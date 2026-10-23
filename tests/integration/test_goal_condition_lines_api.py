"""GET /goals/conditions: goals on one activity, for analytics reference lines."""
import pytest

from tests.integration.test_goal_conditions_api import _create_goal, _threshold


@pytest.mark.integration
def test_lists_live_goals_on_the_activity_open_first(authed_client, sample_ultimate_goal, sample_activity_definition):
    root = sample_ultimate_goal.id
    activity = sample_activity_definition
    done = _create_goal(authed_client, root, root, _threshold(activity, weight=200), name="Lift 200")["id"]
    authed_client.patch(f"/api/{root}/goals/{done}/complete", json={"completed": True})
    _create_goal(authed_client, root, root, _threshold(activity, weight=245, reps=5), name="Lift 245")
    deleted = _create_goal(authed_client, root, root, _threshold(activity, weight=300), name="Gone")["id"]
    authed_client.delete(f"/api/{root}/goals/{deleted}")
    _create_goal(authed_client, root, root, name="No condition")

    response = authed_client.get(f"/api/{root}/goals/conditions", query_string={"activity_id": activity.id})

    assert response.status_code == 200, response.get_json()
    goals = response.get_json()["goals"]
    assert [(goal["goal_name"], goal["completed"]) for goal in goals] == [("Lift 245", False), ("Lift 200", True)]
    assert [rule["value"] for rule in goals[0]["condition"]["rules"]] == [245, 5]


@pytest.mark.integration
def test_needs_an_activity_and_an_owned_fractal(client, authed_client, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    assert authed_client.get(f"/api/{root}/goals/conditions").status_code == 400
    assert authed_client.get("/api/not-a-root/goals/conditions", query_string={"activity_id": "x"}).status_code == 404


@pytest.mark.integration
def test_reads_in_constant_queries(authed_client, sample_ultimate_goal, sample_activity_definition, query_counter):
    root = sample_ultimate_goal.id
    activity = sample_activity_definition

    def queries():
        query_counter["total"] = 0
        authed_client.get(f"/api/{root}/goals/conditions", query_string={"activity_id": activity.id})
        return query_counter["total"]

    _create_goal(authed_client, root, root, _threshold(activity, weight=200, reps=5))
    one = queries()
    for weight in (210, 220, 230, 240):
        _create_goal(authed_client, root, root, _threshold(activity, weight=weight, reps=5))
    assert queries() == one
