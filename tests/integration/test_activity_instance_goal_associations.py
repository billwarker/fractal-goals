"""One-off attribution against the real PostgreSQL mutation/read boundaries."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.orm import Session as DatabaseSession

from models import (
    ActivityInstance, EventLog, Goal, GoalCompletionCondition, GoalConditionMetricRule, GoalPauseInterval, Session,
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


def add_condition(db_session, goal, activity_id, kind='consistency', *, measure='sets', required_count=1,
                  min_sets=None, metric_id=None, value=None, rule_metric_id=None):
    """Give `goal` an activity threshold without associating the activity (one-off evidence only)."""
    goal.completion_condition = 'activity_threshold'
    goal.started_at = goal.created_at
    condition = GoalCompletionCondition(
        id=str(uuid4()), goal_id=goal.id, root_id=goal.root_id, activity_definition_id=activity_id, kind=kind,
        measure=measure, required_count=required_count if kind == 'consistency' else None, min_sets=min_sets,
        metric_definition_id=metric_id, operator='>=' if value is not None and rule_metric_id is None else None,
        target_value=value if rule_metric_id is None else None,
    )
    if rule_metric_id:
        condition.rules.append(GoalConditionMetricRule(metric_definition_id=rule_metric_id, operator='>=', value=value))
    db_session.add(condition)
    db_session.commit()
    return condition


def completed(db_session, goal):
    db_session.expire_all()
    return db_session.get(Goal, goal.id).completed


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
        rows = authed_client.get(f'/api/{root.id}/goals/{scoped.id}/condition/evidence', query_string={'activity_id': instances[0].activity_definition_id, 'since': 'all'}).get_json()
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
    def fail(*args, **kwargs):
        raise RuntimeError('recalculation failed')
    monkeypatch.setattr('services.activity_instance_goal_service.reconcile_activity_conditions', fail)
    with pytest.raises(RuntimeError):
        ActivityInstanceGoalService(db_session).set_goal(root.id, instances[0].id, goal.id, root.owner_id)
    db_session.rollback()
    assert db_session.execute(select(activity_instance_goal_associations)).all() == []
    assert db_session.query(EventLog).filter(EventLog.event_type == 'activity_instance.associated').count() == 0


@pytest.mark.integration
def test_condition_is_reconciled_on_link_and_removal(authed_client, db_session, one_off):
    root, goal, _, session, instances = one_off
    add_condition(db_session, goal, instances[0].activity_definition_id)
    url = url_for(one_off)
    assert authed_client.post(url, json={'goal_id': goal.id}).status_code == 200
    db_session.expire_all()
    stored = db_session.get(Goal, goal.id)
    assert stored.completed is True
    assert stored.completion_source == 'condition'
    assert stored.completed_session_id == session.id
    assert authed_client.delete(f'{url}/{goal.id}').status_code == 200
    assert completed(db_session, goal) is False


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
@pytest.mark.parametrize('kind', ['single_session', 'cumulative', 'consistency'])
def test_conditions_use_only_linked_instances(authed_client, db_session, one_off, sample_activity_definition, kind):
    from models import MetricValue
    root, goal, _, _, instances = one_off
    metric = sample_activity_definition.metric_definitions[0]
    if kind == 'single_session':
        add_condition(db_session, goal, sample_activity_definition.id, kind, min_sets=1, value=10, rule_metric_id=metric.id)
    elif kind == 'cumulative':
        add_condition(db_session, goal, sample_activity_definition.id, kind, measure='metric', metric_id=metric.id, value=10)
    else:
        add_condition(db_session, goal, sample_activity_definition.id, kind)
    # The unlinked instance exceeds the threshold; linking the smaller instance must not achieve it.
    db_session.add_all([MetricValue(id=str(uuid4()), activity_instance_id=instance.id,
        metric_definition_id=metric.id, value=value) for instance, value in zip(instances, [5, 100])])
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    assert completed(db_session, goal) is (kind == 'consistency')
    assert authed_client.post(url_for(one_off, 1), json={'goal_id': goal.id}).status_code == 200
    assert completed(db_session, goal) is True
    assert authed_client.delete(f'{url_for(one_off, 1)}/{goal.id}').status_code == 200
    if kind == 'consistency':
        assert authed_client.delete(f'{url_for(one_off)}/{goal.id}').status_code == 200
    assert completed(db_session, goal) is False


@pytest.mark.integration
def test_linked_incomplete_instance_completes_the_goal_when_completed(authed_client, db_session, one_off):
    root, goal, _, session, instances = one_off
    instances[0].completed = False
    add_condition(db_session, goal, instances[0].activity_definition_id)
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    assert completed(db_session, goal) is False
    response = authed_client.put(f'/api/{root.id}/sessions/{session.id}/activities/{instances[0].id}', json={'completed': True})
    assert response.status_code == 200
    assert completed(db_session, goal) is True


@pytest.mark.integration
@pytest.mark.parametrize('bound', ['start_after_evidence', 'due_before_evidence'])
def test_the_goals_active_period_bounds_one_off_evidence(authed_client, db_session, one_off, bound):
    root, goal, _, _, instances = one_off
    add_condition(db_session, goal, instances[0].activity_definition_id)
    if bound == 'start_after_evidence':
        goal.started_at = instances[0].time_stop + timedelta(days=1)
    else:
        goal.deadline = instances[0].time_start - timedelta(days=1)
    db_session.commit()
    assert authed_client.post(url_for(one_off), json={'goal_id': goal.id}).status_code == 200
    assert completed(db_session, goal) is False


@pytest.mark.integration
def test_removal_retains_other_evidence_and_manual_goal_completion(authed_client, db_session, one_off):
    root, goal, _, _, instances = one_off
    add_condition(db_session, goal, instances[0].activity_definition_id)
    for index in range(2):
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    assert authed_client.delete(f'{url_for(one_off)}/{goal.id}').status_code == 200
    assert completed(db_session, goal) is True
    stored = db_session.get(Goal, goal.id)
    stored.completion_source = 'manual_override'
    db_session.commit()
    assert authed_client.delete(f'{url_for(one_off, 1)}/{goal.id}').status_code == 200
    assert completed(db_session, goal) is True


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
    rows = authed_client.get(f'/api/{root.id}/goals/{goal.id}/condition/evidence', query_string={'activity_id': instances[0].activity_definition_id, 'since': 'all'}).get_json()
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
def test_completed_session_corrections_preserve_alternative_instance_evidence(authed_client, db_session, one_off):
    root, goal, _, _, instances = one_off
    add_condition(db_session, goal, instances[0].activity_definition_id)
    for index in [0, 1]:
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    for index, expected in [(0, True), (1, False)]:
        response = authed_client.put(f'/api/{root.id}/activity-instances/{instances[index].id}', json={'completed': False})
        assert response.status_code == 200
        assert completed(db_session, goal) is expected


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
def test_deleted_instance_preserves_alternative_evidence(authed_client, db_session, one_off):
    root, goal, _, session, instances = one_off
    add_condition(db_session, goal, instances[0].activity_definition_id)
    for index in [0, 1]:
        assert authed_client.post(url_for(one_off, index), json={'goal_id': goal.id}).status_code == 200
    for index, expected in [(0, True), (1, False)]:
        response = authed_client.delete(f'/api/{root.id}/sessions/{session.id}/activities/{instances[index].id}')
        assert response.status_code == 200
        assert completed(db_session, goal) is expected
