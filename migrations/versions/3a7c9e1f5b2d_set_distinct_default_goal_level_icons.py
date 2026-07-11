"""Set distinct icons for system goal levels.

Revision ID: 3a7c9e1f5b2d
Revises: 7f8a9b0c1d2e
"""
from alembic import op
import sqlalchemy as sa


revision = '3a7c9e1f5b2d'
down_revision = '7f8a9b0c1d2e'
branch_labels = None
depends_on = None


DEFAULT_ICONS = {
    'Ultimate Goal': 'twelve-point-star',
    'Long Term Goal': 'hexagon',
    'Mid Term Goal': 'diamond',
    'Short Term Goal': 'circle',
}


def upgrade():
    goal_levels = sa.table(
        'goal_levels',
        sa.column('name', sa.String()),
        sa.column('icon', sa.String()),
        sa.column('owner_id', sa.String()),
    )
    for name, icon in DEFAULT_ICONS.items():
        op.execute(
            goal_levels.update()
            .where(goal_levels.c.name == name)
            .where(goal_levels.c.owner_id.is_(None))
            .values(icon=icon)
        )


def downgrade():
    goal_levels = sa.table(
        'goal_levels',
        sa.column('name', sa.String()),
        sa.column('icon', sa.String()),
        sa.column('owner_id', sa.String()),
    )
    op.execute(
        goal_levels.update()
        .where(goal_levels.c.name.in_(tuple(DEFAULT_ICONS)))
        .where(goal_levels.c.owner_id.is_(None))
        .values(icon='circle')
    )
