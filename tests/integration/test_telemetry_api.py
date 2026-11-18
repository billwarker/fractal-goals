import json

import pytest

from models import ProductEvent


@pytest.mark.integration
class TestTelemetryEventsEndpoint:
    def test_requires_authentication(self, client):
        response = client.post('/api/telemetry/events', json={'events': [{'name': 'page_view'}]})

        assert response.status_code == 401

    def test_records_allowlisted_events(self, authed_client, db_session, test_user):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'page_view', 'path': '/:rootId/goals', 'ts': '2026-07-07T12:00:00Z'},
                {'name': 'settings_opened'},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        assert response.get_json()['accepted'] == 2

        stored = db_session.query(ProductEvent).order_by(ProductEvent.event_name).all()
        assert [event.event_name for event in stored] == ['page_view', 'settings_opened']
        assert all(event.user_id == test_user.id for event in stored)
        assert all(event.created_at is not None for event in stored)
        page_view = next(event for event in stored if event.event_name == 'page_view')
        assert page_view.path == '/:rootId/goals'
        assert page_view.client_ts is not None

    def test_drops_unknown_event_names(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'page_view'},
                {'name': 'totally_made_up_event'},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        assert response.get_json()['accepted'] == 1
        assert db_session.query(ProductEvent).count() == 1

    def test_accepts_offline_sync_health_events(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'offline_sync_drained', 'props': {'ops': 4, 'max_age_s': 380, 'retries': 2}},
                {'name': 'offline_op_rejected', 'props': {'kind': 'session.timer', 'status': 409, 'code': None}},
                {'name': 'offline_boot', 'props': {'offline_seconds': 600}},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        assert response.get_json()['accepted'] == 3
        names = {event.event_name for event in db_session.query(ProductEvent).all()}
        assert names == {'offline_sync_drained', 'offline_op_rejected', 'offline_boot'}

    def test_rejects_oversized_batches(self, authed_client):
        events = [{'name': 'page_view'} for _ in range(21)]
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': events}),
            content_type='application/json',
        )

        assert response.status_code == 400

    def test_drops_oversized_properties(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'settings_opened', 'props': {'blob': 'x' * 5000}},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        stored = db_session.query(ProductEvent).one()
        assert stored.properties is None

    def test_invalid_client_timestamp_is_ignored(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'page_view', 'ts': 'not-a-timestamp'},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        stored = db_session.query(ProductEvent).one()
        assert stored.client_ts is None
        assert stored.created_at is not None


def _post(client, headers, payload):
    return client.post(
        '/api/telemetry/events',
        data=json.dumps(payload),
        content_type='application/json',
        headers=headers,
    )


@pytest.mark.integration
class TestTelemetryTrackingPlan:
    def test_keeps_valid_props_and_drops_the_rest(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'onboarding_step_completed', 'props': {'step_id': 'session', 'goal_name': 'Run a 5k'}},
            ]}),
            content_type='application/json',
        )

        assert response.status_code == 202
        assert response.get_json()['rejected'] == [
            {'name': 'onboarding_step_completed', 'reason': 'invalid_props', 'props': ['goal_name']},
        ]
        stored = db_session.query(ProductEvent).one()
        assert stored.properties == {'step_id': 'session'}
        assert stored.schema_version == 1

    @pytest.mark.parametrize('props, kept', [
        ({'count': 100000}, {'count': 100000}),
        ({'count': 100001}, None),
        ({'count': 0}, {'count': 0}),
        ({'count': -1}, None),
        ({'count': True}, None),
        ({'count': '3'}, None),
        ({'count': None}, None),
    ])
    def test_int_props_respect_bounds_and_type(self, authed_client, db_session, props, kept):
        authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [{'name': 'offline_ops_expired', 'props': props}]}),
            content_type='application/json',
        )

        assert db_session.query(ProductEvent).one().properties == kept

    @pytest.mark.parametrize('value, kept', [
        ('session.timer', True),
        ('a' * 64, True),
        ('a' * 65, False),
        ('two words', False),
        (None, False),
    ])
    def test_code_props_reject_text(self, authed_client, db_session, value, kept):
        authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [{'name': 'offline_submit_failed', 'props': {'kind': value, 'name': 'Error'}}]}),
            content_type='application/json',
        )

        stored = db_session.query(ProductEvent).one().properties
        assert ('kind' in stored) is kept

    def test_nullable_props_accept_null(self, authed_client, db_session):
        authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [
                {'name': 'offline_op_rejected', 'props': {'kind': 'session.timer', 'status': None, 'code': None}},
            ]}),
            content_type='application/json',
        )

        assert db_session.query(ProductEvent).one().properties == {'kind': 'session.timer', 'status': None, 'code': None}

    def test_public_site_events_are_not_accepted_here(self, authed_client, db_session):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [{'name': 'landing_view'}]}),
            content_type='application/json',
        )

        assert response.get_json()['accepted'] == 0
        assert db_session.query(ProductEvent).count() == 0

    def test_stores_batch_context(self, authed_client, db_session):
        authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({
                'events': [{'name': 'page_view', 'path': '/:rootId/goals'}],
                'context': {'visit_id': '0f8fad5b-d9cb-469f-a165-70867728950e', 'app_version': 'b-1234'},
            }),
            content_type='application/json',
        )

        stored = db_session.query(ProductEvent).one()
        assert (stored.visit_id, stored.app_version, stored.surface) == (
            '0f8fad5b-d9cb-469f-a165-70867728950e', 'b-1234', 'app',
        )

    def test_rejects_a_malformed_visit_id(self, authed_client):
        response = authed_client.post(
            '/api/telemetry/events',
            data=json.dumps({'events': [{'name': 'page_view'}], 'context': {'visit_id': 'someone@example.com'}}),
            content_type='application/json',
        )

        assert response.status_code == 400


@pytest.mark.integration
class TestTelemetryOptOut:
    def test_turned_off_in_settings_stores_nothing(self, client, auth_headers, db_session, test_user):
        test_user.preferences = {'usage_analytics': False}
        db_session.commit()

        response = _post(client, auth_headers, {'events': [{'name': 'page_view'}]})

        assert response.status_code == 202
        assert response.get_json()['accepted'] == 0
        assert db_session.query(ProductEvent).count() == 0

    def test_turned_back_on_records_again(self, client, auth_headers, db_session, test_user):
        test_user.preferences = {'usage_analytics': True}
        db_session.commit()

        _post(client, auth_headers, {'events': [{'name': 'page_view'}]})

        assert db_session.query(ProductEvent).count() == 1

    @pytest.mark.parametrize('header', [{'Sec-GPC': '1'}, {'DNT': '1'}])
    def test_browser_privacy_signals_store_nothing(self, client, auth_headers, db_session, header):
        response = _post(client, {**auth_headers, **header}, {'events': [{'name': 'page_view'}]})

        assert response.status_code == 202
        assert db_session.query(ProductEvent).count() == 0

    def test_gpc_zero_is_not_a_signal(self, client, auth_headers, db_session):
        _post(client, {**auth_headers, 'Sec-GPC': '0'}, {'events': [{'name': 'page_view'}]})

        assert db_session.query(ProductEvent).count() == 1
