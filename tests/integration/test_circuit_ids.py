"""Client-minted circuit ids expand into the same child ids the client derives offline."""
import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from models import ActivityDefinition, CircuitRun, Session
from services import circuit_ids

VECTORS = json.loads(
    (Path(__file__).resolve().parents[1] / 'fixtures' / 'circuit_id_vectors.json').read_text()
)['vectors']


@pytest.mark.parametrize('vector', VECTORS, ids=lambda vector: f"{vector['fn']}:{vector['arg']}")
def test_derivations_match_the_shared_vectors(vector):
    assert getattr(circuit_ids, vector['fn'])(vector['parent'], vector['arg']) == vector['expected']


@pytest.fixture
def circuit_setup(authed_client, db_session, test_user, sample_ultimate_goal, sample_activity_definition):
    root = sample_ultimate_goal
    session = Session(
        id=str(uuid.uuid4()), root_id=root.id, owner_id=test_user.id, name='Circuit day',
        session_start=datetime.now(timezone.utc),
        attributes={'session_data': {'sections': [{'name': 'Main', 'items': []}]}},
    )
    burpee = ActivityDefinition(
        id=str(uuid.uuid4()), root_id=root.id, name='Burpee',
        has_sets=False, has_metrics=False, metrics_multiplicative=False, has_splits=False,
    )
    db_session.add_all([session, burpee])
    db_session.commit()
    definition = authed_client.post(f'/api/{root.id}/circuits', json={
        'name': 'Finisher',
        'slots': [{'activity_definition_id': sample_activity_definition.id}, {'activity_definition_id': burpee.id}],
    }).get_json()
    return {'root_id': root.id, 'session_id': session.id, 'definition': definition}


def _create(authed_client, setup, **extra):
    return authed_client.post(
        f"/api/{setup['root_id']}/sessions/{setup['session_id']}/circuit-runs",
        json={'circuit_definition_id': setup['definition']['id'], 'section_index': 0, **extra},
    )


@pytest.mark.integration
class TestClientMintedCircuitIds:
    def test_run_children_use_derived_ids(self, authed_client, circuit_setup):
        run_id = str(uuid.uuid4())
        response = _create(authed_client, circuit_setup, id=run_id)

        assert response.status_code == 201
        run = response.get_json()
        assert run['id'] == run_id
        source_slots = sorted(circuit_setup['definition']['slots'], key=lambda slot: slot['sort_order'])
        for slot, source in zip(run['slots'], source_slots):
            assert slot['id'] == circuit_ids.run_slot_id(run_id, source['id'])
            if slot['has_sets']:
                assert slot['activity_instance_id'] == circuit_ids.run_slot_instance_id(run_id, source['id'])
        [first_round] = run['rounds']
        assert first_round['id'] == circuit_ids.initial_round_id(run_id, 1)
        for member in first_round['members']:
            assert member['id'] == circuit_ids.round_member_id(first_round['id'], member['circuit_run_slot_id'])
            if member['activity_set_id']:
                assert member['activity_set_id'] == circuit_ids.round_member_set_id(
                    first_round['id'], member['circuit_run_slot_id'],
                )
            else:
                assert member['activity_instance_id'] == circuit_ids.round_member_instance_id(
                    first_round['id'], member['circuit_run_slot_id'],
                )

    def test_added_round_members_derive_from_the_client_round_id(self, authed_client, circuit_setup):
        run = _create(authed_client, circuit_setup).get_json()
        round_id = str(uuid.uuid4())

        response = authed_client.post(
            f"/api/{circuit_setup['root_id']}/circuit-runs/{run['id']}/rounds", json={'round_id': round_id},
        )

        assert response.status_code == 201
        added = next(item for item in response.get_json()['rounds'] if item['id'] == round_id)
        assert added['round_number'] == 2
        assert {member['id'] for member in added['members']} == {
            circuit_ids.round_member_id(round_id, member['circuit_run_slot_id']) for member in added['members']
        }

    def test_replayed_creates_succeed_without_duplicating(self, authed_client, circuit_setup):
        run_id = str(uuid.uuid4())
        first = _create(authed_client, circuit_setup, id=run_id)
        replay = _create(authed_client, circuit_setup, id=run_id)
        assert (first.status_code, replay.status_code) == (201, 200)
        assert replay.get_json()['id'] == run_id

        round_url = f"/api/{circuit_setup['root_id']}/circuit-runs/{run_id}/rounds"
        round_id = str(uuid.uuid4())
        assert authed_client.post(round_url, json={'round_id': round_id}).status_code == 201
        replayed_round = authed_client.post(round_url, json={'round_id': round_id})
        assert replayed_round.status_code == 200
        assert [item['round_number'] for item in replayed_round.get_json()['rounds']] == [1, 2]

    def test_ids_used_by_another_record_are_rejected(self, authed_client, circuit_setup):
        first = _create(authed_client, circuit_setup).get_json()
        second = _create(authed_client, circuit_setup).get_json()
        round_url = f"/api/{circuit_setup['root_id']}/circuit-runs/{second['id']}/rounds"
        assert authed_client.post(round_url, json={'round_id': first['rounds'][0]['id']}).status_code == 409

    def test_without_client_ids_children_stay_random(self, authed_client, db_session, circuit_setup):
        run = _create(authed_client, circuit_setup).get_json()
        [first_round] = run['rounds']
        assert first_round['id'] != circuit_ids.initial_round_id(run['id'], 1)
        assert db_session.get(CircuitRun, run['id']) is not None

    def test_ids_must_be_uuids(self, authed_client, circuit_setup):
        assert _create(authed_client, circuit_setup, id='not-a-uuid').status_code == 400
