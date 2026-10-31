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


STRICT, PAUSED = 'strict', 'paused'


def _tagged(values, *tags):
    return EvidenceSet(
        values={key: value if isinstance(value, tuple) else (value,) for key, value in values.items()},
        tag_ids=frozenset(tags),
    )


def _tagged_instance(instance_id, *sets, days=0):
    return EvidenceInstance(
        id=instance_id, session_id=f'session-{instance_id}', occurred_at=T0 + timedelta(days=days), sets=tuple(sets),
    )


@pytest.mark.unit
class TestTagScoping:
    def test_single_session_counts_only_sets_carrying_every_tag(self):
        spec = ConditionSpec(
            'single_session', 'sets', rules=(MetricRule(REPS, '>=', 5),), min_sets=2,
            tag_ids=frozenset({STRICT, PAUSED}),
        )
        evidence = [_tagged_instance(
            'a',
            _tagged({REPS: 6}, STRICT, PAUSED),
            _tagged({REPS: 9}, STRICT),  # partial match does not count
            _tagged({REPS: 9}),
        )]

        result = evaluate_condition(spec, evidence)

        assert result.met is False
        assert result.current == 1
        assert result.rule_bests[0].best == 6

    def test_single_session_yield_and_cumulative_totals_skip_untagged_sets(self):
        tags = frozenset({STRICT})
        evidence = [_tagged_instance('a', _tagged({WEIGHT: 100, REPS: 5}, STRICT), _tagged({WEIGHT: 100, REPS: 50}))]

        single = evaluate_condition(ConditionSpec(
            'single_session', 'yield', operator='>=', target_value=1000, yield_metric_ids=(WEIGHT, REPS), tag_ids=tags,
        ), evidence)
        cumulative_metric = evaluate_condition(ConditionSpec(
            'cumulative', 'metric', metric_definition_id=REPS, operator='>=', target_value=10, tag_ids=tags,
        ), evidence)
        cumulative_yield = evaluate_condition(ConditionSpec(
            'cumulative', 'yield', operator='>=', target_value=500, yield_metric_ids=(WEIGHT, REPS), tag_ids=tags,
        ), evidence)

        assert (single.met, single.current) == (False, 500)
        assert (cumulative_metric.met, cumulative_metric.current) == (False, 5)
        assert (cumulative_yield.met, cumulative_yield.current) == (True, 500)

    def test_rule_free_consistency_needs_a_tagged_set(self):
        spec = ConditionSpec('consistency', 'sets', required_count=2, tag_ids=frozenset({STRICT}))
        evidence = [
            _tagged_instance('a', _tagged({}, STRICT), days=0),
            _tagged_instance('b', _tagged({}), days=1),
            _tagged_instance('c', _tagged({}, STRICT), days=2),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.met is True
        assert result.achieving_instance_id == 'c'

    def test_untagged_rule_free_consistency_still_counts_instances_without_sets(self):
        spec = ConditionSpec('consistency', 'sets', required_count=1)

        assert evaluate_condition(spec, [_tagged_instance('a')]).met is True


@pytest.mark.unit
class TestConsecutive:
    def _evidence(self, *reps):
        return [_tagged_instance(f'i{day}', _tagged({REPS: value}), days=day) for day, value in enumerate(reps)]

    def test_a_miss_resets_the_streak(self):
        spec = ConditionSpec('consistency', 'sets', rules=(MetricRule(REPS, '>=', 5),), required_count=3, consecutive=True)

        result = evaluate_condition(spec, self._evidence(5, 6, 1, 7))

        assert result.met is False
        assert result.current == 1
        assert result.best_streak == 2
        assert result.progress == pytest.approx(1 / 3)

    def test_streak_latches_once_met(self):
        spec = ConditionSpec('consistency', 'sets', rules=(MetricRule(REPS, '>=', 5),), required_count=2, consecutive=True)

        result = evaluate_condition(spec, self._evidence(1, 5, 6, 1, 1))

        assert result.met is True
        assert result.achieving_instance_id == 'i2'
        assert result.current == 2
        assert result.best_streak == 2
        assert result.progress == 1.0

    def test_without_consecutive_misses_do_not_reset(self):
        spec = ConditionSpec('consistency', 'sets', rules=(MetricRule(REPS, '>=', 5),), required_count=3)

        result = evaluate_condition(spec, self._evidence(5, 1, 6, 1, 7))

        assert result.met is True
        assert result.best_streak is None

    def test_tag_misses_break_a_streak(self):
        spec = ConditionSpec('consistency', 'sets', required_count=2, consecutive=True, tag_ids=frozenset({STRICT}))
        evidence = [
            _tagged_instance('a', _tagged({}, STRICT), days=0),
            _tagged_instance('b', _tagged({}), days=1),
            _tagged_instance('c', _tagged({}, STRICT), days=2),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.met is False
        assert result.best_streak == 1


HOLD = 'hold'


@pytest.mark.unit
class TestSetAverages:
    def _session(self, instance_id, *holds, days=0, tags=()):
        return _tagged_instance(instance_id, *(_tagged({HOLD: hold}, *tags) for hold in holds), days=days)

    def test_one_session_averages_every_counted_set(self):
        spec = ConditionSpec('single_session', 'sets', rules=(MetricRule(HOLD, '>=', 5),), min_sets=3, set_aggregate='average')

        short = evaluate_condition(spec, [self._session('a', 7, 6, 1)])  # average 4.67
        enough = evaluate_condition(spec, [self._session('a', 7, 6, 1, days=0), self._session('b', 6, 4, 5, days=1)])

        assert short.met is False
        assert short.rule_bests[0].best_average == pytest.approx(14 / 3, abs=1e-4)
        assert enough.met is True
        assert enough.achieving_instance_id == 'b'

    def test_needs_at_least_min_sets_logging_the_metric(self):
        spec = ConditionSpec('single_session', 'sets', rules=(MetricRule(HOLD, '>=', 5),), min_sets=3, set_aggregate='average')
        evidence = [_tagged_instance('a', _tagged({HOLD: 9}), _tagged({HOLD: 9}), _tagged({}))]

        result = evaluate_condition(spec, evidence)

        assert result.met is False
        assert result.current == 2
        assert result.rule_bests[0].best_average is None

    def test_tags_choose_which_sets_are_averaged(self):
        spec = ConditionSpec(
            'single_session', 'sets', rules=(MetricRule(HOLD, '>=', 5),), min_sets=2, set_aggregate='average',
            tag_ids=frozenset({'working'}),
        )
        evidence = [_tagged_instance('a', _tagged({HOLD: 1}), _tagged({HOLD: 5}, 'working'), _tagged({HOLD: 6}, 'working'))]

        assert evaluate_condition(spec, evidence).met is True

    def test_split_sets_average_their_weakest_side(self):
        spec = ConditionSpec('single_session', 'sets', rules=(MetricRule(HOLD, '>=', 5),), min_sets=2, set_aggregate='average')
        evidence = [_tagged_instance('a', _tagged({HOLD: (8, 4)}), _tagged({HOLD: (6, 5)}))]

        assert evaluate_condition(spec, evidence).met is False  # (4 + 5) / 2

    def test_consistency_counts_sessions_whose_average_meets_and_can_streak(self):
        spec = ConditionSpec(
            'consistency', 'sets', rules=(MetricRule(HOLD, '>=', 5),), min_sets=2, required_count=2,
            set_aggregate='average', consecutive=True,
        )
        evidence = [
            self._session('a', 5, 6, days=0),
            self._session('b', 3, 4, days=1),
            self._session('c', 6, 4, days=2),
            self._session('d', 5, 5, days=3),
        ]

        result = evaluate_condition(spec, evidence)

        assert result.met is True
        assert result.achieving_instance_id == 'd'


@pytest.mark.unit
def test_consistency_can_require_several_sets_meeting_the_rules():
    spec = ConditionSpec('consistency', 'sets', rules=(MetricRule(REPS, '>=', 5),), required_count=1, min_sets=2)
    one = _tagged_instance('a', _tagged({REPS: 6}), _tagged({REPS: 1}))
    two = _tagged_instance('b', _tagged({REPS: 6}), _tagged({REPS: 5}), days=1)

    assert evaluate_condition(spec, [one]).met is False
    assert evaluate_condition(spec, [one, two]).achieving_instance_id == 'b'


@pytest.mark.unit
def test_exact_tag_match_ignores_sets_with_extra_tags():
    rules = (MetricRule(REPS, '>=', 5),)
    evidence = [_tagged_instance('a', _tagged({REPS: 9}, STRICT, PAUSED), _tagged({REPS: 6}, STRICT))]
    contains = ConditionSpec('single_session', 'sets', rules=rules, min_sets=2, tag_ids=frozenset({STRICT}))
    exact = ConditionSpec('single_session', 'sets', rules=rules, min_sets=2, tag_ids=frozenset({STRICT}), tag_match='exact')

    assert evaluate_condition(contains, evidence).met is True
    assert evaluate_condition(exact, evidence).current == 1
