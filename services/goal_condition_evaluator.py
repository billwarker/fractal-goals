"""Pure evaluation of a goal's activity-threshold condition over its evidence.

No database access: callers resolve the goal's evidence (see `goal_condition_evidence`) and pass
plain values. State is never stored; every caller recomputes from canonical results, so progress,
completion, and reversal all agree.

Evidence shape. Each instance carries its completed-at time and a list of sets; an instance
recorded without sets contributes its instance-level metrics as one set. Within a set, a metric may
hold several values (one per split, e.g. left/right): a rule holds only when every value satisfies
it, cumulative totals add every value, and yield multiplies each metric's largest value.

Kinds:
- single_session/sets: one instance has at least `min_sets` sets that meet every rule.
- single_session/yield: one instance's total yield (sum over sets of the product of the yield
  metrics) meets the total.
- cumulative/metric | cumulative/yield: the running total across instances meets the total.
- consistency/sets: `required_count` instances qualify (a set meets every rule, or any instance
  when there are no rules).
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


@dataclass(frozen=True)
class EvidenceSet:
    values: dict[str, tuple[float, ...]]


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
            'rule_bests': [
                {
                    'metric_definition_id': rule.metric_definition_id,
                    'operator': rule.operator,
                    'value': _round(rule.value),
                    'best': _round(rule.best),
                    'best_instance_id': rule.best_instance_id,
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


def _rule_bests(spec: ConditionSpec, instances: list[EvidenceInstance]) -> list[RuleBest]:
    bests = [RuleBest(rule.metric_definition_id, rule.operator, rule.value) for rule in spec.rules]
    for instance in instances:
        for row in instance.sets:
            for rule, best in zip(spec.rules, bests):
                values = _rule_values(row, rule)
                if not values:
                    continue
                # A set's value for a split metric is its weakest side.
                candidate = min(values) if rule.operator in ('>=', '>', '==') else max(values)
                if _better(candidate, best.best, rule.operator):
                    best.best = candidate
                    best.best_instance_id = instance.id
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


def _evaluate_consistency(spec: ConditionSpec, instances: list[EvidenceInstance]) -> ConditionEvaluation:
    required = max(1, spec.required_count or 1)
    evaluation = ConditionEvaluation(met=False, progress=0.0, current=0, required=required)
    count = 0
    for instance in instances:
        qualifies = not spec.rules or any(set_meets_rules(row, spec.rules) for row in instance.sets)
        if not qualifies:
            continue
        count += 1
        if count == required:
            evaluation.met = True
            _achieved(evaluation, instance)
    evaluation.current = count
    evaluation.progress = min(1.0, count / required)
    return evaluation


def evaluate_condition(spec: ConditionSpec, instances) -> ConditionEvaluation:
    ordered = _ordered(instances)
    if spec.kind == 'single_session' and spec.measure == 'sets':
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
