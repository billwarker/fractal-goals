import pytest
import json
import uuid
from models import SessionTemplate
from services.events import Events

@pytest.fixture
def sample_session_template_api(authed_client, sample_ultimate_goal):
    """Create a sample template via API."""
    root_id = sample_ultimate_goal.id
    payload = {
        'name': 'API Test Template',
        'description': 'Created via API',
        'template_data': {
            'sections': [{'name': 'Warmup', 'activities': []}]
        }
    }
    response = authed_client.post(
        f'/api/{root_id}/session-templates',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    return json.loads(response.data)

@pytest.mark.integration
class TestSessionTemplates:
    """Test Session Template CRUD."""
    
    def test_create_template(self, authed_client, sample_ultimate_goal):
        """Test creating a session template."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Leg Day',
            'description': 'Heavy squats',
            'template_data': {
                'sections': [
                    {'name': 'Warmup', 'exercises': []},
                    {'name': 'Main', 'exercises': []}
                ]
            }
        }
        
        response = authed_client.post(
            f'/api/{root_id}/session-templates',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Leg Day'
        # Verify template_data structure
        # Likely returned as dict if to_dict deserializes it
        assert 'sections' in data['template_data']

    def test_create_template_validation(self, authed_client, sample_ultimate_goal):
        """Test validation failures."""
        root_id = sample_ultimate_goal.id
        # Missing name
        payload = {'template_data': {}}
        response = authed_client.post(f'/api/{root_id}/session-templates', json=payload)
        assert response.status_code == 400
        
        # Missing data
        payload = {'name': 'Empty'}
        response = authed_client.post(f'/api/{root_id}/session-templates', json=payload)
        assert response.status_code == 400

        # Invalid quick template: no activities
        payload = {
            'name': 'Quick',
            'template_data': {'session_type': 'quick', 'activities': []}
        }
        response = authed_client.post(f'/api/{root_id}/session-templates', json=payload)
        assert response.status_code == 400

    def test_get_templates(self, authed_client, sample_ultimate_goal, sample_session_template_api):
        """Test listing templates."""
        root_id = sample_ultimate_goal.id
        response = authed_client.get(f'/api/{root_id}/session-templates')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(t['id'] == sample_session_template_api['id'] for t in data)

    def test_get_specific_template(self, authed_client, sample_ultimate_goal, sample_session_template_api):
        """Test retrieving specific template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        response = authed_client.get(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == t_id
        assert data['name'] == 'API Test Template'
        assert data['description'] == 'Created via API'
        assert data['updated_at'] is not None
        assert data['root_id'] == root_id
        assert data['session_type'] == 'normal'

    def test_update_template(self, authed_client, sample_ultimate_goal, sample_session_template_api):
        """Test updating a template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        payload = {
            'name': 'Updated Name',
            'template_data': {'sections': [{'name': 'New Section'}]}
        }
        
        response = authed_client.put(
            f'/api/{root_id}/session-templates/{t_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Name'
        assert data['template_data']['sections'][0]['name'] == 'New Section'

    def test_create_quick_template(self, authed_client, sample_ultimate_goal, sample_activity_definition):
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Daily Weight',
            'description': 'Quick daily check-in',
            'template_data': {
                'session_type': 'quick',
                'template_color': '#123456',
                'activities': [
                    {'activity_id': sample_activity_definition.id, 'name': sample_activity_definition.name}
                ]
            }
        }

        response = authed_client.post(
            f'/api/{root_id}/session-templates',
            data=json.dumps(payload),
            content_type='application/json'
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data['session_type'] == 'quick'
        assert data['template_color'] == '#123456'
        assert data['description'] == 'Quick daily check-in'

    def test_update_template_omits_template_data_to_preserve_existing(self, authed_client, sample_ultimate_goal, sample_session_template_api):
        """Omitting template_data should patch scalars without replacing the stored template body."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']

        response = authed_client.put(
            f'/api/{root_id}/session-templates/{t_id}',
            json={'name': 'Patched Name Only'}
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['name'] == 'Patched Name Only'
        assert data['template_data'] == {
            'session_type': 'normal',
            'sections': [{'name': 'Warmup', 'activities': []}]
        }

    def test_update_template_empty_object_replaces_template_data(self, authed_client, sample_ultimate_goal, sample_session_template_api):
        """Providing an invalid template body should fail validation."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']

        response = authed_client.put(
            f'/api/{root_id}/session-templates/{t_id}',
            json={'template_data': {}}
        )

        assert response.status_code == 400

    def test_delete_template(self, authed_client, db_session, sample_ultimate_goal, sample_session_template_api):
        """Test deleting a template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        response = authed_client.delete(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_template = db_session.query(SessionTemplate).filter_by(id=t_id).first()
        assert deleted_template is not None
        assert deleted_template.deleted_at is not None
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 404

        response = authed_client.get(f'/api/{root_id}/session-templates')
        templates = response.get_json()
        assert not any(template['id'] == t_id for template in templates)

    def test_delete_template_emits_deleted_event(self, authed_client, sample_ultimate_goal, sample_session_template_api, monkeypatch):
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        emitted = []
        monkeypatch.setattr('services.template_service.event_bus.emit', lambda event: emitted.append(event))

        response = authed_client.delete(f'/api/{root_id}/session-templates/{t_id}')

        assert response.status_code == 200
        assert Events.SESSION_TEMPLATE_DELETED in [event.name for event in emitted]
