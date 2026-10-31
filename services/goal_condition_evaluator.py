"""Pure evaluation of a goal's activity-threshold condition over its evidence.

No database access: callers resolve the goal's evidence (see `goal_condition_evidence`) and pass
plain values. State is never stored; every caller recomputes from canonical results, so progress,
completion, and reversal all agree.

Evidence shape. Each instance carries its completed-at time and a list of sets; an instance
recorded without sets contributes its instance-level metrics as one set. Within a set, a metric may
hold several values (one per split, e.g. left/right): a rule holds only when every value satisfies
it, cumulative totals add every value, and yield multiplies each metric's largest value.

With `set_aggregate = 'average'` (single_session and consistency sets), a session qualifies when,
across all of its counted sets that log every rule's metric (at least `min_sets` of them), the
average of each rule's metric meets the rule. A split metric's set value is its weakest side.

Each set carries its effective tags (its own plus its instance's). A condition with tags counts only
sets carrying every one of them (with `tag_match = 'exact'`, sets whose tags are exactly those), in
every kind: other sets are invisible to it.

Kinds:
- single_session/sets: one instance has at least `min_sets` sets that meet every rule.
- single_session/yield: one instance's total yield (sum over sets of the product of the yield
  metrics) meets the total.
- cumulative/metric | cumulative/yield: the running total across instances meets the total.
- consistency/sets: `required_count` instances qualify (at least `min_sets`, default 1, of its sets
  meet every rule, or any instance with a counted set when there are no rules). With `consecutive`, they must qualify in a row:
  an instance that does not qualify resets the count.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal

RULE_OPERATORS = ('>=', '>', '<=', '<', '==')
EQUALITY_TOLERANCE = 1e-6


@dataclass(frozen=True)
class MetricRule:
    metric_definition_id: str
    operator: str
    value: float


@dataclass(frozen=True)
class ConditionSpec:
    kind: str
    measure: str
    rules: tuple[MetricRule, ...] = ()
    min_sets: int | None = None
    required_count: int | None = None
    metric_definition_id: str | None = None
    operator: str | None = None
    target_value: float | None = None
    yield_metric_ids: tuple[str, ...] = ()
    tag_ids: frozenset[str] = frozenset()
    consecutive: bool = False
    set_aggregate: str = 'each'
    tag_match: str = 'contains'

    @property
    def averages(self) -> bool:
        return self.set_aggregate == 'average'


@dataclass(frozen=True)
class EvidenceSet:
    values: dict[str, tuple[float, ...]]
    tag_ids: frozenset[str] = frozenset()


@dataclass(frozen=True)
class EvidenceInstance:
    id: str
    session_id: str | None
    occurred_at: datetime
    sets: tuple[EvidenceSet, ...]


@dataclass
class RuleBest:
    metric_definition_id: str
    operator: str
    value: float
    best: float | None = None
    best_instance_id: str | None = None
    best_average: float | None = None


@dataclass
class ConditionEvaluation:
    met: bool
    progress: float
    current: float
    required: float
    achieving_instance_id: str | None = None
    achieving_session_id: str | None = None
    achieved_at: datetime | None = None
    evidence_count: int = 0
    best_streak: int | None = None
    rule_bests: list[RuleBest] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            'met': self.met,
            'progress': round(self.progress, 4),
            'current': _round(self.current),
            'required': _round(self.required),
            'achieving_instance_id': self.achieving_instance_id,
            'achieving_session_id': self.achieving_session_id,
            'achieved_at': self.achieved_at,
            'evidence_count': self.evidence_count,
            'best_streak': self.best_streak,
            'rule_bests': [
                {
                    'metric_definition_id': rule.metric_definition_id,
                    'operator': rule.operator,
                    'value': _round(rule.value),
                    'best': _round(rule.best),
                    'best_instance_id': rule.best_instance_id,
                    'best_average': _round(rule.best_average),
                }
                for rule in self.rule_bests
            ],
        }


def _round(value):
    if value is None:
        return None
    rounded = round(float(value), 4)
    return int(rounded) if rounded.is_integer() else rounded


def to_float(value) -> float | None:
    if value is None or isinstance(value, bool):
        return None
    if isinstance(value, Decimal):
        return float(value)
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number and number not in (float('inf'), float('-inf')) else None


def compare(actual: float, operator: str, threshold: float) -> bool:
    if operator == '>=':
        return actual >= threshold - EQUALITY_TOLERANCE
    if operator == '>':
        return actual > threshold
    if operator == '<=':
        return actual <= threshold + EQUALITY_TOLERANCE
    if operator == '<':
        return actual < threshold
    if operator == '==':
        return abs(actual - threshold) <= EQUALITY_TOLERANCE
    return False


def closeness(actual: float, operator: str, threshold: float) -> float:
    """How close `actual` is to satisfying the comparison, in [0, 1]."""
    if compare(actual, operator, threshold):
        return 1.0
    if operator in ('>=', '>'):
        return max(0.0, min(1.0, actual / threshold)) if threshold > 0 else 0.0
    if operator in ('<=', '<'):
        return max(0.0, min(1.0, threshold / actual)) if actual > 0 and threshold >= 0 else 0.0
    high, low = max(actual, threshold), min(actual, threshold)
    return max(0.0, low / high) if high > 0 and low >= 0 else 0.0


def _better(candidate: float, incumbent: float | None, operator: str) -> bool:
    if incumbent is None:
        return True
    if operator in ('<=', '<'):
        return candidate < incumbent
    if operator == '==':
        return False
    return candidate > incumbent


def _rule_values(evidence_set: EvidenceSet, rule: MetricRule) -> tuple[float, ...]:
    return evidence_set.values.get(rule.metric_definition_id, ())


def set_meets_rules(evidence_set: EvidenceSet, rules: tuple[MetricRule, ...]) -> bool:
    for rule in rules:
        values = _rule_values(evidence_set, rule)
        if not values or not all(compare(value, rule.operator, rule.value) for value in values):
            return False
    return True


def _set_score(evidence_set: EvidenceSet, rules: tuple[MetricRule, ...]) -> float:
    score = 1.0
    for rule in rules:
        values = _rule_values(evidence_set, rule)
        if not values:
            return 0.0
        score = min(score, min(closeness(value, rule.operator, rule.value) for value in values))
    return score


def set_yield(evidence_set: EvidenceSet, yield_metric_ids: tuple[str, ...]) -> float | None:
    if len(yield_metric_ids) < 2:
        return None
    product = 1.0
    for metric_id in yield_metric_ids:
        values = evidence_set.values.get(metric_id)
        if not values:
            return None
        product *= max(values)
    return product


def instance_yield(instance: EvidenceInstance, yield_metric_ids: tuple[str, ...]) -> float | None:
    yields = [value for value in (set_yield(row, yield_metric_ids) for row in instance.sets) if value is not None]
    return sum(yields) if yields else None


def instance_metric_total(instance: EvidenceInstance, metric_id: str) -> float:
    return sum(sum(row.values.get(metric_id, ())) for row in instance.sets)


def _ordered(instances) -> list[EvidenceInstance]:
    return sorted(instances, key=lambda instance: (instance.occurred_at, instance.id))


def _counted(instance: EvidenceInstance, tag_ids: frozenset[str], tag_match: str = 'contains') -> EvidenceInstance:
    """The instance as a tagged condition sees it: only sets carrying every tag (or exactly them)."""
    if not tag_ids:
        return instance
    exact = tag_match == 'exact'
    sets = tuple(row for row in instance.sets if (row.tag_ids == tag_ids if exact else tag_ids <= row.tag_ids))
    return instance if len(sets) == len(instance.sets) else EvidenceInstance(
        id=instance.id, session_id=instance.session_id, occurred_at=instance.occurred_at, sets=sets,
    )


def _set_value(values: tuple[float, ...], operator: str) -> float:
    """A set's value for a rule: a split metric counts at its weakest side."""
    return min(values) if operator in ('>=', '>', '==') else max(values)


def session_averages(instance: EvidenceInstance, rules: tuple[MetricRule, ...]) -> tuple[int, list[float]]:
    """(sets averaged, average per rule) over the instance's sets that log every rule's metric."""
    scored = [row for row in instance.sets if all(_rule_values(row, rule) for rule in rules)]
    if not scored:
        return 0, []
    return len(scored), [
        sum(_set_value(_rule_values(row, rule), rule.operator) for row in scored) / len(scored)
        for rule in rules
    ]


def _average_meets(spec: ConditionSpec, instance: EvidenceInstance) -> bool:
    count, averages = session_averages(instance, spec.rules)
    return count >= max(1, spec.min_sets or 1) and all(
        compare(average, rule.operator, rule.value) for rule, average in zip(spec.rules, averages)
    )


def _rule_bests(spec: ConditionSpec, instances: list[EvidenceInstance]) -> list[RuleBest]:
    bests = [RuleBest(rule.metric_definition_id, rule.operator, rule.value) for rule in spec.rules]
    for instance in instances:
        for row in instance.sets:
            for rule, best in zip(spec.rules, bests):
                values = _rule_values(row, rule)
                if not values:
                    continue
                candidate = _set_value(values, rule.operator)
                if _better(candidate, best.best, rule.operator):
                    best.best = candidate
                    best.best_instance_id = instance.id
        if spec.averages:
            count, averages = session_averages(instance, spec.rules)
            for best, average in zip(bests, averages if count >= max(1, spec.min_sets or 1) else ()):
                if _better(average, best.best_average, best.operator):
                    best.best_average = average
    return bests


def _achieved(evaluation: ConditionEvaluation, instance: EvidenceInstance) -> ConditionEvaluation:
    evaluation.achieving_instance_id = instance.id
    evaluation.achieving_session_id = instance.session_id
    evaluation.achieved_at = instance.occurred_at
    return evaluation


def _evaluate_single_session_sets(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    min_sets = max(1, spec.min_sets or 1)
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0, required=min_sets)
    for instance in instances:
        met_sets = sum(1 for row in instance.sets if set_meets_rules(row, spec.rules))
        scores = sorted((_set_score(row, spec.rules) for row in instance.sets), reverse=True)[:min_sets]
        evaluation.progress = max(evaluation.progress, sum(scores) / min_sets)
        evaluation.current = max(evaluation.current, met_sets)
        if met_sets >= min_sets and not evaluation.met:
            evaluation.met = True
            _achieved(evaluation, instance)
    if evaluation.met:
        evaluation.progress = 1.0
    return evaluation


def _evaluate_single_session_average(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    """`current` is the most sets averaged in one session; progress is how close the averages come."""
    min_sets = max(1, spec.min_sets or 1)
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0, required=min_sets)
    for instance in instances:
        count, averages = session_averages(instance, spec.rules)
        if not count:
            continue
        evaluation.current = max(evaluation.current, count)
        closeness_score = min(
            closeness(average, rule.operator, rule.value) for rule, average in zip(spec.rules, averages)
        )
        evaluation.progress = max(evaluation.progress, closeness_score * min(1.0, count / min_sets))
        if not evaluation.met and _average_meets(spec, instance):
            evaluation.met = True
            _achieved(evaluation, instance)
    if evaluation.met:
        evaluation.progress = 1.0
    return evaluation


def _evaluate_single_session_yield(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    threshold = spec.target_value or 0.0
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0.0, required=threshold)
    best = None
    for instance in instances:
        total = instance_yield(instance, spec.yield_metric_ids)
        if total is None:
            continue
        if _better(total, best, spec.operator or '>='):
            best = total
        evaluation.progress = max(evaluation.progress, closeness(total, spec.operator or '>=', threshold))
        if compare(total, spec.operator or '>=', threshold) and not evaluation.met:
            evaluation.met = True
            _achieved(evaluation, instance)
    evaluation.current = best or 0.0
    return evaluation


def _evaluate_cumulative(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    threshold = spec.target_value or 0.0
    operator = spec.operator or '>='
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0.0, required=threshold)
    running = 0.0
    for instance in instances:
        if spec.measure == 'yield':
            running += instance_yield(instance, spec.yield_metric_ids) or 0.0
        else:
            running += instance_metric_total(instance, spec.metric_definition_id or '')
        if not evaluation.met and compare(running, operator, threshold) and operator in ('>=', '>'):
            evaluation.met = True
            _achieved(evaluation, instance)
    evaluation.current = running
    if operator in ('<=', '<'):
        # A ceiling on a total is only known to hold once the period has evidence.
        evaluation.met = bool(instances) and compare(running, operator, threshold)
        if evaluation.met:
            _achieved(evaluation, instances[-1])
    evaluation.progress = closeness(running, operator, threshold) if instances else 0.0
    return evaluation


def _instance_qualifies(spec: ConditionSpec, instance: EvidenceInstance) -> bool:
    if spec.averages and spec.rules:
        return _average_meets(spec, instance)
    if not spec.rules:
        # Untagged, any completed instance counts; tagged, it needs a set carrying the tags.
        return not spec.tag_ids or bool(instance.sets)
    return sum(1 for row in instance.sets if set_meets_rules(row, spec.rules)) >= max(1, spec.min_sets or 1)


def _evaluate_consistency(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    required = max(1, spec.required_count or 1)
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0, required=required)
    count = best = 0
    for instance in instances:
        if not _instance_qualifies(spec, instance):
            if spec.consecutive:
                count = 0
            continue
        count += 1
        best = max(best, count)
        if count == required and not evaluation.met:
            evaluation.met = True
            _achieved(evaluation, instance)
    if spec.consecutive:
        # Once met, a later miss does not undo it; until then, progress is the live streak.
        evaluation.best_streak = best
        evaluation.current = required if evaluation.met else count
    else:
        evaluation.current = count
    evaluation.progress = min(1.0, evaluation.current / required)
    return evaluation


def evaluate_condition(spec: ConditionSpec, instances) -> ConditionEvaluation:
    ordered = [_counted(instance, spec.tag_ids, spec.tag_match) for instance in _ordered(instances)]
    if spec.kind == 'single_session' and spec.measure == 'sets' and spec.averages:
        evaluation = _evaluate_single_session_average(spec, ordered)
    elif spec.kind == 'single_session' and spec.measure == 'sets':
        evaluation = _evaluate_single_session_sets(spec, ordered)
    elif spec.kind == 'single_session' and spec.measure == 'yield':
        evaluation = _evaluate_single_session_yield(spec, ordered)
    elif spec.kind == 'cumulative':
        evaluation = _evaluate_cumulative(spec, ordered)
    elif spec.kind == 'consistency':
        evaluation = _evaluate_consistency(spec, ordered)
    else:
        evaluation = ConditionEvaluation(met=False, progress=0.0, current=0, required=0)
    evaluation.evidence_count = len(ordered)
    evaluation.rule_bests = _rule_bests(spec, ordered)
    return evaluation
