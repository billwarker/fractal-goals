"""Add delegated AI access and durable task execution records.

Revision ID: 4f7c2a9d1e6b
Revises: e9b1c3d5f7a9
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "4f7c2a9d1e6b"
down_revision = "e9b1c3d5f7a9"
branch_labels = None
depends_on = None

JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def upgrade():
    op.create_table(
        "agent_oauth_clients",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("client_id", sa.String(128), nullable=False),
        sa.Column("client_name", sa.String(120), nullable=False),
        sa.Column("redirect_uris", JSON_TYPE, nullable=False),
        sa.Column("grant_types", JSON_TYPE, nullable=False),
        sa.Column("token_endpoint_auth_method", sa.String(32), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("client_id", name="uq_agent_oauth_clients_client_id"),
    )
    op.create_index("ix_agent_oauth_clients_active_created", "agent_oauth_clients", ["revoked_at", "created_at"])

    op.create_table(
        "agent_grants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(), sa.ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("allowed_roots", JSON_TYPE, nullable=False),
        sa.Column("scopes", sa.String(500), nullable=False),
        sa.Column("audience", sa.String(500), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=True),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
    )
    op.create_index("ix_agent_grants_user_active", "agent_grants", ["user_id", "revoked_at", "expires_at"])
    op.create_index("ix_agent_grants_client_user", "agent_grants", ["client_id", "user_id"])

    op.create_table(
        "agent_authorization_codes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("code_hash", sa.String(64), nullable=False),
        sa.Column("grant_id", sa.String(), sa.ForeignKey("agent_grants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(), sa.ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("redirect_uri", sa.Text(), nullable=False),
        sa.Column("scope", sa.String(500), nullable=False),
        sa.Column("code_challenge", sa.String(128), nullable=False),
        sa.Column("code_challenge_method", sa.String(16), nullable=False),
        sa.Column("state", sa.String(500), nullable=True),
        sa.Column("resource", sa.String(500), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("consumed_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("code_hash", name="uq_agent_authorization_codes_code_hash"),
    )
    op.create_index("ix_agent_authorization_codes_expiry", "agent_authorization_codes", ["expires_at"])

    op.create_table(
        "agent_credentials",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("token_hash", sa.String(64), nullable=False),
        sa.Column("token_type", sa.String(16), nullable=False),
        sa.Column("grant_id", sa.String(), sa.ForeignKey("agent_grants.id", ondelete="CASCADE"), nullable=False),
        sa.Column("client_id", sa.String(), sa.ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False),
        sa.Column("audience", sa.String(500), nullable=False),
        sa.Column("scopes", sa.String(500), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("revoked_at", sa.DateTime(), nullable=True),
        sa.Column("replaced_by_id", sa.String(), sa.ForeignKey("agent_credentials.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("token_hash", name="uq_agent_credentials_token_hash"),
    )
    op.create_index("ix_agent_credentials_grant_active", "agent_credentials", ["grant_id", "revoked_at", "expires_at"])
    op.create_index("ix_agent_credentials_expiry", "agent_credentials", ["expires_at"])

    op.create_table(
        "agent_task_briefs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grant_id", sa.String(), sa.ForeignKey("agent_grants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("request_text", sa.Text(), nullable=False),
        sa.Column("context", JSON_TYPE, nullable=False),
        sa.Column("timezone", sa.String(64), nullable=False),
        sa.Column("limits", JSON_TYPE, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agent_task_briefs_user_created", "agent_task_briefs", ["user_id", "created_at"])
    op.create_index("ix_agent_task_briefs_root_created", "agent_task_briefs", ["root_id", "created_at"])

    op.create_table(
        "agent_proposals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("task_id", sa.String(), sa.ForeignKey("agent_task_briefs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("revision", sa.Integer(), nullable=False),
        sa.Column("proposal_hash", sa.String(64), nullable=False),
        sa.Column("operations", JSON_TYPE, nullable=False),
        sa.Column("preview", JSON_TYPE, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("expires_at", sa.DateTime(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("task_id", "revision", name="uq_agent_proposals_task_revision"),
    )
    op.create_index("ix_agent_proposals_user_status_created", "agent_proposals", ["user_id", "status", "created_at"])

    op.create_table(
        "agent_approvals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("proposal_id", sa.String(), sa.ForeignKey("agent_proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("proposal_hash", sa.String(64), nullable=False),
        sa.Column("decision", sa.String(16), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
    )
    op.create_index("ix_agent_approvals_proposal_created", "agent_approvals", ["proposal_id", "created_at"])

    op.create_table(
        "agent_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("proposal_id", sa.String(), sa.ForeignKey("agent_proposals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), nullable=False),
        sa.Column("grant_id", sa.String(), sa.ForeignKey("agent_grants.id", ondelete="SET NULL"), nullable=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("lease_owner", sa.String(128), nullable=True),
        sa.Column("lease_expires_at", sa.DateTime(), nullable=True),
        sa.Column("fencing_token", sa.Integer(), nullable=False),
        sa.Column("cancel_requested_at", sa.DateTime(), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("trace_id", sa.String(64), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("proposal_id", name="uq_agent_runs_proposal_id"),
    )
    op.create_index("ix_agent_runs_user_created", "agent_runs", ["user_id", "created_at"])
    op.create_index("ix_agent_runs_status_lease", "agent_runs", ["status", "lease_expires_at"])

    op.create_table(
        "agent_operations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("run_id", sa.String(), sa.ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("operation_id", sa.String(80), nullable=False),
        sa.Column("sequence", sa.Integer(), nullable=False),
        sa.Column("kind", sa.String(48), nullable=False),
        sa.Column("input_hash", sa.String(64), nullable=False),
        sa.Column("input_data", JSON_TYPE, nullable=False),
        sa.Column("status", sa.String(32), nullable=False),
        sa.Column("result", JSON_TYPE, nullable=True),
        sa.Column("error_code", sa.String(64), nullable=True),
        sa.Column("error_message", sa.String(500), nullable=True),
        sa.Column("started_at", sa.DateTime(), nullable=True),
        sa.Column("finished_at", sa.DateTime(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.UniqueConstraint("run_id", "operation_id", name="uq_agent_operations_run_operation"),
    )
    op.create_index("ix_agent_operations_run_sequence", "agent_operations", ["run_id", "sequence"])

    op.create_table(
        "agent_change_cursors",
        sa.Column("user_id", sa.String(), sa.ForeignKey("users.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("cursor", sa.Integer(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
    )

    op.create_table(
        "agent_outbox_events",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("event_type", sa.String(120), nullable=False),
        sa.Column("payload", JSON_TYPE, nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("dispatched_at", sa.DateTime(), nullable=True),
    )
    op.create_index(
        "ix_agent_outbox_events_pending_created",
        "agent_outbox_events",
        ["dispatched_at", "created_at"],
    )

    op.add_column("notes", sa.Column("agent_grant_id", sa.String(), nullable=True))
    op.add_column("notes", sa.Column("agent_run_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_notes_agent_grant_id_agent_grants",
        "notes",
        "agent_grants",
        ["agent_grant_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_foreign_key(
        "fk_notes_agent_run_id_agent_runs",
        "notes",
        "agent_runs",
        ["agent_run_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_notes_agent_grant_id", "notes", ["agent_grant_id"])
    op.create_index("ix_notes_agent_run_id", "notes", ["agent_run_id"])


def downgrade():
    op.drop_index("ix_notes_agent_run_id", table_name="notes")
    op.drop_index("ix_notes_agent_grant_id", table_name="notes")
    op.drop_constraint("fk_notes_agent_run_id_agent_runs", "notes", type_="foreignkey")
    op.drop_constraint("fk_notes_agent_grant_id_agent_grants", "notes", type_="foreignkey")
    op.drop_column("notes", "agent_run_id")
    op.drop_column("notes", "agent_grant_id")
    op.drop_index("ix_agent_outbox_events_pending_created", table_name="agent_outbox_events")
    op.drop_table("agent_outbox_events")
    op.drop_table("agent_change_cursors")
    op.drop_index("ix_agent_operations_run_sequence", table_name="agent_operations")
    op.drop_table("agent_operations")
    op.drop_index("ix_agent_runs_status_lease", table_name="agent_runs")
    op.drop_index("ix_agent_runs_user_created", table_name="agent_runs")
    op.drop_table("agent_runs")
    op.drop_index("ix_agent_approvals_proposal_created", table_name="agent_approvals")
    op.drop_table("agent_approvals")
    op.drop_index("ix_agent_proposals_user_status_created", table_name="agent_proposals")
    op.drop_table("agent_proposals")
    op.drop_index("ix_agent_task_briefs_root_created", table_name="agent_task_briefs")
    op.drop_index("ix_agent_task_briefs_user_created", table_name="agent_task_briefs")
    op.drop_table("agent_task_briefs")
    op.drop_index("ix_agent_credentials_expiry", table_name="agent_credentials")
    op.drop_index("ix_agent_credentials_grant_active", table_name="agent_credentials")
    op.drop_table("agent_credentials")
    op.drop_index("ix_agent_authorization_codes_expiry", table_name="agent_authorization_codes")
    op.drop_table("agent_authorization_codes")
    op.drop_index("ix_agent_grants_client_user", table_name="agent_grants")
    op.drop_index("ix_agent_grants_user_active", table_name="agent_grants")
    op.drop_table("agent_grants")
    op.drop_index("ix_agent_oauth_clients_active_created", table_name="agent_oauth_clients")
    op.drop_table("agent_oauth_clients")
