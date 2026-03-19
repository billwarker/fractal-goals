import pytest
import json
import uuid
from datetime import datetime, timedelta
from services.events import Events

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

    def test_program_goals_do_not_auto_populate_block_goal_ids(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        """Program-level goals should not appear as direct block associations."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        goal_id = sample_goal_hierarchy['mid_term'].id

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            data=json.dumps({'selectedGoals': [goal_id]}),
            content_type='application/json'
        )
        assert update_response.status_code == 200

        program_response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        assert program_response.status_code == 200

        program_data = program_response.get_json()
        assert program_data['goal_ids'] == [goal_id]
        assert len(program_data['blocks']) >= 1
        assert all(block['goal_ids'] == [] for block in program_data['blocks'])
        assert all(goal_id in block.get('program_goal_ids', []) for block in program_data['blocks'])

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

    def test_block_create_accepts_camel_case_dates_and_starts_empty(self, authed_client, sample_ultimate_goal, sample_program):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']

        start_date = datetime.utcnow()
        end_date = start_date + timedelta(days=6)

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks',
            json={
                'name': 'Dragged Block',
                'startDate': start_date.strftime('%Y-%m-%d'),
                'endDate': end_date.strftime('%Y-%m-%d'),
                'color': '#3366ff',
            }
        )

        assert response.status_code == 201
        block = response.get_json()
        assert block['start_date'] == start_date.strftime('%Y-%m-%d')
        assert block['end_date'] == end_date.strftime('%Y-%m-%d')
        assert block['days'] == []

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
        payload = response.get_json()
        assert payload['count'] == 1
        assert payload['days'][0]['name'] == 'Heavy Day'
        
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
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        program_update = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        assert program_update.status_code == 200
        
        response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(response.data)
        block = program_data['blocks'][0]
        block_id = block['id']
        deadline = (
            datetime.strptime(block['start_date'], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')
        
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
        assert data['block']['program_goal_ids'] == [mid_term_goal.id]

    def test_attach_goal_to_block_rejects_goals_outside_program_scope(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        long_term_goal = sample_goal_hierarchy['long_term']

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        assert update_response.status_code == 200

        block = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()['blocks'][0]
        block_id = block['id']
        deadline = (
            datetime.strptime(block['start_date'], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')
        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': long_term_goal.id,
                'deadline': deadline,
            }
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Goal must be within the configured program scope'

    def test_attach_goal_to_block_requires_deadline_within_block_range(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        assert update_response.status_code == 200

        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block = program_data['blocks'][0]
        block_id = block['id']
        invalid_deadline = (datetime.strptime(block['end_date'], '%Y-%m-%d') + timedelta(days=2)).strftime('%Y-%m-%d')

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': short_term_goal.id,
                'deadline': invalid_deadline,
            }
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Goal deadline must be within the selected block date range'

    def test_schedule_block_day_endpoint_creates_program_session(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        """Scheduling a program day should be owned by the programs service/API, not assembled in the client."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        assert update_response.status_code == 200

        program_response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = program_response.get_json()
        block_id = program_data['blocks'][0]['id']
        block_start_date = program_data['blocks'][0]['start_date']
        scoped_deadline = (
            datetime.strptime(block_start_date, '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        attach_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': short_term_goal.id,
                'deadline': scoped_deadline,
            }
        )
        assert attach_response.status_code == 200

        add_day_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days',
            json={'name': 'Schedule Me'}
        )
        assert add_day_response.status_code == 201

        refreshed_program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block = next(entry for entry in refreshed_program['blocks'] if entry['id'] == block_id)
        day_id = next(day['id'] for day in block['days'] if day.get('name') == 'Schedule Me')
        scheduled_date = block['start_date']

        schedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days/{day_id}/schedule',
            json={'session_start': f'{scheduled_date}T12:00:00Z'}
        )
        assert schedule_response.status_code == 201

        scheduled_session = schedule_response.get_json()
        assert scheduled_session['program_day_id'] == day_id
        assert scheduled_session['program_info']['program_id'] == program_id
        assert any(goal['id'] == short_term_goal.id for goal in scheduled_session['short_term_goals'])

    def test_unschedule_block_day_occurrence_soft_deletes_matching_session(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )

        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block_id = program_data['blocks'][0]['id']
        scoped_deadline = (
            datetime.strptime(program_data['blocks'][0]['start_date'], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': short_term_goal.id,
                'deadline': scoped_deadline,
            }
        )
        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days',
            json={'name': 'Recurring Day'}
        )

        refreshed_program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block = next(entry for entry in refreshed_program['blocks'] if entry['id'] == block_id)
        day_id = next(day['id'] for day in block['days'] if day.get('name') == 'Recurring Day')
        scheduled_date = block['start_date']

        schedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days/{day_id}/schedule',
            json={'session_start': f'{scheduled_date}T12:00:00Z'}
        )
        assert schedule_response.status_code == 201
        session_id = schedule_response.get_json()['id']

        unschedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days/{day_id}/unschedule',
            json={'date': scheduled_date, 'timezone': 'UTC'}
        )
        assert unschedule_response.status_code == 200
        payload = unschedule_response.get_json()
        assert payload['removed_count'] == 1
        assert payload['removed_session_ids'] == [session_id]

    def test_unschedule_block_day_occurrence_emits_program_day_unscheduled(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy, monkeypatch):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )

        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block_id = program_data['blocks'][0]['id']
        scoped_deadline = (
            datetime.strptime(program_data['blocks'][0]['start_date'], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/goals',
            json={
                'goal_id': short_term_goal.id,
                'deadline': scoped_deadline,
            }
        )
        authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days',
            json={'name': 'Recurring Day'}
        )

        refreshed_program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        block = next(entry for entry in refreshed_program['blocks'] if entry['id'] == block_id)
        day_id = next(day['id'] for day in block['days'] if day.get('name') == 'Recurring Day')
        scheduled_date = block['start_date']

        schedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days/{day_id}/schedule',
            json={'session_start': f'{scheduled_date}T12:00:00Z'}
        )
        assert schedule_response.status_code == 201

        emitted = []
        monkeypatch.setattr('services.programs.event_bus.emit', lambda event: emitted.append(event))

        unschedule_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{block_id}/days/{day_id}/unschedule',
            json={'date': scheduled_date, 'timezone': 'UTC'}
        )

        assert unschedule_response.status_code == 200
        assert Events.PROGRAM_DAY_UNSCHEDULED in [event.name for event in emitted]

    def test_set_goal_deadline_for_program_date_enforces_scope_and_returns_goal(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        update_response = authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        assert update_response.status_code == 200
        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        deadline_date = (
            datetime.strptime(program_data['start_date'][:10], '%Y-%m-%d') + timedelta(days=1)
        ).strftime('%Y-%m-%d')

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/goal-deadlines',
            json={
                'goal_id': short_term_goal.id,
                'deadline': deadline_date,
            }
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['id'] == short_term_goal.id
        assert payload['deadline'][:10] == deadline_date

    def test_set_goal_deadline_for_program_date_returns_structured_parent_deadline_error(self, authed_client, sample_ultimate_goal, sample_program, sample_goal_hierarchy):
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']
        mid_term_goal = sample_goal_hierarchy['mid_term']
        short_term_goal = sample_goal_hierarchy['short_term']

        authed_client.put(
            f'/api/{root_id}/programs/{program_id}',
            json={'selectedGoals': [mid_term_goal.id]}
        )
        program_data = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        start_date = datetime.strptime(program_data['start_date'][:10], '%Y-%m-%d')
        parent_deadline = (start_date + timedelta(days=4)).strftime('%Y-%m-%d')
        child_deadline = (start_date + timedelta(days=5)).strftime('%Y-%m-%d')
        authed_client.put(
            f'/api/{root_id}/goals/{mid_term_goal.id}',
            json={'deadline': parent_deadline}
        )

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/goal-deadlines',
            json={
                'goal_id': short_term_goal.id,
                'deadline': child_deadline,
            }
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload['error'] == 'Child deadline cannot be later than parent deadline'
        assert payload['parent_deadline'] == parent_deadline

    def test_copy_block_day_rejects_invalid_target_mode(self, authed_client, sample_ultimate_goal, sample_program):
        """Copy-day requests should validate target_mode before reaching the service layer."""
        root_id = sample_ultimate_goal.id
        program_id = sample_program['id']

        program_response = authed_client.get(f'/api/{root_id}/programs/{program_id}')
        program_data = json.loads(program_response.data)
        source_block_id = program_data['blocks'][0]['id']

        block_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks',
            json={
                'name': 'Second Block',
                'start_date': datetime.utcnow().strftime('%Y-%m-%d'),
                'end_date': (datetime.utcnow() + timedelta(days=7)).strftime('%Y-%m-%d'),
            }
        )
        assert block_response.status_code == 201

        add_day_response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{source_block_id}/days',
            json={'name': 'Copy Me'}
        )
        assert add_day_response.status_code == 201

        refreshed_program = authed_client.get(f'/api/{root_id}/programs/{program_id}').get_json()
        source_block = next(block for block in refreshed_program['blocks'] if block['id'] == source_block_id)
        day_id = next(day['id'] for day in source_block['days'] if day.get('name') == 'Copy Me')

        response = authed_client.post(
            f'/api/{root_id}/programs/{program_id}/blocks/{source_block_id}/days/{day_id}/copy',
            json={'target_mode': 'bad-mode'}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'
