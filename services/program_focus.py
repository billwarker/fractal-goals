"""Program-day goals, bounded by the program's goals.

A program's goals and their live descendants are its *ceiling*. A program day may
focus on goals inside that ceiling; sessions started from the day are scoped to the
day's goals and their descendants, or to the program's goals when the day has none.

Narrowing a program's goals compares violations before and after the change: day
goals it strands raise a 409 conflict listing them, unless the caller explicitly
asked to prune them. Pre-existing violations never block unrelated edits.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Iterable, Mapping, NamedTuple

from sqlalchemy import literal, select, union_all

from models import Goal, ProgramBlock, ProgramDay
from models.base import utc_now
from models.goal import program_day_goals
from models.program import program_goals
from services.program_scope import expand_descendants, load_live_goal_tree
from services.program_service_errors import ProgramServiceValidationError

DAY_GOAL_OUT_OF_SCOPE = 'program_day_goal_out_of_scope'
MAX_REPORTED_CONFLICTS = 20
_EMPTY: frozenset[str] = frozenset()


class DayGoalViolation(NamedTuple):
    day_id: str
    goal_id: str


@dataclass(frozen=True)
class FocusScopes:
    program_seed_ids: frozenset[str] = _EMPTY
    program_goal_ids: frozenset[str] = _EMPTY
    day_seed_ids: Mapping[str, frozenset[str]] = field(default_factory=dict)
    day_goal_ids: Mapping[str, frozenset[str]] = field(default_factory=dict)

    def day_scope(self, day_id: str | None) -> frozenset[str]:
        """The day's goals and their descendants, falling back to the program's."""
        if day_id and self.day_seed_ids.get(day_id):
            return self.day_goal_ids[day_id]
        return self.program_goal_ids

    def violations(self) -> frozenset[DayGoalViolation]:
        return frozenset(
            DayGoalViolation(day_id, goal_id)
            for day_id, seeds in self.day_seed_ids.items()
            for goal_id in seeds if goal_id not in self.program_goal_ids
        )


def load_focus_seed_rows(db_session, program_id: str) -> list[tuple[str, str, str]]:
    """The program's goals and its days' goals as ``(kind, owner_id, goal_id)`` rows, in one query."""
    program_seeds = select(
        literal('program').label('kind'), program_goals.c.program_id.label('owner_id'), program_goals.c.goal_id,
    ).where(program_goals.c.program_id == program_id)
    day_seeds = select(
        literal('day'), program_day_goals.c.program_day_id, program_day_goals.c.goal_id,
    ).join(ProgramDay, ProgramDay.id == program_day_goals.c.program_day_id).where(
        ProgramDay.program_id == program_id, program_day_goals.c.deleted_at.is_(None),
    )
    return [
        (str(kind), str(owner_id), str(goal_id))
        for kind, owner_id, goal_id in db_session.execute(union_all(program_seeds, day_seeds)).all()
    ]


def build_focus_scopes(
    seed_rows: Iterable[tuple[str, str, str]],
    valid_goal_ids: set[str],
    children_by_parent: Mapping[str | None, list[str]],
) -> FocusScopes:
    """Assemble scopes from seed rows and an already-loaded live goal tree."""
    program_seeds: set[str] = set()
    day_seeds: dict[str, set[str]] = {}
    for kind, owner_id, goal_id in seed_rows:
        if goal_id not in valid_goal_ids:
            continue
        if kind == 'program':
            program_seeds.add(goal_id)
        else:
            day_seeds.setdefault(owner_id, set()).add(goal_id)
    children = dict(children_by_parent)
    return FocusScopes(
        program_seed_ids=frozenset(program_seeds),
        program_goal_ids=expand_descendants(program_seeds, children),
        day_seed_ids={key: frozenset(value) for key, value in day_seeds.items()},
        day_goal_ids={key: expand_descendants(value, children) for key, value in day_seeds.items()},
    )


def focus_scopes_from_goals(seed_rows, goals_by_id) -> tuple[FocusScopes, dict[str | None, list[str]]]:
    """Scopes from seed rows and an already-loaded ``{id: Goal}`` map of live goals.

    Returns the scopes and the parent -> children index, so callers can expand other seeds.
    """
    children: dict[str | None, list[str]] = {}
    for goal in goals_by_id.values():
        children.setdefault(goal.parent_id, []).append(goal.id)
    return build_focus_scopes(seed_rows, set(goals_by_id), children), children


def resolve_focus_scopes(db_session, root_id: str, program_id: str) -> FocusScopes:
    """Resolve the program's goal ceiling and every program day's goal scope."""
    seed_rows = load_focus_seed_rows(db_session, program_id)
    valid_goal_ids, children_by_parent = load_live_goal_tree(db_session, root_id)
    return build_focus_scopes(seed_rows, valid_goal_ids, children_by_parent)


def resolve_day_focus_scope(db_session, root_id: str, day: ProgramDay) -> frozenset[str]:
    """Session scope for a program-day session: the day's goals, else the program's."""
    return resolve_focus_scopes(db_session, root_id, str(day.program_id)).day_scope(str(day.id))


def normalize_goal_ids(goal_ids: Iterable[str] | None) -> list[str]:
    return list(dict.fromkeys(str(goal_id) for goal_id in (goal_ids or []) if goal_id))


def assert_day_goals_valid(scopes: FocusScopes, goal_ids: Iterable[str] | None) -> list[str]:
    """A day's goals are optional, and must sit within the program's goals."""
    goal_ids = normalize_goal_ids(goal_ids)
    outside = [goal_id for goal_id in goal_ids if goal_id not in scopes.program_goal_ids]
    if outside:
        raise ProgramServiceValidationError({
            'error': "A program day's goals must come from the program's goals.",
            'code': DAY_GOAL_OUT_OF_SCOPE,
            'field': 'goal_ids',
            'goal_ids': outside,
        }, 400)
    return goal_ids


def _conflict_error(db_session, violations: Iterable[DayGoalViolation]) -> ProgramServiceValidationError:
    ordered = sorted(violations)
    goal_ids = {item.goal_id for item in ordered}
    day_ids = {item.day_id for item in ordered}
    goal_names = dict(db_session.query(Goal.id, Goal.name).filter(Goal.id.in_(goal_ids)).all()) if goal_ids else {}
    day_names = {
        day_id: name or (f"Day {number}" if number else "Program day")
        for day_id, name, number in db_session.query(ProgramDay.id, ProgramDay.name, ProgramDay.day_number)
        .filter(ProgramDay.id.in_(day_ids)).all()
    } if day_ids else {}
    conflicts = [{
        'kind': 'day',
        'day_id': item.day_id,
        'name': day_names.get(item.day_id),
        'goal_id': item.goal_id,
        'goal_name': goal_names.get(item.goal_id),
    } for item in ordered]
    days = len(day_ids)
    noun = 'program day' if days == 1 else 'program days'
    return ProgramServiceValidationError({
        'error': f"{days} {noun} would keep goals outside the program's goals. Confirm to remove them.",
        'code': DAY_GOAL_OUT_OF_SCOPE,
        'conflicts': conflicts[:MAX_REPORTED_CONFLICTS],
        'conflict_count': len(conflicts),
    }, 409)


def guard_program_goal_change(db_session, root_id: str, program_id: str, before: FocusScopes, *, prune: bool) -> FocusScopes:
    """Reject (or, when confirmed, prune) day goals that a flushed program-goal change strands."""
    baseline = before.violations()
    db_session.flush()
    after = resolve_focus_scopes(db_session, root_id, program_id)
    introduced = after.violations() - baseline
    if not introduced:
        return after
    if not prune:
        raise _conflict_error(db_session, introduced)
    now = utc_now()
    for item in introduced:
        db_session.execute(program_day_goals.update().where(
            program_day_goals.c.program_day_id == item.day_id,
            program_day_goals.c.goal_id == item.goal_id,
            program_day_goals.c.deleted_at.is_(None),
        ).values(deleted_at=now))
    db_session.flush()
    return resolve_focus_scopes(db_session, root_id, program_id)
