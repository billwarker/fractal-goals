import datetime
import uuid

import pytest

from models import (
    AdminAuditEvent,
    BetaSignupRequest,
    EmailDeliveryEvent,
    EmailWebhookEvent,
    PasswordResetToken,
    ProductEvent,
    User,
    WebEvent,
)
from services.app_settings import DATA_RETENTION_STATE_KEY, TELEMETRY_RETENTION_KEY, get_app_setting, set_app_setting
from services.data_retention_service import DataRetentionService, record_retention_run


@pytest.mark.unit
def test_prune_enforces_each_published_live_database_window(db_session):
    now = datetime.datetime(2026, 8, 25, 12, 0)
    user = User(username='retention', email='retention@example.com')
    user.set_password('Password123')
    db_session.add(user)
    db_session.flush()

    old = now - datetime.timedelta(days=800)
    recent = now - datetime.timedelta(days=1)
    db_session.add_all([
        ProductEvent(user_id=user.id, event_name='page_view', created_at=old),
        ProductEvent(user_id=user.id, event_name='page_view', created_at=recent),
        # Public site events keep 90 days: the 91st day goes, the 89th stays.
        WebEvent(event_name='landing_view', schema_version=1, visitor_day_hash='a' * 64,
                 created_at=now - datetime.timedelta(days=91)),
        WebEvent(event_name='landing_view', schema_version=1, visitor_day_hash='b' * 64,
                 created_at=now - datetime.timedelta(days=89)),
        PasswordResetToken(
            user_id=user.id,
            token_hash='a' * 64,
            expires_at=old,
            created_at=old,
        ),
        EmailDeliveryEvent(provider='test', template_key='test', status='sent', created_at=old),
        EmailWebhookEvent(
            provider='test',
            provider_event_id=str(uuid.uuid4()),
            event_type='delivered',
            created_at=old,
        ),
        AdminAuditEvent(action='support_access', created_at=old),
        BetaSignupRequest(
            email='closed@example.com',
            status='dismissed',
            created_at=old,
            updated_at=old,
        ),
        BetaSignupRequest(
            email='pending@example.com',
            status='new',
            created_at=old,
            updated_at=old,
        ),
    ])
    db_session.commit()

    counts = DataRetentionService(db_session).prune(now=now)

    assert counts == {
        'product_events': 1,
        'web_events': 1,
        'password_reset_tokens': 1,
        'email_delivery_events': 1,
        'email_webhook_events': 1,
        'admin_audit_events': 1,
        'beta_signup_requests': 1,
        'agent_task_briefs': 0,
        'agent_authorization_codes': 0,
        'agent_credentials': 0,
        'agent_grants': 0,
        'agent_oauth_clients': 0,
        'agent_embedded_conversations': 0,
        'user_devices': 0,
        'device_refresh_tokens': 0,
        'sync_field_edits': 0,
        'sync_changes': 0,
    }
    assert db_session.query(ProductEvent).count() == 1
    assert db_session.query(BetaSignupRequest).one().email == 'pending@example.com'


@pytest.mark.unit
def test_product_events_keep_the_published_ceiling_whatever_the_live_window(db_session):
    """The admin live window drives the export's flush; retention only enforces the policy's 180 days."""
    now = datetime.datetime(2026, 8, 25, 12, 0)
    user = User(username='ceiling', email='ceiling@example.com')
    user.set_password('Password123')
    db_session.add(user)
    db_session.flush()
    set_app_setting(db_session, TELEMETRY_RETENTION_KEY, {'live_days': 30})
    db_session.add_all([
        ProductEvent(user_id=user.id, event_name='page_view', created_at=now - datetime.timedelta(days=181)),
        ProductEvent(user_id=user.id, event_name='page_view', created_at=now - datetime.timedelta(days=60)),
    ])
    db_session.commit()

    counts = DataRetentionService(db_session).prune(now=now)

    assert counts['product_events'] == 1
    assert db_session.query(ProductEvent).count() == 1


@pytest.mark.unit
def test_each_run_is_recorded_and_only_a_success_moves_last_success(db_session):
    first = datetime.datetime(2026, 8, 25, 3, 0, tzinfo=datetime.timezone.utc)
    record_retention_run(db_session, succeeded=True, counts={'product_events': 2}, now=first)
    record_retention_run(db_session, succeeded=False, now=first + datetime.timedelta(days=1))

    state = get_app_setting(db_session, DATA_RETENTION_STATE_KEY)
    assert state['last_run_status'] == 'failed'
    assert state['last_run_at'].startswith('2026-08-26')
    assert state['last_success_at'].startswith('2026-08-25')
    assert state['last_run_counts'] == {'product_events': 2}
