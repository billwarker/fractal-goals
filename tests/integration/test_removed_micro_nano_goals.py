import json
import uuid

import pytest

from models import Goal, Session, session_goals


@pytest.mark.integration
class TestRemovedMicroNanoGoals:
    def test_micro_and_nano_goal_creation_are_rejected(
        self,
        authed_client,
        db_session,
        test_user,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            owner_id=test_user.id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id,
        )
        db_session.add(immediate)
        db_session.commit()

        for removed_type, parent_id in [
            ("MicroGoal", immediate.id),
            ("NanoGoal", immediate.id),
        ]:
            response = authed_client.post("/api/goals", json={
                "name": removed_type,
                "type": removed_type,
                "parent_id": parent_id,
            })

            assert response.status_code in (400, 422)
            payload = response.get_json()
            messages = [error.get("message", "") for error in payload.get("details", [])]
            assert payload.get("error") == "Validation failed" or payload.get("error") == "Invalid goal type"
            assert any("Invalid goal type" in message for message in messages) or payload.get("error") == "Invalid goal type"

    def test_removed_session_micro_goals_endpoint_returns_not_found(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        session = Session(
            id=str(uuid.uuid4()),
            name="Test Session",
            root_id=root.id,
        )
        db_session.add(session)
        db_session.commit()

        response = authed_client.get(f"/api/fractal/{root.id}/sessions/{session.id}/micro-goals")

        assert response.status_code == 404

    def test_session_goals_view_has_no_micro_goals_bucket(
        self,
        authed_client,
        db_session,
        sample_goal_hierarchy,
    ):
        root = sample_goal_hierarchy['ultimate']
        immediate = Goal(
            id=str(uuid.uuid4()),
            name="Immediate 1",
            owner_id=root.owner_id,
            parent_id=sample_goal_hierarchy['short_term'].id,
            root_id=root.id,
        )
        session = Session(
            id=str(uuid.uuid4()),
            name="Session View Test",
            root_id=root.id,
        )
        db_session.add_all([immediate, session])
        db_session.flush()
        db_session.execute(session_goals.insert().values(
            session_id=session.id,
            goal_id=immediate.id,
            goal_type='ImmediateGoal',
            association_source='manual',
        ))
        db_session.commit()

        response = authed_client.get(f"/api/fractal/{root.id}/sessions/{session.id}/goals-view")

        assert response.status_code == 200
        data = json.loads(response.data)
        assert "micro_goals" not in data
        assert immediate.id in data['session_goal_ids']
        assert data['session_goal_sources'][immediate.id] == 'manual'
        assert data['goal_tree']['id'] == root.id
