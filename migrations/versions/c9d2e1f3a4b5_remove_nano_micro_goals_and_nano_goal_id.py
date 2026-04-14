"""remove_nano_micro_goals_and_nano_goal_id

Revision ID: a1b2c3d4e5f6
Revises: ff40dedbdfeb
Create Date: 2026-04-10 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c9d2e1f3a4b5'
down_revision: Union[str, Sequence[str], None] = 'b1c2d3e4f5a6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Soft-delete Nano Goal and Micro Goal goal level rows
    op.execute("""
        UPDATE goal_levels
        SET deleted_at = NOW()
        WHERE name IN ('Nano Goal', 'Micro Goal')
          AND deleted_at IS NULL
    """)

    # Reassign goals that had a Nano Goal or Micro Goal level to ImmediateGoal level
    op.execute("""
        UPDATE goals
        SET level_id = (
            SELECT id FROM goal_levels
            WHERE name = 'Immediate Goal'
              AND owner_id IS NULL
              AND deleted_at IS NULL
            LIMIT 1
        )
        WHERE level_id IN (
            SELECT id FROM goal_levels
            WHERE name IN ('Nano Goal', 'Micro Goal')
        )
          AND deleted_at IS NULL
    """)

    # Drop nano_goal_id FK constraint and column from notes table
    op.drop_index('ix_notes_nano_goal_id', table_name='notes', if_exists=True)
    with op.batch_alter_table('notes') as batch_op:
        batch_op.drop_constraint('notes_nano_goal_id_fkey', type_='foreignkey')
        batch_op.drop_column('nano_goal_id')


def downgrade() -> None:
    # Re-add nano_goal_id column to notes
    with op.batch_alter_table('notes') as batch_op:
        batch_op.add_column(sa.Column('nano_goal_id', sa.String(), nullable=True))
        batch_op.create_foreign_key(
            'notes_nano_goal_id_fkey', 'goals',
            ['nano_goal_id'], ['id'],
            ondelete='SET NULL'
        )
    op.create_index('ix_notes_nano_goal_id', 'notes', ['nano_goal_id'], unique=False)

    # Restore Nano Goal and Micro Goal level rows
    op.execute("""
        UPDATE goal_levels
        SET deleted_at = NULL
        WHERE name IN ('Nano Goal', 'Micro Goal')
    """)
