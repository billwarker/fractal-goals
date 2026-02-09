
import pytest
import json
import uuid

@pytest.mark.integration
class TestInheritedActivities:
    """Test recursive activity inheritance."""

    def test_recursive_activity_fetching(self, authed_client, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        
        # 1. Create Hierarchy: Root -> Child -> Grandchild
        # Root is sample_ultimate_goal
        
        # Create Child (LongTermGoal)
        child_payload = {
            'name': 'Child Goal',
            'type': 'LongTermGoal',
            'parent_id': root_id
        }
        res = authed_client.post(f'/api/{root_id}/goals', json=child_payload)
        assert res.status_code == 201
        child_id = res.get_json()['id']
        
        # Create Grandchild (MidTermGoal)
        grandchild_payload = {
            'name': 'Grandchild Goal',
            'type': 'MidTermGoal',
            'parent_id': child_id
        }
        res = authed_client.post(f'/api/{root_id}/goals', json=grandchild_payload)
        assert res.status_code == 201
        grandchild_id = res.get_json()['id']
        
        # 2. Create Activities
        def create_activity(name):
            payload = {'name': name}
            res = authed_client.post(f'/api/{root_id}/activities', json=payload)
            assert res.status_code == 201
            return res.get_json()['id']

        act_root_id = create_activity('Root Activity')
        act_child_id = create_activity('Child Activity')
        act_grandchild_id = create_activity('Grandchild Activity')
        
        # 3. associate Activities
        # Link Root Activity to Root
        authed_client.post(f'/api/{root_id}/activities/{act_root_id}/goals', json={'goal_ids': [root_id]})
        
        # Link Child Activity to Child
        authed_client.post(f'/api/{root_id}/activities/{act_child_id}/goals', json={'goal_ids': [child_id]})
        
        # Link Grandchild Activity to Grandchild
        authed_client.post(f'/api/{root_id}/activities/{act_grandchild_id}/goals', json={'goal_ids': [grandchild_id]})
        
        # 4. Verify Fetching from ROOT
        res = authed_client.get(f'/api/{root_id}/goals/{root_id}/activities')
        assert res.status_code == 200
        data = res.get_json()
        
        ids = [a['id'] for a in data]
        assert act_root_id in ids
        assert act_child_id in ids
        assert act_grandchild_id in ids
        
        # Verify metadata
        root_act = next(a for a in data if a['id'] == act_root_id)
        assert not root_act.get('is_inherited', False)
        
        child_act = next(a for a in data if a['id'] == act_child_id)
        assert child_act['is_inherited'] is True
        assert child_act['source_goal_name'] == 'Child Goal'
        
        grandchild_act = next(a for a in data if a['id'] == act_grandchild_id)
        assert grandchild_act['is_inherited'] is True
        assert grandchild_act['source_goal_name'] == 'Grandchild Goal'
        
        # 5. Verify Fetching from CHILD
        res = authed_client.get(f'/api/{root_id}/goals/{child_id}/activities')
        data = res.get_json()
        ids = [a['id'] for a in data]
        
        assert act_child_id in ids # Direct
        assert act_grandchild_id in ids # Inherited
        assert act_root_id not in ids # Not inherited from parent
        
        child_act_self = next(a for a in data if a['id'] == act_child_id)
        assert not child_act_self.get('is_inherited', False)

    def test_duplicate_handling(self, authed_client, sample_ultimate_goal):
        """Test that if an activity is both DIRECT and INHERITED, it shows as DIRECT."""
        root_id = sample_ultimate_goal.id
        
        # Create Child
        child_payload = {'name': 'Child Goal', 'type': 'LongTermGoal', 'parent_id': root_id}
        child_id = authed_client.post(f'/api/{root_id}/goals', json=child_payload).get_json()['id']
        
        # Create Activity
        act_id = authed_client.post(f'/api/{root_id}/activities', json={'name': 'Shared Activity'}).get_json()['id']
        
        # Link to BOTH
        authed_client.post(f'/api/{root_id}/activities/{act_id}/goals', json={'goal_ids': [root_id, child_id]})
        
        # Fetch from Root
        res = authed_client.get(f'/api/{root_id}/goals/{root_id}/activities')
        data = res.get_json()
        
        activity = next(a for a in data if a['id'] == act_id)
        # Should be Direct (is_inherited=False) because Direct takes precedence
        assert not activity.get('is_inherited', False)
