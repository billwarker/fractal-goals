"""Enforce one active session per user.

Revision ID: 4b8d2f6a9c1e
Revises: 3a7c9e1f5b2d
"""
from alembic import op
import sqlalchemy as sa


revision = '4b8d2f6a9c1e'
down_revision = '3a7c9e1f5b2d'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        'sessions',
        sa.Column('owner_id', sa.String(), sa.ForeignKey('users.id', ondelete='CASCADE'), nullable=True),
    )
    op.execute(sa.text("""
        UPDATE sessions AS s
        SET owner_id = g.owner_id
        FROM goals AS g
        WHERE g.id = s.root_id
          AND s.owner_id IS NULL
    """))

    # Legacy data predates the single-active-session invariant. Preserve each
    # owner's most recently touched unfinished session and close older duplicates
    # without deleting their history.
    op.execute(sa.text("""
        WITH ranked_active_sessions AS (
            SELECT
                id,
                ROW_NUMBER() OVER (
                    PARTITION BY owner_id
                    ORDER BY COALESCE(updated_at, created_at) DESC NULLS LAST, id DESC
                ) AS active_rank
            FROM sessions
            WHERE owner_id IS NOT NULL
              AND completed IS NOT TRUE
              AND deleted_at IS NULL
        )
        UPDATE sessions AS s
        SET
            completed = true,
            completed_at = COALESCE(s.completed_at, s.session_end, s.updated_at, s.created_at, NOW()),
            is_paused = false,
            last_paused_at = NULL
        FROM ranked_active_sessions AS ranked
        WHERE ranked.id = s.id
          AND ranked.active_rank > 1
    """))

    op.alter_column('sessions', 'owner_id', nullable=False)
    op.create_index('ix_sessions_owner_id', 'sessions', ['owner_id'])
    op.create_index(
        'uq_sessions_one_active_per_owner',
        'sessions',
        ['owner_id'],
        unique=True,
        postgresql_where=sa.text('completed IS NOT TRUE AND deleted_at IS NULL'),
    )


def downgrade():
    op.drop_index('uq_sessions_one_active_per_owner', table_name='sessions')
    op.drop_index('ix_sessions_owner_id', table_name='sessions')
    op.drop_column('sessions', 'owner_id')
