import pytest
import json
import uuid
from datetime import datetime, timedelta

@pytest.fixture
def sample_program(client, sample_ultimate_goal):
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
    
    response = client.post(
        f'/api/{root_id}/programs',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    return json.loads(response.data)

@pytest.mark.integration
class TestProgramCRUD:
    """Test Program CRUD operations."""

    def test_create_program(self, client, sample_ultimate_goal):
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
        
        response = client.post(
            f'/api/{root_id}/programs',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Program'
        assert data['root_id'] == root_id

    def test_get_programs(self, client, sample_ultimate_goal, sample_program):
        """Test listing programs."""
        root_id = sample_ultimate_goal.id
        response = client.get(f'/api/{root_id}/programs')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) >= 1
        assert any(p['id'] == sample_program['id'] for p in data)

    def test_get_specific_program(self, client, sample_ultimate_goal, sample_program):
        """Test retrieving a specific program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == program_id
        assert data['name'] == sample_program['name']

    def test_update_program(self, client, sample_ultimate_goal, sample_program):
        """Test updating a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        payload = {
            'name': 'Updated Program Name',
            'description': 'Updated description'
        }
        
        response = client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Program Name'
        assert data['description'] == 'Updated description'

    def test_delete_program(self, client, sample_ultimate_goal, sample_program):
        """Test deleting a program."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        response = client.delete(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 200
        
        # Verify deletion
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        assert response.status_code == 404

@pytest.mark.integration
class TestProgramStructure:
    """Test Program Blocks, Days, and Sessions."""

    def test_update_program_structure(self, client, sample_ultimate_goal, sample_program):
        """Test updating program structure (Shadow Sync)."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        
        # New structure with a second block
        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=7)
        block2_start = end_date + timedelta(days=1)
        block2_end = block2_start + timedelta(days=7)
        
        new_schedule = [
            {
                'id': sample_program['blocks'][0]['id'], # Keep existing block
                'name': 'Week 1 Updated',
                'startDate': sample_program['blocks'][0]['start_date'], # Assuming output format
                'endDate': sample_program['blocks'][0]['end_date'],
                'color': 'blue'
            },
            {
                'id': str(uuid.uuid4()),
                'name': 'Week 2',
                'startDate': block2_start.isoformat(),
                'endDate': block2_end.isoformat(),
                'color': 'green',
                'weeklySchedule': {}
            }
        ]
        
        # Need to be careful with date formats in comparison vs input
        # sample_program came from API, so dates are strings (ISO)
        # Note: sample_program fixture construct payload uses 'startDate' (ISO)
        # But 'blocks' in response might use snake_case 'start_date'?
        # Let's inspect sample_program keys if needed. 
        # Standard to_dict usually returns keys matching model/API.
        # programs_api.py sync_program_structure expects 'weeklySchedule' list of dicts with 'startDate'.
        
        # Let's fetch clean program first to get current structure
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        
        # The API returns 'blocks' list in the program object.
        # We need to construct 'weeklySchedule' for the PUT request.
        # Ideally, the frontend maintains 'weeklySchedule' and sends it back.
        
        # Construct payload
        payload = {
            'weeklySchedule': new_schedule
        }
        
        response = client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Verify 2 blocks now
        assert len(data['blocks']) == 2
        assert any(b['name'] == 'Week 2' for b in data['blocks'])

    def test_add_block_day_endpoint(self, client, sample_ultimate_goal, sample_program, sample_session_template):
        """Test adding a day configuration manually (legacy/specific endpoint)."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        # Get the first block ID
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        block_id = program_data['blocks'][0]['id']
        
        payload = {
            'name': 'Heavy Day',
            'day_of_week': datetime.utcnow().strftime('%A'), # Current day
            'template_id': sample_session_template.id
        }
        
        response = client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        
        # Verify day added
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        data = json.loads(response.data)
        block = next(b for b in data['blocks'] if b['id'] == block_id)
        # Check sessions inside days
        # API hierarchy: Program -> Blocks -> Days -> Sessions
        # We need to check if any day has sessions
        has_session = False
        for day in block['days']:
            if any(s['session_template_id'] == sample_session_template.id for s in day['sessions']):
                has_session = True
                break
        assert has_session

    def test_attach_goal_to_block(self, client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        """Test attaching a goal to a specific block."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        short_term_goal = sample_goal_hierarchy['short_term']
        
        response = client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        block_id = program_data['blocks'][0]['id']
        
        deadline = (datetime.utcnow() + timedelta(days=30)).strftime('%Y-%m-%d')
        
        payload = {
            'goal_id': short_term_goal.id,
            'deadline': deadline
        }
        
        response = client.post(
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
