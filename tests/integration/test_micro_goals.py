import pytest
import json
import uuid
from models import Goal, User, Session, session_goals

@pytest.mark.integration
class TestMicroGoals:
    
    def test_micro_goal_creation_and_session_linking(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        """Verify MicroGoal creation works and links to session."""
        root = sample_goal_hierarchy['ultimate']
        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id
        )
        db_session.add(immediate)
        
        session = Session(
            id=str(uuid.uuid4()),
            name="Test Session",
            root_id=root.id
        )
        db_session.add(session)
        db_session.commit()
        
        # Create Micro Goal via generic API
        payload = {
            "name": "Micro Goal 1",
            "type": "MicroGoal",
            "parent_id": immediate.id,
            "session_id": session.id
        }
        
        response = authed_client.post("/api/goals", data=json.dumps(payload))
        if response.status_code != 201:
            print(f"DEBUG: Response data: {response.data}")
            
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == "Micro Goal 1"
        # Type and parent_id are in 'attributes'
        assert data['attributes']['type'] == "MicroGoal"
        assert data['attributes']['parent_id'] == immediate.id
        
        # Refresh session and verify it's linked in the junction table
        db_session.expire_all()
        linked_goals = db_session.query(session_goals).filter_by(session_id=session.id).all()
        assert len(linked_goals) == 1
        assert linked_goals[0].goal_id == data['id']

    def test_nano_goal_creation(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        """Verify NanoGoal creation works with MicroGoal parent."""
        root = sample_goal_hierarchy['ultimate']
        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id
        )
        db_session.add(immediate)
        db_session.commit()

        # Create a real MicroGoal via API so it gets the proper level assignment.
        micro_response = authed_client.post("/api/goals", data=json.dumps({
            "name": "Micro Goal",
            "type": "MicroGoal",
            "parent_id": immediate.id
        }))
        assert micro_response.status_code == 201
        micro_data = json.loads(micro_response.data)
        
        payload = {
            "name": "Nano Goal 1",
            "type": "NanoGoal",
            "parent_id": micro_data['id']
        }
        
        response = authed_client.post("/api/goals", data=json.dumps(payload))
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['attributes']['type'] == "NanoGoal"
        assert data['attributes']['parent_id'] == micro_data['id']

    def test_micro_goal_validation_failure(self, authed_client, test_user, sample_goal_hierarchy):
        """Verify MicroGoal fails validation if parent_id is missing."""
        root = sample_goal_hierarchy['ultimate']
        payload = {
            "name": "Invalid Micro",
            "type": "MicroGoal"
            # Missing parent_id
        }
        
        # Using generic goals endpoint
        response = authed_client.post("/api/goals", data=json.dumps(payload))
        assert response.status_code in [400, 422]
        data = json.loads(response.data)
        
        # Pydantic errors are in data['details']
        errors = data.get('details', [])
        error_messages = [err.get('message', '') for err in errors]
        assert any("MicroGoal must have a parent_id" in msg for msg in error_messages)

    def test_get_session_micro_goals(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        """Verify specialized endpoint for session micro goals."""
        root = sample_goal_hierarchy['ultimate']
        
        session = Session(
            id=str(uuid.uuid4()),
            name="Test Session",
            root_id=root.id
        )
        db_session.add(session)
        
        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate 1",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id
        )
        db_session.add(immediate)
        db_session.commit()

        # Create and auto-link a real MicroGoal via API.
        micro_response = authed_client.post("/api/goals", data=json.dumps({
            "name": "Micro 1",
            "type": "MicroGoal",
            "parent_id": immediate.id,
            "session_id": session.id
        }))
        assert micro_response.status_code == 201
        micro_data = json.loads(micro_response.data)
        
        # Add a nano goal to that micro goal
        nano_response = authed_client.post("/api/goals", data=json.dumps({
            "name": "Nano 1",
            "type": "NanoGoal",
            "parent_id": micro_data['id']
        }))
        assert nano_response.status_code == 201
        
        # This endpoint uses the custom route I added
        response = authed_client.get(f"/api/fractal/{root.id}/sessions/{session.id}/micro-goals")
        assert response.status_code == 200
        data = json.loads(response.data)
        
        assert len(data) == 1
        assert data[0]['name'] == "Micro 1"
        assert len(data[0].get('children', [])) == 1
        assert data[0]['children'][0]['name'] == "Nano 1"
