"""Goal reviews end to end: level cadence, goal overrides, goal_review notes, deferral, and SMART's R (reviewed)."""
from datetime import datetime, timedelta, timezone

import pytest

from models import Goal, GoalLevel
from tests.integration.test_goal_conditions_api import _create_goal


def _vision_goal(client, db_session, root, *, value=3, unit='months', started_days_ago=100):
    goal = _create_goal(client, root, root, name="Play in a band", type="LongTermGoal")
    record = db_session.get(Goal, goal["id"])
    level = db_session.get(GoalLevel, record.level_id)
    level.uses_reviews, level.review_cadence_value, level.review_cadence_unit = True, value, unit
    record.started_at = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(days=started_days_ago)
    db_session.commit()
    return goal["id"]


def _review(client, root, goal_id):
    return client.get(f"/api/{root}/goals/{goal_id}").get_json()["review"]


def _write_review(client, root, goal_id):
    return client.post(f"/api/{root}/notes", json={
        "content": "Quarter in review", "context_type": "goal", "context_id": goal_id, "goal_id": goal_id,
        "note_kind": "goal_review",
    })


@pytest.mark.integration
class TestReviews:
    def test_a_review_comes_due_and_writing_one_restarts_the_cadence(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal_id = _vision_goal(authed_client, db_session, root)

        assert _review(authed_client, root, goal_id)["status"] == "due"
        response = _write_review(authed_client, root, goal_id)
        assert response.status_code == 201, response.get_json()
        assert response.get_json()["note_type"] == "goal_review_note"

        review = _review(authed_client, root, goal_id)
        today = datetime.now(timezone.utc).date()
        assert (review["status"], review["last_review_on"]) == ("upcoming", today.isoformat())
        assert review["next_review_on"] > today.isoformat()

    def test_the_goal_tree_carries_review_state_in_constant_queries(
        self, authed_client, db_session, sample_ultimate_goal, query_counter,
    ):
        root = sample_ultimate_goal.id

        def reviewed_goal():
            goal_id = _vision_goal(authed_client, db_session, root)
            _write_review(authed_client, root, goal_id)
            return goal_id

        def tree_queries():
            query_counter["total"] = 0
            tree = authed_client.get(f"/api/{root}/goals").get_json()
            return query_counter["total"], tree

        first = reviewed_goal()
        one_goal, tree = tree_queries()
        for _ in range(4):
            reviewed_goal()
        five_goals, _ = tree_queries()

        node = next(child for child in tree["children"] if child["id"] == first)
        assert node["review"]["status"] == "upcoming"
        assert five_goals == one_goal

    def test_deferring_pushes_the_review_one_period_and_a_new_review_clears_it(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal.id
        goal_id = _vision_goal(authed_client, db_session, root)

        response = authed_client.post(f"/api/{root}/goals/{goal_id}/review/defer")

        assert response.status_code == 200, response.get_json()
        review = response.get_json()["review"]
        assert review["status"] == "upcoming" and review["deferred_until"] == review["next_review_on"]
        _write_review(authed_client, root, goal_id)
        db_session.expire_all()
        assert db_session.get(Goal, goal_id).review_deferred_until is None

    def test_a_goal_cadence_overrides_the_level_and_reviews_can_be_turned_off(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal.id
        goal_id = _vision_goal(authed_client, db_session, root)

        response = authed_client.put(f"/api/{root}/goals/{goal_id}", json={
            "review_cadence_value": 6, "review_cadence_unit": "months",
        })
        assert response.status_code == 200, response.get_json()
        assert _review(authed_client, root, goal_id)["cadence"] == {"value": 6, "unit": "months", "source": "goal"}

        authed_client.put(f"/api/{root}/goals/{goal_id}", json={"review_cadence_value": None, "review_cadence_unit": None})
        assert _review(authed_client, root, goal_id)["cadence"]["source"] == "level"

        authed_client.put(f"/api/{root}/goals/{goal_id}", json={"review_disabled": True})
        assert _review(authed_client, root, goal_id)["status"] == "off"
        assert authed_client.post(f"/api/{root}/goals/{goal_id}/review/defer").status_code == 409

    @pytest.mark.parametrize("payload", [
        {"review_cadence_value": 2},
        {"review_cadence_value": 2, "review_cadence_unit": "fortnights"},
        {"review_cadence_value": 0, "review_cadence_unit": "weeks"},
    ])
    def test_invalid_cadences_are_rejected(self, payload, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        goal_id = _vision_goal(authed_client, db_session, root)
        assert authed_client.put(f"/api/{root}/goals/{goal_id}", json=payload).status_code == 400

    def test_review_notes_belong_to_goals_and_unknown_kinds_are_rejected(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        on_root = authed_client.post(f"/api/{root}/notes", json={
            "content": "x", "context_type": "root", "context_id": root, "note_kind": "goal_review",
        })
        unknown = authed_client.post(f"/api/{root}/notes", json={
            "content": "x", "context_type": "root", "context_id": root, "note_kind": "musing",
        })
        assert (on_root.status_code, unknown.status_code) == (400, 400)


@pytest.mark.integration
def test_r_is_lost_while_a_review_is_due_and_restored_by_reviewing(authed_client, db_session, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    # Started 100 days ago on a quarterly cadence: its first review is due.
    reviewed = _vision_goal(authed_client, db_session, root)
    short = _create_goal(authed_client, root, root, name="Practice daily", type="ShortTermGoal")["id"]

    def r(goal):
        return authed_client.get(f"/api/{root}/goals/{goal}").get_json()["smart_status"]["reviewed"]

    # Levels that don't review goals count as met; a due review takes R away.
    assert [r(reviewed), r(short)] == [False, True]
    assert _write_review(authed_client, root, reviewed).status_code == 201
    assert r(reviewed) is True

    authed_client.put(f"/api/{root}/goals/{reviewed}", json={"review_disabled": True})
    assert r(reviewed) is False
    authed_client.put(f"/api/{root}/goals/{reviewed}", json={"review_disabled": False})
    level = db_session.get(GoalLevel, db_session.get(Goal, reviewed).level_id)
    level.review_cadence_value, level.review_cadence_unit = None, None
    db_session.commit()
    assert r(reviewed) is False


@pytest.mark.integration
def test_deferring_a_due_review_keeps_r(authed_client, db_session, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    goal_id = _vision_goal(authed_client, db_session, root)

    response = authed_client.post(f"/api/{root}/goals/{goal_id}/review/defer")

    assert response.get_json()["smart_status"]["reviewed"] is True


@pytest.mark.integration
def test_relevance_statements_are_retired(authed_client, db_session, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    goal = _create_goal(authed_client, root, root, name="Old client", type="LongTermGoal", relevance_statement="ignored")

    assert "relevance_statement" not in goal
    assert authed_client.put(f"/api/{root}/goals/{goal['id']}", json={"relevance_statement": "still ignored"}).status_code == 200


@pytest.mark.integration
def test_levels_expose_and_update_review_defaults(authed_client, db_session, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    level_id = db_session.get(Goal, _create_goal(authed_client, root, root, type="MidTermGoal")["id"]).level_id

    response = authed_client.put(f"/api/goal-levels/{level_id}", json={
        "uses_reviews": True, "review_cadence_value": 2, "review_cadence_unit": "weeks",
    })
    bad = authed_client.put(f"/api/goal-levels/{level_id}", json={"review_cadence_value": 2})

    assert response.status_code == 200, response.get_json()
    assert {key: response.get_json()[key] for key in ("uses_reviews", "review_cadence_value", "review_cadence_unit")} == {
        "uses_reviews": True, "review_cadence_value": 2, "review_cadence_unit": "weeks",
    }
    assert bad.status_code == 400
