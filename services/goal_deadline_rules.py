"""Soft guidance for goal due dates.

A due date that breaks a rule is still saved; callers receive warnings instead:
after the parent's due date, earlier than a child's, outside the level's time horizon
(measured from the goal's start date), or outside a program's dates when one is given.
`client/src/utils/goalDeadlineRules.js` mirrors this module; both are checked against
`tests/fixtures/goal_deadline_cases.json`.
"""

from __future__ import annotations

import calendar
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Iterable

_DAY_UNITS = {'days': 1, 'weeks': 7}
_MONTH_UNITS = {'months': 1, 'years': 12, 'decades': 120}


def as_date(value: Any) -> date | None:
    """A date from a date, datetime, or ISO string (time and zone ignored)."""
    if value is None or value == '':
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    return date.fromisoformat(str(value)[:10])


def _add_months(value: date, months: int) -> date:
    month_index = value.month - 1 + months
    year, month = value.year + month_index // 12, month_index % 12 + 1
    return date(year, month, min(value.day, calendar.monthrange(year, month)[1]))


def add_interval(anchor: date, amount: int | None, unit: str | None) -> date | None:
    """`anchor` moved by a level interval; units under a day stay on the anchor's date."""
    if amount is None or not unit:
        return None
    if unit in _DAY_UNITS:
        return anchor + timedelta(days=amount * _DAY_UNITS[unit])
    if unit in _MONTH_UNITS:
        return _add_months(anchor, amount * _MONTH_UNITS[unit])
    if unit in ('minutes', 'hours'):
        return anchor
    return None


@dataclass(frozen=True)
class DeadlineContext:
    parent_deadline: date | None = None
    child_deadlines: tuple[date, ...] = field(default_factory=tuple)
    started_at: date | None = None
    horizon_min: tuple[int | None, str | None] = (None, None)
    horizon_max: tuple[int | None, str | None] = (None, None)
    program_start: date | None = None
    program_end: date | None = None


def deadline_warnings(deadline: date | None, context: DeadlineContext) -> list[dict[str, Any]]:
    """Warnings for a proposed due date, in a stable order; empty when it fits every rule."""
    if deadline is None:
        return []
    warnings: list[dict[str, Any]] = []
    if context.program_start and context.program_end and not (
        context.program_start <= deadline <= context.program_end
    ):
        warnings.append({
            'code': 'outside_program',
            'program_start': context.program_start.isoformat(),
            'program_end': context.program_end.isoformat(),
        })
    if context.started_at:
        earliest = add_interval(context.started_at, *context.horizon_min)
        latest = add_interval(context.started_at, *context.horizon_max)
        if earliest and deadline < earliest:
            warnings.append({'code': 'before_horizon', 'earliest': earliest.isoformat()})
        if latest and deadline > latest:
            warnings.append({'code': 'after_horizon', 'latest': latest.isoformat()})
    if context.parent_deadline and deadline > context.parent_deadline:
        warnings.append({'code': 'after_parent', 'parent_deadline': context.parent_deadline.isoformat()})
    later_children = sorted(child for child in context.child_deadlines if child > deadline)
    if later_children:
        warnings.append({
            'code': 'children_after',
            'count': len(later_children),
            'latest': later_children[-1].isoformat(),
        })
    return warnings


def _dated(values: Iterable[Any]) -> tuple[date, ...]:
    return tuple(day for day in (as_date(value) for value in values) if day is not None)


def warnings_for_goal(goal, *, program=None) -> list[dict[str, Any]]:
    """Warnings for a goal's saved due date, from its parent, live children and level."""
    level = getattr(goal, 'level', None)
    parent = getattr(goal, 'parent', None)
    children = [child for child in (getattr(goal, 'children', None) or []) if not child.deleted_at]
    context = DeadlineContext(
        parent_deadline=as_date(parent.deadline) if parent is not None and not parent.deleted_at else None,
        child_deadlines=_dated(child.deadline for child in children),
        started_at=as_date(goal.started_at) or as_date(goal.created_at),
        horizon_min=(getattr(level, 'deadline_min_value', None), getattr(level, 'deadline_min_unit', None)),
        horizon_max=(getattr(level, 'deadline_max_value', None), getattr(level, 'deadline_max_unit', None)),
        program_start=as_date(program.start_date) if program is not None else None,
        program_end=as_date(program.end_date) if program is not None else None,
    )
    return deadline_warnings(as_date(goal.deadline), context)
