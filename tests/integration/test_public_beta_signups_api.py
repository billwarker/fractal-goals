import base64
import hashlib
import hmac
import json
import time

from config import Config
from models import BetaSignupRequest, EmailDeliveryEvent, EmailWebhookEvent


def test_public_landing_examples_empty_when_unpublished(client):
    response = client.get('/api/public/landing-examples')

    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'public, max-age=300, stale-while-revalidate=86400'
    assert response.get_json() == {'published_at': None, 'schema_version': None, 'examples': []}


def test_create_beta_signup_request(client, db_session):
    response = client.post('/api/public/beta-signups', json={
        'email': 'Will@Test.Example',
    })

    assert response.status_code == 201
    payload = response.get_json()
    assert payload['created'] is True
    assert payload['request']['email'] == 'will@test.example'

    # Email-only signups no longer backfill placeholder name/use_case so exports
    # reflect only real data.
    stored = db_session.query(BetaSignupRequest).filter_by(email='will@test.example').one()
    assert stored.name is None
    assert stored.use_case is None


def test_create_beta_signup_persists_goal_as_use_case(client, db_session):
    response = client.post('/api/public/beta-signups', json={
        'email': 'goal@test.example',
        'use_case': 'Get strong enough for a one-arm pull-up',
    })

    assert response.status_code == 201
    stored = db_session.query(BetaSignupRequest).filter_by(email='goal@test.example').one()
    assert stored.use_case == 'Get strong enough for a one-arm pull-up'


def test_duplicate_beta_signup_updates_existing_request(client, db_session):
    first = client.post('/api/public/beta-signups', json={
        'name': 'Will Tester',
        'email': 'will@test.example',
        'use_case': 'personal goals',
    })
    assert first.status_code == 201

    second = client.post('/api/public/beta-signups', json={
        'name': 'Will Updated',
        'email': 'will@test.example',
        'use_case': 'startup or work',
        'note': 'New focus.',
    })

    assert second.status_code == 200
    payload = second.get_json()
    assert payload['created'] is False
    assert payload['request']['name'] == 'Will Updated'

    requests = db_session.query(BetaSignupRequest).filter_by(email='will@test.example').all()
    assert len(requests) == 1
    assert requests[0].use_case == 'startup or work'

    third = client.post('/api/public/beta-signups', json={
        'email': 'will@test.example',
    })

    assert third.status_code == 200
    db_session.refresh(requests[0])
    assert requests[0].name == 'Will Updated'
    assert requests[0].use_case == 'startup or work'


def test_beta_signup_validates_required_fields(client):
    response = client.post('/api/public/beta-signups', json={
        'email': 'not-an-email',
    })

    assert response.status_code == 400


def test_beta_signup_rate_limit_counts_invalid_payloads(client):
    responses = [
        client.post(
            '/api/public/beta-signups',
            json={'email': 'not-an-email'},
            environ_base={'REMOTE_ADDR': '198.51.100.20'},
        )
        for _ in range(13)
    ]

    assert [response.status_code for response in responses[:12]] == [400] * 12
    assert responses[12].status_code == 429


def _signed_resend_headers(body: bytes, secret: str, event_id: str = "evt_route_1"):
    timestamp = str(int(time.time()))
    secret_value = secret.split("_", 1)[1] if secret.startswith("whsec_") else secret
    signed_payload = b".".join([event_id.encode("utf-8"), timestamp.encode("utf-8"), body])
    signature = base64.b64encode(
        hmac.new(base64.b64decode(secret_value), signed_payload, hashlib.sha256).digest()
    ).decode("utf-8")
    return {
        "Svix-Id": event_id,
        "Svix-Timestamp": timestamp,
        "Svix-Signature": f"v1,{signature}",
    }


def test_resend_webhook_route_verifies_and_updates_delivery_event(client, db_session, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"route-secret").decode("utf-8")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", secret)
    delivery_event = EmailDeliveryEvent(
        provider="resend",
        template_key="password_reset",
        provider_message_id="email_route_1",
        status="sent",
    )
    db_session.add(delivery_event)
    db_session.commit()

    body = json.dumps({
        "type": "email.bounced",
        "created_at": "2026-07-07T12:00:00Z",
        "data": {"email_id": "email_route_1", "reason": "Mailbox unavailable"},
    }).encode("utf-8")
    response = client.post(
        '/api/public/webhooks/resend',
        data=body,
        headers=_signed_resend_headers(body, secret),
        content_type='application/json',
    )

    assert response.status_code == 200
    db_session.refresh(delivery_event)
    assert delivery_event.status == "bounced"
    assert delivery_event.error_summary == "Mailbox unavailable"
    assert db_session.query(EmailWebhookEvent).count() == 1


def test_resend_webhook_route_rejects_bad_signature(client, monkeypatch):
    secret = "whsec_" + base64.b64encode(b"route-secret").decode("utf-8")
    monkeypatch.setattr(Config, "RESEND_WEBHOOK_SIGNING_SECRET", secret)
    response = client.post(
        '/api/public/webhooks/resend',
        data=b'{"type":"email.delivered","data":{"email_id":"email_1"}}',
        headers={
            "Svix-Id": "evt_bad_route",
            "Svix-Timestamp": str(int(time.time())),
            "Svix-Signature": "v1,bad",
        },
        content_type='application/json',
    )

    assert response.status_code == 400
    assert response.get_json()['error'] == 'Invalid webhook signature'
