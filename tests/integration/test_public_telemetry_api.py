import datetime
import json

import pytest

import services.web_telemetry_service as web_telemetry_module
from models import AppSetting, WebEvent
from services.web_telemetry_service import VISITOR_SALT_KEY, normalize_public_path, normalize_utm, referrer_host

BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15 Safari/605.1.15'


def _post(client, payload, headers=None, ip='203.0.113.7'):
    return client.post(
        '/api/public/telemetry',
        data=json.dumps(payload),
        content_type='application/json',
        headers={'User-Agent': BROWSER, **(headers or {})},
        environ_base={'REMOTE_ADDR': ip},
    )


def _freeze(monkeypatch, day):
    moment = datetime.datetime(2026, 11, day, 12, 0, tzinfo=datetime.timezone.utc)
    monkeypatch.setattr(web_telemetry_module, 'utc_now', lambda: moment)


@pytest.mark.integration
class TestPublicTelemetryEndpoint:
    def test_records_anonymous_events_without_an_account(self, client, db_session):
        response = _post(client, {
            'events': [{'name': 'landing_view'}, {'name': 'waitlist_opened', 'props': {'source': 'landing'}}],
            'context': {
                'path': '/?utm_source=Newsletter',
                'referrer': 'https://news.example.com/posts/42?ref=me',
                'utm_source': 'Newsletter', 'utm_medium': 'email', 'utm_campaign': 'Nov launch!',
            },
        })

        assert response.status_code == 202
        assert response.get_json()['accepted'] == 2
        rows = db_session.query(WebEvent).order_by(WebEvent.event_name).all()
        assert [row.event_name for row in rows] == ['landing_view', 'waitlist_opened']
        landing = rows[0]
        assert landing.path == '/'
        assert landing.referrer_host == 'news.example.com'
        assert (landing.utm_source, landing.utm_medium, landing.utm_campaign) == ('newsletter', 'email', 'nov-launch')
        assert len(landing.visitor_day_hash) == 64
        assert rows[1].properties == {'source': 'landing'}
        stored = json.dumps([row.properties for row in rows]) + ''.join(row.visitor_day_hash for row in rows)
        assert '203.0.113.7' not in stored and 'Safari' not in stored

    def test_same_visitor_same_day_shares_a_hash_and_others_do_not(self, client, db_session, monkeypatch):
        _freeze(monkeypatch, 18)
        _post(client, {'events': [{'name': 'landing_view'}]})
        _post(client, {'events': [{'name': 'demo_started', 'props': {'from_tour': True, 'example_position': 0}}]})
        _post(client, {'events': [{'name': 'landing_view'}]}, ip='198.51.100.9')

        hashes = [row.visitor_day_hash for row in db_session.query(WebEvent).order_by(WebEvent.created_at).all()]
        assert hashes[0] == hashes[1]
        assert hashes[2] != hashes[0]

    def test_the_salt_is_replaced_each_day_so_days_never_match(self, client, db_session, monkeypatch):
        _freeze(monkeypatch, 18)
        _post(client, {'events': [{'name': 'landing_view'}]})
        first_salt = db_session.get(AppSetting, VISITOR_SALT_KEY).value['salt']

        _freeze(monkeypatch, 19)
        _post(client, {'events': [{'name': 'landing_view'}]})
        db_session.expire_all()
        setting = db_session.get(AppSetting, VISITOR_SALT_KEY).value

        assert setting['date'] == '2026-11-19'
        assert setting['salt'] != first_salt
        assert first_salt not in json.dumps(setting)
        hashes = {row.visitor_day_hash for row in db_session.query(WebEvent).all()}
        assert len(hashes) == 2

    def test_app_events_and_unknown_props_are_dropped(self, client, db_session):
        response = _post(client, {'events': [
            {'name': 'page_view'},
            {'name': 'waitlist_submitted', 'props': {'source': 'landing', 'created': True, 'email': 'a@b.co'}},
        ]})

        body = response.get_json()
        assert body['accepted'] == 1
        assert {item['reason'] for item in body['rejected']} == {'unknown_event', 'invalid_props'}
        assert db_session.query(WebEvent).one().properties == {'source': 'landing', 'created': True}

    @pytest.mark.parametrize('headers', [{'Sec-GPC': '1'}, {'DNT': '1'}, {'User-Agent': 'Googlebot/2.1'}])
    def test_privacy_signals_and_crawlers_store_nothing(self, client, db_session, headers):
        response = _post(client, {'events': [{'name': 'landing_view'}]}, headers=headers)

        assert response.status_code == 202
        assert db_session.query(WebEvent).count() == 0

    def test_needs_no_csrf_or_auth_and_bounds_batch_size(self, client):
        response = _post(client, {'events': [{'name': 'landing_view'}] * 11})

        assert response.status_code == 400


@pytest.mark.unit
class TestPublicTelemetryNormalizers:
    @pytest.mark.parametrize('referrer, expected', [
        ('https://news.example.com/a?b=c', 'news.example.com'),
        ('https://fractalgoals.com/demo', None),
        ('', None),
        (None, None),
        ('not a url', None),
    ])
    def test_referrer_host(self, referrer, expected):
        assert referrer_host(referrer, 'fractalgoals.com') == expected

    @pytest.mark.parametrize('path, expected', [
        ('/demo/8f3c1e2a-1b2c-4d5e-8f90-123456789abc/goals?goal=x#y', '/demo/:id/goals'),
        ('/', '/'),
        ('https://evil.example/', None),
        (None, None),
    ])
    def test_public_paths_are_de_identified(self, path, expected):
        assert normalize_public_path(path) == expected

    @pytest.mark.parametrize('value, expected', [
        ('  Twitter ', 'twitter'),
        ('Spring Sale 2026!', 'spring-sale-2026'),
        ('!!!', None),
        (42, None),
    ])
    def test_utm_values_become_codes(self, value, expected):
        assert normalize_utm(value) == expected
