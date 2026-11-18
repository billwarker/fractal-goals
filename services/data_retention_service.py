"""Canonical enforcement of the live-database retention schedule."""

import datetime

from sqlalchemy import delete

from config import config
from models import (
    AdminAuditEvent,
    AgentAuthorizationCode,
    AgentCredential,
    AgentEmbeddedConversation,
    AgentGrant,
    AgentOAuthClient,
    AgentTaskBrief,
    BetaSignupRequest,
    EmailDeliveryEvent,
    EmailWebhookEvent,
    PasswordResetToken,
    ProductEvent,
    WebEvent,
    format_utc,
    utc_now,
)
from services.app_settings import DATA_RETENTION_STATE_KEY, get_app_setting, set_app_setting


class DataRetentionService:
    def __init__(self, db_session):
        self.db_session = db_session

    def prune(self, now=None) -> dict[str, int]:
        now = now or utc_now()
        cutoffs = {
            # The published ceilings. The export job keeps Postgres far smaller while it
            # runs (services/analytics_export_service.flush_exported); this holds if it stops.
            "product_events": now - datetime.timedelta(days=config.PRODUCT_EVENT_RETENTION_DAYS),
            "web_events": now - datetime.timedelta(days=config.WEB_EVENT_RETENTION_DAYS),
            "password_reset_tokens": now - datetime.timedelta(days=config.PASSWORD_RESET_RECORD_RETENTION_DAYS),
            "email_events": now - datetime.timedelta(days=config.EMAIL_EVENT_RETENTION_DAYS),
            "admin_audits": now - datetime.timedelta(days=config.ADMIN_AUDIT_RETENTION_DAYS),
            "beta_signups": now - datetime.timedelta(days=config.BETA_SIGNUP_CLOSED_RETENTION_DAYS),
            "agent_history": now - datetime.timedelta(days=config.AGENT_BRIEF_RETENTION_DAYS),
            "agent_credentials": now - datetime.timedelta(days=30),
        }

        counts = {
            "product_events": self._delete(ProductEvent, ProductEvent.created_at < cutoffs["product_events"]),
            "web_events": self._delete(WebEvent, WebEvent.created_at < cutoffs["web_events"]),
            "password_reset_tokens": self._delete(
                PasswordResetToken,
                PasswordResetToken.created_at < cutoffs["password_reset_tokens"],
            ),
            "email_delivery_events": self._delete(
                EmailDeliveryEvent,
                EmailDeliveryEvent.created_at < cutoffs["email_events"],
            ),
            "email_webhook_events": self._delete(
                EmailWebhookEvent,
                EmailWebhookEvent.created_at < cutoffs["email_events"],
            ),
            "admin_audit_events": self._delete(
                AdminAuditEvent,
                AdminAuditEvent.created_at < cutoffs["admin_audits"],
            ),
            "beta_signup_requests": self._delete(
                BetaSignupRequest,
                BetaSignupRequest.status.in_(("invited", "dismissed")),
                BetaSignupRequest.updated_at < cutoffs["beta_signups"],
            ),
            # Task cascades remove proposals, approvals, runs, operations, and
            # any task-linked private prompt or diff at the same boundary.
            "agent_task_briefs": self._delete(
                AgentTaskBrief,
                AgentTaskBrief.expires_at < now,
                AgentTaskBrief.created_at < cutoffs["agent_history"],
            ),
            "agent_authorization_codes": self._delete(
                AgentAuthorizationCode,
                AgentAuthorizationCode.expires_at < now,
            ),
            "agent_credentials": self._delete(
                AgentCredential,
                (AgentCredential.expires_at < now)
                | (AgentCredential.revoked_at < cutoffs["agent_credentials"]),
            ),
            "agent_grants": self._delete(
                AgentGrant,
                (AgentGrant.expires_at < now)
                | (AgentGrant.revoked_at < cutoffs["agent_history"]),
            ),
            "agent_oauth_clients": self._delete(
                AgentOAuthClient,
                AgentOAuthClient.revoked_at < cutoffs["agent_history"],
            ),
            "agent_embedded_conversations": self._delete(
                AgentEmbeddedConversation,
                AgentEmbeddedConversation.updated_at < cutoffs["agent_history"],
            ),
        }
        self.db_session.commit()
        return counts

    def _delete(self, model, *conditions) -> int:
        result = self.db_session.execute(delete(model).where(*conditions))
        return int(result.rowcount or 0)


def record_retention_run(db_session, *, succeeded: bool, counts=None, now=None) -> dict:
    """Note the run in app_settings, so Admin can show when retention last succeeded."""
    now = now or utc_now()
    state = get_app_setting(db_session, DATA_RETENTION_STATE_KEY, {}) or {}
    if not isinstance(state, dict):
        state = {}
    state["last_run_at"] = format_utc(now)
    state["last_run_status"] = "success" if succeeded else "failed"
    if succeeded:
        state["last_success_at"] = format_utc(now)
        state["last_run_counts"] = counts or {}
    set_app_setting(db_session, DATA_RETENTION_STATE_KEY, state)
    db_session.commit()
    return state
