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

    def test_replayed_note_create_succeeds_without_duplicating(self, authed_client, db_session, sample_practice_session):
        note_id = str(uuid.uuid4())
        url = f'/api/{sample_practice_session.root_id}/notes'
        authed_client.post(url, json=_note_payload(sample_practice_session, id=note_id))

        response = authed_client.post(url, json=_note_payload(sample_practice_session, id=note_id))

        assert response.status_code == 200
        assert response.get_json()['id'] == note_id
        assert db_session.query(Note).filter(Note.id == note_id).count() == 1

    def test_note_id_used_elsewhere_is_rejected(self, authed_client, sample_practice_session, sample_goal_hierarchy):
        note_id = str(uuid.uuid4())
        url = f'/api/{sample_practice_session.root_id}/notes'
        authed_client.post(url, json=_note_payload(sample_practice_session, id=note_id))

        response = authed_client.post(url, json={
            'content': 'Elsewhere', 'context_type': 'root', 'context_id': sample_practice_session.root_id, 'id': note_id,
        })

        assert response.status_code == 409

    def test_note_id_must_be_a_uuid(self, authed_client, sample_practice_session):
        response = authed_client.post(
            f'/api/{sample_practice_session.root_id}/notes',
            json=_note_payload(sample_practice_session, id='not-a-uuid'),
        )
        assert response.status_code == 400

    def test_replayed_activity_create_succeeds_instead_of_erroring(
        self, authed_client, db_session, sample_practice_session, sample_activity_definition,
    ):
        url = f'/api/{sample_practice_session.root_id}/sessions/{sample_practice_session.id}/activities'
        body = {'activity_definition_id': sample_activity_definition.id, 'instance_id': str(uuid.uuid4())}

        first = authed_client.post(url, json=body)
        replay = authed_client.post(url, json=body)

        assert (first.status_code, replay.status_code) == (201, 200)
        assert replay.get_json()['id'] == body['instance_id']
        assert db_session.query(ActivityInstance).filter(ActivityInstance.id == body['instance_id']).count() == 1

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
