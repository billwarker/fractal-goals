"""Goal completion conditions: validation, persistence, evaluation, and reconciliation.

A goal completes in exactly one way (`goals.completion_condition`): an activity threshold, all of
its children, or manually. Manual completion is always available as an override. Activity
thresholds are evaluated from canonical evidence on every relevant change and never stored as
progress, so completion follows the evidence exactly: meeting the condition completes the goal,
and losing that evidence reverts a goal the condition completed.
"""
from __future__ import annotations

from dataclasses import replace
from datetime import datetime, timezone
from decimal import Decimal, InvalidOperation
import logging

from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityTagDefinition,
    COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    COMPLETION_CONDITION_CHILDREN,
    COMPLETION_CONDITION_MANUAL,
    COMPLETION_CONDITIONS,
    CONDITION_NAME_MAX_LENGTH,
    Goal,
    GoalCompletionCondition,
    GoalConditionMetricRule,
    GoalConditionTag,
    ActivityInstance,
    MetricDefinition,
    activity_goal_associations,
    activity_instance_goal_associations,
)
from services._completion_context import _build_event, _queue_event, _track_goal_completion
from services.events import Events
from services.goal_condition_evaluator import (
    RULE_OPERATORS,
    ConditionEvaluation,
    ConditionSpec,
    MetricRule,
    evaluate_condition,
)
from services.association_reconciliation import append_goal_association_event
from services.goal_condition_evidence import associated_goal_ids, collect_goal_activity_instances, to_evidence
from services.goal_contribution import as_utc_datetime
from services.goal_sequence_service import advance_after_completion, revert_after_uncompletion

logger = logging.getLogger(__name__)

CONDITION_KINDS = ('single_session', 'cumulative', 'consistency')
KIND_MEASURES = {
    'single_session': ('sets', 'yield'),
    'cumulative': ('metric', 'yield'),
    'consistency': ('sets',),
}
TOTAL_OPERATORS = ('>=', '>', '<=', '<')
MAX_RULES = 10
MAX_CONDITION_TAGS = 10
# 'each': sets meet the rules one by one; 'average': a session's counted sets meet them on average.
SET_AGGREGATES = ('each', 'average')
TAG_MATCHES = ('contains', 'exact')
MAX_MIN_SETS = 100
MAX_REQUIRED_COUNT = 10000
MAX_VALUE = Decimal('9999999999.9999')
MAX_PROGRESS_GOALS = 200


class ConditionValidationError(ValueError):
    """A condition payload that cannot be stored."""


def _decimal(value, label) -> Decimal:
    if isinstance(value, bool):
        raise ConditionValidationError(f'{label} must be a number')
    try:
        number = Decimal(str(value))
    except (InvalidOperation, TypeError, ValueError):
        raise ConditionValidationError(f'{label} must be a number') from None
    if not number.is_finite() or abs(number) > MAX_VALUE:
        raise ConditionValidationError(f'{label} is out of range')
    return number.quantize(Decimal('0.0001'))


def _bounded_int(value, label, maximum) -> int:
    if isinstance(value, bool) or value is None or value == '':
        raise ConditionValidationError(f'{label} is required')
    if isinstance(value, float) and value.is_integer():
        value = int(value)
    if isinstance(value, str) and value.strip().isdigit():
        value = int(value.strip())
    if not isinstance(value, int):
        raise ConditionValidationError(f'{label} must be a whole number')
    number = value
    if number < 1 or number > maximum:
        raise ConditionValidationError(f'{label} must be between 1 and {maximum}')
    return number


def _condition_name(value) -> str | None:
    """An optional display name; blank means the condition is described from its rules."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ConditionValidationError('Name must be text')
    name = ' '.join(value.split())
    if len(name) > CONDITION_NAME_MAX_LENGTH:
        raise ConditionValidationError(f'Name must be at most {CONDITION_NAME_MAX_LENGTH} characters')
    return name or None


def active_metric_definitions(activity) -> list[MetricDefinition]:
    return [
        metric for metric in (activity.metric_definitions or [])
        if not metric.deleted_at and metric.is_active is not False
    ]


def yield_metric_ids(activity) -> tuple[str, ...]:
    """Metrics whose product is the activity's yield (two or more, all multiplicative)."""
    metrics = [metric for metric in active_metric_definitions(activity) if metric.track_progress is not False]
    if len(metrics) < 2 or not all(metric.multiplies for metric in metrics):
        return ()
    return tuple(str(metric.id) for metric in sorted(metrics, key=lambda metric: (metric.sort_order or 0, str(metric.id))))


def _load_activity(db_session, root_id, activity_id):
    if not activity_id:
        return None
    return db_session.query(ActivityDefinition).options(
        selectinload(ActivityDefinition.metric_definitions),
    ).filter(
        ActivityDefinition.id == activity_id,
        ActivityDefinition.root_id == root_id,
        ActivityDefinition.deleted_at.is_(None),
    ).first()


def _condition_tags(db_session, root_id, raw) -> list[ActivityTagDefinition]:
    """Tags every counted set must carry. Archived tags stay valid: archiving only hides a tag."""
    if raw is None:
        return []
    if not isinstance(raw, list) or not all(isinstance(tag_id, str) for tag_id in raw):
        raise ConditionValidationError('Tags must be a list of tag ids')
    tag_ids = list(dict.fromkeys(raw))
    if len(tag_ids) > MAX_CONDITION_TAGS:
        raise ConditionValidationError(f'Use at most {MAX_CONDITION_TAGS} tags')
    if not tag_ids:
        return []
    tags = db_session.query(ActivityTagDefinition).filter(
        ActivityTagDefinition.root_id == root_id,
        ActivityTagDefinition.id.in_(tag_ids),
    ).all()
    if len(tags) != len(tag_ids):
        raise ConditionValidationError('Choose tags in this fractal')
    by_id = {tag.id: tag for tag in tags}
    return [by_id[tag_id] for tag_id in tag_ids]


def normalize_condition_payload(db_session, root_id, data) -> dict:
    """Validate an activity-threshold condition payload against the fractal's activities."""
    if not isinstance(data, dict):
        raise ConditionValidationError('An activity threshold needs a condition')
    activity = _load_activity(db_session, root_id, data.get('activity_definition_id'))
    if activity is None:
        raise ConditionValidationError('Choose an activity in this fractal')
    kind = data.get('kind')
    if kind not in CONDITION_KINDS:
        raise ConditionValidationError('Choose single session, cumulative, or consistency')
    measure = data.get('measure') or KIND_MEASURES[kind][0]
    if measure not in KIND_MEASURES[kind]:
        raise ConditionValidationError(f"'{measure}' is not available for a {kind.replace('_', ' ')} condition")

    metrics_by_id = {str(metric.id): metric for metric in active_metric_definitions(activity)}
    raw_rules = data.get('rules') or []
    if not isinstance(raw_rules, list) or len(raw_rules) > MAX_RULES:
        raise ConditionValidationError(f'Use at most {MAX_RULES} metric rules')
    rules, seen = [], set()
    for position, raw in enumerate(raw_rules):
        metric_id = (raw or {}).get('metric_definition_id')
        if not isinstance(metric_id, str) or metric_id not in metrics_by_id:
            raise ConditionValidationError(f'Rule {position + 1} uses a metric this activity does not track')
        if metric_id in seen:
            raise ConditionValidationError(f"'{metrics_by_id[metric_id].name}' appears in more than one rule")
        seen.add(metric_id)
        operator = '==' if raw.get('operator') == '=' else (raw.get('operator') or '>=')
        if operator not in RULE_OPERATORS:
            raise ConditionValidationError(f'Rule {position + 1} has an unknown comparison')
        rules.append({
            'metric_definition_id': metric_id,
            'operator': operator,
            'value': _decimal(raw.get('value'), f"'{metrics_by_id[metric_id].name}' value"),
            'position': position,
        })

    set_aggregate = data.get('set_aggregate') or 'each'
    if set_aggregate not in SET_AGGREGATES:
        raise ConditionValidationError('Count each set or the average across sets')
    averages = set_aggregate == 'average'
    if averages and (measure != 'sets' or kind not in ('single_session', 'consistency')):
        raise ConditionValidationError('Only sets meeting rules can be averaged')
    if averages and not activity.has_sets:
        raise ConditionValidationError(f"'{activity.name}' logs no sets to average")
    if averages and not rules:
        raise ConditionValidationError('Add at least one metric rule')

    tag_match = data.get('tag_match') or 'contains'
    if tag_match not in TAG_MATCHES:
        raise ConditionValidationError('Match tags by containing or exactly')

    consecutive = data.get('consecutive', False)
    if not isinstance(consecutive, bool):
        raise ConditionValidationError('In a row must be true or false')
    if consecutive and kind != 'consistency':
        raise ConditionValidationError('Only consistency thresholds can require a streak')

    normalized = {
        'activity_definition_id': activity.id, 'name': _condition_name(data.get('name')),
        'kind': kind, 'measure': measure, 'rules': [],
        'min_sets': None, 'required_count': None, 'metric_definition_id': None, 'operator': None,
        'target_value': None, 'consecutive': consecutive, 'set_aggregate': set_aggregate,
        'tags': _condition_tags(db_session, root_id, data.get('tag_ids')),
    }
    # Without tags there is nothing to match exactly.
    normalized['tag_match'] = tag_match if normalized['tags'] else 'contains'
    if measure == 'sets':
        normalized['rules'] = rules
        if kind == 'single_session':
            if not rules:
                raise ConditionValidationError('Add at least one metric rule')
            # An activity without sets is one implicit set per session.
            normalized['min_sets'] = (
                _bounded_int(data.get('min_sets', 1), 'Sets', MAX_MIN_SETS) if activity.has_sets else 1
            )
        else:
            normalized['required_count'] = _bounded_int(data.get('required_count'), 'Times', MAX_REQUIRED_COUNT)
            if rules and activity.has_sets:
                normalized['min_sets'] = _bounded_int(data.get('min_sets', 1), 'Sets', MAX_MIN_SETS)
    else:
        if rules:
            raise ConditionValidationError('Totals do not take per-set rules')
        operator = data.get('operator') or '>='
        if operator not in TOTAL_OPERATORS:
            raise ConditionValidationError('Totals compare with >, >=, <, or <=')
        normalized['operator'] = operator
        normalized['target_value'] = _decimal(data.get('target_value'), 'Total')
        if measure == 'yield' and not yield_metric_ids(activity):
            raise ConditionValidationError(f"'{activity.name}' has no yield (it needs two or more multiplied metrics)")
        if measure == 'metric':
            metric_id = data.get('metric_definition_id')
            if metric_id not in metrics_by_id:
                raise ConditionValidationError('Choose a metric this activity tracks')
            normalized['metric_definition_id'] = metric_id
    return normalized


def build_condition_spec(condition, activity) -> ConditionSpec:
    return ConditionSpec(
        kind=condition.kind,
        measure=condition.measure,
        rules=tuple(
            MetricRule(rule.metric_definition_id, rule.operator, float(rule.value))
            for rule in sorted(condition.rules or [], key=lambda rule: rule.position)
        ),
        min_sets=condition.min_sets,
        required_count=condition.required_count,
        metric_definition_id=condition.metric_definition_id,
        operator=condition.operator,
        target_value=float(condition.target_value) if condition.target_value is not None else None,
        yield_metric_ids=yield_metric_ids(activity) if activity is not None else (),
        # Historical backfills pass revision-local rows that predate tags and streaks.
        tag_ids=frozenset(tag.id for tag in (getattr(condition, 'tags', None) or [])),
        consecutive=bool(getattr(condition, 'consecutive', False)),
        set_aggregate=getattr(condition, 'set_aggregate', None) or 'each',
        tag_match=getattr(condition, 'tag_match', None) or 'contains',
    )


def live_condition(db_session, goal):
    return db_session.query(GoalCompletionCondition).options(
        selectinload(GoalCompletionCondition.rules),
        selectinload(GoalCompletionCondition.tags),
    ).filter(
        GoalCompletionCondition.goal_id == goal.id,
        GoalCompletionCondition.deleted_at.is_(None),
    ).first()


def write_condition(db_session, goal, completion_condition, condition_data):
    """Set how `goal` completes, replacing any live activity condition. Caller validates and commits."""
    if completion_condition not in COMPLETION_CONDITIONS:
        raise ConditionValidationError('Choose activity threshold, children, or manual completion')
    existing = live_condition(db_session, goal)
    now = datetime.now(timezone.utc)
    goal.completion_condition = completion_condition
    if completion_condition != COMPLETION_CONDITION_ACTIVITY_THRESHOLD:
        if existing is not None:
            existing.deleted_at = now
        return None

    normalized = normalize_condition_payload(db_session, goal.root_id or goal.id, condition_data)
    ensure_activity_association(db_session, goal, normalized['activity_definition_id'])
    if existing is not None and existing.activity_definition_id == normalized['activity_definition_id']:
        condition = existing
    else:
        if existing is not None:
            existing.deleted_at = now
            db_session.flush()
        condition = GoalCompletionCondition(
            goal_id=goal.id, root_id=goal.root_id or goal.id,
            activity_definition_id=normalized['activity_definition_id'],
        )
        db_session.add(condition)
    for key in (
        'name', 'kind', 'measure', 'min_sets', 'required_count', 'metric_definition_id', 'operator',
        'target_value', 'consecutive', 'set_aggregate', 'tag_match', 'tags',
    ):
        setattr(condition, key, normalized[key])
    db_session.flush()

    current = {rule.metric_definition_id: rule for rule in (condition.rules or [])}
    incoming = {rule['metric_definition_id'] for rule in normalized['rules']}
    for metric_id, rule in current.items():
        if metric_id not in incoming:
            condition.rules.remove(rule)
    db_session.flush()
    for rule_data in normalized['rules']:
        rule = current.get(rule_data['metric_definition_id'])
        if rule is None or rule not in condition.rules:
            condition.rules.append(GoalConditionMetricRule(**rule_data))
        else:
            rule.operator, rule.value, rule.position = rule_data['operator'], rule_data['value'], rule_data['position']
    db_session.flush()
    db_session.expire(goal, ['condition'])
    return condition


def ensure_activity_association(db_session, goal, activity_id):
    """A goal's condition activity is its evidence: associate it unless the goal already counts it.

    Goals curated with one-off instance links for this activity keep that narrower evidence.
    """
    root_id = goal.root_id or goal.id
    counted_by = {goal.id} | ({goal.parent_id} if goal.inherit_parent_activities and goal.parent_id else set())
    if associated_goal_ids(db_session, activity_id, counted_by):
        return
    links = activity_instance_goal_associations
    curated = db_session.execute(select(links.c.activity_instance_id).join(
        ActivityInstance, ActivityInstance.id == links.c.activity_instance_id,
    ).where(
        links.c.goal_id == goal.id, links.c.deleted_at.is_(None),
        ActivityInstance.activity_definition_id == activity_id, ActivityInstance.deleted_at.is_(None),
    ).limit(1)).first()
    if curated is not None:
        return
    activity = db_session.get(ActivityDefinition, activity_id)
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    existing = db_session.execute(activity_goal_associations.select().where(
        activity_goal_associations.c.activity_id == activity_id,
        activity_goal_associations.c.goal_id == goal.id,
    )).first()
    if existing is not None:
        db_session.execute(activity_goal_associations.update().where(
            activity_goal_associations.c.activity_id == activity_id,
            activity_goal_associations.c.goal_id == goal.id,
        ).values(deleted_at=None))
    else:
        db_session.execute(activity_goal_associations.insert().values(
            activity_id=activity_id, goal_id=goal.id, created_at=now,
        ))
    activity.row_version += 1
    append_goal_association_event(
        db_session, root_id=root_id, goal_id=goal.id, association_kind='activity',
        association_id=activity_id, association_name=activity.name, action='associated', occurred_at=now,
    )


def evaluate_goal_condition(
    db_session, goal, goals_by_id, *, history=None, condition=None, activity=None, honor_decline=False,
):
    """Evaluate the goal's activity threshold, or None when it has none.

    `honor_decline` (reconciliation only): once the user un-completes a goal, only evidence newer
    than that decision can complete it again.
    """
    if goal.completion_condition != COMPLETION_CONDITION_ACTIVITY_THRESHOLD:
        return None
    condition = condition or getattr(goal, 'condition', None) or live_condition(db_session, goal)
    if condition is None:
        return None
    root_id = goal.root_id or goal.id
    if activity is None:
        activity = (
            history.activity_definition(condition.activity_definition_id) if history is not None
            else _load_activity(db_session, root_id, condition.activity_definition_id)
        )
    instances = collect_goal_activity_instances(
        db_session, root_id, goal, goals_by_id, condition.activity_definition_id, history=history,
    )
    spec = build_condition_spec(condition, activity)
    evidence = [to_evidence(row) for row in instances]
    evaluation = evaluate_condition(spec, evidence)
    declined_at = as_utc_datetime(goal.manually_uncompleted_at)
    if (
        honor_decline and declined_at and not goal.completed and evaluation.met
        and evaluation.achieved_at and evaluation.achieved_at <= declined_at
    ):
        _apply_decline(evaluation, spec, [row for row in evidence if row.occurred_at > declined_at])
    return evaluation


def _apply_decline(evaluation, spec, newer):
    """Re-anchor a met evaluation on evidence newer than the user's un-completion, or unmeet it.

    A single session must happen again; consistency needs one more qualifying instance; a total
    that is already reached needs any newer contribution.
    """
    if spec.kind == 'cumulative':
        first = min(newer, key=lambda row: (row.occurred_at, row.id)) if newer else None
        evaluation.met = first is not None
        evaluation.achieving_instance_id = first.id if first else None
        evaluation.achieving_session_id = first.session_id if first else None
        evaluation.achieved_at = first.occurred_at if first else None
        return
    renewed_spec = replace(spec, required_count=1) if spec.kind == 'consistency' else spec
    renewed = evaluate_condition(renewed_spec, newer)
    evaluation.met = renewed.met
    evaluation.achieving_instance_id = renewed.achieving_instance_id
    evaluation.achieving_session_id = renewed.achieving_session_id
    evaluation.achieved_at = renewed.achieved_at


def _naive(value: datetime | None) -> datetime | None:
    value = as_utc_datetime(value)
    return value.replace(tzinfo=None) if value else None


def apply_evaluation(db_session, goal, evaluation: ConditionEvaluation | None, pending_events, *, trigger):
    """Bring the goal's completion in line with its condition. Returns 'completed', 'reverted', or None."""
    if evaluation is None:
        return None
    if goal.completed and goal.completion_source == 'condition':
        if not evaluation.met:
            goal.completed = False
            goal.completed_at = None
            goal.completed_session_id = None
            goal.completion_source = None
            goal.completion_reason = 'condition_unmet'
            _queue_event(pending_events, _build_event(Events.GOAL_UNCOMPLETED, {
                'goal_id': goal.id, 'goal_name': goal.name, 'root_id': goal.root_id or goal.id,
                'reason': 'condition_unmet', 'triggered_by': trigger,
            }, db_session))
            revert_after_uncompletion(db_session, goal)
            return 'reverted'
        # Provenance follows the evidence that now satisfies the condition.
        goal.completed_at = _naive(evaluation.achieved_at) or goal.completed_at
        goal.completed_session_id = evaluation.achieving_session_id
        return None
    if goal.completed or goal.paused or not evaluation.met:
        return None
    declined_at = as_utc_datetime(goal.manually_uncompleted_at)
    if declined_at and evaluation.achieved_at and evaluation.achieved_at <= declined_at:
        # Callers that reconcile pass honor_decline; anything else must not override the user's decision.
        return None
    goal.completed = True
    goal.completed_at = _naive(evaluation.achieved_at) or datetime.now(timezone.utc).replace(tzinfo=None)
    goal.completed_session_id = evaluation.achieving_session_id
    goal.completion_source = 'condition'
    goal.completion_reason = 'condition_met'
    goal.manually_uncompleted_at = None
    _track_goal_completion({'id': goal.id, 'name': goal.name})
    _queue_event(pending_events, _build_event(Events.GOAL_COMPLETED, {
        'goal_id': goal.id, 'goal_name': goal.name, 'root_id': goal.root_id or goal.id,
        'auto_completed': True, 'reason': 'condition_met', 'triggered_by': trigger,
        **({'session_id': goal.completed_session_id} if goal.completed_session_id else {}),
    }, db_session))
    advance_after_completion(db_session, goal, pending_events)
    return 'completed'


def reconcile_goal(db_session, goal, goals_by_id, pending_events, *, trigger):
    return apply_evaluation(
        db_session, goal, evaluate_goal_condition(db_session, goal, goals_by_id, honor_decline=True),
        pending_events, trigger=trigger,
    )


def goals_with_activity_condition(db_session, root_id, activity_id) -> set[str]:
    return {goal_id for (goal_id,) in db_session.query(GoalCompletionCondition.goal_id).join(
        Goal, Goal.id == GoalCompletionCondition.goal_id,
    ).filter(
        GoalCompletionCondition.root_id == root_id,
        GoalCompletionCondition.activity_definition_id == activity_id,
        GoalCompletionCondition.deleted_at.is_(None),
        Goal.deleted_at.is_(None),
        Goal.completion_condition == COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    ).all()}


def activities_with_conditions(db_session, root_id, activity_ids) -> set[str]:
    """The subset of `activity_ids` that at least one live activity-threshold goal watches."""
    if not activity_ids:
        return set()
    return {activity_id for (activity_id,) in db_session.query(GoalCompletionCondition.activity_definition_id).join(
        Goal, Goal.id == GoalCompletionCondition.goal_id,
    ).filter(
        GoalCompletionCondition.root_id == root_id,
        GoalCompletionCondition.activity_definition_id.in_(activity_ids),
        GoalCompletionCondition.deleted_at.is_(None),
        Goal.deleted_at.is_(None),
        Goal.completion_condition == COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    ).distinct().all()}


def activities_with_condition_tag(db_session, root_id, tag_id) -> set[str]:
    """Activities whose live thresholds require `tag_id`."""
    return {activity_id for (activity_id,) in db_session.query(GoalCompletionCondition.activity_definition_id).join(
        GoalConditionTag, GoalConditionTag.condition_id == GoalCompletionCondition.id,
    ).filter(
        GoalCompletionCondition.root_id == root_id,
        GoalCompletionCondition.deleted_at.is_(None),
        GoalConditionTag.tag_definition_id == tag_id,
    ).distinct().all()}


def reconcile_activity_conditions(db_session, root_id, activity_id, pending_events, *, trigger, goals_by_id=None):
    """Re-evaluate every goal whose condition watches `activity_id`. Returns {goal_id: outcome}."""
    goal_ids = goals_with_activity_condition(db_session, root_id, activity_id)
    if not goal_ids:
        return {}
    if goals_by_id is None:
        from services.goal_loading import load_fractal_goals_for_serialization
        goals_by_id = load_fractal_goals_for_serialization(db_session, root_id)
    activity = _load_activity(db_session, root_id, activity_id)
    outcomes = {}
    for goal_id in sorted(goal_ids):
        goal = goals_by_id.get(goal_id)
        if goal is None:
            continue
        evaluation = evaluate_goal_condition(db_session, goal, goals_by_id, activity=activity, honor_decline=True)
        outcome = apply_evaluation(db_session, goal, evaluation, pending_events, trigger=trigger)
        if outcome:
            outcomes[goal_id] = outcome
    return outcomes


def children_condition_met(db_session, goal) -> bool:
    children = db_session.query(Goal.completed).filter(Goal.parent_id == goal.id, Goal.deleted_at.is_(None)).all()
    return bool(children) and all(completed for (completed,) in children)


def condition_met_now(db_session, goal, goals_by_id) -> bool:
    if goal.completion_condition == COMPLETION_CONDITION_CHILDREN:
        return children_condition_met(db_session, goal)
    evaluation = evaluate_goal_condition(db_session, goal, goals_by_id)
    return bool(evaluation and evaluation.met)


def condition_progress_payload(goal, evaluation: ConditionEvaluation | None, children=None) -> dict:
    """Progress view-model shared by the goal detail, session panels, and charts."""
    payload = {
        'goal_id': goal.id,
        'completion_condition': goal.completion_condition,
        'completed': bool(goal.completed),
        'completion_source': goal.completion_source,
    }
    if goal.completion_condition == COMPLETION_CONDITION_CHILDREN:
        live = [child for child in (children or []) if not child.deleted_at]
        done = sum(1 for child in live if child.completed)
        payload['children'] = {'completed': done, 'total': len(live)}
        payload['progress'] = (done / len(live)) if live else 0.0
    elif evaluation is not None:
        evaluated = evaluation.to_dict()
        achieved_at = as_utc_datetime(evaluated.pop('achieved_at'))
        payload.update(evaluated)
        payload['achieved_at'] = achieved_at.isoformat().replace('+00:00', 'Z') if achieved_at else None
    else:
        payload['progress'] = 1.0 if goal.completed else 0.0
    return payload


def clamp_progress_goal_ids(goal_ids) -> list[str]:
    unique = list(dict.fromkeys(goal_id for goal_id in goal_ids if goal_id))
    if len(unique) > MAX_PROGRESS_GOALS:
        raise ConditionValidationError(f'Request progress for at most {MAX_PROGRESS_GOALS} goals at once')
    return unique


__all__ = [
    'COMPLETION_CONDITION_ACTIVITY_THRESHOLD',
    'COMPLETION_CONDITION_CHILDREN',
    'COMPLETION_CONDITION_MANUAL',
    'ConditionValidationError',
    'apply_evaluation',
    'build_condition_spec',
    'children_condition_met',
    'clamp_progress_goal_ids',
    'condition_met_now',
    'condition_progress_payload',
    'evaluate_goal_condition',
    'goals_with_activity_condition',
    'live_condition',
    'normalize_condition_payload',
    'activities_with_condition_tag',
    'reconcile_activity_conditions',
    'reconcile_goal',
    'write_condition',
    'yield_metric_ids',
]
