import uuid

import pytest

from models import Goal, GoalLevel


@pytest.mark.integration
class TestGoalLevelsApi:
    def test_get_goal_levels_returns_system_and_user_overrides(self, authed_client, db_session, test_user):
        system_level = GoalLevel(
            id=str(uuid.uuid4()),
            name="Short Term Goal",
            rank=3,
            owner_id=None,
            color="#111111",
        )
        user_level = GoalLevel(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            rank=4,
            owner_id=test_user.id,
            root_id=None,
            color="#222222",
        )
        db_session.add_all([system_level, user_level])
        db_session.commit()

        response = authed_client.get("/api/goal-levels")

        assert response.status_code == 200
        payload = response.get_json()
        assert [level["name"] for level in payload] == ["Short Term Goal", "Immediate Goal"]

    def test_update_system_goal_level_creates_user_owned_clone(self, authed_client, db_session, test_user):
        system_level = GoalLevel(
            id=str(uuid.uuid4()),
            name="Immediate Goal",
            rank=4,
            owner_id=None,
            color="#123456",
            allow_manual_completion=True,
        )
        db_session.add(system_level)
        db_session.commit()

        response = authed_client.put(
            f"/api/goal-levels/{system_level.id}",
            json={"color": "#abcdef"},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload["id"] != system_level.id
        assert payload["owner_id"] == test_user.id
        assert payload["color"] == "#abcdef"

    def test_reset_goal_level_remaps_goals_to_system_default(self, authed_client, db_session, test_user):
        system_level = GoalLevel(
            id=str(uuid.uuid4()),
            name="Long Term Goal",
            rank=2,
            owner_id=None,
            color="#111111",
        )
        custom_level = GoalLevel(
            id=str(uuid.uuid4()),
            name="Long Term Goal",
            rank=2,
            owner_id=test_user.id,
            root_id=None,
            color="#222222",
        )
        db_session.add_all([system_level, custom_level])
        db_session.flush()

        goal = Goal(
            id=str(uuid.uuid4()),
            name="Custom Goal",
            owner_id=test_user.id,
            level_id=custom_level.id,
            root_id=None,
        )
        goal.root_id = goal.id
        db_session.add(goal)
        db_session.commit()

        response = authed_client.delete(f"/api/goal-levels/{custom_level.id}")

        assert response.status_code == 200
        db_session.refresh(goal)
        db_session.refresh(custom_level)
        assert goal.level_id == system_level.id
        assert custom_level.deleted_at is not None
