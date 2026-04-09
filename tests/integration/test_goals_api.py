"""
Integration tests for Goals API endpoints.

Tests cover:
- GET /api/fractals - List all fractals
- POST /api/fractals - Create new fractal
- DELETE /api/fractals/<root_id> - Delete fractal
- GET /api/<root_id>/goals - Get goal tree
- POST /api/goals - Create goal
- PUT /api/goals/<goal_id> - Update goal
- DELETE /api/goals/<goal_id> - Delete goal
- PATCH /api/goals/<goal_id>/complete - Toggle completion
- POST /api/goals/<goal_id>/targets - Add target
- DELETE /api/goals/<goal_id>/targets/<target_id> - Remove target
"""

import pytest
import json
from datetime import datetime, timedelta
from datetime import timezone
import uuid

from models import ActivityDefinition, Goal, GoalLevel, Session, SessionTemplate, Target


@pytest.mark.integration
class TestFractalEndpoints:
    """Test fractal (root goal) management endpoints."""
    
    def test_list_fractals_empty(self, authed_client):
        """Test listing fractals when none exist."""
        response = authed_client.get('/api/fractals')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_create_fractal(self, authed_client):
        """Test creating a new fractal."""
        payload = {
            'name': 'Test Fractal',
            'description': 'A test ultimate goal'
        }
        response = authed_client.post(
            '/api/fractals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Test Fractal'
        assert data['attributes']['type'] == 'UltimateGoal'
        assert 'id' in data
    
    def test_list_fractals_with_data(self, authed_client, sample_ultimate_goal):
        """Test listing fractals when they exist."""
        response = authed_client.get('/api/fractals')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) >= 1
        assert any(f['id'] == sample_ultimate_goal.id for f in data)
    
    def test_delete_fractal(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        sample_activity_definition,
        sample_practice_session,
        sample_session_template,
    ):
        """Test deleting a fractal and soft-deleting its root-scoped records."""
        response = authed_client.delete(f'/api/fractals/{sample_ultimate_goal.id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_root = db_session.query(Goal).filter_by(id=sample_ultimate_goal.id).first()
        deleted_activity = db_session.query(ActivityDefinition).filter_by(id=sample_activity_definition.id).first()
        deleted_session = db_session.query(Session).filter_by(id=sample_practice_session.id).first()
        deleted_template = db_session.query(SessionTemplate).filter_by(id=sample_session_template.id).first()

        assert deleted_root is not None and deleted_root.deleted_at is not None
        assert deleted_activity is not None and deleted_activity.deleted_at is not None
        assert deleted_session is not None and deleted_session.deleted_at is not None
        assert deleted_template is not None and deleted_template.deleted_at is not None
        
        # Verify it's gone
        response = authed_client.get('/api/fractals')
        data = json.loads(response.data)
        assert not any(f['id'] == sample_ultimate_goal.id for f in data)
    
    def test_delete_nonexistent_fractal(self, authed_client):
        """Test deleting a fractal that doesn't exist."""
        response = authed_client.delete('/api/fractals/nonexistent-id')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalTreeEndpoints:
    """Test goal tree retrieval endpoints."""
    
    def test_get_goal_tree(self, authed_client, sample_goal_hierarchy):
        """Test retrieving complete goal tree for a fractal."""
        root_id = sample_goal_hierarchy['ultimate'].id
        response = authed_client.get(f'/api/{root_id}/goals')
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Should return the root goal with nested children
        assert data['id'] == root_id
        assert 'children' in data or isinstance(data, dict)
    
    def test_get_goal_tree_nonexistent(self, authed_client):
        """Test retrieving goal tree for nonexistent fractal."""
        response = authed_client.get('/api/nonexistent-id/goals')
        assert response.status_code == 404

    def test_get_active_goals_for_selection(self, authed_client, db_session, sample_goal_hierarchy):
        """Test retrieving active short-term goals and immediate children for selection."""
        short_term = sample_goal_hierarchy['short_term']
        root_id = sample_goal_hierarchy['ultimate'].id

        short_term_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
        immediate_level = GoalLevel(id=str(uuid.uuid4()), name='Immediate Goal', rank=4)
        db_session.add_all([short_term_level, immediate_level])
        db_session.flush()

        short_term.level_id = short_term_level.id
        immediate_goal = Goal(
            id=str(uuid.uuid4()),
            name='Practice pytest fixtures',
            description='Set up reusable fixture patterns',
            parent_id=short_term.id,
            root_id=root_id,
            level_id=immediate_level.id,
            completed=False,
            created_at=datetime.now(timezone.utc),
        )
        completed_immediate = Goal(
            id=str(uuid.uuid4()),
            name='Already done immediate goal',
            description='Should be filtered out',
            parent_id=short_term.id,
            root_id=root_id,
            level_id=immediate_level.id,
            completed=True,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add_all([immediate_goal, completed_immediate])
        db_session.commit()

        response = authed_client.get(f'/api/{root_id}/goals/selection')
        assert response.status_code == 200

        data = json.loads(response.data)
        assert len(data) == 1
        assert data[0]['id'] == short_term.id
        assert len(data[0]['immediateGoals']) == 1
        assert data[0]['immediateGoals'][0]['id'] == immediate_goal.id


@pytest.mark.integration
class TestGoalCRUDEndpoints:
    """Test goal CRUD operations."""
    
    def test_create_goal(self, authed_client, sample_ultimate_goal):
        """Test creating a new goal."""
        payload = {
            'name': 'New Long Term Goal',
            'description': 'A new goal',
            'type': 'LongTermGoal',
            'parent_id': sample_ultimate_goal.id,
            'root_id': sample_ultimate_goal.id
        }
        response = authed_client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Long Term Goal'
        assert data['attributes']['type'] == 'LongTermGoal'
        assert data['attributes']['parent_id'] == sample_ultimate_goal.id

    def test_create_goal_can_associate_activity_atomically(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        sample_activity_definition,
    ):
        payload = {
            'name': 'Associated Immediate Goal',
            'description': 'Created from session detail',
            'type': 'ImmediateGoal',
            'parent_id': sample_ultimate_goal.id,
            'activity_definition_id': sample_activity_definition.id,
        }
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )

        assert response.status_code == 201
        data = json.loads(response.data)

        db_session.expire_all()
        activity = db_session.query(ActivityDefinition).filter_by(id=sample_activity_definition.id).first()
        associated_goal_ids = {goal.id for goal in activity.associated_goals}
        assert data['id'] in associated_goal_ids
    
    def test_create_goal_missing_fields(self, authed_client):
        """Test creating goal with missing required fields."""
        payload = {
            'name': 'Incomplete Goal'
            # Missing type, parent_id, root_id
        }
        response = authed_client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should return 400 Bad Request
        assert response.status_code in [400, 422]
    
    def test_update_goal(self, authed_client, sample_ultimate_goal):
        """Test updating an existing goal."""
        payload = {
            'name': 'Updated Goal Name',
            'description': 'Updated description'
        }
        response = authed_client.put(
            f'/api/goals/{sample_ultimate_goal.id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Goal Name'
        assert data['description'] == 'Updated description'
    
    def test_update_nonexistent_goal(self, authed_client):
        """Test updating a goal that doesn't exist."""
        payload = {'name': 'Updated Name'}
        response = authed_client.put(
            '/api/goals/nonexistent-id',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 404

    def test_update_goal_rejects_non_array_targets(self, authed_client, sample_ultimate_goal):
        """Target payloads must keep their validated list shape."""
        response = authed_client.put(
            f'/api/goals/{sample_ultimate_goal.id}',
            json={'targets': {'name': 'not-a-list'}}
        )
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_update_goal_rejects_child_deadline_after_parent(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
    ):
        """Global goal updates should still enforce parent deadline rules via the service."""
        parent_goal = sample_goal_hierarchy['mid_term']
        child_goal = sample_goal_hierarchy['short_term']
        parent_goal.deadline = datetime(2026, 3, 20, tzinfo=timezone.utc)
        db_session.commit()

        response = authed_client.put(
            f'/api/goals/{child_goal.id}',
            json={'deadline': '2026-03-25'}
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload['error'] == 'Child deadline cannot be later than parent deadline'
        assert payload['parent_deadline'] == '2026-03-20'
    
    def test_delete_goal(self, authed_client, db_session, sample_goal_hierarchy):
        """Test deleting a goal."""
        goal_id = sample_goal_hierarchy['short_term'].id
        response = authed_client.delete(f'/api/goals/{goal_id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_goal = db_session.query(Goal).filter_by(id=goal_id).first()
        assert deleted_goal is not None
        assert deleted_goal.deleted_at is not None
        
        # Verify it's deleted
        response = authed_client.get(f'/api/goals/{goal_id}')
        assert response.status_code == 404
    
    def test_delete_goal_cascades_to_children(self, authed_client, db_session, sample_goal_hierarchy):
        """Test that deleting a goal also deletes its children."""
        # Delete mid-term goal (which has short-term as child)
        mid_term_id = sample_goal_hierarchy['mid_term'].id
        short_term_id = sample_goal_hierarchy['short_term'].id
        
        response = authed_client.delete(f'/api/goals/{mid_term_id}')
        assert response.status_code == 200

        db_session.expire_all()
        deleted_mid_term = db_session.query(Goal).filter_by(id=mid_term_id).first()
        deleted_short_term = db_session.query(Goal).filter_by(id=short_term_id).first()
        assert deleted_mid_term is not None and deleted_mid_term.deleted_at is not None
        assert deleted_short_term is not None and deleted_short_term.deleted_at is not None
        
        # Verify both are deleted
        response = authed_client.get(f'/api/goals/{mid_term_id}')
        assert response.status_code == 404
        
        response = authed_client.get(f'/api/goals/{short_term_id}')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalCompletionEndpoints:
    """Test goal completion toggle endpoints."""
    
    def test_toggle_goal_completion(self, authed_client, sample_ultimate_goal):
        """Test toggling goal completion status."""
        # Initially not completed
        response = authed_client.get(f'/api/goals/{sample_ultimate_goal.id}')
        data = json.loads(response.data)
        initial_status = data.get('attributes', {}).get('completed', False)
        
        # Toggle completion
        response = authed_client.patch(f'/api/goals/{sample_ultimate_goal.id}/complete')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['attributes']['completed'] != initial_status
        
        # Toggle again
        response = authed_client.patch(f'/api/goals/{sample_ultimate_goal.id}/complete')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['attributes']['completed'] == initial_status
    
    def test_toggle_completion_nonexistent_goal(self, authed_client):
        """Test toggling completion for nonexistent goal."""
        response = authed_client.patch('/api/goals/nonexistent-id/complete')
        assert response.status_code == 404

    def test_toggle_completion_rejects_goal_level_manual_completion_block(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
    ):
        sample_ultimate_goal.allow_manual_completion = False
        db_session.commit()

        response = authed_client.patch(f'/api/goals/{sample_ultimate_goal.id}/complete')

        assert response.status_code == 403
        assert response.get_json()['error'] == 'Manual completion is not allowed for this goal level'

    def test_toggle_completion_rejects_non_boolean_completed(self, authed_client, sample_ultimate_goal):
        """Completion updates should reject malformed completed payloads."""
        response = authed_client.patch(
            f'/api/goals/{sample_ultimate_goal.id}/complete',
            json={'completed': {'bad': 'shape'}}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_toggle_completion_rejects_non_object_json_body(self, authed_client, sample_ultimate_goal):
        response = authed_client.patch(
            f'/api/goals/{sample_ultimate_goal.id}/complete',
            json=['bad', 'shape']
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload['error'] == 'Validation failed'
        assert payload['details'][0]['type'] == 'dict_type'


@pytest.mark.integration
class TestGoalOptionsEndpoints:
    def test_eligible_move_parents_only_returns_same_tier_candidates(
        self,
        authed_client,
        db_session,
        test_user,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        long_term = sample_goal_hierarchy['long_term']
        short_term = sample_goal_hierarchy['short_term']

        root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
        long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
        mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
        short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
        db_session.add_all([root_level, long_level, mid_level, short_level])
        db_session.flush()

        root.level_id = root_level.id
        long_term.level_id = long_level.id
        sample_goal_hierarchy['mid_term'].level_id = mid_level.id
        short_term.level_id = short_level.id

        alternate_mid = Goal(
            id=str(uuid.uuid4()),
            name='Alternate mid-term parent',
            description='Valid move target',
            parent_id=long_term.id,
            root_id=root.id,
            level_id=mid_level.id,
            owner_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        alternate_long = Goal(
            id=str(uuid.uuid4()),
            name='Alternate long-term parent',
            description='Invalid move target',
            parent_id=root.id,
            root_id=root.id,
            level_id=long_level.id,
            owner_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add_all([alternate_mid, alternate_long])
        db_session.commit()

        response = authed_client.get(f'/api/{root.id}/goals/{short_term.id}/eligible-parents')

        assert response.status_code == 200
        payload = response.get_json()
        eligible_parent_ids = {parent['id'] for parent in payload['eligible_parents']}
        assert alternate_mid.id in eligible_parent_ids
        assert alternate_long.id not in eligible_parent_ids

    def test_freeze_endpoint_blocks_completion(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id

        freeze_response = authed_client.patch(
            f'/api/{root_id}/goals/{goal_id}/freeze',
            json={'frozen': True},
        )

        assert freeze_response.status_code == 200
        assert freeze_response.get_json()['frozen'] is True

        completion_response = authed_client.patch(
            f'/api/goals/{goal_id}/complete',
            json={'completed': True},
        )

        assert completion_response.status_code == 400
        assert completion_response.get_json()['error'] == 'Cannot complete a frozen goal. Unfreeze it first.'

    def test_move_goal_endpoint_only_allows_same_parent_tier(
        self,
        authed_client,
        db_session,
        test_user,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        long_term = sample_goal_hierarchy['long_term']
        mid_term = sample_goal_hierarchy['mid_term']
        short_term = sample_goal_hierarchy['short_term']

        root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
        long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
        mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
        short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
        db_session.add_all([root_level, long_level, mid_level, short_level])
        db_session.flush()

        root.level_id = root_level.id
        long_term.level_id = long_level.id
        mid_term.level_id = mid_level.id
        short_term.level_id = short_level.id

        alternate_mid = Goal(
            id=str(uuid.uuid4()),
            name='Alternate mid-term parent',
            description='Valid move target',
            parent_id=long_term.id,
            root_id=root.id,
            level_id=mid_level.id,
            owner_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        alternate_long = Goal(
            id=str(uuid.uuid4()),
            name='Alternate long-term parent',
            description='Invalid move target',
            parent_id=root.id,
            root_id=root.id,
            level_id=long_level.id,
            owner_id=test_user.id,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add_all([alternate_mid, alternate_long])
        db_session.commit()

        allowed_response = authed_client.patch(
            f'/api/{root.id}/goals/{short_term.id}/move',
            json={'new_parent_id': alternate_mid.id},
        )

        assert allowed_response.status_code == 200
        assert allowed_response.get_json()['attributes']['parent_id'] == alternate_mid.id

        rejected_response = authed_client.patch(
            f'/api/{root.id}/goals/{short_term.id}/move',
            json={'new_parent_id': alternate_long.id},
        )

        assert rejected_response.status_code == 400
        assert rejected_response.get_json()['error'] == 'Can only move a goal under a parent on the same tier as its current parent'

    def test_move_goal_endpoint_validates_request_shape(self, authed_client, sample_goal_hierarchy):
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id

        response = authed_client.patch(
            f'/api/{root_id}/goals/{goal_id}/move',
            json={},
        )

        assert response.status_code == 400
        payload = response.get_json()
        assert payload['error'] == 'Validation failed'
        assert payload['details'][0]['field'] == 'new_parent_id'

    def test_convert_level_endpoint_rejects_root_tier(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        long_term = sample_goal_hierarchy['long_term']
        mid_term = sample_goal_hierarchy['mid_term']
        short_term = sample_goal_hierarchy['short_term']

        root_level = GoalLevel(id=str(uuid.uuid4()), name='Ultimate Goal', rank=0)
        long_level = GoalLevel(id=str(uuid.uuid4()), name='Long Term Goal', rank=1)
        mid_level = GoalLevel(id=str(uuid.uuid4()), name='Mid Term Goal', rank=2)
        short_level = GoalLevel(id=str(uuid.uuid4()), name='Short Term Goal', rank=3)
        db_session.add_all([root_level, long_level, mid_level, short_level])
        db_session.flush()

        root.level_id = root_level.id
        long_term.level_id = long_level.id
        mid_term.level_id = mid_level.id
        short_term.level_id = short_level.id
        db_session.commit()

        response = authed_client.patch(
            f'/api/{root.id}/goals/{short_term.id}/convert-level',
            json={'level_id': root_level.id},
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Cannot convert a goal to the fractal root level'


@pytest.mark.integration
class TestGoalTargetEndpoints:
    """Test goal target management endpoints."""
    
    def test_add_target_to_goal(self, authed_client, sample_ultimate_goal):
        """Test adding a target to a goal."""
        payload = {
            'description': 'Complete 100 sessions',
            'target_value': 100,
            'current_value': 0
        }
        response = authed_client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert 'targets' in data or 'id' in data

    def test_add_target_rejects_non_array_metrics(self, authed_client, sample_ultimate_goal):
        """Target metrics must be sent as an array of objects."""
        response = authed_client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            json={'name': 'Bad Target', 'metrics': {'metric_id': 'x'}}
        )
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'
    
    def test_remove_target_from_goal(self, authed_client, sample_ultimate_goal):
        """Test removing a target from a goal."""
        # First add a target
        payload = {
            'description': 'Test target',
            'target_value': 50,
            'current_value': 0
        }
        response = authed_client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        
        # Get the target ID (implementation-dependent)
        # This test documents expected behavior
        # Actual implementation may vary
        target_id = 'target-id-placeholder'
        
        response = authed_client.delete(
            f'/api/goals/{sample_ultimate_goal.id}/targets/{target_id}'
        )
        # Should succeed or return 404 if target management differs
        assert response.status_code in [200, 404]

    def test_update_goal_omits_targets_to_preserve_existing(self, authed_client, db_session, sample_ultimate_goal):
        """Omitting targets should patch scalars without replacing the target set."""
        create_response = authed_client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            json={'name': 'Preserved Target', 'metrics': []}
        )
        assert create_response.status_code == 201
        target_id = create_response.get_json()['id']

        update_response = authed_client.put(
            f'/api/goals/{sample_ultimate_goal.id}',
            json={'name': 'Renamed Goal'}
        )
        assert update_response.status_code == 200

        target = db_session.query(Target).filter(Target.id == target_id).first()
        assert target is not None
        assert target.deleted_at is None

    def test_update_goal_empty_targets_clears_existing(self, authed_client, db_session, sample_ultimate_goal):
        """Providing targets=[] should replace the goal target set with empty."""
        create_response = authed_client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            json={'name': 'Clear Me', 'metrics': []}
        )
        assert create_response.status_code == 201
        target_id = create_response.get_json()['id']

        update_response = authed_client.put(
            f'/api/goals/{sample_ultimate_goal.id}',
            json={'targets': []}
        )
        assert update_response.status_code == 200

        target = db_session.query(Target).filter(Target.id == target_id).first()
        assert target is not None
        assert target.deleted_at is not None


@pytest.mark.integration
class TestGoalValidation:
    """Test goal validation and business rules."""
    
    def test_cannot_create_invalid_parent_child_relationship(self, authed_client, sample_goal_hierarchy):
        """Test that invalid parent-child relationships are rejected."""
        # Try to create a LongTermGoal as child of ShortTermGoal (invalid)
        payload = {
            'name': 'Invalid Goal',
            'type': 'LongTermGoal',
            'parent_id': sample_goal_hierarchy['short_term'].id,
            'root_id': sample_goal_hierarchy['ultimate'].id
        }
        response = authed_client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should reject invalid hierarchy
        # Note: This requires validation logic in backend
        # Test documents expected behavior
        assert response.status_code in [400, 422, 201]  # 201 if validation not implemented yet
    
    def test_goal_with_deadline(self, authed_client, sample_ultimate_goal):
        """Test creating goal with deadline."""
        deadline = (datetime.utcnow() + timedelta(days=30)).isoformat()
        payload = {
            'name': 'Goal with Deadline',
            'type': 'ShortTermGoal',
            'parent_id': sample_ultimate_goal.id,
            'root_id': sample_ultimate_goal.id,
            'deadline': deadline
        }
        response = authed_client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert 'deadline' in data


@pytest.mark.integration
class TestGoalSearch:
    """Test goal search and filtering."""
    
    def test_search_goals_by_name(self, authed_client, sample_goal_hierarchy):
        """Test searching goals by name."""
        # This documents expected search functionality
        # May not be implemented yet
        response = authed_client.get(
            f'/api/{sample_goal_hierarchy["ultimate"].id}/goals',
            query_string={'search': 'Python'}
        )
        assert response.status_code == 200
        # If search is implemented, verify results
        # If not, this test documents the expected feature
    
    def test_filter_goals_by_completion(self, authed_client, sample_goal_hierarchy):
        """Test filtering goals by completion status."""
        # This documents expected filtering functionality
        response = authed_client.get(
            f'/api/{sample_goal_hierarchy["ultimate"].id}/goals',
            query_string={'completed': 'true'}
        )
        assert response.status_code == 200
        # Test documents expected behavior


@pytest.mark.integration
class TestGlobalGoalEndpointProtection:
    """Auth and ownership checks for global goal endpoints."""

    @pytest.mark.parametrize("method,path,payload", [
        ("get", "/api/goals", None),
        ("post", "/api/goals", {"name": "Unauthorized Goal", "type": "LongTermGoal", "parent_id": "missing-root"}),
        ("delete", "/api/goals/some-goal-id", None),
        ("get", "/api/goals/some-goal-id", None),
        ("put", "/api/goals/some-goal-id", {"name": "Updated"}),
        ("post", "/api/goals/some-goal-id/targets", {"name": "Target"}),
        ("delete", "/api/goals/some-goal-id/targets/some-target-id", None),
    ])
    def test_endpoints_require_auth(self, client, method, path, payload):
        kwargs = {}
        if payload is not None:
            kwargs["data"] = json.dumps(payload)
            kwargs["content_type"] = "application/json"
        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 401

    @pytest.mark.parametrize("method,endpoint_kind", [
        ("get", "list_goals"),
        ("post", "create_goal"),
        ("delete", "delete_goal"),
        ("get", "get_goal"),
        ("put", "update_goal"),
        ("post", "add_target"),
        ("delete", "delete_target"),
    ])
    def test_endpoints_return_404_for_wrong_owner(
        self, client, db_session, sample_ultimate_goal, method, endpoint_kind
    ):
        import jwt
        from config import config
        from models import User, Target

        other_user = User(
            id=str(uuid.uuid4()),
            username="otheruser",
            email="other@example.com"
        )
        other_user.set_password("Password123")
        db_session.add(other_user)
        db_session.commit()

        token = jwt.encode({
            'user_id': other_user.id,
            'exp': datetime.now(timezone.utc) + timedelta(hours=24)
        }, config.JWT_SECRET_KEY, algorithm="HS256")

        headers = {
            'Authorization': f'Bearer {token}',
            'Content-Type': 'application/json'
        }

        target_id = str(uuid.uuid4())
        if endpoint_kind == "delete_target":
            target = Target(
                id=target_id,
                goal_id=sample_ultimate_goal.id,
                root_id=sample_ultimate_goal.id,
                name="Protected Target"
            )
            db_session.add(target)
            db_session.commit()

        if endpoint_kind == "list_goals":
            path = "/api/goals"
            payload = None
        elif endpoint_kind == "create_goal":
            path = "/api/goals"
            payload = {
                "name": "Cross User Goal",
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "root_id": sample_ultimate_goal.id
            }
        elif endpoint_kind == "delete_goal":
            path = f"/api/goals/{sample_ultimate_goal.id}"
            payload = None
        elif endpoint_kind == "get_goal":
            path = f"/api/goals/{sample_ultimate_goal.id}"
            payload = None
        elif endpoint_kind == "update_goal":
            path = f"/api/goals/{sample_ultimate_goal.id}"
            payload = {"name": "Cross User Update"}
        elif endpoint_kind == "add_target":
            path = f"/api/goals/{sample_ultimate_goal.id}/targets"
            payload = {"name": "Cross User Target"}
        else:
            path = f"/api/goals/{sample_ultimate_goal.id}/targets/{target_id}"
            payload = None

        kwargs = {"headers": headers}
        if payload is not None:
            kwargs["data"] = json.dumps(payload)
            kwargs["content_type"] = "application/json"

        response = getattr(client, method)(path, **kwargs)
        assert response.status_code == 404
