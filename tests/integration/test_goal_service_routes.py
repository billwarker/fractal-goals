import json

import pytest

from models import Goal


@pytest.mark.integration
class TestGoalServiceBackedRoutes:
    def test_global_create_goal_still_creates_child_goal(self, authed_client, db_session, sample_ultimate_goal):
        response = authed_client.post(
            "/api/goals",
            data=json.dumps({
                "name": "Service Global Goal",
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "deadline": "2026-04-01",
            }),
            content_type="application/json",
        )

        assert response.status_code == 201
        payload = response.get_json()
        assert payload["name"] == "Service Global Goal"

        created = db_session.query(Goal).filter_by(id=payload["id"]).first()
        assert created is not None
        assert created.root_id == sample_ultimate_goal.id
        assert created.parent_id == sample_ultimate_goal.id

    def test_fractal_goal_crud_round_trip_uses_service_backed_routes(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
    ):
        create_response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/goals",
            data=json.dumps({
                "name": "Service Fractal Goal",
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "description": "Initial description",
                "deadline": "2026-05-01",
                "track_activities": True,
            }),
            content_type="application/json",
        )

        assert create_response.status_code == 201
        created_payload = create_response.get_json()
        goal_id = created_payload["id"]

        update_response = authed_client.put(
            f"/api/{sample_ultimate_goal.id}/goals/{goal_id}",
            data=json.dumps({
                "name": "Updated Service Fractal Goal",
                "description": "Updated description",
                "deadline": "2026-06-15T00:00:00.000Z",
                "track_activities": False,
            }),
            content_type="application/json",
        )

        assert update_response.status_code == 200
        updated_payload = update_response.get_json()
        assert updated_payload["name"] == "Updated Service Fractal Goal"
        assert updated_payload["description"] == "Updated description"

        db_session.expire_all()
        updated_goal = db_session.query(Goal).filter_by(id=goal_id).first()
        assert updated_goal is not None
        assert updated_goal.track_activities is False

        get_response = authed_client.get(f"/api/{sample_ultimate_goal.id}/goals/{goal_id}")
        assert get_response.status_code == 200
        assert get_response.get_json()["name"] == "Updated Service Fractal Goal"

        delete_response = authed_client.delete(f"/api/{sample_ultimate_goal.id}/goals/{goal_id}")
        assert delete_response.status_code == 200

        missing_response = authed_client.get(f"/api/{sample_ultimate_goal.id}/goals/{goal_id}")
        assert missing_response.status_code == 404
