import json
import uuid
import pytest

from models import Goal, Session


@pytest.mark.integration
class TestNotesApiNanoValidation:
    def test_create_note_rejects_non_nano_goal_id(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        root = sample_goal_hierarchy['ultimate']
        non_nano_goal_id = sample_goal_hierarchy['short_term'].id

        response = authed_client.post(
            f"/api/{root.id}/notes",
            data=json.dumps({
                "content": "Invalid note link",
                "context_type": "session",
                "context_id": "ctx-1",
                "nano_goal_id": non_nano_goal_id
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        assert "NanoGoal" in response.get_json().get("error", "")

    def test_create_note_rejects_nano_goal_not_linked_to_session(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        root = sample_goal_hierarchy['ultimate']
        session = Session(
            id=str(uuid.uuid4()),
            name="Session A",
            root_id=root.id
        )
        db_session.add(session)

        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id
        )
        db_session.add(immediate)
        db_session.commit()

        micro_response = authed_client.post("/api/goals", json={
            "name": "Micro Goal",
            "type": "MicroGoal",
            "parent_id": immediate.id
        })
        assert micro_response.status_code == 201
        micro_id = micro_response.get_json()["id"]

        nano_response = authed_client.post("/api/goals", json={
            "name": "Nano Goal",
            "type": "NanoGoal",
            "parent_id": micro_id
        })
        assert nano_response.status_code == 201
        nano_id = nano_response.get_json()["id"]

        response = authed_client.post(
            f"/api/{root.id}/notes",
            data=json.dumps({
                "content": "Nano note",
                "context_type": "activity_instance",
                "context_id": "instance-1",
                "session_id": session.id,
                "nano_goal_id": nano_id
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        assert "not linked to the provided session" in response.get_json().get("error", "")

    def test_create_note_accepts_session_linked_nano_goal(self, authed_client, db_session, test_user, sample_goal_hierarchy):
        root = sample_goal_hierarchy['ultimate']
        session = Session(
            id=str(uuid.uuid4()),
            name="Session B",
            root_id=root.id
        )
        db_session.add(session)

        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id
        )
        db_session.add(immediate)
        db_session.commit()

        micro_response = authed_client.post("/api/goals", json={
            "name": "Linked Micro",
            "type": "MicroGoal",
            "parent_id": immediate.id,
            "session_id": session.id
        })
        assert micro_response.status_code == 201
        micro_id = micro_response.get_json()["id"]

        nano_response = authed_client.post("/api/goals", json={
            "name": "Linked Nano",
            "type": "NanoGoal",
            "parent_id": micro_id
        })
        assert nano_response.status_code == 201
        nano_id = nano_response.get_json()["id"]

        response = authed_client.post(
            f"/api/{root.id}/notes",
            data=json.dumps({
                "content": "Valid nano note",
                "context_type": "activity_instance",
                "context_id": "instance-1",
                "session_id": session.id,
                "nano_goal_id": nano_id
            }),
            content_type='application/json'
        )

        assert response.status_code == 201
        data = response.get_json()
        assert data["nano_goal_id"] == nano_id
        assert data["is_nano_goal"] is True
