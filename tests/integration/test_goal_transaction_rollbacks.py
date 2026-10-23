import uuid

import pytest

from models import Goal, GoalCompletionCondition


def _failing_write_condition(*args, **kwargs):
    raise RuntimeError("condition write exploded")


def _condition_payload(activity):
    weight = next(metric for metric in activity.metric_definitions if metric.name == "Weight")
    return {
        "activity_definition_id": activity.id,
        "kind": "single_session",
        "measure": "sets",
        "min_sets": 1,
        "rules": [{"metric_definition_id": weight.id, "operator": ">=", "value": 225}],
    }


@pytest.mark.integration
class TestGoalTransactionRollbacks:
    @pytest.mark.parametrize("path", ["global", "fractal"])
    def test_create_goal_rolls_back_when_condition_write_fails(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition, monkeypatch, path,
    ):
        import services._goal_helpers as goal_helpers
        monkeypatch.setattr(goal_helpers, "write_condition", _failing_write_condition)
        goal_name = f"Rollback {path} {uuid.uuid4()}"
        payload = {
            "name": goal_name,
            "type": "LongTermGoal",
            "parent_id": sample_ultimate_goal.id,
            "completion_condition": "activity_threshold",
            "condition": _condition_payload(sample_activity_definition),
        }
        url = "/api/goals" if path == "global" else f"/api/{sample_ultimate_goal.id}/goals"

        response = authed_client.post(url, json=payload)

        assert response.status_code == 500
        db_session.expire_all()
        assert db_session.query(Goal).filter_by(name=goal_name).count() == 0
        assert db_session.query(GoalCompletionCondition).count() == 0

    def test_invalid_condition_is_rejected_before_any_goal_is_written(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        goal_name = f"Invalid {uuid.uuid4()}"
        condition = _condition_payload(sample_activity_definition)
        condition["rules"] = []

        response = authed_client.post(f"/api/{sample_ultimate_goal.id}/goals", json={
            "name": goal_name, "type": "LongTermGoal", "parent_id": sample_ultimate_goal.id,
            "completion_condition": "activity_threshold", "condition": condition,
        })

        assert response.status_code == 400
        assert response.get_json() == {"error": "Add at least one metric rule", "field": "condition"}
        db_session.expire_all()
        assert db_session.query(Goal).filter_by(name=goal_name).count() == 0
