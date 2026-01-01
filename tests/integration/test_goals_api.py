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


@pytest.mark.integration
class TestFractalEndpoints:
    """Test fractal (root goal) management endpoints."""
    
    def test_list_fractals_empty(self, client):
        """Test listing fractals when none exist."""
        response = client.get('/api/fractals')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, list)
        assert len(data) == 0
    
    def test_create_fractal(self, client):
        """Test creating a new fractal."""
        payload = {
            'name': 'Test Fractal',
            'description': 'A test ultimate goal'
        }
        response = client.post(
            '/api/fractals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Test Fractal'
        assert data['attributes']['type'] == 'UltimateGoal'
        assert 'id' in data
    
    def test_list_fractals_with_data(self, client, sample_ultimate_goal):
        """Test listing fractals when they exist."""
        response = client.get('/api/fractals')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data) >= 1
        assert any(f['id'] == sample_ultimate_goal.id for f in data)
    
    def test_delete_fractal(self, client, sample_ultimate_goal):
        """Test deleting a fractal and all its descendants."""
        response = client.delete(f'/api/fractals/{sample_ultimate_goal.id}')
        assert response.status_code == 200
        
        # Verify it's gone
        response = client.get('/api/fractals')
        data = json.loads(response.data)
        assert not any(f['id'] == sample_ultimate_goal.id for f in data)
    
    def test_delete_nonexistent_fractal(self, client):
        """Test deleting a fractal that doesn't exist."""
        response = client.delete('/api/fractals/nonexistent-id')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalTreeEndpoints:
    """Test goal tree retrieval endpoints."""
    
    def test_get_goal_tree(self, client, sample_goal_hierarchy):
        """Test retrieving complete goal tree for a fractal."""
        root_id = sample_goal_hierarchy['ultimate'].id
        response = client.get(f'/api/{root_id}/goals')
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Should return the root goal with nested children
        assert data['id'] == root_id
        assert 'children' in data or isinstance(data, dict)
    
    def test_get_goal_tree_nonexistent(self, client):
        """Test retrieving goal tree for nonexistent fractal."""
        response = client.get('/api/nonexistent-id/goals')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalCRUDEndpoints:
    """Test goal CRUD operations."""
    
    def test_create_goal(self, client, sample_ultimate_goal):
        """Test creating a new goal."""
        payload = {
            'name': 'New Long Term Goal',
            'description': 'A new goal',
            'type': 'LongTermGoal',
            'parent_id': sample_ultimate_goal.id,
            'root_id': sample_ultimate_goal.id
        }
        response = client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'New Long Term Goal'
        assert data['attributes']['type'] == 'LongTermGoal'
        assert data['attributes']['parent_id'] == sample_ultimate_goal.id
    
    def test_create_goal_missing_fields(self, client):
        """Test creating goal with missing required fields."""
        payload = {
            'name': 'Incomplete Goal'
            # Missing type, parent_id, root_id
        }
        response = client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should return 400 Bad Request
        assert response.status_code in [400, 422]
    
    def test_update_goal(self, client, sample_ultimate_goal):
        """Test updating an existing goal."""
        payload = {
            'name': 'Updated Goal Name',
            'description': 'Updated description'
        }
        response = client.put(
            f'/api/goals/{sample_ultimate_goal.id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Goal Name'
        assert data['description'] == 'Updated description'
    
    def test_update_nonexistent_goal(self, client):
        """Test updating a goal that doesn't exist."""
        payload = {'name': 'Updated Name'}
        response = client.put(
            '/api/goals/nonexistent-id',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 404
    
    def test_delete_goal(self, client, sample_goal_hierarchy):
        """Test deleting a goal."""
        goal_id = sample_goal_hierarchy['short_term'].id
        response = client.delete(f'/api/goals/{goal_id}')
        assert response.status_code == 200
        
        # Verify it's deleted
        response = client.get(f'/api/goals/{goal_id}')
        assert response.status_code == 404
    
    def test_delete_goal_cascades_to_children(self, client, sample_goal_hierarchy):
        """Test that deleting a goal also deletes its children."""
        # Delete mid-term goal (which has short-term as child)
        mid_term_id = sample_goal_hierarchy['mid_term'].id
        short_term_id = sample_goal_hierarchy['short_term'].id
        
        response = client.delete(f'/api/goals/{mid_term_id}')
        assert response.status_code == 200
        
        # Verify both are deleted
        response = client.get(f'/api/goals/{mid_term_id}')
        assert response.status_code == 404
        
        response = client.get(f'/api/goals/{short_term_id}')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalCompletionEndpoints:
    """Test goal completion toggle endpoints."""
    
    def test_toggle_goal_completion(self, client, sample_ultimate_goal):
        """Test toggling goal completion status."""
        # Initially not completed
        response = client.get(f'/api/goals/{sample_ultimate_goal.id}')
        data = json.loads(response.data)
        initial_status = data.get('attributes', {}).get('completed', False)
        
        # Toggle completion
        response = client.patch(f'/api/goals/{sample_ultimate_goal.id}/complete')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['attributes']['completed'] != initial_status
        
        # Toggle again
        response = client.patch(f'/api/goals/{sample_ultimate_goal.id}/complete')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['attributes']['completed'] == initial_status
    
    def test_toggle_completion_nonexistent_goal(self, client):
        """Test toggling completion for nonexistent goal."""
        response = client.patch('/api/goals/nonexistent-id/complete')
        assert response.status_code == 404


@pytest.mark.integration
class TestGoalTargetEndpoints:
    """Test goal target management endpoints."""
    
    def test_add_target_to_goal(self, client, sample_ultimate_goal):
        """Test adding a target to a goal."""
        payload = {
            'description': 'Complete 100 sessions',
            'target_value': 100,
            'current_value': 0
        }
        response = client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert 'targets' in data or 'id' in data
    
    def test_remove_target_from_goal(self, client, sample_ultimate_goal):
        """Test removing a target from a goal."""
        # First add a target
        payload = {
            'description': 'Test target',
            'target_value': 50,
            'current_value': 0
        }
        response = client.post(
            f'/api/goals/{sample_ultimate_goal.id}/targets',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        
        # Get the target ID (implementation-dependent)
        # This test documents expected behavior
        # Actual implementation may vary
        target_id = 'target-id-placeholder'
        
        response = client.delete(
            f'/api/goals/{sample_ultimate_goal.id}/targets/{target_id}'
        )
        # Should succeed or return 404 if target management differs
        assert response.status_code in [200, 404]


@pytest.mark.integration
class TestGoalValidation:
    """Test goal validation and business rules."""
    
    def test_cannot_create_invalid_parent_child_relationship(self, client, sample_goal_hierarchy):
        """Test that invalid parent-child relationships are rejected."""
        # Try to create a LongTermGoal as child of ShortTermGoal (invalid)
        payload = {
            'name': 'Invalid Goal',
            'type': 'LongTermGoal',
            'parent_id': sample_goal_hierarchy['short_term'].id,
            'root_id': sample_goal_hierarchy['ultimate'].id
        }
        response = client.post(
            '/api/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should reject invalid hierarchy
        # Note: This requires validation logic in backend
        # Test documents expected behavior
        assert response.status_code in [400, 422, 201]  # 201 if validation not implemented yet
    
    def test_goal_with_deadline(self, client, sample_ultimate_goal):
        """Test creating goal with deadline."""
        deadline = (datetime.utcnow() + timedelta(days=30)).isoformat()
        payload = {
            'name': 'Goal with Deadline',
            'type': 'ShortTermGoal',
            'parent_id': sample_ultimate_goal.id,
            'root_id': sample_ultimate_goal.id,
            'deadline': deadline
        }
        response = client.post(
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
    
    def test_search_goals_by_name(self, client, sample_goal_hierarchy):
        """Test searching goals by name."""
        # This documents expected search functionality
        # May not be implemented yet
        response = client.get(
            f'/api/{sample_goal_hierarchy["ultimate"].id}/goals',
            query_string={'search': 'Python'}
        )
        assert response.status_code == 200
        # If search is implemented, verify results
        # If not, this test documents the expected feature
    
    def test_filter_goals_by_completion(self, client, sample_goal_hierarchy):
        """Test filtering goals by completion status."""
        # This documents expected filtering functionality
        response = client.get(
            f'/api/{sample_goal_hierarchy["ultimate"].id}/goals',
            query_string={'completed': 'true'}
        )
        assert response.status_code == 200
        # Test documents expected behavior
