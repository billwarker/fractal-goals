"""One-off attribution against the real PostgreSQL mutation/read boundaries."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session as DatabaseSession

from models import (
    ActivityInstance, EventLog, GoalPauseInterval, Session, Target,
    activity_goal_associations, activity_instance_goal_associations,
)
from services.activity_instance_goal_service import ActivityInstanceGoalService
from services.metrics import GoalMetricsService


@pytest.fixture
def one_off(db_session, sample_goal_hierarchy, sample_activity_definition):
    root = sample_goal_hierarchy['ultimate']
    goal = sample_goal_hierarchy['short_term']
    parent = sample_goal_hierarchy['mid_term']
    now = datetime.now(timezone.utc) - timedelta(days=1)
    for row in sample_goal_hierarchy.values():
        row.created_at = now - timedelta(days=2)
    session = Session(id=str(uuid4()), root_id=root.id, owner_id=root.owner_id,
                      name='One-off practice', session_start=now, completed=True, total_duration_seconds=120)
    db_session.add(session)
    instances = [ActivityInstance(id=str(uuid4()), root_id=root.id, session_id=session.id,
        activity_definition_id=sample_activity_definition.id, completed=True, duration_seconds=60,
        created_at=now, time_start=now, time_stop=now + timedelta(minutes=1)) for _ in range(2)]
    db_session.add_all(instances)
    db_session.commit()
    return root, goal, parent, session, instances


def url_for(one_off, index=0):
    root, _, _, _, instances = one_off
    return f'/api/{root.id}/activity-instances/{instances[index].id}/goals'


@pytest.mark.integration
def test_only_linked_execution_contributes_and_rolls_up(authed_client, db_session, one_off):
    root, goal, parent, session, instances = one_off
    response = authed_client.post(url_for(one_off), json={'goal_id': goal.id})
    assert response.status_code == 200
    assert response.get_json()['associated_goal_ids'] == [goal.id]
    for scoped in [goal, parent]:
        rows = authed_client.get(f'/api/{root.id}/goals/{scoped.id}/activities/{instances[0].activity_definition_id}/instances').get_json()
        assert [row['id'] for row in rows['instances']] == [instances[0].id]
        metrics = GoalMetricsService(db_session).get_metrics_for_goal(scoped.id)['recursive']
        assert metrics['activities_count'] == 1
        assert metrics['activities_duration_seconds'] == 60
        assert metrics['sessions_count'] == 1
    timeline = authed_client.get(f'/api/{root.id}/goals/{goal.id}/activity-heatmap', query_string={'view': 'entries', 'metric': 'activities'}).get_json()
    assert timeline['pagination']['total'] == 1
    assert timeline['entries'][0]['entity_id'] == instances[0].id
    catalog = authed_client.get(f'/api/{root.id}/goals/{goal.id}/activities').get_json()
    assert catalog == []
    serialized = authed_client.get(f'/api/{root.id}/sessions/{session.id}/activities').get_json()
    assert {row['id']: row['associated_goal_ids'] for row in serialized} == {instances[0].id: [goal.id], instances[1].id: []}
    analytics = authed_client.get(f'/api/{root.id}/goals/analytics')
    assert analytics.status_code == 200
    payload = analytics.get_json()
    goal_row = next(row for row in payload['goals'] if row['id'] == goal.id)
    assert goal_row['session_count'] == 1
    assert goal_row['total_duration_seconds'] == 60
    assert goal_row['activity_breakdown'][0]['instance_count'] == 1



@pytest.mark.integration
def test_idempotent_add_remove_restore_and_independent_sources(authed_client, db_session, one_off):
    root, goal, parent, _, instances = one_off
    url = url_for(one_off)
    for _ in range(2):
        assert authed_client.post(url, json={'goal_id': goal.id}).status_code == 200
    assert authed_client.post(url, json={'goal_id': parent.id}).status_code == 200
    db_session.execute(activity_goal_associations.insert().values(activity_id=instances[0].activity_definition_id, goal_id=goal.id))
    db_session.commit()
    for _ in range(2):
        assert authed_client.delete(f'{url}/{goal.id}').status_code == 200
    assert authed_client.get(url).get_json()['associated_goal_ids'] == [parent.id]
    assert GoalMetricsService(db_session).get_metrics_for_goal(goal.id)['direct']['activities_duration_seconds'] == 120
    assert authed_client.post(url, json={'goal_id': goal.id}).status_code == 200
    rows = db_session.execute(select(activity_instance_goal_associations)).all()
    assert len(rows) == 2
    assert all(row.deleted_at is None for row in rows)
    events = db_session.query(EventLog).filter(EventLog.event_type.like('activity_instance.%associated')).all()
    assert len(events) == 4
    assert all('activity_instance_id' in event.payload for event in events)


@pytest.mark.integration
@pytest.mark.parametrize('payload', [{}, {'goal_id': ''}, {'goal_id': 'has space'}, {'goal_id': 1}, {'goal_id': 'x' * 65}, {'goal_id': 'missing'}, {'goal_id': 'missing', 'extra': True}])
def test_invalid_requests_have_no_side_effects(authed_client, db_session, one_off, payload):
    assert authed_client.post(url_for(one_off), json=payload).status_code in (400, 404)
    assert db_session.execute(select(activity_instance_goal_associations)).all() == []


@pytest.mark.integration
@pytest.mark.parametrize('deleted', ['instance', 'goal', 'session'])
def test_deleted_entities_are_rejected(authed_client, db_session, one_off, deleted):
    _, goal, _, session, instances = one_off
    row = {'instance': instances[0], 'goal': goal, 'session': session}[deleted]
    row.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 404


@pytest.mark.integration
def test_wrong_owner_and_cross_root_are_rejected(db_session, one_off, sample_ultimate_goal):
    root, goal, _, _, instances = one_off
    service = ActivityInstanceGoalService(db_session)
    assert service.set_goal(root.id, instances[0].id, goal.id, 'another-user')[2] == 404
    assert service.set_goal('another-root', instances[0].id, goal.id, root.owner_id)[2] == 404


@pytest.mark.integration
def test_concurrent_duplicate_requests_create_one_link(db_session, one_off):
    root, goal, _, _, instances = one_off
    ids = root.id, goal.id, instances[0].id, root.owner_id
    engine = db_session.get_bind()
    def associate(_):
        with DatabaseSession(engine) as session:
            return ActivityInstanceGoalService(session).set_goal(ids[0], ids[2], ids[1], ids[3])[2]
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert list(pool.map(associate, range(2))) == [200, 200]
    assert len(db_session.execute(select(activity_instance_goal_associations)).all()) == 1


@pytest.mark.integration
def test_recalculation_failure_rolls_back_link_and_event(db_session, one_off, monkeypatch):
    root, goal, _, _, instances = one_off
    def fail(*args):
        raise RuntimeError('recalculation failed')
    monkeypatch.setattr('services.activity_instance_goal_service.recalculate_instance_goal_targets', fail)
    with pytest.raises(RuntimeError):
        ActivityInstanceGoalService(db_session).set_goal(root.id, instances[0].id, goal.id, root.owner_id)
    db_session.rollback()
    assert db_session.execute(select(activity_instance_goal_associations)).all() == []
    assert db_session.query(EventLog).filter(EventLog.event_type == 'activity_instance.associated').count() == 0


@pytest.mark.integration
def test_completion_target_is_recalculated_on_link_and_removal(authed_client, db_session, one_off):
    root, goal, _, _, instances = one_off
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id,
                    activity_id=instances[0].activity_definition_id, type='completion', name='Do it once',
                    created_at=goal.created_at)
    db_session.add(target)
    db_session.commit()
    url = url_for(one_off)
    assert authed_client.post(url, json={'goal_id': goal.id}).status_code == 200
    db_session.refresh(target)
    assert target.completed is True
    assert target.completed_instance_id == instances[0].id
    assert authed_client.delete(f'{url}/{goal.id}').status_code == 200
    db_session.refresh(target)
    assert target.completed is False
    db_session.refresh(goal)
    assert goal.completed is False


@pytest.mark.integration
@pytest.mark.parametrize('excluded', ['incomplete', 'before_creation', 'after_completion', 'paused_interval'])
def test_one_off_evidence_exclusions(authed_client, db_session, one_off, excluded):
    root, goal, _, _, instances = one_off
    now = instances[0].created_at
    if excluded == 'incomplete':
        instances[0].completed = False
    elif excluded == 'before_creation':
        goal.created_at = now + timedelta(hours=1)
    elif excluded == 'after_completion':
        goal.completed = True
        goal.completed_at = now - timedelta(hours=1)
    else:
        db_session.add(GoalPauseInterval(id=str(uuid4()), goal_id=goal.id, paused_at=now - timedelta(hours=1), resumed_at=now + timedelta(hours=1)))
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    assert GoalMetricsService(db_session).get_metrics_for_goal(goal.id)['direct']['activities_count'] == 0


@pytest.mark.integration
@pytest.mark.parametrize('target_type', ['threshold', 'sum', 'frequency'])
def test_target_types_use_only_associated_instance(authed_client, db_session, one_off, sample_activity_definition, target_type):
    from models import MetricValue, TargetMetricCondition
    root, goal, _, _, instances = one_off
    metric = sample_activity_definition.metric_definitions[0]
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id,
        activity_id=sample_activity_definition.id, type=target_type, name='One-off target',
        created_at=goal.created_at, frequency_count=1)
    db_session.add(target)
    db_session.flush()
    if target_type != 'frequency':
        db_session.add(TargetMetricCondition(id=str(uuid4()), target_id=target.id,
            metric_definition_id=metric.id, operator='>=', target_value=10))
        # The unlinked instance exceeds the target; linking the smaller instance must not achieve it.
        db_session.add_all([MetricValue(id=str(uuid4()), activity_instance_id=instance.id,
            metric_definition_id=metric.id, value=value) for instance, value in zip(instances, [5, 100])])
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    db_session.refresh(target)
    assert target.completed is (target_type == 'frequency')
    assert authed_client.post(url_for(one_off, 1), json={'goal_id': goal.id}).status_code == 200
    db_session.refresh(target)
    assert target.completed is True
    assert authed_client.delete(f'{url_for(one_off, 1)}/{goal.id}').status_code == 200
    if target_type == 'frequency':
        assert authed_client.delete(f'{url_for(one_off)}/{goal.id}').status_code == 200
    db_session.refresh(target)
    assert target.completed is False


@pytest.mark.integration
def test_linked_incomplete_instance_achieves_target_when_completed(authed_client, db_session, one_off):
    root, goal, _, session, instances = one_off
    instances[0].completed = False
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id, type='completion',
        activity_id=instances[0].activity_definition_id, name='Complete later', created_at=goal.created_at)
    db_session.add(target)
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    response = authed_client.put(f'/api/{root.id}/sessions/{session.id}/activities/{instances[0].id}', json={'completed': True})
    assert response.status_code == 200
    db_session.refresh(target)
    assert target.completed is True
    assert target.completed_instance_id == instances[0].id


@pytest.mark.integration
def test_target_window_and_instance_binding_are_preserved(authed_client, db_session, one_off):
    root, goal, _, _, instances = one_off
    targets = [Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id, type='completion',
        activity_id=instances[0].activity_definition_id, name='Bound target',
        created_at=goal.created_at, **options) for options in [
            {'start_date': instances[0].time_stop + timedelta(days=1)},
            {'end_date': instances[0].time_start - timedelta(days=1)},
            {'activity_instance_id': instances[1].id},
        ]]
    db_session.add_all(targets)
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    db_session.expire_all()
    assert all(not target.completed for target in targets)


@pytest.mark.integration
def test_removal_retains_other_evidence_and_manual_goal_completion(authed_client, db_session, one_off):
    root, goal, _, _, instances = one_off
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id, type='completion',
        activity_id=instances[0].activity_definition_id, name='Either instance', created_at=goal.created_at)
    db_session.add(target)
    db_session.commit()
    for index in range(2):
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    assert authed_client.delete(f'{url_for(one_off)}/{goal.id}').status_code == 200
    db_session.refresh(target)
    assert target.completed is True
    assert target.completed_instance_id == instances[1].id
    db_session.refresh(goal)
    goal.completion_source = 'manual'
    db_session.commit()
    assert authed_client.delete(f'{url_for(one_off, 1)}/{goal.id}').status_code == 200
    db_session.refresh(target)
    db_session.refresh(goal)
    assert target.completed is False
    assert goal.completed is True


@pytest.mark.integration
def test_duplicate_session_does_not_copy_one_off_links(authed_client, db_session, one_off):
    root, goal, _, session, _ = one_off
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    response = authed_client.post(f'/api/{root.id}/sessions/{session.id}/duplicate')
    assert response.status_code == 201
    copied_id = response.get_json()['id']
    copied = authed_client.get(f'/api/{root.id}/sessions/{copied_id}/activities').get_json()
    assert copied
    assert all(not row['associated_goal_ids'] for row in copied)


@pytest.mark.integration
def test_cross_root_goal_is_rejected_even_for_same_owner(authed_client, db_session, one_off):
    from models import Goal
    root, _, _, _, _ = one_off
    other = Goal(id=str(uuid4()), root_id=None, owner_id=root.owner_id, name='Other fractal')
    other.root_id = other.id
    db_session.add(other)
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': other.id}).status_code == 404
    assert db_session.execute(select(activity_instance_goal_associations)).all() == []


@pytest.mark.integration
def test_explicit_parent_link_is_not_inherited_downward(authed_client, db_session, one_off):
    root, goal, parent, _, instances = one_off
    goal.inherit_parent_activities = True
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': parent.id}).status_code == 200
    rows = authed_client.get(f'/api/{root.id}/goals/{goal.id}/activities/{instances[0].activity_definition_id}/instances').get_json()
    assert rows['instances'] == []
    assert GoalMetricsService(db_session).get_metrics_for_goal(goal.id)['direct']['activities_duration_seconds'] == 0


@pytest.mark.integration
def test_instance_association_serialization_has_constant_query_count(authed_client, db_session, one_off, query_counter):
    root, goal, _, session, instances = one_off
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    def count_read():
        query_counter['total'] = 0
        response = authed_client.get(f'/api/{root.id}/sessions/{session.id}/activities')
        assert response.status_code == 200
        return query_counter['total']
    # Compare mixed completed/pending collections so the progress read paths stay the same.
    db_session.add(ActivityInstance(id=str(uuid4()), root_id=root.id, session_id=session.id,
        activity_definition_id=instances[0].activity_definition_id, completed=False))
    db_session.commit()
    baseline = count_read()
    db_session.add_all([ActivityInstance(id=str(uuid4()), root_id=root.id, session_id=session.id,
        activity_definition_id=instances[0].activity_definition_id, completed=False) for _ in range(30)])
    db_session.commit()
    assert count_read() == baseline


@pytest.mark.integration
@pytest.mark.parametrize('target_type', ['completion', 'frequency'])
def test_completed_session_corrections_preserve_alternative_instance_evidence(authed_client, db_session, one_off, target_type):
    root, goal, _, _, instances = one_off
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id,
        activity_id=instances[0].activity_definition_id, type=target_type, name='Correctable target',
        created_at=goal.created_at, frequency_count=1)
    db_session.add(target)
    db_session.commit()
    for index in [0, 1]:
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    for index, expected in [(0, True), (1, False)]:
        response = authed_client.put(f'/api/{root.id}/activity-instances/{instances[index].id}', json={'completed': False})
        assert response.status_code == 200
        db_session.refresh(target)
        assert target.completed is expected


@pytest.mark.integration
def test_flowtree_metrics_do_not_credit_unlinked_sibling(authed_client, one_off):
    root, goal, _, _, _ = one_off
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    response = authed_client.get(f'/api/{root.id}/sessions/flowtree-metrics', query_string={'goal_ids': goal.id})
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['completed_instances_count'] == 1
    assert payload['total_instance_duration_seconds'] == 60


@pytest.mark.integration
def test_related_session_filters_preserve_ancestor_rollups(authed_client, one_off):
    root, goal, parent, session, _ = one_off
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    for scoped in [goal, parent]:
        response = authed_client.get(f'/api/{root.id}/sessions', query_string={'goal_ids': scoped.id})
        assert response.status_code == 200
        assert [row['id'] for row in response.get_json()['sessions']] == [session.id]


@pytest.mark.integration
@pytest.mark.parametrize('target_type', ['completion', 'frequency'])
def test_deleted_instance_preserves_alternative_target_evidence(authed_client, db_session, one_off, target_type):
    root, goal, _, session, instances = one_off
    target = Target(id=str(uuid4()), root_id=root.id, goal_id=goal.id,
        activity_id=instances[0].activity_definition_id, type=target_type, name='Correctable target',
        created_at=goal.created_at, frequency_count=1)
    db_session.add(target)
    db_session.commit()
    for index in [0, 1]:
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    for index, expected in [(0, True), (1, False)]:
        response = authed_client.delete(f'/api/{root.id}/sessions/{session.id}/activities/{instances[index].id}')
        assert response.status_code == 200
        db_session.refresh(target)
        assert target.completed is expected
