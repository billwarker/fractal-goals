import pytest
import base64
import hashlib
import hmac
import json
import time

from config import Config
from models import EmailDeliveryEvent, EmailWebhookEvent
from services.email_service import EmailService, EmailWebhookVerificationError, TEST_EMAIL_OUTBOX


def test_test_transport_captures_email(db_session, monkeypatch):
    monkeypatch.setattr(Config, "EMAIL_PROVIDER", "test")
    EmailService.clear_test_outbox()

    result = EmailService(db_session).send_email(
        to="user@test.example",
        subject="Hello",
        html="<p>Hello</p>",
        text="Hello",
        template_key="unit_test",
        entity_type="thing",
        entity_id="thing-1",
        idempotency_key="unit-test-1",
    )
    db_session.commit()

    assert result.message_id == "test_1"
    assert TEST_EMAIL_OUTBOX[0]["to"] == "user@test.example"
    assert TEST_EMAIL_OUTBOX[0]["subject"] == "Hello"
    assert TEST_EMAIL_OUTBOX[0]["template_key"] == "unit_test"
    event = db_session.query(EmailDeliveryEvent).one()
    assert event.status == "sent"
    assert event.provider_message_id == "test_1"


def test_resend_transport_posts_expected_payload(db_session, monkeypatch):
    calls = []

    class FakeResponse:
        status_code = 200
        content = b'{"id":"resend-1"}'

        def json(self):
            return {"id": "resend-1"}

    def fake_post(url, **kwargs):
        calls.append((url, kwargs))
        return FakeResponse()

    monkeypatch.setattr(Config, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(Config, "RESEND_EMAIL_API_KEY", "re_test")
    monkeypatch.setattr("services.email_service.requests.post", fake_post)

    result = EmailService(db_session).send_email(
        to="user@test.example",
        subject="Hello",
        html="<p>Hello</p>",
        text="Hello",
        template_key="unit_test",
        idempotency_key="idem-1",
    )

    assert result.message_id == "resend-1"
    url, kwargs = calls[0]
    assert url == "https://api.resend.com/emails"
    assert kwargs["headers"]["Authorization"] == "Bearer re_test"
    assert kwargs["headers"]["Idempotency-Key"] == "idem-1"
    assert kwargs["json"]["to"] == ["user@test.example"]
    assert kwargs["json"]["from"] == Config.EMAIL_FROM


def test_production_security_requires_resend_config(monkeypatch):
    monkeypatch.setattr(Config, "ENV", "production")
    monkeypatch.setattr(Config, "JWT_SECRET_KEY", "secret")
    monkeypatch.setattr(Config, "DEBUG", False)
    monkeypatch.setattr(Config, "CORS_ORIGINS", ["https://my.fractalgoals.com"])
    monkeypatch.setattr(Config, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(Config, "AUTH_COOKIE_SAMESITE", "Strict")
    monkeypatch.setattr(Config, "RATELIMIT_STORAGE_URI", "redis://redis:6379")
    monkeypatch.setattr(Config, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(Config, "RESEND_EMAIL_API_KEY", "")

    with pytest.raises(ValueError, match="RESEND_EMAIL_API_KEY"):
        Config.check_production_security()


def test_production_security_requires_resend_webhook_secret(monkeypatch):
    monkeypatch.setattr(Config, "ENV", "production")
    monkeypatch.setattr(Config, "JWT_SECRET_KEY", "secret")
    monkeypatch.setattr(Config, "DEBUG", False)
    monkeypatch.setattr(Config, "CORS_ORIGINS", ["https://my.fractalgoals.com"])
    monkeypatch.setattr(Config, "AUTH_COOKIE_SECURE", True)
    monkeypatch.setattr(Config, "AUTH_COOKIE_SAMESITE", "Strict")
    monkeypatch.setattr(Config, "RATELIMIT_STORAGE_URI", "redis://redis:6379")
    monkeypatch.setattr(Config, "EMAIL_PROVIDER", "resend")
    monkeypatch.setattr(Config, "RESEND_EMAIL_API_KEY", "re_test")
    monkeypatch.setattr(Config, "EMAIL_FROM", "Fractal Goals <support@fractalgoals.com>")
    monkeypatch.setattr(Config, "APP_BASE_URL", "https://my.fractalgoals.com")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", "")

    with pytest.raises(ValueError, match="RESEND_WEBHOOK_SIGNING_SECRET"):
        Config.check_production_security()


def _signed_resend_headers(body: bytes, secret: str, event_id: str = "evt_1"):
    timestamp = str(int(time.time()))
    secret_value = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    signed_payload = b".".join([event_id.encode("utf-8"), timestamp.encode("utf-8"), body])
    signature = base64.b64encode(
        hmac.new(base64.b64decode(secret_value), signed_payload, hashlib.sha256).digest()
    ).decode("utf-8")
    return {
        "svix-id": event_id,
        "svix-timestamp": timestamp,
        "svix-signature": f"v1,{signature}",
    }


def test_resend_webhook_updates_delivery_event(db_session, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"test-secret").decode("utf-8")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", secret)
    delivery_event = EmailDeliveryEvent(
        provider="resend",
        template_key="beta_invite",
        provider_message_id="email_1",
        status="sent",
    )
    db_session.add(delivery_event)
    db_session.commit()

    body = json.dumps({
        "type": "email.delivered",
        "created_at": "2026-07-07T12:00:00Z",
        "data": {"email_id": "email_1"},
    }).encode("utf-8")
    result = EmailService(db_session).process_resend_webhook(
        body=body,
        headers=_signed_resend_headers(body, secret),
    )

    assert result["processed"] is True
    db_session.refresh(delivery_event)
    assert delivery_event.status == "delivered"
    assert delivery_event.delivered_at is not None
    assert delivery_event.last_event_type == "email.delivered"
    assert db_session.query(EmailWebhookEvent).count() == 1


def test_resend_webhook_is_idempotent(db_session, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"test-secret").decode("utf-8")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", secret)
    body = json.dumps({
        "type": "email.opened",
        "created_at": "2026-07-07T12:00:00Z",
        "data": {"email_id": "email_1"},
    }).encode("utf-8")
    headers = _signed_resend_headers(body, secret, event_id="evt_duplicate")

    first = EmailService(db_session).process_resend_webhook(body=body, headers=headers)
    second = EmailService(db_session).process_resend_webhook(body=body, headers=headers)

    assert first["processed"] is True
    assert second["duplicate"] is True
    assert db_session.query(EmailWebhookEvent).count() == 1


def test_resend_webhook_rejects_bad_signature(db_session, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"test-secret").decode("utf-8")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", secret)
    body = b'{"type":"email.delivered","data":{"email_id":"email_1"}}'

    with pytest.raises(EmailWebhookVerificationError):
        EmailService(db_session).process_resend_webhook(
            body=body,
            headers={
                "svix-id": "evt_bad",
                "svix-timestamp": str(int(time.time())),
                "svix-signature": "v1,bad",
            },
        )
