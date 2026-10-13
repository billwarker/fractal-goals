"""Client-minted ids let offline writes reference records before the server has seen them."""
import uuid

import pytest

from models import ActivityInstance, Note


def _note_payload(session, **extra):
    return {'content': 'Felt strong', 'context_type': 'session', 'context_id': session.id, 'session_id': session.id, **extra}


@pytest.mark.integration
class TestClientMintedIds:
    def test_note_create_uses_client_id(self, authed_client, db_session, sample_practice_session):
        note_id = str(uuid.uuid4())
        response = authed_client.post(
            f'/api/{sample_practice_session.root_id}/notes',
            json=_note_payload(sample_practice_session, id=note_id),
        )
        assert response.status_code == 201
        assert response.get_json()['id'] == note_id
        assert db_session.get(Note, note_id) is not None

    def test_note_id_collision_is_rejected(self, authed_client, sample_practice_session):
        note_id = str(uuid.uuid4())
        url = f'/api/{sample_practice_session.root_id}/notes'
        authed_client.post(url, json=_note_payload(sample_practice_session, id=note_id))

        response = authed_client.post(url, json=_note_payload(sample_practice_session, id=note_id))

        assert response.status_code == 409

    def test_note_id_must_be_a_uuid(self, authed_client, sample_practice_session):
        response = authed_client.post(
            f'/api/{sample_practice_session.root_id}/notes',
            json=_note_payload(sample_practice_session, id='not-a-uuid'),
        )
        assert response.status_code == 400

    def test_activity_instance_create_uses_client_id(
        self, authed_client, db_session, sample_practice_session, sample_activity_definition,
    ):
        instance_id = str(uuid.uuid4())
        response = authed_client.post(
            f'/api/{sample_practice_session.root_id}/sessions/{sample_practice_session.id}/activities',
            json={'activity_definition_id': sample_activity_definition.id, 'instance_id': instance_id},
        )
        assert response.status_code == 201
        assert response.get_json()['id'] == instance_id
        assert db_session.get(ActivityInstance, instance_id) is not None
