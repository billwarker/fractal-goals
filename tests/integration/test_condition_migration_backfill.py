"""Historical SQL evidence must agree with runtime completion semantics."""
from datetime import datetime, timedelta
from uuid import uuid4

import pytest

from migrations.condition_backfill import met_conditions
from models import (
    ActivityInstance, ActivitySet, GoalCompletionCondition, GoalConditionMetricRule,
    GoalPauseInterval, MetricValue, Session, activity_goal_associations,
)
from services.goal_condition_service import evaluate_goal_condition
from services.goal_loading import load_fractal_goals_for_serialization


@pytest.mark.integration
@pytest.mark.parametrize('case,expected', [
    ('met', True), ('unmet', False), ('sets', True), ('skipped_set', False),
    ('cumulative', True), ('yield', True), ('no_evidence', False),
    ('paused', False), ('pause_interval', False), ('declined', False),
    ('deleted_goal', False), ('deleted_instance', False), ('deleted_session', False),
    ('incomplete_instance', False), ('before_start', False), ('after_deadline', False),
    ('already_completed', False), ('direct_link', True), ('group_link', True),
])
def test_migration_backfill_preserves_completion_rules(
    db_session, sample_ultimate_goal, sample_activity_definition, case, expected,
):
    goal, activity = sample_ultimate_goal, sample_activity_definition
    start, occurred = datetime(2026, 1, 1), datetime(2026, 2, 1)
    goal.created_at = goal.started_at = start
    goal.deadline = None
    goal.completed = goal.paused = False
    goal.completion_condition = 'activity_threshold'
    condition = GoalCompletionCondition(goal_id=goal.id, root_id=goal.id,
                                        activity_definition_id=activity.id,
                                        kind='consistency', measure='sets', required_count=1)
    session = Session(id=str(uuid4()), root_id=goal.id, owner_id=goal.owner_id,
                      name='Migration evidence', session_start=occurred, completed=True)
    instance = ActivityInstance(id=str(uuid4()), root_id=goal.id, session=session,
                                activity_definition_id=activity.id, completed=True,
                                time_start=occurred, created_at=occurred)
    db_session.add_all([condition, session, instance])
    db_session.flush()
    if case == 'direct_link':
        from models import activity_instance_goal_associations
        db_session.execute(activity_instance_goal_associations.insert().values(
            activity_instance_id=instance.id, goal_id=goal.id,
        ))
    elif case == 'group_link':
        from models import goal_activity_group_associations
        db_session.execute(goal_activity_group_associations.insert().values(
            activity_group_id=activity.group_id, goal_id=goal.id,
        ))
    else:
        db_session.execute(activity_goal_associations.insert().values(activity_id=activity.id, goal_id=goal.id))
    if case == 'unmet':
        condition.required_count = 2
    if case in ('sets', 'skipped_set', 'cumulative', 'yield'):
        metric = activity.metric_definitions[0]
        activity_set = ActivitySet(id=str(uuid4()), activity_instance_id=instance.id,
                                   sort_order=0, status='skipped' if case == 'skipped_set' else 'completed')
        db_session.add(activity_set)
        db_session.flush()
        db_session.add(MetricValue(activity_instance_id=instance.id, activity_set_id=activity_set.id,
                                   metric_definition_id=metric.id, value=10))
        condition.required_count = None
        if case in ('sets', 'skipped_set'):
            condition.kind, condition.min_sets = 'single_session', 1
            db_session.add(GoalConditionMetricRule(condition_id=condition.id,
                                                   metric_definition_id=metric.id, operator='>=', value=10))
        elif case == 'cumulative':
            condition.kind, condition.measure = 'cumulative', 'metric'
            condition.metric_definition_id, condition.operator, condition.target_value = metric.id, '>=', 10
        else:
            second = activity.metric_definitions[1]
            for item in activity.metric_definitions:
                item.track_progress = item.is_multiplicative = True
                if item.fractal_metric:
                    item.fractal_metric.is_multiplicative = True
            db_session.add(MetricValue(activity_instance_id=instance.id, activity_set_id=activity_set.id,
                                       metric_definition_id=second.id, value=5))
            condition.kind, condition.measure = 'single_session', 'yield'
            condition.operator, condition.target_value = '>=', 50
    if case == 'paused':
        goal.paused = True
    elif case == 'pause_interval':
        db_session.add(GoalPauseInterval(goal_id=goal.id, root_id=goal.id,
                                        paused_at=occurred - timedelta(days=1), resumed_at=occurred + timedelta(days=1)))
    elif case == 'declined':
        goal.manually_uncompleted_at = occurred + timedelta(days=1)
    elif case == 'deleted_goal':
        goal.deleted_at = occurred
    elif case == 'no_evidence':
        db_session.delete(instance)
    elif case == 'deleted_instance':
        instance.deleted_at = occurred
    elif case == 'deleted_session':
        session.deleted_at = occurred
    elif case == 'incomplete_instance':
        instance.completed = False
    elif case == 'before_start':
        goal.started_at = occurred + timedelta(days=1)
    elif case == 'after_deadline':
        goal.deadline = occurred - timedelta(days=1)
    elif case == 'already_completed':
        goal.completed = True
    db_session.commit()
    result = list(met_conditions(db_session.connection(), goal.id))
    assert bool(result) is expected
    if case not in ('deleted_goal', 'already_completed', 'paused'):
        goals = load_fractal_goals_for_serialization(db_session, goal.id)
        evaluation = evaluate_goal_condition(db_session, goals[goal.id], goals, honor_decline=True)
        assert evaluation.met is expected
        if expected:
            assert result[0][1].achieved_at == evaluation.achieved_at
            assert result[0][1].achieving_session_id == evaluation.achieving_session_id
