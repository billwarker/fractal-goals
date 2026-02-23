import pytest
import json
import uuid
from datetime import datetime, timedelta

@pytest.fixture
def sample_program(authed_client, sample_ultimate_goal):
    """Create a sample program for testing."""
    root_id = sample_ultimate_goal.id
    start_date = datetime.utcnow()
    end_date = start_date + timedelta(days=7)
    
    payload = {
        'name': 'Test Program',
        'description': 'A test program',
        'start_date': start_date.isoformat(),
        'end_date': end_date.isoformat(),
        'weeklySchedule': [
            {
                'id': str(uuid.uuid4()),
                'name': 'Week 1',
                'startDate': start_date.isoformat(),
                'endDate': end_date.isoformat(),
                'color': 'blue',
                'weeklySchedule': {
                    'monday': [], # No templates yet
                    'tuesday': []
                }
            }
        ],
        'selectedGoals': []
    }
    
    response = authed_client.post(
        f'/api/{root_id}/programs',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    return json.loads(response.data)

@pytest.mark.integration
class TestProgramCRUD:
    """Test Program CRUD operations."""

    def test_create_program(self, authed_client, sample_ultimate_goal):
        """Test creating a new training program."""
        root_id = sample_ultimate_goal.id
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=14)
        
        payload = {
            'name': 'New Program',
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat(),
            'weeklySchedule': []
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Program'
        assert data['root_id'] == root_id

    def test_get_programs(self, authed_client, sample_ultimate_goal, sample_program):
        """Test listing programs."""
        root_id = sample_ultimate_goal.id
        response = authed_client.get(f'/api/{root_id}/programs')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p['id'] == sample_program['id'] for p in data)

    def test_get_specific_program(self, authed_client, sample_ultimate_goal, sample_program):
        """Test retrieving a specific program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == program_id
        assert data['name'] == sample_program['name']

    def test_update_program(self, authed_client, sample_ultimate_goal, sample_program):
        """Test updating a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        payload = {
            'name': 'Updated Program Name',
            'description': 'Updated description'
        }
        
        response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Program Name'
        assert data['description'] == 'Updated description'

    def test_delete_program(self, authed_client, sample_ultimate_goal, sample_program):
        """Test deleting a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        response = authed_client.delete(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 404

@pytest.mark.integration
class TestProgramStructure:
    """Test Program Blocks, Days, and Sessions."""

    def test_block_crud(self, authed_client, sample_ultimate_goal, sample_program):
        """Test creating, updating, and deleting a block via dedicated endpoints."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        # 1. Create a Block
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=7)
        
        create_payload = {
            'name': 'New Phase Block',
            'start_date': start_date.strftime('%Y-%m-%d'),
            'end_date': end_date.strftime('%Y-%m-%d'),
            'color': '#ff0000'
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks',
            data=json.dumps(create_payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        new_block = json.loads(response.data)
        assert new_block['name'] == 'New Phase Block'
        block_id = new_block['id']
        
        # 2. Update the Block
        update_payload = {
            'name': 'Updated Phase Block',
            'color': '#00ff00'
        }
        
        response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}',
            data=json.dumps(update_payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        updated_block = json.loads(response.data)
        assert updated_block['name'] == 'Updated Phase Block'
        assert updated_block['color'] == '#00ff00'
        
        # 3. Delete the Block
        response = authed_client.delete(f'/api/{root_id}/programs/{program_id}/blocks/{block_id}')
        assert response.status_code == 200
        delete_data = json.loads(response.data)
        assert delete_data['message'] == 'Block deleted'
        
        # Verify deletion via program fetch
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        assert not any(b['id'] == block_id for b in program_data['blocks'])

    def test_add_block_day_endpoint(self, authed_client, sample_ultimate_goal, sample_program, sample_session_template):
        """Test adding a day configuration manually (legacy/specific endpoint)."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        # Get the first block ID
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        block_id = program_data['blocks'][0]['id']
        
        payload = {
            'name': 'Heavy Day',
            'day_of_week': [datetime.utcnow().strftime('%A')], # Current day
            'template_id': sample_session_template.id
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        
        # Verify day added
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        data = json.loads(response.data)
        block = next(b for b in data['blocks'] if b['id'] == block_id)
        # Check sessions inside days
        # API hierarchy: Program -> Blocks -> Days -> Sessions
        # We need to check if any day has sessions
        has_session = False
        for day in block['days']:
            # Check for template in either 'templates' list or 'sessions' list (legacy/new)
            in_templates = any(t['id'] == sample_session_template.id for t in day.get('templates', []))
            in_sessions = any(s.get('template_id') == sample_session_template.id or s.get('session_template_id') == sample_session_template.id for s in day.get('sessions', []))
            if in_templates or in_sessions:
                has_session = True
                break
        assert has_session

    def test_attach_goal_to_block(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        """Test attaching a goal to a specific block."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        short_term_goal = sample_goal_hierarchy['short_term']
        
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        block_id = program_data['blocks'][0]['id']
        
        deadline = (datetime.utcnow() + timedelta(days=30)).strftime('%Y-%m-%d')
        
        payload = {
            'goal_id': short_term_goal.id,
            'deadline': deadline
        }
        
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['message'] == 'Goal attached and updated'
        
        # Verify goal ID in block
        block_data = data['block']
        goal_ids = block_data['goal_ids']
        assert short_term_goal.id in goal_ids
