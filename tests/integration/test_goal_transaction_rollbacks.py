import uuid

import pytest

from blueprints import goals_api
from models import Goal, Target


def _failing_sync_targets(*args, **kwargs):
    raise RuntimeError("target sync exploded")


@pytest.mark.integration
class TestGoalTransactionRollbacks:
    def test_global_create_goal_rolls_back_when_target_sync_fails(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        monkeypatch,
    ):
        monkeypatch.setattr(goals_api, "_sync_targets", _failing_sync_targets)
        goal_name = f"Rollback Global {uuid.uuid4()}"

        response = authed_client.post(
            "/api/goals",
            json={
                "name": goal_name,
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "root_id": sample_ultimate_goal.id,
                "targets": [
                    {
                        "name": "Rollback Target",
                        "type": "boolean",
                        "metrics": [],
                    }
                ],
            },
        )

        assert response.status_code == 500

        db_session.expire_all()
        assert db_session.query(Goal).filter_by(name=goal_name).count() == 0
        assert db_session.query(Target).filter_by(name="Rollback Target").count() == 0

    def test_fractal_create_goal_rolls_back_when_target_sync_fails(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        monkeypatch,
    ):
        monkeypatch.setattr(goals_api, "_sync_targets", _failing_sync_targets)
        goal_name = f"Rollback Fractal {uuid.uuid4()}"

        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/goals",
            json={
                "name": goal_name,
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "targets": [
                    {
                        "name": "Rollback Target",
                        "type": "boolean",
                        "metrics": [],
                    }
                ],
            },
        )

        assert response.status_code == 500

        db_session.expire_all()
        assert db_session.query(Goal).filter_by(name=goal_name).count() == 0
        assert db_session.query(Target).filter_by(name="Rollback Target").count() == 0
