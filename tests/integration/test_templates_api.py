import pytest
import json
import uuid

@pytest.fixture
def sample_session_template_api(client, sample_ultimate_goal):
    """Create a sample template via API."""
    root_id = sample_ultimate_goal.id
    payload = {
        'name': 'API Test Template',
        'description': 'Created via API',
        'template_data': {'sections': []}
    }
    response = client.post(
        f'/api/{root_id}/session-templates',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    return json.loads(response.data)

@pytest.mark.integration
class TestSessionTemplates:
    """Test Session Template CRUD."""
    
    def test_create_template(self, client, sample_ultimate_goal):
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
        
        response = client.post(
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

    def test_create_template_validation(self, client, sample_ultimate_goal):
        """Test validation failures."""
        root_id = sample_ultimate_goal.id
        # Missing name
        payload = {'template_data': {}}
        response = client.post(f'/api/{root_id}/session-templates', json=payload)
        assert response.status_code == 400
        
        # Missing data
        payload = {'name': 'Empty'}
        response = client.post(f'/api/{root_id}/session-templates', json=payload)
        assert response.status_code == 400

    def test_get_templates(self, client, sample_ultimate_goal, sample_session_template_api):
        """Test listing templates."""
        root_id = sample_ultimate_goal.id
        response = client.get(f'/api/{root_id}/session-templates')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(t['id'] == sample_session_template_api['id'] for t in data)

    def test_get_specific_template(self, client, sample_ultimate_goal, sample_session_template_api):
        """Test retrieving specific template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        response = client.get(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == t_id
        assert data['name'] == 'API Test Template'

    def test_update_template(self, client, sample_ultimate_goal, sample_session_template_api):
        """Test updating a template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        payload = {
            'name': 'Updated Name',
            'template_data': {'sections': [{'name': 'New Section'}]}
        }
        
        response = client.put(
            f'/api/{root_id}/session-templates/{t_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Name'
        assert data['template_data']['sections'][0]['name'] == 'New Section'

    def test_delete_template(self, client, sample_ultimate_goal, sample_session_template_api):
        """Test deleting a template."""
        root_id = sample_ultimate_goal.id
        t_id = sample_session_template_api['id']
        
        response = client.delete(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = client.get(f'/api/{root_id}/session-templates/{t_id}')
        assert response.status_code == 404
