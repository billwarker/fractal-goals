"""Saved analytics can be pinned and remember when they were last opened.

Additive: existing views and dashboards start unpinned and never opened.
"""
from alembic import op
import sqlalchemy as sa

revision = 'e3a5c7b9d1f2'
down_revision = 'd2f4b6c8e0a1'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('analytics_dashboards', sa.Column('pinned', sa.Boolean(), nullable=False, server_default=sa.text('false')))
    op.add_column('analytics_dashboards', sa.Column('last_opened_at', sa.DateTime(), nullable=True))


def downgrade():
    op.drop_column('analytics_dashboards', 'last_opened_at')
    op.drop_column('analytics_dashboards', 'pinned')
