"""Durable delegated access and AI task execution records."""

import uuid

import sqlalchemy as sa
from sqlalchemy import BigInteger, Column, Date, DateTime, ForeignKey, Integer, String, Text

from .base import Base, JSON_TYPE, utc_now


def _id():
    return str(uuid.uuid4())


class AgentOAuthClient(Base):
    __tablename__ = "agent_oauth_clients"
    __table_args__ = (
        sa.UniqueConstraint("client_id", name="uq_agent_oauth_clients_client_id"),
        sa.Index("ix_agent_oauth_clients_active_created", "revoked_at", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    client_id = Column(String(128), nullable=False)
    client_name = Column(String(120), nullable=False)
    redirect_uris = Column(JSON_TYPE, nullable=False)
    grant_types = Column(JSON_TYPE, nullable=False, default=lambda: ["authorization_code", "refresh_token"])
    token_endpoint_auth_method = Column(String(32), nullable=False, default="none")
    created_at = Column(DateTime, nullable=False, default=utc_now)
    revoked_at = Column(DateTime, nullable=True)

    def get_client_id(self):
        return self.client_id

    def get_client_secret(self):
        return None

    def check_client_secret(self, client_secret):
        return False

    def check_endpoint_auth_method(self, method, endpoint):
        return method == self.token_endpoint_auth_method == "none"

    def check_grant_type(self, grant_type):
        return grant_type in (self.grant_types or [])

    def check_response_type(self, response_type):
        return response_type == "code"

    def check_redirect_uri(self, redirect_uri):
        return redirect_uri in (self.redirect_uris or [])

    def get_allowed_scope(self, scope):
        return scope or "goals:read"


class AgentGrant(Base):
    __tablename__ = "agent_grants"
    __table_args__ = (
        sa.Index("ix_agent_grants_user_active", "user_id", "revoked_at", "expires_at"),
        sa.Index("ix_agent_grants_client_user", "client_id", "user_id"),
    )

    id = Column(String, primary_key=True, default=_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(String, ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False)
    allowed_roots = Column(JSON_TYPE, nullable=False, default=list)
    scopes = Column(String(500), nullable=False)
    audience = Column(String(500), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    expires_at = Column(DateTime, nullable=True)
    revoked_at = Column(DateTime, nullable=True)


class AgentAuthorizationCode(Base):
    __tablename__ = "agent_authorization_codes"
    __table_args__ = (
        sa.UniqueConstraint("code_hash", name="uq_agent_authorization_codes_code_hash"),
        sa.Index("ix_agent_authorization_codes_expiry", "expires_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    code_hash = Column(String(64), nullable=False)
    grant_id = Column(String, ForeignKey("agent_grants.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(String, ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False)
    redirect_uri = Column(Text, nullable=False)
    scope = Column(String(500), nullable=False)
    code_challenge = Column(String(128), nullable=False)
    code_challenge_method = Column(String(16), nullable=False, default="S256")
    state = Column(String(500), nullable=True)
    resource = Column(String(500), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    consumed_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    def get_redirect_uri(self):
        return self.redirect_uri

    def get_scope(self):
        return self.scope


class AgentCredential(Base):
    __tablename__ = "agent_credentials"
    __table_args__ = (
        sa.UniqueConstraint("token_hash", name="uq_agent_credentials_token_hash"),
        sa.Index("ix_agent_credentials_grant_active", "grant_id", "revoked_at", "expires_at"),
        sa.Index("ix_agent_credentials_expiry", "expires_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    token_hash = Column(String(64), nullable=False)
    token_type = Column(String(16), nullable=False)
    grant_id = Column(String, ForeignKey("agent_grants.id", ondelete="CASCADE"), nullable=False)
    client_id = Column(String, ForeignKey("agent_oauth_clients.id", ondelete="CASCADE"), nullable=False)
    audience = Column(String(500), nullable=False)
    scopes = Column(String(500), nullable=False)
    expires_at = Column(DateTime, nullable=False)
    revoked_at = Column(DateTime, nullable=True)
    replaced_by_id = Column(String, ForeignKey("agent_credentials.id", ondelete="SET NULL"), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)

    def get_scope(self):
        return self.scopes

    def check_client(self, client):
        return self.client_id == client.id


class AgentTaskBrief(Base):
    __tablename__ = "agent_task_briefs"
    __table_args__ = (
        sa.Index("ix_agent_task_briefs_user_created", "user_id", "created_at"),
        sa.Index("ix_agent_task_briefs_root_created", "root_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    grant_id = Column(String, ForeignKey("agent_grants.id", ondelete="SET NULL"), nullable=True)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    execution_origin = Column(String(32), nullable=False, default="first_party")
    request_text = Column(Text, nullable=False)
    context = Column(JSON_TYPE, nullable=False, default=dict)
    timezone = Column(String(64), nullable=False)
    limits = Column(JSON_TYPE, nullable=False, default=dict)
    status = Column(String(32), nullable=False, default="open")
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AgentProposal(Base):
    __tablename__ = "agent_proposals"
    __table_args__ = (
        sa.UniqueConstraint("task_id", "revision", name="uq_agent_proposals_task_revision"),
        sa.Index("ix_agent_proposals_user_status_created", "user_id", "status", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    task_id = Column(String, ForeignKey("agent_task_briefs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    revision = Column(Integer, nullable=False)
    proposal_hash = Column(String(64), nullable=False)
    operations = Column(JSON_TYPE, nullable=False)
    preview = Column(JSON_TYPE, nullable=False, default=list)
    status = Column(String(32), nullable=False, default="awaiting_approval")
    expires_at = Column(DateTime, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentApproval(Base):
    __tablename__ = "agent_approvals"
    __table_args__ = (
        sa.Index("ix_agent_approvals_proposal_created", "proposal_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    proposal_id = Column(String, ForeignKey("agent_proposals.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    proposal_hash = Column(String(64), nullable=False)
    decision = Column(String(16), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentRun(Base):
    __tablename__ = "agent_runs"
    __table_args__ = (
        sa.UniqueConstraint("proposal_id", name="uq_agent_runs_proposal_id"),
        sa.Index("ix_agent_runs_user_created", "user_id", "created_at"),
        sa.Index("ix_agent_runs_status_lease", "status", "lease_expires_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    proposal_id = Column(String, ForeignKey("agent_proposals.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    grant_id = Column(String, ForeignKey("agent_grants.id", ondelete="SET NULL"), nullable=True)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    execution_origin = Column(String(32), nullable=False, default="first_party")
    status = Column(String(32), nullable=False, default="queued")
    lease_owner = Column(String(128), nullable=True)
    lease_expires_at = Column(DateTime, nullable=True)
    fencing_token = Column(Integer, nullable=False, default=0)
    cancel_requested_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    trace_id = Column(String(64), nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentOperation(Base):
    __tablename__ = "agent_operations"
    __table_args__ = (
        sa.UniqueConstraint("run_id", "operation_id", name="uq_agent_operations_run_operation"),
        sa.Index("ix_agent_operations_run_sequence", "run_id", "sequence"),
    )

    id = Column(String, primary_key=True, default=_id)
    run_id = Column(String, ForeignKey("agent_runs.id", ondelete="CASCADE"), nullable=False)
    operation_id = Column(String(80), nullable=False)
    sequence = Column(Integer, nullable=False)
    kind = Column(String(48), nullable=False)
    input_hash = Column(String(64), nullable=False)
    input_data = Column(JSON_TYPE, nullable=False)
    status = Column(String(32), nullable=False, default="queued")
    result = Column(JSON_TYPE, nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(500), nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentChangeCursor(Base):
    __tablename__ = "agent_change_cursors"

    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), primary_key=True)
    cursor = Column(Integer, nullable=False, default=0)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AgentOutboxEvent(Base):
    __tablename__ = "agent_outbox_events"
    __table_args__ = (
        sa.Index("ix_agent_outbox_events_pending_created", "dispatched_at", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    event_type = Column(String(120), nullable=False)
    payload = Column(JSON_TYPE, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    dispatched_at = Column(DateTime, nullable=True)


class AgentEmbeddedConversation(Base):
    __tablename__ = "agent_embedded_conversations"
    __table_args__ = (
        sa.Index("ix_agent_embedded_conversations_user_updated", "user_id", "updated_at"),
        sa.Index("ix_agent_embedded_conversations_root_updated", "root_id", "updated_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    provider = Column(String(16), nullable=False)
    model = Column(String(120), nullable=False)
    timezone = Column(String(64), nullable=False, default="UTC")
    created_at = Column(DateTime, nullable=False, default=utc_now)
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AgentEmbeddedMessage(Base):
    __tablename__ = "agent_embedded_messages"
    __table_args__ = (
        sa.Index("ix_agent_embedded_messages_conversation_created", "conversation_id", "created_at"),
        sa.CheckConstraint("role IN ('user', 'assistant')", name="ck_agent_embedded_messages_role"),
    )

    id = Column(String, primary_key=True, default=_id)
    conversation_id = Column(
        String,
        ForeignKey("agent_embedded_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    role = Column(String(16), nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentEmbeddedRun(Base):
    __tablename__ = "agent_embedded_runs"
    __table_args__ = (
        sa.Index("ix_agent_embedded_runs_status_lease", "status", "lease_expires_at"),
        sa.Index("ix_agent_embedded_runs_user_created", "user_id", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    conversation_id = Column(
        String,
        ForeignKey("agent_embedded_conversations.id", ondelete="CASCADE"),
        nullable=False,
    )
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    root_id = Column(String, ForeignKey("goals.id", ondelete="CASCADE"), nullable=False)
    status = Column(String(24), nullable=False, default="queued")
    step_budget = Column(Integer, nullable=False)
    token_budget = Column(Integer, nullable=False)
    steps_used = Column(Integer, nullable=False, default=0)
    tokens_used = Column(Integer, nullable=False, default=0)
    checkpoint = Column(JSON_TYPE, nullable=False, default=dict)
    proposal_id = Column(String, ForeignKey("agent_proposals.id", ondelete="SET NULL"), nullable=True)
    lease_owner = Column(String(128), nullable=True)
    lease_expires_at = Column(DateTime, nullable=True)
    fencing_token = Column(Integer, nullable=False, default=0, server_default='0')
    provider_call_sequence = Column(Integer, nullable=False, default=0, server_default='0')
    cancel_requested_at = Column(DateTime, nullable=True)
    started_at = Column(DateTime, nullable=True)
    finished_at = Column(DateTime, nullable=True)
    error_code = Column(String(64), nullable=True)
    error_message = Column(String(500), nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)


class AgentEmbeddedDailyBudget(Base):
    __tablename__ = "agent_embedded_daily_budgets"

    scope_key = Column(String(128), primary_key=True)
    usage_date = Column(Date, primary_key=True)
    reserved_microdollars = Column(BigInteger, nullable=False, default=0, server_default='0')
    charged_microdollars = Column(BigInteger, nullable=False, default=0, server_default='0')
    updated_at = Column(DateTime, nullable=False, default=utc_now, onupdate=utc_now)


class AgentEmbeddedUsage(Base):
    __tablename__ = "agent_embedded_usage"
    __table_args__ = (
        sa.UniqueConstraint("run_id", "call_number", name="uq_agent_embedded_usage_run_call"),
        sa.Index("ix_agent_embedded_usage_user_date", "user_id", "usage_date"),
        sa.Index("ix_agent_embedded_usage_status_created", "status", "created_at"),
    )

    id = Column(String, primary_key=True, default=_id)
    run_id = Column(String, ForeignKey("agent_embedded_runs.id", ondelete="CASCADE"), nullable=False)
    user_id = Column(String, ForeignKey("users.id", ondelete="CASCADE"), nullable=False)
    usage_date = Column(Date, nullable=False)
    call_number = Column(Integer, nullable=False)
    fencing_token = Column(Integer, nullable=False)
    provider = Column(String(16), nullable=False)
    model = Column(String(120), nullable=False)
    status = Column(String(16), nullable=False, default="reserved")
    estimated_input_tokens = Column(Integer, nullable=False)
    reserved_output_tokens = Column(Integer, nullable=False)
    actual_input_tokens = Column(Integer, nullable=True)
    actual_output_tokens = Column(Integer, nullable=True)
    reserved_microdollars = Column(BigInteger, nullable=False)
    actual_microdollars = Column(BigInteger, nullable=True)
    created_at = Column(DateTime, nullable=False, default=utc_now)
    completed_at = Column(DateTime, nullable=True)
