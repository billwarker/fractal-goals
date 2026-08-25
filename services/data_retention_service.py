"""Canonical enforcement of the live-database retention schedule."""

import datetime

from sqlalchemy import delete

from config import config
from models import (
    AdminAuditEvent,
    BetaSignupRequest,
    EmailDeliveryEvent,
    EmailWebhookEvent,
    PasswordResetToken,
    ProductEvent,
    utc_now,
)
from services.app_settings import TELEMETRY_RETENTION_KEY, get_app_setting


class DataRetentionService:
    def __init__(self, db_session):
        self.db_session = db_session

    def prune(self, now=None) -> dict[str, int]:
        now = now or utc_now()
        product_event_setting = get_app_setting(self.db_session, TELEMETRY_RETENTION_KEY, {}) or {}
        if not isinstance(product_event_setting, dict):
            product_event_setting = {}
        try:
            configured_product_event_days = int(
                product_event_setting.get("product_events_days", config.PRODUCT_EVENT_RETENTION_DAYS)
            )
        except (TypeError, ValueError):
            configured_product_event_days = config.PRODUCT_EVENT_RETENTION_DAYS
        product_event_days = max(
            30,
            min(
                config.PRODUCT_EVENT_RETENTION_DAYS,
                configured_product_event_days,
            ),
        )
        cutoffs = {
            "product_events": now - datetime.timedelta(days=product_event_days),
            "password_reset_tokens": now - datetime.timedelta(days=config.PASSWORD_RESET_RECORD_RETENTION_DAYS),
            "email_events": now - datetime.timedelta(days=config.EMAIL_EVENT_RETENTION_DAYS),
            "admin_audits": now - datetime.timedelta(days=config.ADMIN_AUDIT_RETENTION_DAYS),
            "beta_signups": now - datetime.timedelta(days=config.BETA_SIGNUP_CLOSED_RETENTION_DAYS),
        }

        counts = {
            "product_events": self._delete(ProductEvent, ProductEvent.created_at < cutoffs["product_events"]),
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
        }
        self.db_session.commit()
        return counts

    def _delete(self, model, *conditions) -> int:
        result = self.db_session.execute(delete(model).where(*conditions))
        return int(result.rowcount or 0)
