"""A goal links at most one live activity group, through every write path."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

import models
from models import (
    ActivityDefinition, ActivityGroup, ActivityInstance, EventLog, Goal, GoalCompletionCondition, Session,
    activity_instance_goal_associations, get_session, goal_activity_group_associations,
)
from services.activity_association_service import ActivityAssociationService
from services.instance_goal_evidence import load_instance_linked_activities

pytestmark = pytest.mark.integration


def make_group(db_session, root, name):
    group = ActivityGroup(id=str(uuid4()), root_id=root.id, name=name, sort_order=9)
    db_session.add(group)
    db_session.commit()
    return group


def live_groups(db_session, goal_id):
    table = goal_activity_group_associations
    db_session.expire_all()
    return list(db_session.execute(
        select(table.c.activity_group_id).where(table.c.goal_id == goal_id, table.c.deleted_at.is_(None))
    ).scalars())


def link(client, root, goal, group, **body):
    return client.post(f'/api/{root.id}/goals/{goal.id}/activity-groups/{group.id}', json=body or None)


@pytest.fixture
def groups(db_session, sample_goal_hierarchy, sample_activity_group):
    root = sample_goal_hierarchy['ultimate']
    return root, sample_goal_hierarchy['short_term'], sample_activity_group, make_group(db_session, root, 'Cardio')


def test_link_is_idempotent_and_a_second_group_conflicts_until_replaced(authed_client, db_session, groups):
    root, goal, first, second = groups
    assert link(authed_client, root, goal, first).status_code == 201
    again = link(authed_client, root, goal, first)
    assert again.status_code == 200 and again.get_json()['message'] == 'Group already linked'

    conflict = link(authed_client, root, goal, second)
    assert conflict.status_code == 409
    body = conflict.get_json()
    assert body['code'] == 'goal_activity_group_taken'
    assert body['current_group'] == {'id': first.id, 'name': first.name}
    assert live_groups(db_session, goal.id) == [first.id]

    replaced = link(authed_client, root, goal, second, replace=True)
    assert replaced.status_code == 200
    assert replaced.get_json()['previous_group_id'] == first.id
    assert live_groups(db_session, goal.id) == [second.id]
    events = [row.event_type for row in db_session.query(EventLog).filter(
        EventLog.entity_type == 'activity_group', EventLog.root_id == root.id,
    ).order_by(EventLog.timestamp, EventLog.event_type)]
    assert events.count('activity_group.associated') == 2
    assert events.count('activity_group.disassociated') == 1


def test_unlink_then_unlink_again_and_wrong_group(authed_client, db_session, groups):
    root, goal, first, second = groups
    link(authed_client, root, goal, first)
    url = f'/api/{root.id}/goals/{goal.id}/activity-groups'
    assert authed_client.delete(f'{url}/{second.id}').status_code == 404
    assert authed_client.delete(f'{url}/{first.id}').status_code == 200
    assert authed_client.delete(f'{url}/{first.id}').status_code == 404
    assert live_groups(db_session, goal.id) == []
    # Removing the only group frees the goal for another one without `replace`.
    assert link(authed_client, root, goal, second).status_code == 201


def test_deleted_or_foreign_records_are_not_linkable(authed_client, db_session, groups):
    root, goal, first, second = groups
    second.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert link(authed_client, root, goal, second).status_code == 404
    other_root = Goal(id=str(uuid4()), name='Other', owner_id=root.owner_id, level_id=root.level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.commit()
    foreign = make_group(db_session, other_root, 'Foreign')
    assert link(authed_client, root, goal, foreign).status_code == 404
    goal.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert link(authed_client, root, goal, first).status_code == 404


def test_soft_deleted_row_is_not_already_linked(authed_client, db_session, groups):
    root, goal, first, _ = groups
    db_session.execute(goal_activity_group_associations.insert().values(
        goal_id=goal.id, activity_group_id=first.id, deleted_at=datetime.now(timezone.utc),
    ))
    db_session.commit()
    response = link(authed_client, root, goal, first)
    assert response.status_code == 201
    assert live_groups(db_session, goal.id) == [first.id]


def test_batch_accepts_zero_or_one_real_group_and_rejects_two(authed_client, db_session, groups):
    root, goal, first, second = groups
    url = f'/api/{root.id}/goals/{goal.id}/associations/batch'
    assert authed_client.put(url, json={'activity_ids': [], 'group_ids': [first.id, str(uuid4())]}).status_code == 200
    assert live_groups(db_session, goal.id) == [first.id]
    # The batch states the full association set, so one group replaces the previous one.
    assert authed_client.put(url, json={'activity_ids': [], 'group_ids': [second.id]}).status_code == 200
    assert live_groups(db_session, goal.id) == [second.id]
    rejected = authed_client.put(url, json={'activity_ids': [], 'group_ids': [first.id, second.id]})
    assert rejected.status_code == 422
    assert rejected.get_json()['code'] == 'goal_activity_group_single'
    assert live_groups(db_session, goal.id) == [second.id]
    assert authed_client.put(url, json={'activity_ids': [], 'group_ids': []}).status_code == 200
    assert live_groups(db_session, goal.id) == []


def test_group_side_set_lists_conflicts_and_moves_with_replace(authed_client, db_session, groups, sample_goal_hierarchy):
    root, goal, first, second = groups
    other = sample_goal_hierarchy['mid_term']
    link(authed_client, root, goal, first)
    url = f'/api/{root.id}/activity-groups/{second.id}/goals'
    conflict = authed_client.post(url, json={'goal_ids': [goal.id, other.id]})
    assert conflict.status_code == 409
    assert conflict.get_json()['conflicts'] == [{
        'goal_id': goal.id, 'goal_name': goal.name, 'current_group': {'id': first.id, 'name': first.name},
    }]
    assert live_groups(db_session, other.id) == []  # Nothing partially applied.
    moved = authed_client.post(url, json={'goal_ids': [goal.id, other.id], 'replace': True})
    assert moved.status_code == 200
    assert live_groups(db_session, goal.id) == [second.id]
    assert live_groups(db_session, other.id) == [second.id]
    # Dropping a goal from the group's list unlinks only that goal.
    assert authed_client.post(url, json={'goal_ids': [other.id]}).status_code == 200
    assert live_groups(db_session, goal.id) == []
    assert live_groups(db_session, other.id) == [second.id]


def test_group_update_payload_respects_the_invariant(authed_client, db_session, groups):
    root, goal, first, second = groups
    link(authed_client, root, goal, first)
    url = f'/api/{root.id}/activity-groups/{second.id}'
    assert authed_client.put(url, json={'goal_ids': [goal.id]}).status_code == 409
    assert authed_client.put(url, json={'goal_ids': [goal.id], 'replace_goal_groups': True}).status_code == 200
    assert live_groups(db_session, goal.id) == [second.id]


def test_copy_goal_copies_its_one_group(authed_client, db_session, groups):
    root, goal, first, _ = groups
    link(authed_client, root, goal, first)
    response = authed_client.post(f'/api/{root.id}/goals/{goal.id}/copy')
    assert response.status_code in (200, 201)
    copy_id = response.get_json()['id']
    assert live_groups(db_session, copy_id) == [first.id]
    assert response.get_json()['activity_group_id'] == first.id


def test_serializer_exposes_the_canonical_group_and_ignores_deleted_groups(authed_client, db_session, groups):
    root, goal, first, _ = groups
    link(authed_client, root, goal, first)
    tree = authed_client.get(f'/api/{root.id}/goals/{goal.id}').get_json()
    assert tree['activity_group_id'] == first.id
    assert tree['attributes']['associated_activity_group_ids'] == [first.id]
    first.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    tree = authed_client.get(f'/api/{root.id}/goals/{goal.id}').get_json()
    assert tree['activity_group_id'] is None
    assert tree['attributes']['associated_activity_group_ids'] == []


def test_database_rejects_a_second_live_row_but_allows_soft_deleted(db_session, groups):
    _, goal, first, second = groups
    table = goal_activity_group_associations
    db_session.execute(table.insert().values(goal_id=goal.id, activity_group_id=first.id))
    db_session.execute(table.insert().values(
        goal_id=goal.id, activity_group_id=second.id, deleted_at=datetime.now(timezone.utc),
    ))
    db_session.commit()
    with pytest.raises(IntegrityError):
        db_session.execute(table.update().where(
            table.c.goal_id == goal.id, table.c.activity_group_id == second.id,
        ).values(deleted_at=None))
        db_session.flush()
    db_session.rollback()


def test_concurrent_links_to_different_groups_leave_one(app, db_session, groups):
    root, goal, first, second = groups

    def attempt(group_id):
        session = get_session(models.get_engine())
        try:
            group = session.get(ActivityGroup, group_id)
            return ActivityAssociationService(session).link_goal_activity_group(
                root.id, goal.id, group.id, root.owner_id,
            )[2]
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        statuses = sorted(pool.map(attempt, [first.id, second.id]))
    assert statuses == [201, 409]
    assert len(live_groups(db_session, goal.id)) == 1


def test_group_link_changes_reconcile_activity_threshold_goals(authed_client, db_session, groups, sample_activity_definition):
    root, goal, first, second = groups
    now = datetime.now(timezone.utc)
    goal.created_at = now - timedelta(days=3)
    goal.started_at = goal.created_at
    goal.completion_condition = 'activity_threshold'
    db_session.add(GoalCompletionCondition(
        id=str(uuid4()), goal_id=goal.id, root_id=root.id, activity_definition_id=sample_activity_definition.id,
        kind='consistency', measure='sets', required_count=1,
    ))
    session = Session(id=str(uuid4()), root_id=root.id, owner_id=root.owner_id, name='Practice',
                      session_start=now - timedelta(days=1), completed=True, total_duration_seconds=60)
    db_session.add(session)
    db_session.add(ActivityInstance(
        id=str(uuid4()), root_id=root.id, session_id=session.id, activity_definition_id=sample_activity_definition.id,
        completed=True, duration_seconds=60, created_at=now - timedelta(days=1),
        time_start=now - timedelta(days=1), time_stop=now - timedelta(days=1) + timedelta(minutes=1),
    ))
    db_session.commit()

    def completed():
        db_session.expire_all()
        return db_session.get(Goal, goal.id).completed

    assert completed() is False
    assert link(authed_client, root, goal, first).status_code == 201  # The definition's own group.
    assert completed() is True
    assert link(authed_client, root, goal, second, replace=True).status_code == 200
    assert completed() is False


@pytest.fixture
def linked(db_session, sample_goal_hierarchy, sample_activity_definition):
    root = sample_goal_hierarchy['ultimate']
    now = datetime.now(timezone.utc)
    session = Session(id=str(uuid4()), root_id=root.id, owner_id=root.owner_id, name='Linked',
                      session_start=now, completed=True)
    other = ActivityDefinition(id=str(uuid4()), root_id=root.id, name='Scales')
    db_session.add_all([session, other])
    db_session.flush()
    instances = [ActivityInstance(
        id=str(uuid4()), root_id=root.id, session_id=session.id, activity_definition_id=definition_id, created_at=now,
    ) for definition_id in (sample_activity_definition.id, sample_activity_definition.id, other.id)]
    db_session.add_all(instances)
    db_session.commit()
    return root, session, instances, sample_activity_definition, other


def add_link(db_session, instance, goal, *, deleted=False, at=None):
    db_session.execute(activity_instance_goal_associations.insert().values(
        activity_instance_id=instance.id, goal_id=goal.id, created_at=at or datetime.now(timezone.utc),
        deleted_at=datetime.now(timezone.utc) if deleted else None,
    ))
    db_session.commit()


def test_instance_linked_activities_cover_goal_and_descendants_only(authed_client, db_session, linked, sample_goal_hierarchy):
    root, _, instances, definition, other = linked
    mid, short, long_term = (sample_goal_hierarchy[key] for key in ('mid_term', 'short_term', 'long_term'))
    base = datetime.now(timezone.utc) - timedelta(hours=3)
    add_link(db_session, instances[0], short, at=base)
    add_link(db_session, instances[1], mid, at=base + timedelta(hours=1))
    add_link(db_session, instances[2], long_term, at=base + timedelta(hours=2))

    response = authed_client.get(f'/api/{root.id}/goals/{mid.id}/instance-linked-activities')
    assert response.status_code == 200
    body = response.get_json()
    assert body['truncated'] is False
    assert [(row['id'], row['link_count']) for row in body['activities']] == [(definition.id, 2)]
    assert body['activities'][0]['linked_goal_ids'] == sorted([mid.id, short.id])
    assert body['activities'][0]['group_id'] == definition.group_id
    # The ancestor-only link belongs to the long-term goal, newest first.
    rows = authed_client.get(f'/api/{root.id}/goals/{long_term.id}/instance-linked-activities').get_json()['activities']
    assert [row['id'] for row in rows] == [other.id, definition.id]
    # Siblings/descendants of the scoped goal only: the short-term goal sees its own link.
    rows = authed_client.get(f'/api/{root.id}/goals/{short.id}/instance-linked-activities').get_json()['activities']
    assert [(row['id'], row['link_count']) for row in rows] == [(definition.id, 1)]
    # The reusable catalog is unchanged by one-off links.
    catalog = authed_client.get(f'/api/{root.id}/goals/{mid.id}/activities').get_json()
    assert definition.id not in {row['id'] for row in catalog if row.get('has_direct_association')}


def test_instance_linked_activities_exclude_removed_and_deleted_records(authed_client, db_session, linked, sample_goal_hierarchy):
    root, session, instances, definition, other = linked
    goal = sample_goal_hierarchy['mid_term']
    add_link(db_session, instances[0], goal, deleted=True)
    add_link(db_session, instances[2], goal)
    url = f'/api/{root.id}/goals/{goal.id}/instance-linked-activities'
    assert [row['id'] for row in authed_client.get(url).get_json()['activities']] == [other.id]
    other.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert authed_client.get(url).get_json()['activities'] == []
    other.deleted_at = None
    session.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    assert authed_client.get(url).get_json()['activities'] == []


def test_instance_linked_activities_tenant_and_missing_goal(authed_client, db_session, linked):
    root, *_ = linked
    assert authed_client.get(f'/api/{root.id}/goals/{uuid4()}/instance-linked-activities').status_code == 404
    assert authed_client.get(f'/api/{uuid4()}/goals/{root.id}/instance-linked-activities').status_code == 404


def test_instance_linked_activities_is_bounded(db_session, linked, sample_goal_hierarchy):
    root, session, _, _, _ = linked
    goal = sample_goal_hierarchy['mid_term']
    for index in range(3):
        definition = ActivityDefinition(id=str(uuid4()), root_id=root.id, name=f'Drill {index}')
        db_session.add(definition)
        db_session.flush()
        instance = ActivityInstance(id=str(uuid4()), root_id=root.id, session_id=session.id,
                                    activity_definition_id=definition.id)
        db_session.add(instance)
        db_session.flush()
        add_link(db_session, instance, goal)
    rows, truncated = load_instance_linked_activities(db_session, root.id, goal.id, limit=2)
    assert len(rows) == 2 and truncated is True
    rows, truncated = load_instance_linked_activities(db_session, root.id, goal.id, limit=3)
    assert len(rows) == 3 and truncated is False


def test_instance_linked_activities_query_count_is_constant(authed_client, db_session, linked, sample_goal_hierarchy, query_counter):
    root, session, _, _, _ = linked
    goal = sample_goal_hierarchy['mid_term']
    url = f'/api/{root.id}/goals/{goal.id}/instance-linked-activities'

    def measure():
        query_counter['total'] = 0
        assert authed_client.get(url).status_code == 200
        return query_counter['total']

    def grow(count):
        for _ in range(count):
            definition = ActivityDefinition(id=str(uuid4()), root_id=root.id, name='Drill')
            db_session.add(definition)
            db_session.flush()
            instance = ActivityInstance(id=str(uuid4()), root_id=root.id, session_id=session.id,
                                        activity_definition_id=definition.id)
            db_session.add(instance)
            db_session.flush()
            add_link(db_session, instance, goal)

    grow(1)
    small = measure()
    grow(10)
    assert measure() == small


def _migration_module():
    import importlib.util
    from pathlib import Path
    path = Path(__file__).resolve().parents[2] / 'migrations/versions/a7c9e1b3d5f7_one_activity_group_per_goal.py'
    spec = importlib.util.spec_from_file_location('one_group_migration', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def test_migration_is_reversible_and_aborts_on_multi_group_goals(db_session, groups):
    from alembic.migration import MigrationContext
    from alembic.operations import Operations
    from sqlalchemy import inspect

    module = _migration_module()
    _, goal, first, second = groups
    table = goal_activity_group_associations
    with db_session.get_bind().connect() as connection:
        transaction = connection.begin()
        try:
            with Operations.context(MigrationContext.configure(connection)):
                module.downgrade()
                assert module.INDEX_NAME not in {i['name'] for i in inspect(connection).get_indexes(table.name)}
                connection.execute(table.insert(), [
                    {'goal_id': goal.id, 'activity_group_id': first.id},
                    {'goal_id': goal.id, 'activity_group_id': second.id},
                ])
                with pytest.raises(RuntimeError, match=r'1 goal\(s\) link more than one activity group'):
                    module.upgrade()
                connection.execute(table.delete().where(table.c.activity_group_id == second.id))
                module.upgrade()
                index = next(i for i in inspect(connection).get_indexes(table.name) if i['name'] == module.INDEX_NAME)
                assert index['unique'] and index['column_names'] == ['goal_id']
        finally:
            transaction.rollback()
