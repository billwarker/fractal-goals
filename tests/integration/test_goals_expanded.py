import pytest
import json
from datetime import datetime, timedelta

@pytest.mark.integration
class TestFractalGoalEndpoints:
    """Test fractal-scoped goal endpoints (/<root_id>/goals/*)."""

    def test_create_goal_in_fractal(self, client, sample_ultimate_goal):
        """Test creating a goal using the fractal-scoped endpoint."""
        root_id = sample_ultimate_goal.id
        payload = {
            'name': 'Scoped Goal',
            'type': 'LongTermGoal',
            'parent_id': root_id, # Ultimate is parent
            'description': 'Created via scoped endpoint'
        }
        
        response = client.post(
            f'/api/{root_id}/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Scoped Goal'
        assert data['attributes']['type'] == 'LongTermGoal'

    def test_get_fractal_goals(self, client, sample_goal_hierarchy):
        """Test listing goals for a fractal."""
        root_id = sample_goal_hierarchy['ultimate'].id
        
        response = client.get(f'/api/{root_id}/goals')
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Should return root goal tree
        assert data['id'] == root_id
        assert 'children' in data

    def test_get_specific_fractal_goal(self, client, sample_goal_hierarchy):
        """Test getting a specific goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id
        
        response = client.get(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == goal_id

    def test_update_fractal_goal(self, client, sample_goal_hierarchy):
        """Test updating a goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['mid_term'].id
        
        payload = {'name': 'Updated via Scoped API'}
        
        response = client.put(
            f'/api/{root_id}/goals/{goal_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated via Scoped API'

    def test_delete_fractal_goal(self, client, sample_goal_hierarchy):
        """Test deleting a goal via scoped endpoint."""
        root_id = sample_goal_hierarchy['ultimate'].id
        goal_id = sample_goal_hierarchy['short_term'].id # Delete leaf to check
        
        response = client.delete(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 200
        
        # Verify
        response = client.get(f'/api/{root_id}/goals/{goal_id}')
        assert response.status_code == 404

    def test_fractal_checks(self, client, sample_ultimate_goal):
        """Test validation of root_id."""
        response = client.get('/api/nonexistent-root/goals')
        assert response.status_code == 404


@pytest.mark.integration
class TestPracticeSessionCreation:
    """Test the specialized practice session creation endpoint."""
    
    def test_create_practice_session_endpoint(self, client, sample_goal_hierarchy):
        """Test POST /goals/practice-session."""
        short_term_id = sample_goal_hierarchy['short_term'].id
        
        payload = {
            'parent_ids': [short_term_id],
            'immediate_goals': [
                {'name': 'IG 1', 'description': 'First item'},
                {'name': 'IG 2'}
            ],
            'description': 'Test Session'
        }
        
        response = client.post(
            '/api/goals/practice-session',
            data=json.dumps(payload),
            content_type='application/json'
        )
        
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['success'] is True
        assert 'practice_session' in data
        
        ps = data['practice_session']
        # Check immediate goals are attached
        # Note: logic returns tree. Immediate goals are children of structure?
        # Or likely checks session?
        # Let's inspect 'children' of practice session if modeled as Goal
        # PracticeSession IS a goal.
        # But immediate goals are children.
        children = ps.get('children', [])
        assert len(children) == 2
        assert any(c['name'] == 'IG 1' for c in children)

    def test_create_practice_session_validation(self, client):
        """Test validation failures."""
        # Missing parents
        response = client.post('/api/goals/practice-session', json={'parent_ids': []})
        assert response.status_code == 400
        
        # Nonexistent parent
        response = client.post('/api/goals/practice-session', json={'parent_ids': ['fake']})
        assert response.status_code == 404
