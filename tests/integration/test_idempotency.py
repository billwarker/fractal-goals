"""Integration tests for replay-safe writes via ``Idempotency-Key``."""
import hashlib
import json
from datetime import timedelta
from uuid import uuid4

import pytest

from models import ActivityInstance, IdempotencyRecord
from models.base import utc_now


def _keyed(auth_headers, key):
    return {**auth_headers, 'Idempotency-Key': key}


def _instance_count(db_session, session_id):
    db_session.expire_all()
    return db_session.query(ActivityInstance).filter(
        ActivityInstance.session_id == session_id,
        ActivityInstance.deleted_at.is_(None),
    ).count()


def _hash(method, path, body: bytes):
    digest = hashlib.sha256()
    for part in (method.encode(), b'\0', path.encode(), b'\0', body):
        digest.update(part)
    return digest.hexdigest()


@pytest.mark.integration
class TestIdempotentWrites:
    def _add_url(self, session):
        return f'/api/{session.root_id}/sessions/{session.id}/activities'

    def test_replay_returns_first_response_without_duplicating(
        self, client, auth_headers, db_session, sample_practice_session, sample_activity_definition,
    ):
        url = self._add_url(sample_practice_session)
        body = json.dumps({'activity_definition_id': sample_activity_definition.id})
        headers = _keyed(auth_headers, str(uuid4()))

        first = client.post(url, data=body, headers=headers)
        second = client.post(url, data=body, headers=headers)

        assert first.status_code == 201
        assert second.status_code == 201
        assert second.headers.get('Idempotent-Replayed') == 'true'
        assert second.get_json()['id'] == first.get_json()['id']
        assert _instance_count(db_session, sample_practice_session.id) == 1

    def test_requests_without_key_are_unchanged(
        self, client, auth_headers, db_session, sample_practice_session, sample_activity_definition,
    ):
        url = self._add_url(sample_practice_session)
        body = json.dumps({'activity_definition_id': sample_activity_definition.id})

        client.post(url, data=body, headers=auth_headers)
        client.post(url, data=body, headers=auth_headers)

        assert _instance_count(db_session, sample_practice_session.id) == 2
        assert db_session.query(IdempotencyRecord).count() == 0

    def test_key_reused_with_different_body_is_rejected(
        self, client, auth_headers, sample_practice_session, sample_activity_definition,
    ):
        url = self._add_url(sample_practice_session)
        headers = _keyed(auth_headers, str(uuid4()))
        client.post(url, data=json.dumps({'activity_definition_id': sample_activity_definition.id}), headers=headers)

        response = client.post(
            url,
            data=json.dumps({'activity_definition_id': sample_activity_definition.id, 'section_index': 0}),
            headers=headers,
        )

        assert response.status_code == 422
        assert response.get_json()['code'] == 'idempotency_key_mismatch'

    def test_rejected_request_releases_key(
        self, client, auth_headers, db_session, sample_practice_session,
    ):
        url = self._add_url(sample_practice_session)
        body = json.dumps({'activity_definition_id': str(uuid4())})
        headers = _keyed(auth_headers, str(uuid4()))

        first = client.post(url, data=body, headers=headers)
        second = client.post(url, data=body, headers=headers)

        assert first.status_code == 404
        assert second.status_code == 404
        assert second.headers.get('Idempotent-Replayed') is None
        assert db_session.query(IdempotencyRecord).count() == 0

    def test_in_flight_claim_returns_retryable_conflict(
        self, client, auth_headers, db_session, test_user, sample_practice_session, sample_activity_definition,
    ):
        url = self._add_url(sample_practice_session)
        body = json.dumps({'activity_definition_id': sample_activity_definition.id})
        key = str(uuid4())
        db_session.add(IdempotencyRecord(
            user_id=test_user.id, key=key, method='POST', path=url,
            request_hash=_hash('POST', url, body.encode()), status='in_progress', created_at=utc_now(),
        ))
        db_session.commit()

        response = client.post(url, data=body, headers=_keyed(auth_headers, key))

        assert response.status_code == 409
        assert response.get_json()['code'] == 'idempotency_in_flight'
        assert _instance_count(db_session, sample_practice_session.id) == 0

    def test_stale_claim_is_taken_over(
        self, client, auth_headers, db_session, test_user, sample_practice_session, sample_activity_definition,
    ):
        url = self._add_url(sample_practice_session)
        body = json.dumps({'activity_definition_id': sample_activity_definition.id})
        key = str(uuid4())
        db_session.add(IdempotencyRecord(
            user_id=test_user.id, key=key, method='POST', path=url,
            request_hash=_hash('POST', url, body.encode()), status='in_progress',
            created_at=utc_now() - timedelta(minutes=10),
        ))
        db_session.commit()

        response = client.post(url, data=body, headers=_keyed(auth_headers, key))

        assert response.status_code == 201
        assert _instance_count(db_session, sample_practice_session.id) == 1

    def test_replayed_pause_does_not_fail_as_already_paused(
        self, client, auth_headers, sample_practice_session,
    ):
        url = f'/api/{sample_practice_session.root_id}/timers/session/{sample_practice_session.id}/pause'
        headers = _keyed(auth_headers, str(uuid4()))

        first = client.post(url, headers=headers)
        second = client.post(url, headers=headers)
        unkeyed = client.post(url, headers=auth_headers)

        assert first.status_code == 200
        assert second.status_code == 200
        assert second.headers.get('Idempotent-Replayed') == 'true'
        assert unkeyed.status_code == 400

    def test_expired_records_for_user_are_pruned_on_next_claim(
        self, client, auth_headers, db_session, test_user, sample_practice_session, sample_activity_definition,
    ):
        db_session.add(IdempotencyRecord(
            user_id=test_user.id, key='old', method='POST', path='/x',
            request_hash='0' * 64, status='done', created_at=utc_now() - timedelta(days=30),
        ))
        db_session.commit()

        client.post(
            self._add_url(sample_practice_session),
            data=json.dumps({'activity_definition_id': sample_activity_definition.id}),
            headers=_keyed(auth_headers, str(uuid4())),
        )

        db_session.expire_all()
        assert db_session.get(IdempotencyRecord, (test_user.id, 'old')) is None
