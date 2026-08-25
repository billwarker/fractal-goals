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
)
from services.data_retention_service import DataRetentionService


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
        'password_reset_tokens': 1,
        'email_delivery_events': 1,
        'email_webhook_events': 1,
        'admin_audit_events': 1,
        'beta_signup_requests': 1,
    }
    assert db_session.query(ProductEvent).count() == 1
    assert db_session.query(BetaSignupRequest).one().email == 'pending@example.com'
