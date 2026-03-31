"""backfill_level_id_for_null_goals

One-time migration: assigns level_id to any goals that have level_id = NULL,
using tree depth to infer the correct system default level. This is required
before the depth-based fallback in goal_type_utils.py is removed.

Revision ID: 94008ce509bb
Revises: a1b2c3d4e5f6
Create Date: 2026-03-30

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = '94008ce509bb'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

# Depth → system default level name (matches seed migration 6cd6d0e3f98b)
DEPTH_TO_LEVEL_NAME = {
    0: "Ultimate Goal",
    1: "Long Term Goal",
    2: "Mid Term Goal",
    3: "Short Term Goal",
    4: "Immediate Goal",
    5: "Micro Goal",
}
DEFAULT_DEEP_LEVEL_NAME = "Nano Goal"


def upgrade() -> None:
    conn = op.get_bind()

    # Fetch system default levels (owner_id IS NULL, root_id IS NULL)
    rows = conn.execute(sa.text(
        "SELECT id, name FROM goal_levels WHERE owner_id IS NULL AND root_id IS NULL"
    )).fetchall()
    level_id_by_name = {row[1]: row[0] for row in rows}

    # Fetch all goals with NULL level_id that are not soft-deleted
    goals = conn.execute(sa.text(
        "SELECT id, parent_id FROM goals WHERE level_id IS NULL AND deleted_at IS NULL"
    )).fetchall()

    if not goals:
        return

    # Build parent lookup for depth calculation
    parent_by_id = {row[0]: row[1] for row in goals}
    # Also fetch parents that may already have level_id set (not in our null set)
    all_parents = conn.execute(sa.text(
        "SELECT id, parent_id FROM goals WHERE deleted_at IS NULL"
    )).fetchall()
    all_parent_by_id = {row[0]: row[1] for row in all_parents}

    def compute_depth(goal_id):
        depth = 0
        current = goal_id
        seen = set()
        while True:
            parent = all_parent_by_id.get(current)
            if not parent or parent in seen:
                break
            seen.add(current)
            depth += 1
            current = parent
        return depth

    for goal_id, _ in goals:
        depth = compute_depth(goal_id)
        level_name = DEPTH_TO_LEVEL_NAME.get(depth, DEFAULT_DEEP_LEVEL_NAME)
        level_id = level_id_by_name.get(level_name)
        if level_id:
            conn.execute(sa.text(
                "UPDATE goals SET level_id = :level_id WHERE id = :goal_id"
            ), {"level_id": level_id, "goal_id": goal_id})


def downgrade() -> None:
    # Intentionally a no-op: we cannot safely determine which level_ids were
    # assigned by this migration vs. set explicitly by the application.
    pass
