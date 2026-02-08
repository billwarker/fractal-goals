
import pytest
import json
from models import Goal, Target

@pytest.mark.integration
def test_create_goal_with_targets_persists_relational(authed_client, sample_ultimate_goal):
    """
    Test that creating a goal with 'targets' in the payload 
    correctly creates Target rows in the database.
    """
    payload = {
        'name': 'Goal with Targets',
        'type': 'ShortTermGoal',
        'parent_id': sample_ultimate_goal.id,
        'root_id': sample_ultimate_goal.id,
        'targets': [
            {
                'name': 'Target 1',
                'type': 'threshold',
                'metrics': [{'metric_id': 'm1', 'value': 10, 'operator': '>='}]
            }
        ]
    }
    
    # 1. Create the goal
    response = authed_client.post(
        '/api/goals',
        data=json.dumps(payload),
        content_type='application/json'
    )
    assert response.status_code == 201
    data = json.loads(response.data)
    goal_id = data['id']
    
    # 2. Verify response contains targets
    # This might pass if the serializer falls back to JSON, 
    # so we must verify the DB state directly or ensure serializer prefers relational
    assert 'targets' in data['attributes']
    assert len(data['attributes']['targets']) == 1
    assert data['attributes']['targets'][0]['name'] == 'Target 1'
    
    # 3. Verify Database State
    from models import Target, get_session, get_engine
    
    # Create a new session to ensure we're reading from DB, not just cache
    session = get_session(get_engine())
    try:
        targets = session.query(Target).filter_by(goal_id=goal_id).all()
        assert len(targets) == 1
        assert targets[0].name == 'Target 1'
    finally:
        session.close()

    # Re-fetch via API to see if it persists strictly via relationship    # Alternatively, fetch the goal again and check targets_rel
    
    # Re-fetch via API to see if it persists strictly via relationship
    # (The serializer prefers relationship, so if relationship is empty, it returns empty)
    get_response = authed_client.get(f'/api/goals/{goal_id}')
    get_data = json.loads(get_response.data)
    
    # If the bug exists, this assertion will fail because serializer 
    # returns empty list for relational targets if they don't exist
    assert len(get_data['attributes']['targets']) == 1
    assert get_data['attributes']['targets'][0]['name'] == 'Target 1'
