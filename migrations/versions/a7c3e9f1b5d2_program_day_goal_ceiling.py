"""Program-day goals stay within their program's goals.

Program goals and their live descendants are the ceiling for program-day goals
(services/program_focus.py). Any live day goal not already covered by its
program's goals is added to the program's goals here, so existing data satisfies
the rule. Shallower goals are added first, so a covered descendant is never added
twice. Every addition is logged.

Self-contained on purpose: it mirrors the program-scope expansion as of this revision.

Revision ID: a7c3e9f1b5d2
Revises: f1b3d5a7c9e2
"""
import logging
from collections import defaultdict

import sqlalchemy as sa
from alembic import op


revision = "a7c3e9f1b5d2"
down_revision = "f1b3d5a7c9e2"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def _backfill_program_goal_ceiling(bind):
    seeds = bind.execute(sa.text("""
        SELECT p.id AS program_id, p.root_id, pg.goal_id, 'program' AS kind
          FROM programs p JOIN program_goals pg ON pg.program_id = p.id
        UNION ALL
        SELECT p.id, p.root_id, dg.goal_id, 'day'
          FROM programs p
          JOIN program_blocks b ON b.program_id = p.id
          JOIN program_days d ON d.block_id = b.id
          JOIN program_day_goals dg ON dg.program_day_id = d.id
         WHERE dg.deleted_at IS NULL
    """)).fetchall()
    if not seeds:
        return

    by_program = defaultdict(lambda: {"root_id": None, "program": set(), "day": set()})
    for row in seeds:
        entry = by_program[row.program_id]
        entry["root_id"] = row.root_id
        entry[row.kind].add(row.goal_id)

    root_ids = {entry["root_id"] for entry in by_program.values()}
    goal_rows = bind.execute(
        sa.text("SELECT id, parent_id, root_id FROM goals WHERE deleted_at IS NULL AND root_id IN :roots")
        .bindparams(sa.bindparam("roots", expanding=True)),
        {"roots": sorted(root_ids)},
    ).fetchall()
    parent_of = {row.id: row.parent_id for row in goal_rows}
    root_of = {row.id: row.root_id for row in goal_rows}
    children = defaultdict(list)
    for row in goal_rows:
        if row.parent_id:
            children[row.parent_id].append(row.id)

    def depth(goal_id):
        steps, current = 0, parent_of.get(goal_id)
        while current and steps < 64:
            steps, current = steps + 1, parent_of.get(current)
        return steps

    def expand(goal_ids):
        covered, stack = set(), list(goal_ids)
        while stack:
            goal_id = stack.pop()
            if goal_id in covered:
                continue
            covered.add(goal_id)
            stack.extend(children.get(goal_id, ()))
        return covered

    for program_id, entry in sorted(by_program.items()):
        live = lambda goal_id: goal_id in parent_of and root_of.get(goal_id) == entry["root_id"]  # noqa: E731
        covered = expand(goal_id for goal_id in entry["program"] if live(goal_id))
        for goal_id in sorted((g for g in entry["day"] if live(g)), key=lambda g: (depth(g), g)):
            if goal_id in covered:
                continue
            bind.execute(sa.text(
                "INSERT INTO program_goals (program_id, goal_id, created_at) "
                "VALUES (:program_id, :goal_id, now()) ON CONFLICT DO NOTHING"
            ), {"program_id": program_id, "goal_id": goal_id})
            covered |= expand([goal_id])
            logger.warning(
                "program goal ceiling: added goal %s to program %s goals (it focused a program day)",
                goal_id, program_id,
            )


def upgrade():
    _backfill_program_goal_ceiling(op.get_bind())


def downgrade():
    # Backfilled program goals stay: they are valid program goals either way. An
    # unreleased draft of this revision also added alignment thresholds; remove them
    # from development databases that applied it.
    op.execute("ALTER TABLE program_blocks DROP COLUMN IF EXISTS alignment_threshold")
    op.execute("ALTER TABLE programs DROP COLUMN IF EXISTS alignment_threshold")
