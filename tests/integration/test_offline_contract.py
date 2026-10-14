"""The fields offline placeholders must mirror, recorded from real API responses.

The client builds records offline (activity instances, circuit runs, notes) and
patches cached ones. ``client/src/offline/serverContract.json`` lists each
serialized shape's keys; client tests hold placeholders and patches to it, and
its hash versions the persisted query cache. When a serializer changes shape,
this test fails until the contract is regenerated:

    UPDATE_OFFLINE_CONTRACT=1 ENV=testing pytest tests/integration/test_offline_contract.py
"""
import json
import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

import pytest

from models import ActivityDefinition, Session

CONTRACT_PATH = Path(__file__).resolve().parents[2] / 'client' / 'src' / 'offline' / 'serverContract.json'


@pytest.mark.integration
def test_offline_contract_matches_the_serializers(
    authed_client, db_session, test_user, sample_ultimate_goal, sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    session = Session(
        id=str(uuid.uuid4()), root_id=root_id, owner_id=test_user.id, name='Contract',
        session_start=datetime.now(timezone.utc),
        attributes={'session_data': {'sections': [{'name': 'Main', 'items': []}]}},
    )
    burpee = ActivityDefinition(
        id=str(uuid.uuid4()), root_id=root_id, name='Burpee',
        has_sets=False, has_metrics=False, metrics_multiplicative=False, has_splits=False,
    )
    db_session.add_all([session, burpee])
    db_session.commit()

    instance = authed_client.post(
        f'/api/{root_id}/sessions/{session.id}/activities',
        json={'activity_definition_id': sample_activity_definition.id},
    ).get_json()
    session_payload = authed_client.get(f'/api/{root_id}/sessions/{session.id}').get_json()
    definition = authed_client.post(f'/api/{root_id}/circuits', json={
        'name': 'Contract circuit',
        'slots': [{'activity_definition_id': sample_activity_definition.id}, {'activity_definition_id': burpee.id}],
    }).get_json()
    run = authed_client.post(
        f'/api/{root_id}/sessions/{session.id}/circuit-runs',
        json={'circuit_definition_id': definition['id'], 'section_index': 0},
    ).get_json()
    note = authed_client.post(f'/api/{root_id}/notes', json={
        'content': 'Contract note', 'context_type': 'session', 'context_id': session.id, 'session_id': session.id,
    }).get_json()

    contract = {
        'activity_instance': sorted(instance),
        'session': sorted(session_payload),
        'circuit_run': sorted(run),
        'circuit_run_slot': sorted(run['slots'][0]),
        'circuit_round': sorted(run['rounds'][0]),
        'circuit_round_member': sorted(run['rounds'][0]['members'][0]),
        'note': sorted(note),
    }

    if os.environ.get('UPDATE_OFFLINE_CONTRACT') == '1':
        CONTRACT_PATH.write_text(json.dumps(contract, indent=2) + '\n')
    recorded = json.loads(CONTRACT_PATH.read_text()) if CONTRACT_PATH.exists() else None
    assert recorded == contract, (
        'Serializer shapes changed: regenerate client/src/offline/serverContract.json '
        '(see this module docstring) and update the offline placeholders to match.'
    )
