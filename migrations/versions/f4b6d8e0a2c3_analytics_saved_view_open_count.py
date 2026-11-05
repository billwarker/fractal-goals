"""Saved analytics count how many times they've been opened.

Additive: existing views and dashboards start at zero opens.
"""
from alembic import op
import sqlalchemy as sa

revision = 'f4b6d8e0a2c3'
down_revision = 'e3a5c7b9d1f2'
branch_labels = None
depends_on = None


def upgrade():
    op.add_column('analytics_dashboards', sa.Column('open_count', sa.Integer(), nullable=False, server_default=sa.text('0')))


def downgrade():
    op.drop_column('analytics_dashboards', 'open_count')
