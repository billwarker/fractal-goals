import logging
import base64
import binascii
import hashlib
import hmac
import json
import time
from dataclasses import dataclass
from datetime import datetime, timezone

import requests

from config import config
from models import EmailDeliveryEvent, EmailWebhookEvent, utc_now
from services.service_types import JsonDict

logger = logging.getLogger(__name__)

TEST_EMAIL_OUTBOX: list[JsonDict] = []


class EmailSendError(RuntimeError):
    pass


class EmailWebhookVerificationError(RuntimeError):
    pass


@dataclass
class EmailSendResult:
    provider: str
    message_id: str | None = None


class EmailService:
    TERMINAL_STATUSES = {'bounced', 'complained'}
    EVENT_STATUS_MAP = {
        'email.sent': 'sent',
        'email.delivered': 'delivered',
        'email.delivery_delayed': 'delivery_delayed',
        'email.bounced': 'bounced',
        'email.complained': 'complained',
        'email.opened': 'opened',
        'email.clicked': 'clicked',
    }

    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def clear_test_outbox():
        TEST_EMAIL_OUTBOX.clear()

    def send_email(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
        template_key: str,
        entity_type: str | None = None,
        entity_id: str | None = None,
        idempotency_key: str | None = None,
        recipient_user_id: str | None = None,
        beta_signup_id: str | None = None,
    ) -> EmailSendResult:
        provider = config.EMAIL_PROVIDER or 'disabled'
        event = EmailDeliveryEvent(
            provider=provider,
            template_key=template_key,
            entity_type=entity_type,
            entity_id=entity_id,
            recipient_user_id=recipient_user_id,
            beta_signup_id=beta_signup_id,
            idempotency_key=idempotency_key,
            status='pending',
        )
        self.db_session.add(event)
        self.db_session.flush()

        try:
            if provider == 'resend':
                result = self._send_resend(
                    to=to,
                    subject=subject,
                    html=html,
                    text=text,
                    idempotency_key=idempotency_key,
                )
            elif provider == 'test':
                result = self._send_test(
                    to=to,
                    subject=subject,
                    html=html,
                    text=text,
                    template_key=template_key,
                    entity_type=entity_type,
                    entity_id=entity_id,
                    idempotency_key=idempotency_key,
                )
            elif provider == 'disabled':
                raise EmailSendError("Email provider is disabled")
            else:
                raise EmailSendError("Unsupported email provider")
        except Exception as exc:
            event.status = 'failed'
            event.error_summary = str(exc)[:500]
            logger.warning(
                "Email send failed provider=%s template=%s entity_type=%s entity_id=%s",
                provider,
                template_key,
                entity_type,
                entity_id,
            )
            raise EmailSendError(str(exc)) from exc

        event.status = 'sent'
        event.provider_message_id = result.message_id
        event.sent_at = utc_now()
        return result

    def _send_test(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
        template_key: str,
        entity_type: str | None,
        entity_id: str | None,
        idempotency_key: str | None,
    ) -> EmailSendResult:
        message_id = f"test_{len(TEST_EMAIL_OUTBOX) + 1}"
        TEST_EMAIL_OUTBOX.append({
            "id": message_id,
            "to": to,
            "from": config.EMAIL_FROM,
            "subject": subject,
            "html": html,
            "text": text,
            "template_key": template_key,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "idempotency_key": idempotency_key,
        })
        logger.info("Captured test email template=%s entity_type=%s entity_id=%s", template_key, entity_type, entity_id)
        return EmailSendResult(provider='test', message_id=message_id)

    def _send_resend(
        self,
        *,
        to: str,
        subject: str,
        html: str,
        text: str,
        idempotency_key: str | None,
    ) -> EmailSendResult:
        if not config.RESEND_EMAIL_API_KEY:
            raise EmailSendError("RESEND_EMAIL_API_KEY is not configured")
        headers = {
            "Authorization": f"Bearer {config.RESEND_EMAIL_API_KEY}",
            "Content-Type": "application/json",
        }
        if idempotency_key:
            headers["Idempotency-Key"] = idempotency_key

        response = requests.post(
            "https://api.resend.com/emails",
            headers=headers,
            json={
                "from": config.EMAIL_FROM,
                "to": [to],
                "subject": subject,
                "html": html,
                "text": text,
            },
            timeout=10,
        )
        if response.status_code >= 400:
            raise EmailSendError(f"Resend API returned {response.status_code}")
        payload = response.json() if response.content else {}
        return EmailSendResult(provider='resend', message_id=payload.get("id"))

    def process_resend_webhook(self, *, body: bytes, headers: dict[str, str]) -> JsonDict:
        self._verify_resend_webhook(body=body, headers=headers)
        try:
            payload = json.loads(body.decode('utf-8'))
        except (UnicodeDecodeError, json.JSONDecodeError) as exc:
            raise EmailWebhookVerificationError("Invalid webhook JSON") from exc

        event_type = payload.get("type")
        provider_event_id = headers.get("svix-id") or payload.get("id")
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        provider_message_id = data.get("email_id") or data.get("id")
        if not event_type or not provider_event_id:
            raise EmailWebhookVerificationError("Webhook payload missing event identity")

        existing = self.db_session.query(EmailWebhookEvent).filter_by(provider_event_id=provider_event_id).first()
        if existing:
            return {"processed": False, "duplicate": True, "event_type": existing.event_type}

        webhook_event = EmailWebhookEvent(
            provider="resend",
            provider_event_id=provider_event_id,
            provider_message_id=provider_message_id,
            event_type=event_type,
            payload=payload,
        )
        self.db_session.add(webhook_event)

        delivery_event = None
        if provider_message_id:
            delivery_event = (
                self.db_session.query(EmailDeliveryEvent)
                .filter_by(provider="resend", provider_message_id=provider_message_id)
                .order_by(EmailDeliveryEvent.created_at.desc())
                .first()
            )
        if delivery_event:
            self._apply_provider_event(delivery_event, event_type, payload)

        self.db_session.commit()
        return {
            "processed": True,
            "duplicate": False,
            "event_type": event_type,
            "matched_delivery_event": bool(delivery_event),
        }

    def _apply_provider_event(self, delivery_event: EmailDeliveryEvent, event_type: str, payload: JsonDict):
        event_status = self.EVENT_STATUS_MAP.get(event_type)
        event_time = self._parse_provider_datetime(payload.get("created_at")) or utc_now()
        delivery_event.last_event_type = event_type
        delivery_event.last_event_at = event_time
        if event_type == 'email.delivered' and delivery_event.delivered_at is None:
            delivery_event.delivered_at = event_time
        if event_status and delivery_event.status not in self.TERMINAL_STATUSES:
            delivery_event.status = event_status
        if event_type in ('email.bounced', 'email.complained'):
            delivery_event.error_summary = self._provider_event_summary(payload)

    @staticmethod
    def _provider_event_summary(payload: JsonDict) -> str | None:
        data = payload.get("data") if isinstance(payload.get("data"), dict) else {}
        for key in ("reason", "bounce_reason", "complaint_type"):
            if data.get(key):
                return str(data[key])[:500]
        return str(payload.get("type") or "Provider delivery event")[:500]

    @staticmethod
    def _parse_provider_datetime(value: str | None):
        if not value:
            return None
        try:
            parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
        if parsed.tzinfo is None:
            return parsed.replace(tzinfo=timezone.utc)
        return parsed.astimezone(timezone.utc)

    @staticmethod
    def _verify_resend_webhook(*, body: bytes, headers: dict[str, str]):
        secret = config.RESEND_WEBHOOK_SIGNING_SECRET
        if not secret:
            raise EmailWebhookVerificationError("Webhook signing secret is not configured")

        svix_id = headers.get("svix-id")
        svix_timestamp = headers.get("svix-timestamp")
        svix_signature = headers.get("svix-signature")
        if not svix_id or not svix_timestamp or not svix_signature:
            raise EmailWebhookVerificationError("Missing webhook signature headers")

        try:
            timestamp = int(svix_timestamp)
        except ValueError as exc:
            raise EmailWebhookVerificationError("Invalid webhook timestamp") from exc
        if abs(time.time() - timestamp) > 300:
            raise EmailWebhookVerificationError("Webhook timestamp outside tolerance")

        secret_value = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
        try:
            secret_bytes = base64.b64decode(secret_value)
        except (ValueError, binascii.Error) as exc:
            raise EmailWebhookVerificationError("Invalid webhook signing secret") from exc

        signed_payload = b".".join([svix_id.encode("utf-8"), svix_timestamp.encode("utf-8"), body])
        expected = base64.b64encode(hmac.new(secret_bytes, signed_payload, hashlib.sha256).digest()).decode("utf-8")
        signatures = []
        for part in svix_signature.split(" "):
            if "," in part:
                version, signature = part.split(",", 1)
                if version == "v1":
                    signatures.append(signature)
        if not any(hmac.compare_digest(expected, signature) for signature in signatures):
            raise EmailWebhookVerificationError("Invalid webhook signature")
