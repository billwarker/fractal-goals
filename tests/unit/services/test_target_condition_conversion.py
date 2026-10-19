from datetime import datetime, timedelta
from decimal import Decimal

import pytest

from services.target_condition_conversion import (
    GoalRow,
    MetricConditionRow,
    TargetRow,
    _stable_id,
    plan_conversion,
    render_report_markdown,
)

T0 = datetime(2026, 9, 1)


def _goal(goal_id='g1', *, level='Short Term Goal', completed=False, source=None, via_children=False,
          level_auto=False, parent_id='parent', inherit=False):
    return GoalRow(
        id=goal_id, root_id='root', parent_id=parent_id, owner_id='user', name=f'Goal {goal_id}',
        level_name=level, completed=completed, completed_at=T0 if completed else None, completion_source=source,
        completed_via_children=via_children, level_auto_completes=level_auto, deadline=None, created_at=T0,
        inherit_parent_activities=inherit,
    )


def _target(target_id, goal_id='g1', *, kind='threshold', activity='act', completed=False, minutes=0, **extra):
    return TargetRow(
        id=target_id, goal_id=goal_id, name=f'Target {target_id}', type=kind, activity_id=activity,
        completed=completed, completed_at=T0 if completed else None, completed_session_id='s1' if completed else None,
        created_at=T0 + timedelta(minutes=minutes), **extra,
    )


def _metric(target_id, metric_id='weight', operator='>=', value=225):
    return MetricConditionRow(target_id=target_id, metric_definition_id=metric_id, operator=operator, target_value=value)


@pytest.mark.unit
class TestGoalsWithoutTargets:
    def test_children_flag_or_level_default_becomes_children(self):
        plan = plan_conversion([_goal('a', via_children=True), _goal('b', level_auto=True), _goal('c')], [], [])

        assert plan.goal_updates['a']['completion_condition'] == 'children'
        assert plan.goal_updates['b']['completion_condition'] == 'children'
        assert plan.goal_updates['c']['completion_condition'] == 'manual'
        assert not plan.conditions and not plan.new_goals

    def test_target_completion_source_becomes_condition(self):
        plan = plan_conversion([_goal('a', completed=True, source='target')], [], [])
        assert plan.goal_updates['a']['completion_source'] == 'condition'


@pytest.mark.unit
class TestOneTarget:
    def test_threshold_becomes_single_session_with_exact_decimal_rules(self):
        plan = plan_conversion([_goal()], [_target('t1')], [_metric('t1', value=102.5), _metric('t1', 'reps', '=', 6)])

        (condition,) = plan.conditions
        assert (condition.kind, condition.measure, condition.min_sets) == ('single_session', 'sets', 1)
        assert [(rule['metric_definition_id'], rule['operator'], rule['value']) for rule in condition.rules] == [
            ('weight', '>=', Decimal('102.5000')), ('reps', '==', Decimal('6.0000')),
        ]
        assert plan.goal_updates['g1']['completion_condition'] == 'activity_threshold'
        assert condition.id == _stable_id('condition', 't1')

    def test_threshold_without_rules_never_completes_on_its_own(self):
        plan = plan_conversion([_goal()], [_target('t1')], [])
        assert plan.conditions == []
        assert plan.goal_updates['g1']['completion_condition'] == 'manual'
        assert 'completes manually until you set a threshold' in plan.report[0]['warnings'][0]

    def test_sum_keeps_the_first_total(self):
        plan = plan_conversion([_goal()], [_target('t1', kind='sum')], [_metric('t1', 'reps', '>=', 500)])
        (condition,) = plan.conditions
        assert (condition.kind, condition.measure, condition.metric_definition_id) == ('cumulative', 'metric', 'reps')
        assert condition.target_value == Decimal('500.0000')

    def test_frequency_counts_instances(self):
        plan = plan_conversion([_goal()], [_target('t1', kind='frequency', frequency_count=4)], [])
        (condition,) = plan.conditions
        assert (condition.kind, condition.required_count) == ('consistency', 4)

    def test_every_condition_goal_is_associated_with_its_activity_once(self):
        plan = plan_conversion(
            [_goal('a'), _goal('b')], [_target('t1', 'a'), _target('t2', 'b', activity='other')],
            [_metric('t1'), _metric('t2')],
        )
        assert plan.activity_associations == [('a', 'act'), ('b', 'other')]

    def test_target_without_activity_leaves_a_manual_goal(self):
        plan = plan_conversion([_goal()], [_target('t1', activity=None)], [])
        assert not plan.conditions
        assert plan.goal_updates['g1']['completion_condition'] == 'manual'

    def test_custom_windows_and_instance_bindings_are_reported(self):
        plan = plan_conversion([_goal()], [_target('t1', time_scope='custom', activity_instance_id='i1')], [_metric('t1')])
        warnings = ' '.join(plan.report[0]['warnings'])
        assert "goal's dates now apply" in warnings
        assert 'any matching instance now counts' in warnings

    def test_repeated_metrics_keep_the_first_rule(self):
        plan = plan_conversion([_goal()], [_target('t1')], [_metric('t1', value=200), _metric('t1', value=300)])
        assert [rule['value'] for rule in plan.conditions[0].rules] == [Decimal('200.0000')]


@pytest.mark.unit
class TestSeveralTargets:
    def test_targets_become_child_goals_at_the_next_level(self):
        targets = [_target('t1', completed=True), _target('t2', minutes=1)]
        plan = plan_conversion(
            [_goal(level='Mid Term Goal')], targets, [_metric('t1'), _metric('t2')], child_sort_start={'g1': 3},
        )

        assert plan.goal_updates['g1']['completion_condition'] == 'children'
        first, second = plan.new_goals
        assert (first.parent_id, first.level_name, first.sort_order) == ('g1', 'Short Term Goal', 3)
        assert second.sort_order == 4
        assert first.completed and first.completion_source == 'condition' and first.completed_session_id == 's1'
        assert not second.completed and second.completion_source is None
        assert all(goal.inherit_parent_activities for goal in plan.new_goals)
        assert {condition.goal_id for condition in plan.conditions} == {first.id, second.id}
        assert first.id == _stable_id('goal-from-target', 't1')

    def test_lowest_level_keeps_the_first_target_and_sequences_the_rest(self):
        targets = [_target('t1'), _target('t2', minutes=1), _target('t3', minutes=2)]
        plan = plan_conversion([_goal(level='Immediate Goal')], targets, [_metric(t.id) for t in targets])

        (track,) = plan.tracks
        assert track.parent_goal_id == 'parent'
        assert track.goal_ids[0] == 'g1'
        assert plan.goal_updates['g1']['sequence_position'] == 1
        assert [goal.sequence_position for goal in plan.new_goals] == [2, 3]
        assert all(goal.paused for goal in plan.new_goals)
        assert all(goal.parent_id == 'parent' and goal.level_name == 'Immediate Goal' for goal in plan.new_goals)
        assert plan.activity_associations == [('g1', 'act'), *((goal.id, 'act') for goal in plan.new_goals)]
        assert plan.program_memberships == [('g1', goal.id) for goal in plan.new_goals]

    def test_reached_sequence_steps_stay_unpaused(self):
        targets = [_target('t1'), _target('t2', minutes=1, completed=True), _target('t3', minutes=2)]
        plan = plan_conversion([_goal(level='Immediate Goal', completed=True)], targets, [_metric(t.id) for t in targets])

        second, third = plan.new_goals
        assert second.completed and not second.paused
        assert not third.completed and not third.paused

    def test_an_unreached_step_pauses_everything_after_it(self):
        targets = [_target('t1'), _target('t2', minutes=1), _target('t3', minutes=2, completed=True)]
        plan = plan_conversion([_goal(level='Immediate Goal')], targets, [])

        second, third = plan.new_goals
        assert second.paused
        assert third.completed and not third.paused

    def test_plans_are_deterministic(self):
        goals = [_goal(level='Mid Term Goal')]
        targets = [_target('t2', minutes=1), _target('t1')]
        first = plan_conversion(goals, targets, [])
        second = plan_conversion(goals, list(reversed(targets)), [])
        assert [goal.id for goal in first.new_goals] == [goal.id for goal in second.new_goals]
        assert first.new_goals[0].name == 'Target t1'


@pytest.mark.unit
def test_report_markdown_summarizes_by_fractal():
    plan = plan_conversion([_goal(level='Mid Term Goal')], [_target('t1'), _target('t2', minutes=1)], [])
    report = render_report_markdown(plan)
    assert '- Goals created: 2' in report
    assert '## Fractal root' in report
    assert '2 targets became child goals' in report
