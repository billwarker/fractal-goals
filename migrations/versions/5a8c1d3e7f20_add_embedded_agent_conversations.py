"""Add bounded, durable embedded agent conversations and checkpoints.

Revision ID: 5a8c1d3e7f20
Revises: 4f7c2a9d1e6b
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "5a8c1d3e7f20"
down_revision = "4f7c2a9d1e6b"
branch_labels = None
depends_on = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    op.create_table(
        "agent_embedded_conversations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("provider", sa.String(16), nullable=False),
        sa.Column("model", sa.String(120), nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index(
        "ix_agent_embedded_conversations_user_updated",
        "agent_embedded_conversations", ["user_id", "updated_at"],
    )
    op.create_index(
        "ix_agent_embedded_conversations_root_updated",
        "agent_embedded_conversations", ["root_id", "updated_at"],
    )

    op.create_table(
        "agent_embedded_messages",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "conversation_id", sa.String(),
            sa.ForeignKey("agent_embedded_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("role", sa.String(16), nullable=False),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_agent_embedded_messages_role"),
    )
    op.create_index(
        "ix_agent_embedded_messages_conversation_created",
        "agent_embedded_messages", ["conversation_id", "created_at"],
    )

    op.create_table(
        "agent_embedded_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "conversation_id", sa.String(),
            sa.ForeignKey("agent_embedded_conversations.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(24), nullable=False),
        sa.Column("step_budget", sa.Integer(), nullable=False),
        sa.Column("token_budget", sa.Integer(), nullable=False),
        sa.Column("steps_used", sa.Integer(), nullable=False),
        sa.Column("tokens_used", sa.Integer(), nullable=False),
        sa.Column("checkpoint", JSON_TYPE, nullable=False),
        sa.Column("proposal_id", sa.String(), sa.ForeignKey("agent_proposals.id", ondelete="SET NULL"), nullable=True),
        sa.Column("lease_owner", sa.String(128), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
        sa.Column("cancel_requested_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agent_embedded_runs_status_lease", "agent_embedded_runs", ["status", "lease_expires_at"])
    op.create_index("ix_agent_embedded_runs_user_created", "agent_embedded_runs", ["user_id", "created_at"])


def downgrade():
    op.drop_index("ix_agent_embedded_runs_user_created", table_name="agent_embedded_runs")
    op.drop_index("ix_agent_embedded_runs_status_lease", table_name="agent_embedded_runs")
    op.drop_table("agent_embedded_runs")
    op.drop_index("ix_agent_embedded_messages_conversation_created", table_name="agent_embedded_messages")
    op.drop_table("agent_embedded_messages")
    op.drop_index("ix_agent_embedded_conversations_root_updated", table_name="agent_embedded_conversations")
    op.drop_index("ix_agent_embedded_conversations_user_updated", table_name="agent_embedded_conversations")
    op.drop_table("agent_embedded_conversations")
