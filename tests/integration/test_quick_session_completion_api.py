import json
from datetime import datetime
from uuid import uuid4

from models import SessionTemplate


def test_quick_complete_endpoint_creates_and_completes_session(
    authed_client,
    db_session,
    sample_goal_hierarchy,
    sample_activity_definition,
):
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
                    'completed': True,
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
