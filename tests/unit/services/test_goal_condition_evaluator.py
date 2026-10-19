from datetime import datetime, timedelta, timezone

import pytest

from services.goal_condition_evaluator import (
    ConditionSpec,
    EvidenceInstance,
    EvidenceSet,
    MetricRule,
    closeness,
    compare,
    evaluate_condition,
)

T0 = datetime(2026, 10, 1, 12, tzinfo=timezone.utc)
WEIGHT, REPS = 'weight', 'reps'


def _instance(instance_id, *sets, days=0, session_id=None):
    return EvidenceInstance(
        id=instance_id,
        session_id=session_id or f'session-{instance_id}',
        occurred_at=T0 + timedelta(days=days),
        sets=tuple(EvidenceSet(values={key: tuple(value if isinstance(value, tuple) else (value,))
                                       for key, value in values.items()}) for values in sets),
    )


def _rules(weight=225, reps=6):
    return (MetricRule(WEIGHT, '>=', weight), MetricRule(REPS, '>=', reps))


@pytest.mark.unit
class TestComparisons:
    @pytest.mark.parametrize('actual,operator,threshold,expected', [
        (225, '>=', 225, True), (224.99, '>=', 225, False),
        (225, '>', 225, False), (225.01, '>', 225, True),
        (30, '<=', 30, True), (30.01, '<=', 30, False),
        (30, '<', 30, False), (29.99, '<', 30, True),
        (102.5, '==', 102.5, True), (102.6, '==', 102.5, False),
    ])
    def test_boundaries(self, actual, operator, threshold, expected):
        assert compare(actual, operator, threshold) is expected

    def test_closeness_scales_toward_the_threshold(self):
        assert closeness(200, '>=', 225) == pytest.approx(200 / 225)
        assert closeness(300, '>=', 225) == 1.0
        assert closeness(40, '<=', 30) == pytest.approx(30 / 40)
        assert closeness(5, '>=', 0) == 1.0


@pytest.mark.unit
class TestSingleSessionSets:
    def test_exactly_min_sets_meeting_every_rule_completes(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=3)
        evidence = [_instance('a', {WEIGHT: 225, REPS: 6}, {WEIGHT: 230, REPS: 7}, {WEIGHT: 225, REPS: 6})]

        result = evaluate_condition(spec, evidence)

        assert result.met is True
        assert result.current == 3
        assert result.progress == 1.0
        assert result.achieving_instance_id == 'a'
        assert result.achieving_session_id == 'session-a'

    def test_one_set_short_does_not_complete_and_reports_partial_progress(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=3)
        evidence = [_instance('a', {WEIGHT: 225, REPS: 6}, {WEIGHT: 225, REPS: 6}, {WEIGHT: 225, REPS: 5})]

        result = evaluate_condition(spec, evidence)

        assert result.met is False
        assert result.current == 2
        assert result.progress == pytest.approx((1 + 1 + 5 / 6) / 3)

    def test_sets_must_come_from_one_instance(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=2)
        evidence = [
            _instance('a', {WEIGHT: 225, REPS: 6}, days=0),
            _instance('b', {WEIGHT: 225, REPS: 6}, days=1),
        ]

        assert evaluate_condition(spec, evidence).met is False

    def test_every_rule_must_hold_in_the_same_set(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=1)
        evidence = [_instance('a', {WEIGHT: 230, REPS: 3}, {WEIGHT: 135, REPS: 10})]

        result = evaluate_condition(spec, evidence)

        assert result.met is False
        assert [best.best for best in result.rule_bests] == [230, 10]

    def test_missing_metric_fails_the_rule(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=1)
        assert evaluate_condition(spec, [_instance('a', {WEIGHT: 300})]).met is False

    def test_every_split_value_must_satisfy_the_rule(self):
        spec = ConditionSpec('single_session', 'sets', rules=(MetricRule(REPS, '>=', 8),), min_sets=1)
        both_sides = [_instance('a', {REPS: (8, 9)})]
        one_side_short = [_instance('a', {REPS: (8, 7)})]

        assert evaluate_condition(spec, both_sides).met is True
        assert evaluate_condition(spec, one_side_short).met is False
        assert evaluate_condition(spec, one_side_short).rule_bests[0].best == 7

    def test_fractional_thresholds_are_exact(self):
        spec = ConditionSpec('single_session', 'sets', rules=(MetricRule(WEIGHT, '>=', 102.5),), min_sets=1)
        assert evaluate_condition(spec, [_instance('a', {WEIGHT: 102.5})]).met is True
        assert evaluate_condition(spec, [_instance('a', {WEIGHT: 102.4})]).met is False

    def test_the_earliest_qualifying_instance_achieves_the_condition(self):
        spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=1)
        evidence = [
            _instance('late', {WEIGHT: 240, REPS: 6}, days=5),
            _instance('early', {WEIGHT: 225, REPS: 6}, days=2),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.achieving_instance_id == 'early'
        assert result.achieved_at == T0 + timedelta(days=2)


@pytest.mark.unit
class TestYield:
    def test_single_session_yield_sums_set_products(self):
        spec = ConditionSpec(
            'single_session', 'yield', operator='>=', target_value=3000, yield_metric_ids=(WEIGHT, REPS),
        )
        exactly = [_instance('a', {WEIGHT: 200, REPS: 5}, {WEIGHT: 200, REPS: 5}, {WEIGHT: 100, REPS: 10})]
        short = [_instance('a', {WEIGHT: 200, REPS: 5}, {WEIGHT: 199, REPS: 5}, {WEIGHT: 100, REPS: 10})]

        assert evaluate_condition(spec, exactly).met is True
        assert evaluate_condition(spec, exactly).current == 3000
        assert evaluate_condition(spec, short).met is False

    def test_sets_missing_a_yield_metric_add_nothing(self):
        spec = ConditionSpec(
            'single_session', 'yield', operator='>=', target_value=1000, yield_metric_ids=(WEIGHT, REPS),
        )
        result = evaluate_condition(spec, [_instance('a', {WEIGHT: 200, REPS: 5}, {WEIGHT: 500})])
        assert result.current == 1000

    def test_yield_without_two_metrics_never_completes(self):
        spec = ConditionSpec('single_session', 'yield', operator='>=', target_value=1, yield_metric_ids=(WEIGHT,))
        assert evaluate_condition(spec, [_instance('a', {WEIGHT: 500})]).met is False


@pytest.mark.unit
class TestCumulative:
    def test_running_total_crossing_the_threshold_names_the_achieving_instance(self):
        spec = ConditionSpec('cumulative', 'metric', metric_definition_id=REPS, operator='>=', target_value=100)
        evidence = [
            _instance('a', {REPS: 30}, {REPS: 30}, days=0),
            _instance('b', {REPS: 39}, days=1),
            _instance('c', {REPS: 1}, days=2),
            _instance('d', {REPS: 50}, days=3),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.met is True
        assert result.current == 150
        assert result.achieving_instance_id == 'c'

    def test_one_short_of_the_total_is_unmet(self):
        spec = ConditionSpec('cumulative', 'metric', metric_definition_id=REPS, operator='>=', target_value=100)
        result = evaluate_condition(spec, [_instance('a', {REPS: 99})])

        assert result.met is False
        assert result.progress == pytest.approx(0.99)

    def test_split_values_all_add_to_the_total(self):
        spec = ConditionSpec('cumulative', 'metric', metric_definition_id=REPS, operator='>=', target_value=20)
        assert evaluate_condition(spec, [_instance('a', {REPS: (10, 10)})]).met is True

    def test_a_ceiling_holds_only_once_there_is_evidence(self):
        spec = ConditionSpec('cumulative', 'metric', metric_definition_id=REPS, operator='<=', target_value=10)
        assert evaluate_condition(spec, []).met is False
        assert evaluate_condition(spec, [_instance('a', {REPS: 10})]).met is True
        assert evaluate_condition(spec, [_instance('a', {REPS: 11})]).met is False

    def test_cumulative_yield(self):
        spec = ConditionSpec('cumulative', 'yield', operator='>=', target_value=2000, yield_metric_ids=(WEIGHT, REPS))
        evidence = [_instance('a', {WEIGHT: 100, REPS: 10}, days=0), _instance('b', {WEIGHT: 100, REPS: 10}, days=1)]
        assert evaluate_condition(spec, evidence).achieving_instance_id == 'b'


@pytest.mark.unit
class TestConsistency:
    def test_required_count_of_qualifying_instances(self):
        spec = ConditionSpec('consistency', 'sets', rules=(MetricRule(REPS, '>=', 5),), required_count=3)
        evidence = [
            _instance('a', {REPS: 5}, days=0),
            _instance('b', {REPS: 4}, days=1),
            _instance('c', {REPS: 6}, days=2),
            _instance('d', {REPS: 5}, days=3),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.met is True
        assert result.current == 3
        assert result.achieving_instance_id == 'd'

    def test_one_fewer_qualifying_instance_is_unmet(self):
        spec = ConditionSpec('consistency', 'sets', required_count=3)
        result = evaluate_condition(spec, [_instance('a', days=0), _instance('b', days=1)])

        assert result.met is False
        assert result.progress == pytest.approx(2 / 3)

    def test_without_rules_any_completed_instance_counts(self):
        spec = ConditionSpec('consistency', 'sets', required_count=1)
        assert evaluate_condition(spec, [_instance('a')]).met is True


@pytest.mark.unit
def test_no_evidence_is_unmet_with_zero_progress():
    spec = ConditionSpec('single_session', 'sets', rules=_rules(), min_sets=1)
    result = evaluate_condition(spec, [])

    assert result.met is False
    assert result.progress == 0.0
    assert result.evidence_count == 0
    assert result.to_dict()['rule_bests'][0]['best'] is None
