import pytest
import json
from datetime import datetime, timedelta

@pytest.mark.integration
class TestFractalGoalEndpoints:
    """Test fractal-scoped goal endpoints (/<root_id>/goals/*)."""

    def test_create_goal_in_fractal(self, authed_client, sample_ultimate_goal):
        """Test creating a goal using the fractal-scoped endpoint."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Scoped Goal',
            'type': 'LongTermGoal',
            'parent_id': root_id, # Ultimate is parent
            'description': 'Created via scoped endpoint'
        }
        
        response = authed_client.post(
            f'/api/{root_id}/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Scoped Goal'
        assert data['attributes']['type'] == 'LongTermGoal'

    def test_get_fractal_goals(self, authed_client, sample_goal_hierarchy):
        """Test listing goals for a fractal."""
        root_id = sample_goal_hierarchy['ultimate'].id
        
        response = authed_client.get(f'/api/{root_id}/goals')
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Should return root goal tree
        assert data['id'] == root_id
        assert 'children' in data

    def test_get_specific_fractal_goal(self, authed_client, sample_goal_hierarchy):
        """Test getting a specific goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id
        
        response = authed_client.get(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == goal_id

    def test_update_fractal_goal(self, authed_client, sample_goal_hierarchy):
        """Test updating a goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['mid_term'].id
        
        payload = {'name': 'Updated via Scoped API'}
        
        response = authed_client.put(
            f'/api/{root_id}/goals/{goal_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated via Scoped API'

    def test_delete_fractal_goal(self, authed_client, sample_goal_hierarchy):
        """Test deleting a goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id # Delete leaf to check
        
        response = authed_client.delete(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 200
        
        # Verify
        response = authed_client.get(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 404

    def test_fractal_checks(self, authed_client, sample_ultimate_goal):
        """Test validation of root_id."""
        response = authed_client.get('/api/nonexistent-root/goals')
        assert response.status_code == 404



