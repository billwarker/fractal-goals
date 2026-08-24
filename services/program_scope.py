"""Canonical program goal-scope resolution.

Program metrics, session creation, and program-aware client surfaces all use
the same rule: program, block, and active day-goal seeds expanded through
active descendants in the owned fractal. Ancestors are presentation context,
not metric scope.
"""

from dataclasses import dataclass
from typing import Iterable

from sqlalchemy import select, union_all

from models import Goal, Program, ProgramBlock, ProgramDay
from models.goal import program_day_goals
from models.program import program_block_goals, program_goals


@dataclass(frozen=True)
class ProgramScope:
    seed_goal_ids: frozenset[str]
    goal_ids: frozenset[str]


EMPTY_PROGRAM_SCOPE = ProgramScope(frozenset(), frozenset())


def _normalize_ids(values: Iterable[str] | None) -> list[str]:
    return list(dict.fromkeys(str(value) for value in (values or []) if value))


def resolve_program_scopes(db_session, root_id: str, program_ids: Iterable[str]) -> dict[str, ProgramScope]:
    normalized_program_ids = _normalize_ids(program_ids)
    if not root_id or not normalized_program_ids:
        return {}

    valid_program_ids = {
        str(program_id)
        for (program_id,) in db_session.query(Program.id).filter(
            Program.root_id == root_id,
            Program.id.in_(normalized_program_ids),
        ).all()
    }
    result = {program_id: EMPTY_PROGRAM_SCOPE for program_id in valid_program_ids}
    if not valid_program_ids:
        return result

    goal_rows = db_session.query(Goal.id, Goal.parent_id).filter(
        Goal.root_id == root_id,
        Goal.deleted_at.is_(None),
    ).all()
    valid_goal_ids = {str(goal_id) for goal_id, _ in goal_rows}
    children_by_parent: dict[str | None, list[str]] = {}
    for goal_id, parent_id in goal_rows:
        children_by_parent.setdefault(str(parent_id) if parent_id else None, []).append(str(goal_id))

    program_seed_query = select(
        program_goals.c.program_id.label("program_id"),
        program_goals.c.goal_id.label("goal_id"),
    ).where(program_goals.c.program_id.in_(valid_program_ids))

    block_seed_query = select(
        ProgramBlock.program_id.label("program_id"),
        program_block_goals.c.goal_id.label("goal_id"),
    ).join(
        program_block_goals,
        program_block_goals.c.program_block_id == ProgramBlock.id,
    ).where(ProgramBlock.program_id.in_(valid_program_ids))

    day_seed_query = select(
        ProgramBlock.program_id.label("program_id"),
        program_day_goals.c.goal_id.label("goal_id"),
    ).join(ProgramDay, ProgramDay.block_id == ProgramBlock.id).join(
        program_day_goals,
        program_day_goals.c.program_day_id == ProgramDay.id,
    ).where(
        ProgramBlock.program_id.in_(valid_program_ids),
        program_day_goals.c.deleted_at.is_(None),
    )

    seed_rows = db_session.execute(union_all(
        program_seed_query,
        block_seed_query,
        day_seed_query,
    )).all()
    seeds_by_program: dict[str, set[str]] = {program_id: set() for program_id in valid_program_ids}
    for program_id, goal_id in seed_rows:
        normalized_goal_id = str(goal_id)
        if normalized_goal_id in valid_goal_ids:
            seeds_by_program[str(program_id)].add(normalized_goal_id)

    for program_id, seed_ids in seeds_by_program.items():
        scope_ids: set[str] = set()
        stack = list(seed_ids)
        while stack:
            goal_id = stack.pop()
            if goal_id in scope_ids:
                continue
            scope_ids.add(goal_id)
            stack.extend(children_by_parent.get(goal_id, ()))
        result[program_id] = ProgramScope(frozenset(seed_ids), frozenset(scope_ids))

    return result


def resolve_program_scope(db_session, root_id: str, program_id: str) -> ProgramScope:
    return resolve_program_scopes(db_session, root_id, [program_id]).get(str(program_id), EMPTY_PROGRAM_SCOPE)
