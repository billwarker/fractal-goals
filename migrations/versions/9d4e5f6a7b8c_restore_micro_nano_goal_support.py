"""restore micro/nano goal support

Revision ID: 9d4e5f6a7b8c
Revises: 83820083f8ac
Create Date: 2026-04-21 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
import uuid


revision: str = '9d4e5f6a7b8c'
down_revision: Union[str, Sequence[str], None] = '83820083f8ac'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _ensure_level(conn, name: str, rank: int, color: str) -> None:
    existing = conn.execute(
        sa.text("SELECT id FROM goal_levels WHERE name = :name AND owner_id IS NULL LIMIT 1"),
        {"name": name},
    ).scalar()
    if existing:
        conn.execute(
            sa.text("UPDATE goal_levels SET deleted_at = NULL WHERE id = :id"),
            {"id": existing},
        )
        return

    conn.execute(
        sa.text(
            """
            INSERT INTO goal_levels
                (id, name, rank, color, icon, owner_id, allow_manual_completion, track_activities, requires_smart)
            VALUES
                (:id, :name, :rank, :color, 'circle', NULL, true, true, false)
            """
        ),
        {"id": str(uuid.uuid4()), "name": name, "rank": rank, "color": color},
    )


def upgrade() -> None:
    conn = op.get_bind()
    _ensure_level(conn, "Micro Goal", 5, "#ff6f3c")
    _ensure_level(conn, "Nano Goal", 6, "#ffc93c")

    op.add_column('notes', sa.Column('nano_goal_id', sa.String(), nullable=True))
    op.create_foreign_key(
        'notes_nano_goal_id_fkey',
        'notes',
        'goals',
        ['nano_goal_id'],
        ['id'],
        ondelete='SET NULL',
    )
    op.create_index('ix_notes_nano_goal_id', 'notes', ['nano_goal_id'], unique=False)


def downgrade() -> None:
    op.drop_index('ix_notes_nano_goal_id', table_name='notes')
    op.drop_constraint('notes_nano_goal_id_fkey', 'notes', type_='foreignkey')
    op.drop_column('notes', 'nano_goal_id')

    op.execute("""
        UPDATE goal_levels
        SET deleted_at = NOW()
        WHERE name IN ('Nano Goal', 'Micro Goal')
          AND owner_id IS NULL
          AND deleted_at IS NULL
    """)
