"""goal charts: saved analytics views linked to goals (migration E)

Revision ID: d7e8f9a0b1c2
Revises: c6d7e8f9a0b1
Create Date: 2026-10-20

Kind: additive. A new link table; nothing existing changes. Goals point at saved analytics views
(analytics_dashboards with kind 'view'), in order. Deleting a goal or a view removes its links.
"""

import sqlalchemy as sa
from alembic import op


revision = "d7e8f9a0b1c2"
down_revision = "c6d7e8f9a0b1"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "goal_analytics_views",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("goal_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "dashboard_id", sa.String(), sa.ForeignKey("analytics_dashboards.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column("position", sa.Integer(), nullable=False, server_default=sa.text("0")),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("goal_id", "dashboard_id", name="uq_goal_analytics_views_goal_dashboard"),
    )
    op.create_index("ix_goal_analytics_views_root_id", "goal_analytics_views", ["root_id"])
    op.create_index("ix_goal_analytics_views_dashboard_id", "goal_analytics_views", ["dashboard_id"])
    op.create_index("ix_goal_analytics_views_goal_position", "goal_analytics_views", ["goal_id", "position"])


def downgrade():
    op.drop_table("goal_analytics_views")
