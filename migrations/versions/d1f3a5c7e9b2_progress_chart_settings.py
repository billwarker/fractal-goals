"""remembered Progress pane chart per activity and template/program day

Revision ID: d1f3a5c7e9b2
Revises: c8e0a2b4d6f8
Create Date: 2026-10-23

Kind: additive. See planning/progress-chart-types.md.

`activity_progress_charts` holds the chart chosen in the Progress pane (goal progress, activity
trend, scatter or metric trend; its metrics and set aggregation) for an activity in a session
template and/or program day. Both context columns NULL is the activity-wide choice.
"""

import sqlalchemy as sa
from alembic import op


revision = "d1f3a5c7e9b2"
down_revision = "c8e0a2b4d6f8"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "activity_progress_charts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "activity_definition_id", sa.String(),
            sa.ForeignKey("activity_definitions.id", ondelete="CASCADE"), nullable=False,
        ),
        sa.Column(
            "session_template_id", sa.String(),
            sa.ForeignKey("session_templates.id", ondelete="CASCADE"), nullable=True,
        ),
        sa.Column("program_day_id", sa.String(), sa.ForeignKey("program_days.id", ondelete="CASCADE"), nullable=True),
        sa.Column("kind", sa.String(16), nullable=False),
        sa.Column("trend_series", sa.String(8), nullable=True),
        sa.Column("metric_id", sa.String(), sa.ForeignKey("metric_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("x_metric_id", sa.String(), sa.ForeignKey("metric_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("y_metric_id", sa.String(), sa.ForeignKey("metric_definitions.id", ondelete="SET NULL"), nullable=True),
        sa.Column("set_aggregation", sa.String(8), nullable=False, server_default="top"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint(
            "kind IN ('goal', 'activity_trend', 'scatter', 'metric_trend')",
            name="ck_activity_progress_charts_kind",
        ),
        sa.CheckConstraint(
            "trend_series IS NULL OR (kind = 'activity_trend' AND trend_series IN ('metric', 'yield'))",
            name="ck_activity_progress_charts_trend_series",
        ),
        sa.CheckConstraint(
            "set_aggregation IN ('top', 'average', 'total')"
            " AND (set_aggregation <> 'total' OR trend_series = 'yield')",
            name="ck_activity_progress_charts_set_aggregation",
        ),
    )
    for column in ("root_id", "activity_definition_id", "session_template_id", "program_day_id"):
        op.create_index(f"ix_activity_progress_charts_{column}", "activity_progress_charts", [column])
    op.execute(
        "CREATE UNIQUE INDEX uq_activity_progress_charts_context ON activity_progress_charts "
        "(activity_definition_id, coalesce(session_template_id, ''), coalesce(program_day_id, ''))"
    )


def downgrade():
    op.drop_table("activity_progress_charts")
