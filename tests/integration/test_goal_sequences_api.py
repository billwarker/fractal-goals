"""Sequence tracks end to end: built on pause, advanced by completion, cleaned up by Move/Convert/Delete."""
from config import config
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models import Goal, GoalPauseInterval, GoalSequenceTrack, User
from tests.integration.test_goal_conditions_api import (
    _complete, _create_goal, _instance, _now, _session, _threshold,
)


def _goal(db_session, goal_id):
    db_session.expire_all()
    return db_session.get(Goal, goal_id)


def _siblings(client, root_id, count=3, *, parent_id=None, type_='ShortTermGoal', **fields):
    parent_id = parent_id or root_id
    return [_create_goal(client, root_id, parent_id, name=f"Step {index + 1}", type=type_, **fields)['id']
            for index in range(count)]


def _track(client, root_id, goal_ids, parent_id=None):
    response = client.post(f"/api/{root_id}/sequence-tracks", json={
        "parent_goal_id": parent_id or root_id, "goal_ids": goal_ids,
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _state(db_session, goal_ids):
    db_session.expire_all()
    return [(goal.sequence_position, goal.paused, goal.completed) for goal in (db_session.get(Goal, i) for i in goal_ids)]


def _set_completed(client, root_id, goal_id, completed, **options):
    response = client.patch(f"/api/{root_id}/goals/{goal_id}/complete", json={"completed": completed, **options})
    assert response.status_code == 200, response.get_json()
    return response.get_json()


@pytest.mark.integration
class TestBuildingTracks:
    def test_later_steps_wait_paused_for_the_sequence(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        track = _track(authed_client, root, ids)

        assert track["goal_ids"] == ids
        assert _state(db_session, ids) == [(1, False, False), (2, True, False), (3, True, False)]
        payload = authed_client.get(f"/api/{root}/goals/{ids[1]}").get_json()
        assert payload["pause_reason"] == "sequence"
        assert payload["sequence_track_id"] == track["id"]
        intervals = db_session.query(GoalPauseInterval).filter_by(goal_id=ids[2]).all()
        assert [(interval.reason, interval.resumed_at) for interval in intervals] == [("sequence", None)]

    def test_completed_steps_are_skipped_and_manual_pauses_kept(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        _set_completed(authed_client, root, ids[0], True)
        authed_client.patch(f"/api/{root}/goals/{ids[1]}/pause", json={"paused": True})

        _track(authed_client, root, ids)

        # Step 2 is active but stays paused by the user; step 3 waits on the sequence.
        assert _state(db_session, ids) == [(1, False, True), (2, True, False), (3, True, False)]
        assert authed_client.get(f"/api/{root}/goals/{ids[1]}").get_json()["pause_reason"] == "manual"

    @pytest.mark.parametrize("problem", ["one_goal", "duplicate", "not_siblings", "mixed_levels", "already_sequenced"])
    def test_invalid_tracks_are_rejected(self, problem, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 2)
        if problem == "one_goal":
            goal_ids = ids[:1]
        elif problem == "duplicate":
            goal_ids = [ids[0], ids[0]]
        elif problem == "not_siblings":
            nephew = _create_goal(authed_client, root, ids[0], name="Nephew", type="ImmediateGoal")["id"]
            goal_ids = [ids[1], nephew]
        elif problem == "mixed_levels":
            goal_ids = [ids[0], _create_goal(authed_client, root, root, name="Mid", type="MidTermGoal")["id"]]
        else:
            _track(authed_client, root, ids)
            goal_ids = [ids[0], _siblings(authed_client, root, 1)[0]]

        response = authed_client.post(f"/api/{root}/sequence-tracks", json={"parent_goal_id": root, "goal_ids": goal_ids})

        assert response.status_code == 400
        if problem not in ("one_goal", "already_sequenced"):
            assert db_session.query(GoalSequenceTrack).count() == 0

    def test_another_users_fractal_is_not_reachable(self, client, authed_client, db_session, sample_ultimate_goal):
        from tests.conftest import session_headers_for
        other = User(
            id=str(uuid.uuid4()), username="sequencer", email="sequencer@example.com",
            terms_accepted_version="1.0", terms_accepted_at=datetime.now(timezone.utc),
            privacy_accepted_version=config.PRIVACY_VERSION, privacy_accepted_at=datetime.now(timezone.utc),
        )
        other.set_password("Password123")
        db_session.add(other)
        db_session.commit()
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 2)
        headers = session_headers_for(other)

        created = client.post(f"/api/{root}/sequence-tracks", json={"parent_goal_id": root, "goal_ids": ids}, headers=headers)
        track = _track(authed_client, root, ids)
        updated = client.put(f"/api/{root}/sequence-tracks/{track['id']}", json={"goal_ids": ids[::-1]}, headers=headers)
        read = client.get(f"/api/{root}/goals/{ids[0]}/sequence", headers=headers)

        assert (created.status_code, updated.status_code, read.status_code) == (404, 404, 404)
        assert _state(db_session, ids) == [(1, False, False), (2, True, False)]

    def test_same_level_goals_under_different_parents_cannot_be_sequenced(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parents = [_create_goal(authed_client, root, root, name=name, type="LongTermGoal")["id"] for name in ("A", "B")]
        cousins = [_siblings(authed_client, root, 1, parent_id=parent, type_="MidTermGoal")[0] for parent in parents]

        responses = [
            authed_client.post(f"/api/{root}/sequence-tracks", json={"parent_goal_id": parent, "goal_ids": cousins})
            for parent in parents
        ]

        assert [response.status_code for response in responses] == [400, 400]
        assert "sibling" in responses[0].get_json()["error"]
        assert db_session.query(GoalSequenceTrack).count() == 0

    def test_siblings_cannot_be_sequenced_under_another_parent(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent, other = [_create_goal(authed_client, root, root, name=name, type="LongTermGoal")["id"] for name in ("A", "B")]
        ids = _siblings(authed_client, root, 2, parent_id=parent, type_="MidTermGoal")

        response = authed_client.post(f"/api/{root}/sequence-tracks", json={"parent_goal_id": other, "goal_ids": ids})

        assert response.status_code == 400
        assert db_session.query(GoalSequenceTrack).count() == 0


@pytest.mark.integration
class TestEditingTracks:
    def test_reordering_moves_the_active_step(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        track = _track(authed_client, root, ids)

        response = authed_client.put(f"/api/{root}/sequence-tracks/{track['id']}", json={"goal_ids": [ids[2], ids[0], ids[1]]})

        assert response.status_code == 200
        assert response.get_json()["goal_ids"] == [ids[2], ids[0], ids[1]]
        # The new first step resumes; the old first step now waits.
        assert _state(db_session, [ids[2], ids[0], ids[1]]) == [(1, False, False), (2, True, False), (3, True, False)]

    def test_removing_and_adding_steps(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 4)
        track = _track(authed_client, root, ids[:3])

        response = authed_client.put(f"/api/{root}/sequence-tracks/{track['id']}", json={"goal_ids": [ids[0], ids[3], ids[2]]})

        assert response.status_code == 200
        removed = _goal(db_session, ids[1])
        assert (removed.sequence_track_id, removed.paused) == (None, False)
        assert _state(db_session, [ids[0], ids[3], ids[2]]) == [(1, False, False), (2, True, False), (3, True, False)]

    def test_a_cousin_cannot_be_added_to_a_track(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent, other = [_create_goal(authed_client, root, root, name=name, type="LongTermGoal")["id"] for name in ("A", "B")]
        ids = _siblings(authed_client, root, 2, parent_id=parent, type_="MidTermGoal")
        cousin = _siblings(authed_client, root, 1, parent_id=other, type_="MidTermGoal")[0]
        track = _track(authed_client, root, ids, parent)

        response = authed_client.put(f"/api/{root}/sequence-tracks/{track['id']}", json={"goal_ids": [*ids, cousin]})

        assert response.status_code == 400
        assert _goal(db_session, cousin).sequence_track_id is None
        assert _state(db_session, ids) == [(1, False, False), (2, True, False)]

    def test_dissolving_resumes_every_held_step(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        track = _track(authed_client, root, ids)

        response = authed_client.delete(f"/api/{root}/sequence-tracks/{track['id']}")

        assert response.status_code == 200 and response.get_json()["dissolved"] is True
        assert _state(db_session, ids) == [(None, False, False)] * 3
        assert db_session.get(GoalSequenceTrack, track["id"]).deleted_at is not None


@pytest.mark.integration
class TestAdvancing:
    def test_completing_a_step_begins_the_next_and_uncompleting_pauses_it_again(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        _track(authed_client, root, ids)

        before = authed_client.get(f"/api/{root}/goals/{ids[0]}/sequence").get_json()
        assert before["next_step"] == {"id": ids[1], "name": "Step 2"}
        _set_completed(authed_client, root, ids[0], True)

        assert _state(db_session, ids) == [(1, False, True), (2, False, False), (3, True, False)]
        resumed = db_session.query(GoalPauseInterval).filter_by(goal_id=ids[1]).one()
        assert resumed.resumed_by_goal_id == ids[0]
        after = authed_client.get(f"/api/{root}/goals/{ids[0]}/sequence").get_json()
        assert after["next_step_begun_by_this"] == {"id": ids[1], "name": "Step 2"}

        _set_completed(authed_client, root, ids[0], False)

        assert _state(db_session, ids) == [(1, False, False), (2, True, False), (3, True, False)]
        assert authed_client.get(f"/api/{root}/goals/{ids[1]}").get_json()["pause_reason"] == "sequence"

    def test_the_user_can_decline_either_step(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 2)
        _track(authed_client, root, ids)

        _set_completed(authed_client, root, ids[0], True, begin_next=False)
        assert _state(db_session, ids) == [(1, False, True), (2, True, False)]

        _set_completed(authed_client, root, ids[0], False)
        _set_completed(authed_client, root, ids[0], True)
        _set_completed(authed_client, root, ids[0], False, pause_next=False)
        assert _state(db_session, ids) == [(1, False, False), (2, False, False)]

    def test_uncompleting_leaves_a_step_alone_once_the_user_has_paused_it(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 2)
        _track(authed_client, root, ids)
        _set_completed(authed_client, root, ids[0], True)
        authed_client.patch(f"/api/{root}/goals/{ids[1]}/pause", json={"paused": True})
        authed_client.patch(f"/api/{root}/goals/{ids[1]}/pause", json={"paused": False})

        _set_completed(authed_client, root, ids[0], False)

        assert _state(db_session, ids) == [(1, False, False), (2, False, False)]

    def test_manual_resume_out_of_order_and_pausing_the_active_step(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        _track(authed_client, root, ids)

        authed_client.patch(f"/api/{root}/goals/{ids[2]}/pause", json={"paused": False})
        authed_client.patch(f"/api/{root}/goals/{ids[0]}/pause", json={"paused": True})

        assert _state(db_session, ids) == [(1, True, False), (2, True, False), (3, False, False)]
        assert authed_client.get(f"/api/{root}/goals/{ids[0]}").get_json()["pause_reason"] == "manual"

    def test_meeting_a_condition_begins_the_next_step_and_losing_it_pauses_it_again(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal.id
        first = _create_goal(authed_client, root, root, _threshold(sample_activity_definition), name="Lift 225")["id"]
        second = _siblings(authed_client, root, 1)[0]
        _track(authed_client, root, [first, second])
        session = _session(db_session, sample_ultimate_goal, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1))

        _complete(authed_client, root, instance)
        assert _state(db_session, [first, second]) == [(1, False, True), (2, False, False)]

        assert authed_client.delete(f"/api/{root}/sessions/{session.id}/activities/{instance.id}").status_code == 200
        assert _state(db_session, [first, second]) == [(1, False, False), (2, True, False)]

    def test_undoing_an_automatic_begin_holds_the_step_and_keeps_the_completion(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal.id
        first = _create_goal(authed_client, root, root, _threshold(sample_activity_definition), name="Lift 225")["id"]
        second = _siblings(authed_client, root, 1)[0]
        _track(authed_client, root, [first, second])
        session = _session(db_session, sample_ultimate_goal, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root, instance)
        assert authed_client.get(f"/api/{root}/goals/{second}").get_json()["sequence_begun_by"] == first

        response = authed_client.post(f"/api/{root}/goals/{second}/sequence-hold")

        assert response.status_code == 200, response.get_json()
        assert _state(db_session, [first, second]) == [(1, False, True), (2, True, False)]
        payload = authed_client.get(f"/api/{root}/goals/{second}").get_json()
        assert (payload["pause_reason"], payload["sequence_begun_by"]) == ("sequence", None)
        # Holding twice, or un-completing the first step afterwards, changes nothing more.
        assert authed_client.post(f"/api/{root}/goals/{second}/sequence-hold").status_code == 409
        _set_completed(authed_client, root, first, False)
        assert _state(db_session, [first, second]) == [(1, False, False), (2, True, False)]

    def test_only_a_step_its_sequence_began_can_be_held(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 3)
        _track(authed_client, root, ids)
        # The first step was never held; the third was begun by hand, out of order.
        authed_client.patch(f"/api/{root}/goals/{ids[2]}/pause", json={"paused": False})
        loose = _siblings(authed_client, root, 1)[0]

        statuses = [authed_client.post(f"/api/{root}/goals/{goal}/sequence-hold").status_code
                    for goal in (ids[0], ids[2], loose, "missing")]

        assert statuses == [409, 409, 409, 404]
        assert _state(db_session, ids) == [(1, False, False), (2, True, False), (3, False, False)]

    def test_a_resumed_step_already_meeting_its_condition_completes(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal.id
        first = _siblings(authed_client, root, 1)[0]
        second = _create_goal(authed_client, root, root, _threshold(sample_activity_definition), name="Lift 225")["id"]
        session = _session(db_session, sample_ultimate_goal, started=_now() + timedelta(minutes=1))
        _complete(authed_client, root, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1)))
        _set_completed(authed_client, root, second, False)  # leave it open; the decline is older than new evidence
        _goal(db_session, second).manually_uncompleted_at = None
        db_session.commit()
        _track(authed_client, root, [first, second])

        _set_completed(authed_client, root, first, True)

        assert _goal(db_session, second).completed is True

    def test_a_parent_completed_by_its_children_begins_its_next_sibling(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parents = _siblings(authed_client, root, 2, type_='MidTermGoal', completion_condition='children')
        child = _create_goal(authed_client, root, parents[0], name="Only child", type="ShortTermGoal")["id"]
        _track(authed_client, root, parents)

        _set_completed(authed_client, root, child, True)

        assert _state(db_session, parents) == [(1, False, True), (2, False, False)]


@pytest.mark.integration
class TestGoalOptions:
    def _two_parents(self, client, root):
        return [_create_goal(client, root, root, name=name, type="LongTermGoal")["id"] for name in ("Here", "Elsewhere")]

    def test_moving_a_step_out_resumes_it_and_dissolves_a_two_step_track(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent, new_parent = self._two_parents(authed_client, root)
        ids = _siblings(authed_client, root, 2, parent_id=parent, type_='MidTermGoal')
        track = _track(authed_client, root, ids, parent)

        response = authed_client.patch(f"/api/{root}/goals/{ids[1]}/move", json={"new_parent_id": new_parent})

        assert response.status_code == 200
        assert _state(db_session, ids) == [(None, False, False), (None, False, False)]
        assert db_session.get(GoalSequenceTrack, track["id"]).deleted_at is not None

    def test_moving_the_active_step_begins_the_next(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent, new_parent = self._two_parents(authed_client, root)
        ids = _siblings(authed_client, root, 3, parent_id=parent, type_='MidTermGoal')
        _track(authed_client, root, ids, parent)

        response = authed_client.patch(f"/api/{root}/goals/{ids[0]}/move", json={"new_parent_id": new_parent})

        assert response.status_code == 200, response.get_json()

        assert _state(db_session, ids) == [(None, False, False), (1, False, False), (2, True, False)]

    def test_reparenting_through_a_goal_update_leaves_the_track(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        parent, new_parent = self._two_parents(authed_client, root)
        ids = _siblings(authed_client, root, 3, parent_id=parent, type_='MidTermGoal')
        _track(authed_client, root, ids, parent)

        response = authed_client.put(f"/api/{root}/goals/{ids[1]}", json={"parent_id": new_parent})

        assert response.status_code == 200, response.get_json()
        moved = _goal(db_session, ids[1])
        assert (moved.parent_id, moved.sequence_track_id) == (new_parent, None)
        assert _state(db_session, [ids[0], ids[1], ids[2]]) == [(1, False, False), (None, False, False), (2, True, False)]

    def test_converting_a_level_leaves_the_track(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 3, type_='MidTermGoal')
        _track(authed_client, root, ids)
        short_term = _goal(db_session, _siblings(authed_client, root, 1)[0]).level_id

        response = authed_client.patch(f"/api/{root}/goals/{ids[2]}/convert-level", json={"level_id": short_term})

        assert response.status_code == 200, response.get_json()
        assert _state(db_session, ids) == [(1, False, False), (2, True, False), (None, False, False)]

    @pytest.mark.parametrize("begin_next, expected_paused", [(None, False), ("false", True)])
    def test_deleting_the_active_step_begins_the_next_unless_declined(
        self, begin_next, expected_paused, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root)
        _track(authed_client, root, ids)
        query = f"?begin_next={begin_next}" if begin_next else ""

        assert authed_client.delete(f"/api/{root}/goals/{ids[0]}{query}").status_code == 200

        assert _state(db_session, ids[1:]) == [(1, expected_paused, False), (2, True, False)]

    def test_a_copy_never_joins_the_track(self, authed_client, db_session, sample_ultimate_goal):
        root = sample_ultimate_goal.id
        ids = _siblings(authed_client, root, 2)
        _track(authed_client, root, ids)

        response = authed_client.post(f"/api/{root}/goals/{ids[1]}/copy")

        assert response.status_code == 201, response.get_json()
        copy = _goal(db_session, response.get_json()["id"])
        assert (copy.sequence_track_id, copy.sequence_position, copy.paused) == (None, None, False)


@pytest.mark.integration
def test_deleting_a_track_row_releases_its_goals(authed_client, db_session, sample_ultimate_goal):
    """A cascade (e.g. a fractal's hard delete) may remove a track row; its goals must not block it."""
    root = sample_ultimate_goal.id
    ids = _siblings(authed_client, root, 2)
    track = _track(authed_client, root, ids)

    db_session.query(GoalSequenceTrack).filter_by(id=track["id"]).delete()
    db_session.commit()

    assert [_goal(db_session, goal_id).sequence_track_id for goal_id in ids] == [None, None]
