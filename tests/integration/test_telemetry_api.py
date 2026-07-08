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
