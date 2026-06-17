"""add goal_pause_intervals, rename goals.frozen -> paused, backfill open intervals

Revision ID: e7a1b9c3d2f4
Revises: 8b2f4d6a9c10
Create Date: 2026-06-16 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e7a1b9c3d2f4'
down_revision: Union[str, Sequence[str], None] = '8b2f4d6a9c10'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # Rename the point-in-time pause flag columns to the canonical 'paused' vocabulary.
    op.alter_column('goals', 'frozen', new_column_name='paused')
    op.alter_column('goals', 'frozen_at', new_column_name='paused_at')

    # Durable history of pause windows so activity performed while paused never
    # counts as evidence, even after the goal is resumed.
    op.create_table(
        'goal_pause_intervals',
        sa.Column('id', sa.String(), nullable=False),
        sa.Column('goal_id', sa.String(), nullable=False),
        sa.Column('root_id', sa.String(), nullable=True),
        sa.Column('paused_at', sa.DateTime(), nullable=False),
        sa.Column('resumed_at', sa.DateTime(), nullable=True),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(['goal_id'], ['goals.id'], ondelete='CASCADE'),
        sa.PrimaryKeyConstraint('id'),
    )
    op.create_index(op.f('ix_goal_pause_intervals_goal_id'), 'goal_pause_intervals', ['goal_id'], unique=False)
    op.create_index(op.f('ix_goal_pause_intervals_root_id'), 'goal_pause_intervals', ['root_id'], unique=False)
    op.create_index('ix_goal_pause_intervals_goal_resumed', 'goal_pause_intervals', ['goal_id', 'resumed_at'], unique=False)

    # Backfill one open interval for every currently-paused goal. Already-resumed
    # historical pauses are unrecoverable (frozen_at was cleared on resume) and are
    # intentionally not backfilled.
    op.execute(
        """
        INSERT INTO goal_pause_intervals (id, goal_id, root_id, paused_at, resumed_at, created_at)
        SELECT
            gen_random_uuid()::text,
            g.id,
            g.root_id,
            COALESCE(g.paused_at, g.updated_at, g.created_at, now()),
            NULL,
            now()
        FROM goals g
        WHERE g.paused IS TRUE
          AND g.deleted_at IS NULL
        """
    )


def downgrade() -> None:
    op.drop_index('ix_goal_pause_intervals_goal_resumed', table_name='goal_pause_intervals')
    op.drop_index(op.f('ix_goal_pause_intervals_root_id'), table_name='goal_pause_intervals')
    op.drop_index(op.f('ix_goal_pause_intervals_goal_id'), table_name='goal_pause_intervals')
    op.drop_table('goal_pause_intervals')

    op.alter_column('goals', 'paused_at', new_column_name='frozen_at')
    op.alter_column('goals', 'paused', new_column_name='frozen')
