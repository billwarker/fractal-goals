"""Plan the one-time conversion of legacy goal targets into completion conditions.

Pure and deterministic: the planner takes plain rows and returns the writes to apply plus a
human-readable report. Migration A applies the plan with SQL; `scripts/migrate_targets_to_conditions.py`
prints the same plan as a dry run. Generated ids are UUIDv5 values derived from the source target,
so re-planning the same data yields the same rows.

Rules (planning/goal-conditions-hierarchy-creation-sequencing.md, Phase 1):
- no targets: `children` when the goal or its level completed via children, otherwise `manual`;
- one target: that target becomes the goal's condition;
- several targets: each target becomes a child goal at the next level, and the goal completes via
  children. A goal at the lowest level keeps its first target, and each further target becomes a
  same-level sibling placed after it in a sequence track (later steps paused until reached).
Target windows (custom dates, program blocks) and instance bindings are not carried over; the
goal's own active period applies. Completion flags are preserved as they are.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any
from datetime import datetime
from decimal import Decimal
import uuid

import sqlalchemy as sa

CONVERSION_NAMESPACE = uuid.UUID('5f0d3c52-9a3e-4d7b-9a43-0b0f6d8f6a21')
LEVEL_ORDER = ('Ultimate Goal', 'Long Term Goal', 'Mid Term Goal', 'Short Term Goal', 'Immediate Goal')
VALID_RULE_OPERATORS = ('>=', '>', '<=', '<', '==')
TOTAL_OPERATORS = ('>=', '>', '<=', '<')


@dataclass(frozen=True)
class GoalRow:
    id: str
    root_id: str
    parent_id: str | None
    owner_id: str | None
    name: str
    level_name: str | None
    completed: bool
    completed_at: datetime | None
    completion_source: str | None
    completed_via_children: bool
    level_auto_completes: bool
    deadline: datetime | None
    created_at: datetime | None
    inherit_parent_activities: bool
    sort_order: int = 0
    level_id: str | None = None


@dataclass(frozen=True)
class TargetRow:
    id: str
    goal_id: str
    name: str
    type: str | None
    activity_id: str | None
    completed: bool
    completed_at: datetime | None
    completed_session_id: str | None
    created_at: datetime | None
    frequency_count: int | None = None
    time_scope: str | None = None
    activity_instance_id: str | None = None


@dataclass(frozen=True)
class MetricConditionRow:
    target_id: str
    metric_definition_id: str
    operator: str
    target_value: float | int | Decimal


@dataclass
class PlannedCondition:
    id: str
    goal_id: str
    root_id: str
    activity_definition_id: str
    kind: str
    measure: str
    min_sets: int | None = None
    required_count: int | None = None
    metric_definition_id: str | None = None
    operator: str | None = None
    target_value: Decimal | None = None
    rules: list[dict] = field(default_factory=list)


@dataclass
class PlannedGoal:
    id: str
    parent_id: str
    root_id: str
    owner_id: str | None
    level_name: str | None
    name: str
    deadline: datetime | None
    started_at: datetime | None
    completed: bool
    completed_at: datetime | None
    completed_session_id: str | None
    completion_condition: str
    completion_source: str | None
    inherit_parent_activities: bool
    sort_order: int
    paused: bool = False
    sequence_track_id: str | None = None
    sequence_position: int | None = None
    source_target_id: str | None = None
    # Set when the new goal keeps its source's level (siblings); otherwise resolve level_name.
    level_id: str | None = None


@dataclass
class PlannedTrack:
    id: str
    root_id: str
    parent_goal_id: str
    level_name: str | None
    goal_ids: list[str]
    level_id: str | None = None


@dataclass
class ConversionPlan:
    goal_updates: dict[str, dict] = field(default_factory=dict)
    conditions: list[PlannedCondition] = field(default_factory=list)
    new_goals: list[PlannedGoal] = field(default_factory=list)
    tracks: list[PlannedTrack] = field(default_factory=list)
    # (goal_id, activity_id) direct associations the new goals need for evidence.
    activity_associations: list[tuple[str, str]] = field(default_factory=list)
    # (source_goal_id, new_goal_id): copy the source's program memberships to the new goal.
    program_memberships: list[tuple[str, str]] = field(default_factory=list)
    report: list[dict] = field(default_factory=list)

    def summary(self) -> dict:
        return {
            'goals_updated': len(self.goal_updates),
            'conditions_created': len(self.conditions),
            'goals_created': len(self.new_goals),
            'tracks_created': len(self.tracks),
            'warnings': sum(len(entry['warnings']) for entry in self.report),
        }


def _stable_id(kind: str, source_id: str) -> str:
    return str(uuid.uuid5(CONVERSION_NAMESPACE, f'{kind}:{source_id}'))


def _next_level_name(level_name: str | None) -> str | None:
    if level_name not in LEVEL_ORDER:
        return None
    index = LEVEL_ORDER.index(level_name)
    return LEVEL_ORDER[index + 1] if index + 1 < len(LEVEL_ORDER) else None


def _decimal(value) -> Decimal:
    return Decimal(str(value)).quantize(Decimal('0.0001'))


def _target_order(target: TargetRow):
    return (target.created_at or datetime.min, target.id)


def _plan_condition(target: TargetRow, goal_id: str, root_id: str, metrics: list[MetricConditionRow], warnings: list[str]):
    """Return the condition a single target maps to, or None when it cannot carry one."""
    if not target.activity_id:
        warnings.append(f"Target '{target.name}' has no activity; the goal completes manually.")
        return None
    if target.activity_instance_id:
        warnings.append(f"Target '{target.name}' was bound to one activity instance; any matching instance now counts.")
    if target.time_scope and target.time_scope != 'all_time':
        warnings.append(f"Target '{target.name}' used its own '{target.time_scope}' window; the goal's dates now apply.")

    rules = []
    seen_metrics = set()
    for position, metric in enumerate(metrics):
        if metric.metric_definition_id in seen_metrics:
            warnings.append(f"Target '{target.name}' repeated a metric rule; only the first is kept.")
            continue
        seen_metrics.add(metric.metric_definition_id)
        operator = '==' if metric.operator == '=' else metric.operator
        if operator not in VALID_RULE_OPERATORS:
            warnings.append(f"Target '{target.name}' rule with operator '{metric.operator}' was dropped.")
            continue
        rules.append({
            'id': _stable_id('condition-rule', f'{target.id}:{metric.metric_definition_id}'),
            'metric_definition_id': metric.metric_definition_id,
            'operator': operator,
            'value': _decimal(metric.target_value),
            'position': position,
        })

    condition_id = _stable_id('condition', target.id)
    target_type = target.type or 'threshold'
    activity_id = target.activity_id

    def condition(**fields: Any) -> PlannedCondition:
        return PlannedCondition(
            id=condition_id, goal_id=goal_id, root_id=root_id, activity_definition_id=activity_id, **fields,
        )

    if target_type == 'threshold':
        if not rules:
            # A threshold without rules could never be met; keep it from completing on its own.
            warnings.append(f"Target '{target.name}' had no metric rules; the goal completes manually until you set a threshold.")
            return None
        return condition(kind='single_session', measure='sets', min_sets=1, rules=rules)

    if target_type == 'completion':
        return condition(kind='consistency', measure='sets', required_count=1)

    if target_type == 'sum':
        totals = [rule for rule in rules if rule['operator'] in TOTAL_OPERATORS]
        if not totals:
            warnings.append(f"Target '{target.name}' had no usable total; the goal completes manually.")
            return None
        if len(rules) > 1:
            warnings.append(f"Target '{target.name}' summed several metrics; only the first total is kept.")
        first = totals[0]
        return condition(
            kind='cumulative', measure='metric', metric_definition_id=first['metric_definition_id'],
            operator=first['operator'], target_value=first['value'],
        )

    if target_type == 'frequency':
        required = target.frequency_count if target.frequency_count and target.frequency_count > 0 else 1
        if not target.frequency_count or target.frequency_count <= 0:
            warnings.append(f"Target '{target.name}' had no frequency count; one completed instance now counts.")
        warnings.append(f"Target '{target.name}' counted sessions; it now counts completed instances.")
        return condition(kind='consistency', measure='sets', required_count=required, rules=rules)

    warnings.append(f"Target '{target.name}' had unknown type '{target_type}'; the goal completes manually.")
    return None


def _converted_source(goal: GoalRow) -> str | None:
    if not goal.completed:
        return None
    if goal.completion_source == 'target':
        return 'condition'
    if goal.completion_source in ('children', 'manual', 'condition', 'manual_override'):
        return goal.completion_source
    return 'manual'


def plan_conversion(
    goals: list[GoalRow],
    targets: list[TargetRow],
    metric_conditions: list[MetricConditionRow],
    *,
    child_sort_start: dict[str, int] | None = None,
) -> ConversionPlan:
    """Plan the writes that replace every live target with conditions and goals."""
    plan = ConversionPlan()
    metrics_by_target: dict[str, list[MetricConditionRow]] = {}
    for metric in metric_conditions:
        metrics_by_target.setdefault(metric.target_id, []).append(metric)
    targets_by_goal: dict[str, list[TargetRow]] = {}
    for target in targets:
        targets_by_goal.setdefault(target.goal_id, []).append(target)
    next_sort = dict(child_sort_start or {})

    for goal in sorted(goals, key=lambda row: row.id):
        goal_targets = sorted(targets_by_goal.get(goal.id, []), key=_target_order)
        warnings: list[str] = []
        actions: list[str] = []
        source = _converted_source(goal)

        if not goal_targets:
            condition_kind = 'children' if goal.completed_via_children or goal.level_auto_completes else 'manual'
            plan.goal_updates[goal.id] = {'completion_condition': condition_kind, 'completion_source': source}
            if goal.completion_source == 'target':
                actions.append('Completion source recorded as condition.')
            if condition_kind == 'children' or actions:
                plan.report.append({'goal_id': goal.id, 'goal_name': goal.name, 'root_id': goal.root_id,
                                    'actions': actions or ['Completes via children.'], 'warnings': warnings})
            continue

        if len(goal_targets) == 1:
            target = goal_targets[0]
            condition = _plan_condition(target, goal.id, goal.root_id, metrics_by_target.get(target.id, []), warnings)
            if condition:
                plan.conditions.append(condition)
                actions.append(f"Target '{target.name}' became a {condition.kind.replace('_', ' ')} condition.")
            plan.goal_updates[goal.id] = {
                'completion_condition': 'activity_threshold' if condition else 'manual',
                'completion_source': source,
            }
            plan.report.append({'goal_id': goal.id, 'goal_name': goal.name, 'root_id': goal.root_id,
                                'actions': actions, 'warnings': warnings})
            continue

        child_level = _next_level_name(goal.level_name)
        if child_level:
            plan.goal_updates[goal.id] = {'completion_condition': 'children', 'completion_source': source}
            for target in goal_targets:
                plan.new_goals.append(_split_goal(
                    plan, goal, target, metrics_by_target, warnings, actions,
                    parent_id=goal.id, level_name=child_level, next_sort=next_sort,
                    inherit_parent_activities=True,
                ))
            actions.insert(0, f'{len(goal_targets)} targets became child goals; the goal completes via children.')
        elif goal.parent_id is None:
            # A lowest-level root has neither a child level nor siblings to carry extra targets.
            first, *rest = goal_targets
            condition = _plan_condition(first, goal.id, goal.root_id, metrics_by_target.get(first.id, []), warnings)
            if condition:
                plan.conditions.append(condition)
            plan.goal_updates[goal.id] = {
                'completion_condition': 'activity_threshold' if condition else 'manual',
                'completion_source': source,
            }
            warnings.extend(f"Target '{target.name}' was dropped: this goal has no level below it or parent." for target in rest)
        else:
            first, *rest = goal_targets
            condition = _plan_condition(first, goal.id, goal.root_id, metrics_by_target.get(first.id, []), warnings)
            if condition:
                plan.conditions.append(condition)
            plan.goal_updates[goal.id] = {
                'completion_condition': 'activity_threshold' if condition else 'manual',
                'completion_source': source,
            }
            track = PlannedTrack(
                id=_stable_id('track', goal.id), root_id=goal.root_id, parent_goal_id=goal.parent_id,
                level_name=goal.level_name, goal_ids=[goal.id], level_id=goal.level_id,
            )
            plan.goal_updates[goal.id].update({'sequence_track_id': track.id, 'sequence_position': 1})
            reached = True
            for position, target in enumerate(rest, start=2):
                sibling = _split_goal(
                    plan, goal, target, metrics_by_target, warnings, actions,
                    parent_id=goal.parent_id, level_name=goal.level_name, next_sort=next_sort,
                    inherit_parent_activities=goal.inherit_parent_activities,
                )
                sibling.sequence_track_id = track.id
                sibling.sequence_position = position
                sibling.level_id = goal.level_id
                # A step is reached once every step before it is completed.
                previous_completed = goal.completed if position == 2 else plan.new_goals[-1].completed
                reached = reached and previous_completed
                sibling.paused = not sibling.completed and not reached
                plan.program_memberships.append((goal.id, sibling.id))
                plan.new_goals.append(sibling)
                track.goal_ids.append(sibling.id)
            plan.tracks.append(track)
            actions.insert(0, (
                f"Kept target '{first.name}'; {len(rest)} further target(s) became sequenced sibling goals."
            ))

        plan.report.append({'goal_id': goal.id, 'goal_name': goal.name, 'root_id': goal.root_id,
                            'actions': actions, 'warnings': warnings})

    # A condition's activity is the goal's evidence: make sure each converted goal counts it.
    seen = set(plan.activity_associations)
    for condition in plan.conditions:
        pair = (condition.goal_id, condition.activity_definition_id)
        if pair not in seen:
            seen.add(pair)
            plan.activity_associations.append(pair)
    return plan


def _split_goal(plan, goal, target, metrics_by_target, warnings, actions, *, parent_id, level_name,
                next_sort, inherit_parent_activities) -> PlannedGoal:
    new_goal_id = _stable_id('goal-from-target', target.id)
    condition = _plan_condition(target, new_goal_id, goal.root_id, metrics_by_target.get(target.id, []), warnings)
    if condition:
        plan.conditions.append(condition)
    sort_order = next_sort.get(parent_id, 0)
    next_sort[parent_id] = sort_order + 1
    completed = bool(target.completed)
    actions.append(f"Created goal '{target.name}' ({level_name}).")
    return PlannedGoal(
        id=new_goal_id,
        parent_id=parent_id,
        root_id=goal.root_id,
        owner_id=goal.owner_id,
        level_name=level_name,
        name=(target.name or goal.name)[:255],
        deadline=goal.deadline,
        started_at=goal.created_at,
        completed=completed,
        completed_at=target.completed_at if completed else None,
        completed_session_id=target.completed_session_id if completed else None,
        completion_condition='activity_threshold' if condition else 'manual',
        completion_source=('condition' if condition else 'manual') if completed else None,
        inherit_parent_activities=inherit_parent_activities,
        sort_order=sort_order,
        source_target_id=target.id,
    )


def render_report_markdown(plan: ConversionPlan) -> str:
    summary = plan.summary()
    lines = [
        '# Target → condition conversion report',
        '',
        f"- Goals updated: {summary['goals_updated']}",
        f"- Conditions created: {summary['conditions_created']}",
        f"- Goals created: {summary['goals_created']}",
        f"- Sequence tracks created: {summary['tracks_created']}",
        f"- Warnings: {summary['warnings']}",
        '',
    ]
    by_root: dict[str, list[dict]] = {}
    for entry in plan.report:
        by_root.setdefault(entry['root_id'], []).append(entry)
    for root_id in sorted(by_root):
        lines.append(f'## Fractal {root_id}')
        lines.append('')
        for entry in by_root[root_id]:
            lines.append(f"### {entry['goal_name']} (`{entry['goal_id']}`)")
            lines.extend(f'- {action}' for action in entry['actions'])
            lines.extend(f'- ⚠ {warning}' for warning in entry['warnings'])
            lines.append('')
    return '\n'.join(lines)


def load_conversion_inputs(bind):
    """Read live goals, targets, and metric conditions with plain SQL (works before and after migration A)."""
    inspector = sa.inspect(bind)
    if 'targets' not in inspector.get_table_names():
        return None
    goal_columns = {column['name'] for column in inspector.get_columns('goals')}
    level_columns = {column['name'] for column in inspector.get_columns('goal_levels')}
    via_children = 'g.completed_via_children' if 'completed_via_children' in goal_columns else 'false'
    level_auto = (
        'gl.auto_complete_when_children_done' if 'auto_complete_when_children_done' in level_columns else 'false'
    )
    goal_rows = bind.execute(sa.text(f"""
        SELECT g.id, g.root_id, g.parent_id, g.owner_id, g.name, gl.name AS level_name, g.completed,
               g.completed_at, g.completion_source, COALESCE({via_children}, false) AS completed_via_children,
               COALESCE({level_auto}, false) AS level_auto_completes, g.deadline, g.created_at,
               COALESCE(g.inherit_parent_activities, false) AS inherit_parent_activities,
               COALESCE(g.sort_order, 0) AS sort_order, g.level_id
        FROM goals g LEFT JOIN goal_levels gl ON gl.id = g.level_id
        WHERE g.deleted_at IS NULL
    """)).mappings().all()
    target_rows = bind.execute(sa.text("""
        SELECT t.id, t.goal_id, t.name, t.type, t.activity_id, t.completed, t.completed_at,
               t.completed_session_id, t.created_at, t.frequency_count, t.time_scope, t.activity_instance_id
        FROM targets t JOIN goals g ON g.id = t.goal_id
        WHERE t.deleted_at IS NULL AND g.deleted_at IS NULL
    """)).mappings().all()
    metric_rows = bind.execute(sa.text("""
        SELECT c.target_id, c.metric_definition_id, c.operator, c.target_value
        FROM target_metric_conditions c JOIN targets t ON t.id = c.target_id
        WHERE t.deleted_at IS NULL
    """)).mappings().all()
    child_sort_start = {
        row.parent_id: row.next_sort for row in bind.execute(sa.text("""
            SELECT parent_id, COALESCE(MAX(sort_order), -1) + 1 AS next_sort
            FROM goals WHERE parent_id IS NOT NULL AND deleted_at IS NULL GROUP BY parent_id
        """))
    }
    return (
        [GoalRow(**dict(row)) for row in goal_rows],
        [TargetRow(**dict(row)) for row in target_rows],
        [MetricConditionRow(**dict(row)) for row in metric_rows],
        child_sort_start,
    )
