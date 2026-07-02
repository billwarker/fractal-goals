"""add analytics saved object kind

Revision ID: e1a2b3c4d5f6
Revises: c7e9a1f4b2d3
Create Date: 2026-06-29 00:00:00.000000

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'e1a2b3c4d5f6'
down_revision: Union[str, Sequence[str], None] = 'c7e9a1f4b2d3'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def _kind_from_layout(layout) -> str:
    if not isinstance(layout, dict):
        return 'dashboard'
    window_states = layout.get('window_states')
    if not isinstance(window_states, dict):
        return 'dashboard'
    configured = [
        state for state in window_states.values()
        if isinstance(state, dict)
        and state.get('selectedCategory')
        and state.get('selectedVisualization')
    ]
    return 'view' if len(configured) <= 1 else 'dashboard'


def upgrade() -> None:
    op.add_column(
        'analytics_dashboards',
        sa.Column('kind', sa.String(), nullable=False, server_default='dashboard'),
    )

    bind = op.get_bind()
    dashboard_table = sa.table(
        'analytics_dashboards',
        sa.column('id', sa.String()),
        sa.column('layout', sa.JSON()),
        sa.column('kind', sa.String()),
    )
    rows = bind.execute(sa.select(dashboard_table.c.id, dashboard_table.c.layout)).fetchall()
    for row in rows:
        bind.execute(
            dashboard_table.update()
            .where(dashboard_table.c.id == row.id)
            .values(kind=_kind_from_layout(row.layout))
        )


def downgrade() -> None:
    op.drop_column('analytics_dashboards', 'kind')
