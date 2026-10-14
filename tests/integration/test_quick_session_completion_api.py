import json
from datetime import datetime
from uuid import uuid4

import pytest

from models import ActivityInstance, SessionTemplate


@pytest.mark.parametrize('activity_completed', [False, True, None])
@pytest.mark.parametrize('activity_count', [1, 5])
@pytest.mark.parametrize('has_sets', [False, True])
def test_quick_complete_endpoint_creates_and_completes_session(
    activity_completed,
    activity_count,
    has_sets,
    authed_client,
    db_session,
    sample_goal_hierarchy,
    sample_activity_definition,
):
    sample_activity_definition.has_sets = has_sets
    root_id = sample_goal_hierarchy['ultimate'].id
    quick_template = SessionTemplate(
        id=str(uuid4()),
        name='Daily Weight',
        description='Quick log',
        root_id=root_id,
        template_data=json.dumps({
            'session_type': 'quick',
            'template_color': '#123456',
            'activities': [
                {'activity_id': sample_activity_definition.id, 'name': sample_activity_definition.name}
                for _ in range(activity_count)
            ],
        }),
    )
    db_session.add(quick_template)
    db_session.commit()

    response = authed_client.post(
        f'/api/{root_id}/sessions/quick-complete',
        json={
            'name': 'Quick Weight Entry',
            'template_id': quick_template.id,
            'session_start': datetime.utcnow().isoformat(),
            'session_data': {
                'template_id': quick_template.id,
                'template_name': quick_template.name,
                'session_type': 'quick',
                'template_color': '#123456',
            },
            'activity_instances': [
                {
                    'activity_definition_id': sample_activity_definition.id,
                    'completed': activity_completed,
                    'has_sets': has_sets,
                    'metrics': [],
                    'sets': [],
                }
            ],
        },
    )

    assert response.status_code == 201
    data = response.get_json()
    assert data['completed'] is True
    assert data['session_type'] == 'quick'
    assert data['template_color'] == '#123456'
    assert data['attributes']['session_data']['activity_ids']

    instances = db_session.query(ActivityInstance).filter_by(session_id=data['id']).all()
    assert len(instances) == activity_count
    assert all(instance.completed for instance in instances)


def test_quick_complete_accepts_a_client_id_and_replays_safely(
    client, auth_headers, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    from models import Session

    root_id = sample_goal_hierarchy['ultimate'].id
    quick_template = SessionTemplate(
        id=str(uuid4()), name='Daily Weight', root_id=root_id,
        template_data=json.dumps({'session_type': 'quick', 'activities': [
            {'activity_id': sample_activity_definition.id},
        ]}),
    )
    db_session.add(quick_template)
    db_session.commit()
    session_id = str(uuid4())
    body = json.dumps({
        'id': session_id,
        'name': 'Offline quick log',
        'template_id': quick_template.id,
        'session_start': datetime.utcnow().isoformat(),
        'session_data': {'template_id': quick_template.id, 'session_type': 'quick'},
        'activity_instances': [{'activity_definition_id': sample_activity_definition.id, 'metrics': [], 'sets': []}],
    })
    url = f'/api/{root_id}/sessions/quick-complete'
    keyed = {**auth_headers, 'Idempotency-Key': str(uuid4())}

    first = client.post(url, data=body, headers=keyed)
    replay = client.post(url, data=body, headers=keyed)
    reused = client.post(url, data=body, headers=auth_headers)

    assert first.status_code == 201
    assert first.get_json()['id'] == session_id
    assert replay.status_code == 201
    assert replay.headers.get('Idempotent-Replayed') == 'true'
    assert reused.status_code == 409
    db_session.expire_all()
    assert db_session.query(Session).filter(Session.root_id == root_id).count() == 1
