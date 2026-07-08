import datetime
import json
import uuid

import jwt
import pytest

from config import config
from models import EmailDeliveryEvent, EventLog, Goal, ProductEvent, User, utc_now


def auth_headers_for(user):
    token = jwt.encode({
        'user_id': user.id,
        'exp': datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(hours=24),
    }, config.JWT_SECRET_KEY, algorithm="HS256")
    return {
        'Authorization': f'Bearer {token}',
        'Content-Type': 'application/json',
    }


@pytest.fixture
def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username='usageadmin',
        email='usageadmin@example.com',
        role='admin',
    )
    user.set_password('Password123')
    db_session.add(user)
    db_session.commit()
    return user


@pytest.fixture
def admin_client(client, admin_user):
    class AdminClient:
        def __init__(self, client, user):
            self.client = client
            self.headers = auth_headers_for(user)

        def get(self, *args, **kwargs):
            return self.client.get(*args, headers=self.headers, **kwargs)

        def post(self, *args, **kwargs):
            return self.client.post(*args, headers=self.headers, **kwargs)

    return AdminClient(client, admin_user)


@pytest.fixture
def seeded_usage_data(db_session, test_user):
    now = utc_now()

    root = Goal(
        id=str(uuid.uuid4()),
        name="Usage Root",
        owner_id=test_user.id,
    )
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()

    db_session.add_all([
        ProductEvent(
            user_id=test_user.id,
            event_name="page_view",
            path="/:rootId/goals",
            created_at=now - datetime.timedelta(hours=2),
        ),
        ProductEvent(
            user_id=test_user.id,
            event_name="page_view",
            path="/:rootId/analytics",
            created_at=now - datetime.timedelta(hours=1),
        ),
        ProductEvent(
            user_id=test_user.id,
            event_name="settings_opened",
            created_at=now - datetime.timedelta(hours=1),
        ),
        # Outside any window we query in these tests.
        ProductEvent(
            user_id=test_user.id,
            event_name="page_view",
            path="/:rootId/goals",
            created_at=now - datetime.timedelta(days=200),
        ),
    ])

    db_session.add_all([
        EventLog(
            root_id=root.id,
            event_type="session.created",
            timestamp=now - datetime.timedelta(hours=3),
        ),
        EventLog(
            root_id=root.id,
            event_type="session.created",
            timestamp=now - datetime.timedelta(hours=4),
        ),
        EventLog(
            root_id=root.id,
            event_type="goal.created",
            timestamp=now - datetime.timedelta(hours=5),
        ),
    ])

    db_session.add(EmailDeliveryEvent(
        provider="test",
        template_key="beta_invite",
        status="delivered",
        created_at=now - datetime.timedelta(hours=6),
    ))

    db_session.commit()
    return root


@pytest.mark.integration
class TestAdminUsageEndpoint:
    def test_requires_admin(self, authed_client):
        response = authed_client.get('/api/admin/usage')

        assert response.status_code == 403

    def test_usage_summary_aggregates(self, admin_client, seeded_usage_data, test_user):
        response = admin_client.get('/api/admin/usage?days=30')

        assert response.status_code == 200
        payload = json.loads(response.data)

        assert payload['window_days'] == 30
        assert len(payload['active_users']['dau']) == 30
        assert payload['active_users']['dau'][-1]['count'] == 1
        assert payload['active_users']['wau'] >= 1
        assert payload['active_users']['mau'] >= 1

        per_user = {entry['user_id']: entry for entry in payload['per_user']}
        assert per_user[test_user.id]['page_views'] == 2
        assert per_user[test_user.id]['sessions_created'] == 2
        assert per_user[test_user.id]['goals_created'] == 1

        top_pages = {entry['path']: entry for entry in payload['top_pages']}
        assert top_pages['/:rootId/goals']['count'] == 1
        assert top_pages['/:rootId/analytics']['count'] == 1

        top_events = {entry['event_name']: entry for entry in payload['top_events']}
        assert top_events['page_view']['count'] == 2
        assert top_events['settings_opened']['count'] == 1

        email_health = {
            (entry['template_key'], entry['status']): entry['count']
            for entry in payload['email_health']
        }
        assert email_health[('beta_invite', 'delivered')] == 1

    def test_days_parameter_is_clamped(self, admin_client):
        response = admin_client.get('/api/admin/usage?days=5000')
        assert response.status_code == 200
        assert json.loads(response.data)['window_days'] == 90

        response = admin_client.get('/api/admin/usage?days=not-a-number')
        assert response.status_code == 200
        assert json.loads(response.data)['window_days'] == 30

    def test_login_fallback_counts_active_users_without_telemetry(self, admin_client, db_session, test_user):
        test_user.last_login_at = utc_now() - datetime.timedelta(days=1)
        db_session.commit()

        response = admin_client.get('/api/admin/usage?days=7')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['active_users']['wau'] >= 1


@pytest.mark.integration
class TestAdminUsagePrune:
    def test_prune_deletes_old_events_only(self, admin_client, db_session, seeded_usage_data, test_user):
        response = admin_client.post(
            '/api/admin/usage/prune',
            data=json.dumps({'older_than_days': 180}),
            content_type='application/json',
        )

        assert response.status_code == 200
        assert json.loads(response.data)['deleted'] == 1
        remaining = db_session.query(ProductEvent).count()
        assert remaining == 3

    def test_prune_requires_admin(self, authed_client):
        response = authed_client.post('/api/admin/usage/prune', json={})

        assert response.status_code == 403
