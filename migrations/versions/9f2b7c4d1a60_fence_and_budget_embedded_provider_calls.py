"""Fence and budget every embedded provider request.

Revision ID: 9f2b7c4d1a60
Revises: 8e1f6a3c9d42
"""

from alembic import op
import sqlalchemy as sa


revision = "9f2b7c4d1a60"
down_revision = "8e1f6a3c9d42"
branch_labels = None
depends_on = None


def upgrade():
    op.add_column(
        "agent_embedded_runs",
        sa.Column("fencing_token", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "agent_embedded_runs",
        sa.Column("provider_call_sequence", sa.Integer(), nullable=False, server_default="0"),
    )
    op.create_table(
        "agent_embedded_daily_budgets",
        sa.Column("scope_key", sa.String(length=128), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("reserved_microdollars", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("charged_microdollars", sa.BigInteger(), nullable=False, server_default="0"),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.PrimaryKeyConstraint("scope_key", "usage_date"),
    )
    op.create_table(
        "agent_embedded_usage",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("run_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("usage_date", sa.Date(), nullable=False),
        sa.Column("call_number", sa.Integer(), nullable=False),
        sa.Column("fencing_token", sa.Integer(), nullable=False),
        sa.Column("provider", sa.String(length=16), nullable=False),
        sa.Column("model", sa.String(length=120), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False),
        sa.Column("estimated_input_tokens", sa.Integer(), nullable=False),
        sa.Column("reserved_output_tokens", sa.Integer(), nullable=False),
        sa.Column("actual_input_tokens", sa.Integer(), nullable=True),
        sa.Column("actual_output_tokens", sa.Integer(), nullable=True),
        sa.Column("reserved_microdollars", sa.BigInteger(), nullable=False),
        sa.Column("actual_microdollars", sa.BigInteger(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["run_id"], ["agent_embedded_runs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("run_id", "call_number", name="uq_agent_embedded_usage_run_call"),
    )
    op.create_index(
        "ix_agent_embedded_usage_user_date", "agent_embedded_usage", ["user_id", "usage_date"],
    )
    op.create_index(
        "ix_agent_embedded_usage_status_created", "agent_embedded_usage", ["status", "created_at"],
    )


def downgrade():
    op.drop_index("ix_agent_embedded_usage_status_created", table_name="agent_embedded_usage")
    op.drop_index("ix_agent_embedded_usage_user_date", table_name="agent_embedded_usage")
    op.drop_table("agent_embedded_usage")
    op.drop_table("agent_embedded_daily_budgets")
    op.drop_column("agent_embedded_runs", "provider_call_sequence")
    op.drop_column("agent_embedded_runs", "fencing_token")
