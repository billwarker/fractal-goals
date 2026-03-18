import json
import uuid
import pytest

from models import Goal, Note, Session, SessionTemplate


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

    def test_create_nano_goal_note_is_atomic(self, authed_client, db_session, sample_goal_hierarchy, sample_activity_instance):
        root = sample_goal_hierarchy['ultimate']
        session_id = sample_activity_instance.session_id

        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=root.owner_id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id,
        )
        db_session.add(immediate)
        db_session.commit()

        micro_response = authed_client.post(f"/api/{root.id}/goals", json={
            "name": "Linked Micro",
            "type": "MicroGoal",
            "parent_id": immediate.id,
            "session_id": session_id,
        })
        assert micro_response.status_code == 201
        micro_id = micro_response.get_json()["id"]

        response = authed_client.post(
            f"/api/{root.id}/nano-goal-notes",
            data=json.dumps({
                "name": "Do one strict rep",
                "parent_id": micro_id,
                "session_id": session_id,
                "activity_instance_id": sample_activity_instance.id,
                "activity_definition_id": sample_activity_instance.activity_definition_id,
            }),
            content_type='application/json'
        )

        assert response.status_code == 201
        payload = response.get_json()
        assert payload["goal"]["name"] == "Do one strict rep"
        assert payload["goal"]["attributes"]["type"] == "NanoGoal"
        assert payload["note"]["nano_goal_id"] == payload["goal"]["id"]
        assert payload["note"]["activity_instance_id"] == sample_activity_instance.id

        created_note = db_session.query(Note).filter_by(id=payload["note"]["id"]).first()
        assert created_note is not None
        assert created_note.nano_goal_id == payload["goal"]["id"]

    def test_create_nano_goal_note_rolls_back_on_invalid_activity_instance(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
        sample_activity_instance,
    ):
        root = sample_goal_hierarchy['ultimate']
        session_id = sample_activity_instance.session_id

        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=root.owner_id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id,
        )
        db_session.add(immediate)
        db_session.commit()

        micro_response = authed_client.post(f"/api/{root.id}/goals", json={
            "name": "Linked Micro",
            "type": "MicroGoal",
            "parent_id": immediate.id,
            "session_id": session_id,
        })
        assert micro_response.status_code == 201
        micro_id = micro_response.get_json()["id"]

        response = authed_client.post(
            f"/api/{root.id}/nano-goal-notes",
            data=json.dumps({
                "name": "Should Roll Back",
                "parent_id": micro_id,
                "session_id": session_id,
                "activity_instance_id": str(uuid.uuid4()),
                "activity_definition_id": sample_activity_instance.activity_definition_id,
            }),
            content_type='application/json'
        )

        assert response.status_code == 400
        assert "Activity instance not found" in response.get_json().get("error", "")

    def test_create_note_rejects_quick_session(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
        root_id = sample_ultimate_goal.id
        quick_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name='Quick Template',
            root_id=root_id,
            template_data=json.dumps({
                'session_type': 'quick',
                'activities': [{'activity_id': sample_activity_definition.id}],
            }),
        )
        db_session.add(quick_template)
        db_session.commit()

        create_response = authed_client.post(
            f'/api/{root_id}/sessions',
            json={
                'name': 'Quick Session',
                'template_id': quick_template.id,
            }
        )
        assert create_response.status_code == 201
        session = create_response.get_json()

        response = authed_client.post(
            f'/api/{root_id}/notes',
            json={
                'content': 'Should fail',
                'context_type': 'session',
                'context_id': session['id'],
                'session_id': session['id'],
            }
        )

        assert response.status_code == 400
        assert 'Quick sessions do not support notes' in response.get_json()['error']

        db_session.expire_all()
        rolled_back_goal = db_session.query(Goal).filter_by(name="Should Roll Back").first()
        assert rolled_back_goal is None
