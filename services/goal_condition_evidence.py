"""Resolve the activity evidence a goal's completion condition is evaluated against.

Evidence is every completed instance of the condition's activity that contributes to the goal's
subtree under the canonical attribution rule (`instance_goal_evidence`), further limited to the
goal's active period: on or after `started_at`, on or before the end of the deadline day, and
outside the goal's pause intervals. The goal's own completion never hides the evidence that
completed it, so re-evaluation after an edit or deletion is exact.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    MetricValue,
    Session,
    activity_goal_associations,
    goal_activity_group_associations,
)
from services.goal_condition_evaluator import EvidenceInstance, EvidenceSet, to_float
from services.goal_contribution import as_utc_datetime, goal_was_paused_at
from services.instance_goal_evidence import (
    instance_contributes_to_goal,
    instance_source_goal_ids,
    load_instance_goal_ids,
)

SKIPPED_SET_STATUSES = frozenset({'skipped'})
EPOCH = datetime(1970, 1, 1, tzinfo=timezone.utc)


def goal_active_window(goal) -> tuple[datetime | None, datetime | None]:
    """[start, end) bounds of the goal's active period, in UTC."""
    start = as_utc_datetime(getattr(goal, 'started_at', None) or getattr(goal, 'created_at', None))
    deadline = as_utc_datetime(getattr(goal, 'deadline', None))
    end = None
    if deadline is not None:
        end = deadline.replace(hour=0, minute=0, second=0, microsecond=0) + timedelta(days=1)
    return start, end


def instance_occurred_at(instance) -> datetime | None:
    return as_utc_datetime(instance.time_start or instance.created_at)


def in_active_window(goal, occurred_at: datetime | None) -> bool:
    if occurred_at is None:
        return False
    start, end = goal_active_window(goal)
    if start and occurred_at < start:
        return False
    if end and occurred_at >= end:
        return False
    return not goal_was_paused_at(goal, occurred_at)


def _subtree_ids(goal, goals_by_id) -> set[str]:
    children_by_parent: dict[str, list] = {}
    for candidate in goals_by_id.values():
        if candidate.parent_id and not candidate.deleted_at:
            children_by_parent.setdefault(candidate.parent_id, []).append(candidate)
    ids: set[str] = set()
    stack = [goal]
    while stack:
        current = stack.pop()
        if not current or current.deleted_at or current.id in ids:
            continue
        ids.add(current.id)
        stack.extend(children_by_parent.get(current.id, []))
    return ids


def _attribution_view(goal):
    """The goal as attribution sees it while its own condition is evaluated.

    Its completion is ignored (the evidence that completed it must stay visible), and a start date
    earlier than creation extends the window backwards.
    """
    created_at = getattr(goal, 'created_at', None)
    started = as_utc_datetime(getattr(goal, 'started_at', None))
    created = as_utc_datetime(created_at)
    if started and created and started < created:
        created_at = getattr(goal, 'started_at', None)
    return SimpleNamespace(
        id=goal.id, parent_id=goal.parent_id, deleted_at=goal.deleted_at, created_at=created_at,
        completed_at=None, paused=False, pause_intervals=[],
    )


def associated_goal_ids(db_session, activity_id, goal_ids) -> set[str]:
    """Goals in `goal_ids` linked to the activity directly or through its group."""
    if not goal_ids:
        return set()
    result = set(db_session.execute(
        select(activity_goal_associations.c.goal_id).where(
            activity_goal_associations.c.activity_id == activity_id,
            activity_goal_associations.c.goal_id.in_(goal_ids),
            activity_goal_associations.c.deleted_at.is_(None),
        )
    ).scalars())
    group_id = db_session.execute(
        select(ActivityDefinition.group_id).where(ActivityDefinition.id == activity_id)
    ).scalar()
    if group_id:
        result.update(db_session.execute(
            select(goal_activity_group_associations.c.goal_id).where(
                goal_activity_group_associations.c.activity_group_id == group_id,
                goal_activity_group_associations.c.goal_id.in_(goal_ids),
                goal_activity_group_associations.c.deleted_at.is_(None),
            )
        ).scalars())
    return result


def collect_goal_activity_instances(
    db_session, root_id, goal, goals_by_id, activity_id, *, history=None, within_active_window=True,
) -> list[ActivityInstance]:
    """Completed instances of `activity_id` that count toward `goal`, oldest first.

    `within_active_window=False` returns the full contributing history (for charts and previews);
    condition evaluation always uses the active window.
    """
    if not activity_id or goal is None:
        return []
    subtree_ids = _subtree_ids(goal, goals_by_id)
    effective_goal_ids = set(subtree_ids)
    if goal.inherit_parent_activities and goal.parent_id and goal.parent_id in goals_by_id:
        effective_goal_ids.add(goal.parent_id)

    definition_goal_ids = (
        history.associated_goal_ids(activity_id, effective_goal_ids) if history is not None
        else associated_goal_ids(db_session, activity_id, effective_goal_ids)
    )
    instance_links = (
        history.instance_links(subtree_ids) if history is not None
        else load_instance_goal_ids(db_session, root_id, goal_ids=subtree_ids)
    )
    if not definition_goal_ids and not instance_links:
        return []

    if history is not None:
        instances = history.instances({activity_id}, linked_instance_ids=set(instance_links))
    else:
        start, end = goal_active_window(goal) if within_active_window else (None, None)
        occurred = func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at)
        query = db_session.query(ActivityInstance).options(
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(ActivityInstance.sets).selectinload(ActivitySet.metric_values),
            selectinload(ActivityInstance.session),
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None)),
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.completed.is_(True),
            ActivityInstance.deleted_at.is_(None),
        )
        if start is not None:
            query = query.filter(occurred >= start.replace(tzinfo=None))
        if end is not None:
            query = query.filter(occurred < end.replace(tzinfo=None))
        instances = query.all()

    view = _attribution_view(goal)
    attribution_goals = {**goals_by_id, goal.id: view}
    contributing = []
    for instance in instances:
        if instance.activity_definition_id != activity_id or not instance.completed or instance.deleted_at:
            continue
        occurred_at = instance_occurred_at(instance)
        if within_active_window and not in_active_window(goal, occurred_at):
            continue
        sources = instance_source_goal_ids(instance.id, definition_goal_ids, instance_links, subtree_ids)
        if any(instance_contributes_to_goal(instance, attribution_goals.get(goal_id)) for goal_id in sources):
            contributing.append(instance)
    contributing.sort(key=lambda row: (instance_occurred_at(row) or datetime.min.replace(tzinfo=timezone.utc), row.id))
    return contributing


def to_evidence(instance) -> EvidenceInstance:
    """Convert an ORM instance to the evaluator's shape."""
    sets = []
    for activity_set in (getattr(instance, 'sets', None) or []):
        if activity_set.status in SKIPPED_SET_STATUSES:
            continue
        sets.append(EvidenceSet(values=_metric_values(activity_set.metric_values or [])))
    if not sets:
        instance_level = [metric for metric in (instance.metric_values or []) if metric.activity_set_id is None]
        if instance_level:
            sets.append(EvidenceSet(values=_metric_values(instance_level)))
    return EvidenceInstance(
        id=instance.id,
        session_id=instance.session_id,
        occurred_at=instance_occurred_at(instance) or EPOCH,
        sets=tuple(sets),
    )


def _metric_values(metric_values) -> dict[str, tuple[float, ...]]:
    values: dict[str, list[float]] = {}
    for metric in metric_values:
        number = to_float(metric.value)
        if number is not None:
            values.setdefault(metric.metric_definition_id, []).append(number)
    return {metric_id: tuple(numbers) for metric_id, numbers in values.items()}
