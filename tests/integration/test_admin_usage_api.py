from config import config
import datetime
import json
import uuid

import pytest

from models import EmailDeliveryEvent, EventLog, Goal, ProductEvent, User, utc_now
from services.app_settings import ANALYTICS_EXPORT_STATE_KEY, TELEMETRY_RETENTION_KEY, set_app_setting
from tests.conftest import session_headers_for


def auth_headers_for(user):
    return session_headers_for(user)


@pytest.fixture
def admin_user(db_session):
    user = User(
        id=str(uuid.uuid4()),
        username='usageadmin',
        email='usageadmin@example.com',
        role='admin',
        terms_accepted_version=config.TERMS_VERSION,
        privacy_accepted_version=config.PRIVACY_VERSION,
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

        def patch(self, *args, **kwargs):
            return self.client.patch(*args, headers=self.headers, **kwargs)

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
            created_at=now,
        ),
        ProductEvent(
            user_id=test_user.id,
            event_name="page_view",
            path="/:rootId/analytics",
            created_at=now,
        ),
        ProductEvent(
            user_id=test_user.id,
            event_name="settings_opened",
            created_at=now,
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
        assert json.loads(response.data)['window_days'] == 365

        response = admin_client.get('/api/admin/usage?days=not-a-number')
        assert response.status_code == 200
        assert json.loads(response.data)['window_days'] == 30

    def test_start_end_window_honored_and_echoed(self, admin_client):
        response = admin_client.get('/api/admin/usage?start=2026-06-01&end=2026-06-14')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['window'] == {'start': '2026-06-01', 'end': '2026-06-14', 'days': 14}
        assert len(payload['active_users']['dau']) == 14
        assert payload['active_users']['dau'][0]['date'] == '2026-06-01'
        assert payload['active_users']['dau'][-1]['date'] == '2026-06-14'

    def test_swapped_dates_are_normalized(self, admin_client):
        response = admin_client.get('/api/admin/usage?start=2026-06-14&end=2026-06-01')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['window']['start'] == '2026-06-01'
        assert payload['window']['end'] == '2026-06-14'

    def test_oversized_range_is_clamped_to_max_window(self, admin_client):
        response = admin_client.get('/api/admin/usage?start=2020-01-01&end=2026-06-14')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['window']['days'] == 365
        assert payload['window']['end'] == '2026-06-14'

    def test_events_breakdown_covers_all_event_types(self, admin_client, seeded_usage_data, test_user):
        response = admin_client.get('/api/admin/usage?days=30')

        assert response.status_code == 200
        payload = json.loads(response.data)
        breakdown = {entry['event_type']: entry for entry in payload['events_breakdown']}
        assert breakdown['session.created']['count'] == 2
        assert breakdown['session.created']['users'] == 1
        assert breakdown['session.created']['domain'] == 'session'
        assert breakdown['goal.created']['count'] == 1

        per_user = {entry['user_id']: entry for entry in payload['per_user']}
        assert per_user[test_user.id]['total_events'] == 3

    def test_storage_retention_and_export_state_present(self, admin_client, seeded_usage_data):
        usage = json.loads(admin_client.get('/api/admin/usage?days=30').data)
        response = admin_client.get('/api/admin/usage/storage')

        assert response.status_code == 200
        payload = json.loads(response.data)
        # The full storage scan is the System tab's own request, not every overview load.
        assert 'storage' not in usage and 'retention' not in usage

        tables = {entry['table']: entry for entry in payload['storage']['tables']}
        assert set(tables) == {
            'product_events', 'web_events', 'event_logs', 'email_delivery_events', 'email_webhook_events',
        }
        assert tables['product_events']['rows'] == 4
        assert tables['event_logs']['rows'] == 3
        assert tables['product_events']['oldest'] is not None
        assert tables['product_events']['bytes'] > 0
        database_storage = payload['storage']['database']
        assert database_storage['total_bytes'] > 0
        assert database_storage['relation_bytes'] > 0
        assert database_storage['other_bytes'] >= 0
        assert any(
            relation['schema'] == 'public' and relation['table'] == 'event_logs'
            for relation in database_storage['relations']
        )

        assert database_storage['quota_bytes'] == config.DATABASE_STORAGE_QUOTA_MB * 1024 * 1024
        payloads = {entry['event_type']: entry for entry in payload['storage']['event_log_payloads']}
        assert payloads['session.created']['events'] == 2
        assert usage['live_since']['product_events'] == tables['product_events']['oldest']
        assert usage['live_since']['web_events'] is None

        assert payload['retention'] == {
            'live_days': 35, 'product_events_ceiling_days': 180, 'web_events_ceiling_days': 90,
        }
        assert payload['export'] == {
            'last_run_at': None, 'last_run_status': None, 'last_success_at': None, 'tables': {},
        }
        assert payload['jobs'] == {
            'export': {'last_run_at': None, 'last_success_at': None},
            'retention': {'last_run_at': None, 'last_success_at': None},
        }

    def test_storage_requires_admin(self, authed_client):
        assert authed_client.get('/api/admin/usage/storage').status_code == 403

    def test_a_failed_storage_read_leaves_the_rest_of_the_request_working(self, admin_client, monkeypatch):
        import services.admin_usage_service as admin_usage_module

        # Postgres rejects the LIMIT, failing the payload query inside its savepoint.
        monkeypatch.setattr(admin_usage_module, 'EVENT_LOG_PAYLOAD_TOP', 'not-a-number')
        response = admin_client.get('/api/admin/usage/storage')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['storage']['event_log_payloads'] == []
        # Without the savepoint the aborted transaction would fail every query after it.
        assert payload['retention']['live_days'] == 35
        assert payload['storage']['database']['quota_bytes'] > 0

    def test_sign_ups_leave_out_demo_and_admin_accounts(self, admin_client, db_session, test_user):
        for role in ('demo', 'admin'):
            account = User(username=f'{role}-account', email=f'{role}-account@example.com', role=role)
            account.set_password('Password123')
            db_session.add(account)
        db_session.commit()

        payload = json.loads(admin_client.get('/api/admin/usage?days=7').data)

        signups = sum(day['count'] for day in payload['signups_by_day'])
        funnel = {step['key']: step['count'] for step in payload['growth']['funnel']}
        assert signups == funnel['signed_up']

    def test_daily_users_start_at_the_oldest_event_postgres_holds(self, admin_client, db_session, test_user):
        db_session.add(ProductEvent(user_id=test_user.id, event_name='page_view',
                                    created_at=utc_now() - datetime.timedelta(days=3)))
        db_session.commit()

        dau = json.loads(admin_client.get('/api/admin/usage?days=90').data)['active_users']['dau']

        assert len(dau) == 4

    def test_login_fallback_counts_active_users_without_telemetry(self, admin_client, db_session, test_user):
        test_user.last_login_at = utc_now() - datetime.timedelta(days=1)
        db_session.commit()

        response = admin_client.get('/api/admin/usage?days=7')

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['active_users']['wau'] >= 1


def _mark_exported_through(db_session, created_at, event_id):
    set_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY, {
        'last_run_status': 'success',
        'tables': {'product_events': {'last_ts': created_at.isoformat() + 'Z', 'last_id': event_id}},
    })
    db_session.commit()


@pytest.mark.integration
class TestAdminUsageFlush:
    def test_flush_removes_only_exported_events_past_the_live_window(self, admin_client, db_session, seeded_usage_data):
        oldest = db_session.query(ProductEvent).order_by(ProductEvent.created_at).first()

        # Not exported yet: it stays, however old.
        unexported = admin_client.post('/api/admin/usage/prune', json={})
        assert unexported.status_code == 200
        assert json.loads(unexported.data)['deleted'] == 0

        _mark_exported_through(db_session, oldest.created_at, oldest.id)
        response = admin_client.post('/api/admin/usage/prune', json={})

        assert response.status_code == 200
        payload = json.loads(response.data)
        assert payload['flushed'] == {'product_events': 1, 'web_events': 0}
        assert payload['live_days'] == 35
        assert db_session.query(ProductEvent).count() == 3

    def test_flush_requires_admin(self, authed_client):
        response = authed_client.post('/api/admin/usage/prune', json={})

        assert response.status_code == 403


@pytest.mark.integration
class TestAdminUsageRetention:
    def test_live_window_round_trip(self, admin_client):
        update = admin_client.patch('/api/admin/usage/retention', json={'live_days': 90})
        assert update.status_code == 200
        assert json.loads(update.data) == {'live_days': 90}

        storage = admin_client.get('/api/admin/usage/storage')
        assert json.loads(storage.data)['retention']['live_days'] == 90

    def test_the_setting_saved_before_the_flush_still_counts(self, admin_client, db_session):
        set_app_setting(db_session, TELEMETRY_RETENTION_KEY, {'product_events_days': 120})
        db_session.commit()

        storage = admin_client.get('/api/admin/usage/storage')

        assert json.loads(storage.data)['retention']['live_days'] == 120

    def test_live_window_values_are_clamped(self, admin_client):
        low = admin_client.patch('/api/admin/usage/retention', json={'live_days': 1})
        assert json.loads(low.data)['live_days'] == 30

        high = admin_client.patch('/api/admin/usage/retention', json={'live_days': 5000})
        assert json.loads(high.data)['live_days'] == 180

    def test_retention_requires_admin(self, authed_client):
        response = authed_client.patch(
            '/api/admin/usage/retention',
            data=json.dumps({'live_days': 90}),
            content_type='application/json',
        )
        assert response.status_code == 403
