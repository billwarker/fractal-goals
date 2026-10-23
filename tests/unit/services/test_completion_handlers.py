import uuid
from datetime import datetime, timedelta, timezone
from unittest.mock import patch

import pytest

from models import ActivityInstance, Goal, GoalCompletionCondition, GoalConditionMetricRule, MetricValue
from models.goal import activity_goal_associations
from services.events import Event, Events
import services.completion_handlers

STARTED = datetime.now(timezone.utc) - timedelta(days=1)


@pytest.fixture
def lift_condition(db_session, sample_goal_hierarchy, sample_activity_definition):
    """The short-term goal completes when one Bench Press set reaches 100."""
    goal = sample_goal_hierarchy['short_term']
    db_session.execute(activity_goal_associations.insert().values(
        activity_id=sample_activity_definition.id, goal_id=goal.id,
    ))
    goal.completion_condition = 'activity_threshold'
    goal.started_at = STARTED
    condition = GoalCompletionCondition(
        id=str(uuid.uuid4()), goal_id=goal.id, root_id=goal.root_id,
        activity_definition_id=sample_activity_definition.id, kind='single_session', measure='sets', min_sets=1,
    )
    condition.rules.append(GoalConditionMetricRule(
        metric_definition_id=sample_activity_definition.metric_definitions[0].id, operator='>=', value=100,
    ))
    db_session.add(condition)
    db_session.commit()
    return condition


def _instance(db_session, session, activity, value, *, completed=True, offset=0):
    occurred = datetime.now(timezone.utc) - timedelta(hours=1) + timedelta(seconds=offset)
    instance = ActivityInstance(
        id=str(uuid.uuid4()), session_id=session.id, activity_definition_id=activity.id, root_id=session.root_id,
        completed=completed, created_at=occurred, time_start=occurred, time_stop=occurred, data={},
    )
    instance.metric_values.append(MetricValue(
        id=str(uuid.uuid4()), activity_instance_id=instance.id,
        metric_definition_id=activity.metric_definitions[0].id, value=value,
    ))
    db_session.add(instance)
    db_session.commit()
    return instance


def _run(handler, name, data, db_session):
    with patch('services.completion_handlers._get_db_session', return_value=db_session), \
            patch.object(db_session, 'close', return_value=None):
        handler(Event(name, data))
    db_session.expire_all()


def test_session_completion_completes_goals_from_the_instance_that_met_them(
    db_session, sample_practice_session, lift_condition, sample_activity_definition, sample_goal_hierarchy,
):
    _instance(db_session, sample_practice_session, sample_activity_definition, 95, offset=0)
    _instance(db_session, sample_practice_session, sample_activity_definition, 105, offset=1)

    _run(services.completion_handlers.handle_session_completed, Events.SESSION_COMPLETED, {
        'session_id': sample_practice_session.id, 'root_id': sample_practice_session.root_id,
    }, db_session)

    goal = db_session.get(Goal, sample_goal_hierarchy['short_term'].id)
    assert goal.completed is True
    assert goal.completed_session_id == sample_practice_session.id
    assert goal.completion_source == 'condition'
    assert goal.completion_reason == 'condition_met'


def test_instance_completion_reconciles_the_activitys_conditions(
    db_session, sample_practice_session, lift_condition, sample_activity_definition, sample_goal_hierarchy,
):
    instance = _instance(db_session, sample_practice_session, sample_activity_definition, 105)

    _run(services.completion_handlers.handle_activity_instance_completed, Events.ACTIVITY_INSTANCE_COMPLETED, {
        'instance_id': instance.id, 'root_id': instance.root_id,
    }, db_session)

    assert db_session.get(Goal, sample_goal_hierarchy['short_term'].id).completed is True


def test_marking_the_instance_incomplete_reverts_the_goal(
    db_session, sample_practice_session, lift_condition, sample_activity_definition, sample_goal_hierarchy,
):
    instance = _instance(db_session, sample_practice_session, sample_activity_definition, 105)
    _run(services.completion_handlers.handle_activity_instance_completed, Events.ACTIVITY_INSTANCE_COMPLETED, {
        'instance_id': instance.id, 'root_id': instance.root_id,
    }, db_session)
    instance = db_session.get(ActivityInstance, instance.id)
    instance.completed = False
    db_session.commit()

    _run(services.completion_handlers.handle_activity_instance_updated, Events.ACTIVITY_INSTANCE_UPDATED, {
        'instance_id': instance.id, 'root_id': instance.root_id, 'updated_fields': ['completed'],
    }, db_session)

    goal = db_session.get(Goal, sample_goal_hierarchy['short_term'].id)
    assert goal.completed is False
    assert goal.completion_reason == 'condition_unmet'


def test_unrelated_instance_updates_do_not_reconcile(db_session, lift_condition, sample_practice_session, sample_activity_definition):
    instance = _instance(db_session, sample_practice_session, sample_activity_definition, 105)
    with patch('services.completion_handlers.reconcile_activity_conditions') as reconcile:
        _run(services.completion_handlers.handle_activity_instance_updated, Events.ACTIVITY_INSTANCE_UPDATED, {
            'instance_id': instance.id, 'root_id': instance.root_id, 'updated_fields': ['notes'],
        }, db_session)
    reconcile.assert_not_called()


def test_a_hard_deleted_instance_is_reconciled_from_the_event_payload(
    db_session, sample_practice_session, lift_condition, sample_activity_definition, sample_goal_hierarchy,
):
    instance = _instance(db_session, sample_practice_session, sample_activity_definition, 105)
    _run(services.completion_handlers.handle_activity_instance_completed, Events.ACTIVITY_INSTANCE_COMPLETED, {
        'instance_id': instance.id, 'root_id': instance.root_id,
    }, db_session)
    payload = {
        'instance_id': instance.id, 'root_id': instance.root_id,
        'activity_definition_id': sample_activity_definition.id,
    }
    db_session.delete(db_session.get(ActivityInstance, instance.id))
    db_session.commit()

    _run(services.completion_handlers.handle_activity_instance_deleted, Events.ACTIVITY_INSTANCE_DELETED, payload, db_session)

    assert db_session.get(Goal, sample_goal_hierarchy['short_term'].id).completed is False


def test_completing_the_last_child_completes_a_children_condition_parent(db_session, sample_goal_hierarchy):
    mid_goal = db_session.get(Goal, sample_goal_hierarchy['mid_term'].id)
    mid_goal.completion_condition = 'children'
    child = db_session.get(Goal, sample_goal_hierarchy['short_term'].id)
    child.completed = True
    child.completed_at = datetime.now(timezone.utc)
    db_session.commit()

    _run(services.completion_handlers.handle_goal_completed, Events.GOAL_COMPLETED, {
        'goal_id': child.id, 'root_id': child.root_id, 'goal_name': child.name,
    }, db_session)

    mid_goal = db_session.get(Goal, sample_goal_hierarchy['mid_term'].id)
    assert mid_goal.completed is True
    assert mid_goal.completion_source == 'children'
    assert mid_goal.completion_reason == 'all_children_completed'


def test_a_manual_parent_is_not_completed_by_its_children(db_session, sample_goal_hierarchy):
    child = db_session.get(Goal, sample_goal_hierarchy['short_term'].id)
    child.completed = True
    child.completed_at = datetime.now(timezone.utc)
    db_session.commit()

    _run(services.completion_handlers.handle_goal_completed, Events.GOAL_COMPLETED, {
        'goal_id': child.id, 'root_id': child.root_id,
    }, db_session)

    assert db_session.get(Goal, sample_goal_hierarchy['mid_term'].id).completed is False
