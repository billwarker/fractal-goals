"""Goal completion conditions end to end: API writes, evidence reconciliation, and reads."""
from config import config
from datetime import datetime, timedelta, timezone
import uuid

import pytest

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    Goal,
    GoalCompletionCondition,
    MetricDefinition,
    MetricValue,
    Session,
    activity_goal_associations,
)

def _now():
    """Wall-clock 'now' per call: goals are stamped at creation time, so evidence is placed relative to it."""
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _metric(activity, name):
    return next(metric for metric in activity.metric_definitions if metric.name == name)


def _threshold(activity, *, weight=225, reps=None, min_sets=1):
    rules = [{"metric_definition_id": _metric(activity, "Weight").id, "operator": ">=", "value": weight}]
    if reps is not None:
        rules.append({"metric_definition_id": _metric(activity, "Reps").id, "operator": ">=", "value": reps})
    return {
        "activity_definition_id": activity.id, "kind": "single_session", "measure": "sets",
        "min_sets": min_sets, "rules": rules,
    }


def _create_goal(client, root_id, parent_id, condition=None, **fields):
    payload = {"name": fields.pop("name", f"Goal {uuid.uuid4().hex[:6]}"), "type": fields.pop("type", "ShortTermGoal"),
               "parent_id": parent_id, **fields}
    if condition is not None:
        payload.update(completion_condition="activity_threshold", condition=condition)
    response = client.post(f"/api/{root_id}/goals", json=payload)
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def _session(db_session, root, *, started=None):
    session = Session(
        id=str(uuid.uuid4()), root_id=root.id, owner_id=root.owner_id, name="Lift",
        session_start=started or _now(), created_at=started or _now(),
    )
    db_session.add(session)
    db_session.commit()
    return session


def _instance(db_session, session, activity, sets, *, occurred=None, completed=False):
    occurred = occurred or _now()
    instance = ActivityInstance(
        id=str(uuid.uuid4()), session_id=session.id, activity_definition_id=activity.id, root_id=session.root_id,
        created_at=occurred, time_start=occurred, completed=completed, data={},
    )
    db_session.add(instance)
    db_session.flush()
    for index, values in enumerate(sets):
        activity_set = ActivitySet(
            id=str(uuid.uuid4()), activity_instance_id=instance.id, sort_order=index, status="completed",
        )
        db_session.add(activity_set)
        db_session.flush()
        for name, value in values.items():
            db_session.add(MetricValue(
                id=str(uuid.uuid4()), activity_instance_id=instance.id, activity_set_id=activity_set.id,
                metric_definition_id=_metric(activity, name).id, value=value,
            ))
    db_session.commit()
    return instance


def _complete(client, root_id, instance):
    response = client.post(f"/api/{root_id}/activity-instances/{instance.id}/complete")
    assert response.status_code == 200, response.get_json()
    return response.get_json()


def _goal(db_session, goal_id):
    db_session.expire_all()
    return db_session.get(Goal, goal_id)


@pytest.mark.integration
class TestConditionWrites:
    def test_creating_a_threshold_goal_stores_it_and_associates_the_activity(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        payload = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition, weight=102.5))

        assert payload["completion_condition"] == "activity_threshold"
        assert payload["condition_pending_completion"] is False
        condition = payload["condition"]
        assert condition["activity_name"] == "Bench Press"
        assert condition["rules"] == [{
            "id": condition["rules"][0]["id"], "metric_definition_id": _metric(sample_activity_definition, "Weight").id,
            "metric_name": "Weight", "unit": "lbs", "operator": ">=", "value": 102.5,
        }]
        assert db_session.execute(activity_goal_associations.select().where(
            activity_goal_associations.c.goal_id == payload["id"],
            activity_goal_associations.c.activity_id == sample_activity_definition.id,
        )).first() is not None

    def test_a_threshold_name_is_optional_and_cleared_by_leaving_it_out(
        self, authed_client, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        condition = {**_threshold(sample_activity_definition), "name": "  Heavy   triple "}
        payload = _create_goal(authed_client, root.id, root.id, condition)
        assert payload["condition"]["name"] == "Heavy triple"

        response = authed_client.put(f"/api/{root.id}/goals/{payload['id']}/condition", json={
            "completion_condition": "activity_threshold", "condition": _threshold(sample_activity_definition),
        })
        assert response.status_code == 200, response.get_json()
        assert response.get_json()["condition"]["name"] is None

    def test_goals_default_to_manual_completion(self, authed_client, sample_ultimate_goal):
        payload = _create_goal(authed_client, sample_ultimate_goal.id, sample_ultimate_goal.id)
        assert payload["completion_condition"] == "manual"
        assert payload["condition"] is None

    @pytest.mark.parametrize("mutate,message", [
        (lambda c, other: c.update(rules=[{**c["rules"][0], "metric_definition_id": other}]),
         "Rule 1 uses a metric this activity does not track"),
        (lambda c, _: c.update(rules=c["rules"] * 2), "'Weight' appears in more than one rule"),
        (lambda c, _: c.update(min_sets=0), "Sets must be between 1 and 100"),
        (lambda c, _: c.update(kind="cumulative", measure="sets"), "'sets' is not available for a cumulative condition"),
        (lambda c, _: c.update(measure="yield", rules=[], target_value=100), "'Bench Press' has no yield (it needs two or more multiplied metrics)"),
        (lambda c, _: c.update(rules=[{**c["rules"][0], "operator": "!="}]), "Rule 1 has an unknown comparison"),
        (lambda c, _: c.update(rules=[{**c["rules"][0], "value": "heavy"}]), "'Weight' value must be a number"),
        (lambda c, _: c.update(name="x" * 121), "Name must be at most 120 characters"),
        (lambda c, _: c.update(name=7), "Name must be text"),
    ])
    def test_invalid_conditions_are_rejected(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition, mutate, message,
    ):
        other_activity = ActivityDefinition(id=str(uuid.uuid4()), root_id=sample_ultimate_goal.id, name="Row")
        db_session.add(other_activity)
        db_session.flush()
        other_metric = MetricDefinition(
            id=str(uuid.uuid4()), activity_id=other_activity.id, root_id=sample_ultimate_goal.id, name="Pace", unit="s",
        )
        db_session.add(other_metric)
        db_session.commit()
        condition = _threshold(sample_activity_definition)
        mutate(condition, other_metric.id)

        response = authed_client.post(f"/api/{sample_ultimate_goal.id}/goals", json={
            "name": "Bad", "type": "ShortTermGoal", "parent_id": sample_ultimate_goal.id,
            "completion_condition": "activity_threshold", "condition": condition,
        })

        assert response.status_code == 400
        assert response.get_json() == {"error": message, "field": "condition"}

    def test_condition_of_another_users_fractal_is_not_reachable(
        self, client, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        from tests.conftest import session_headers_for
        from models import User
        other = User(
            id=str(uuid.uuid4()), username="otheruser", email="other@example.com",
            terms_accepted_version="1.0", terms_accepted_at=datetime.now(timezone.utc),
            privacy_accepted_version=config.PRIVACY_VERSION, privacy_accepted_at=datetime.now(timezone.utc),
        )
        other.set_password("Password123")
        db_session.add(other)
        db_session.commit()
        goal = _create_goal(authed_client, sample_ultimate_goal.id, sample_ultimate_goal.id, _threshold(sample_activity_definition))

        response = client.put(
            f"/api/{sample_ultimate_goal.id}/goals/{goal['id']}/condition",
            json={"completion_condition": "manual"}, headers=session_headers_for(other),
        )
        progress = client.get(
            f"/api/{sample_ultimate_goal.id}/goals/condition-progress?goal_ids={goal['id']}",
            headers=session_headers_for(other),
        )

        assert response.status_code == 404
        assert progress.status_code == 404


@pytest.mark.integration
class TestReconciliation:
    def test_meeting_the_threshold_completes_the_goal_from_its_session(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition, reps=6, min_sets=2))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        short = _instance(db_session, session, sample_activity_definition,
                          [{"Weight": 225, "Reps": 6}, {"Weight": 225, "Reps": 5}], occurred=_now() + timedelta(minutes=1))

        assert _complete(authed_client, root.id, short)["completed_goals"] == []
        assert _goal(db_session, goal["id"]).completed is False

        enough = _instance(db_session, session, sample_activity_definition,
                           [{"Weight": 225, "Reps": 6}, {"Weight": 230, "Reps": 6}], occurred=_now() + timedelta(minutes=2))
        result = _complete(authed_client, root.id, enough)

        stored = _goal(db_session, goal["id"])
        assert result["completed_goals"] == [{"id": goal["id"], "name": goal["name"]}]
        assert stored.completed is True
        assert stored.completion_source == "condition"
        assert stored.completed_session_id == session.id

    def test_an_offline_replay_of_the_completion_completes_the_goal_once(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        """The outbox replays a keyed completion after reconnecting; the replay must not reconcile twice."""
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 230}],
                             occurred=_now() + timedelta(minutes=1))
        url = f"/api/{root.id}/activity-instances/{instance.id}/complete"
        headers = {**authed_client.headers, "Idempotency-Key": str(uuid.uuid4())}

        first = authed_client.client.post(url, headers=headers)
        completed_at = _goal(db_session, goal["id"]).completed_at
        replay = authed_client.client.post(url, headers=headers)

        assert first.status_code == replay.status_code == 200
        assert replay.headers.get("Idempotent-Replayed") == "true"
        assert replay.get_json()["completed_goals"] == first.get_json()["completed_goals"] == [
            {"id": goal["id"], "name": goal["name"]},
        ]
        stored = _goal(db_session, goal["id"])
        assert stored.completed is True
        assert stored.completion_source == "condition"
        assert stored.completed_at == completed_at

    def test_deleting_the_achieving_instance_reverts_the_goal(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, instance)
        assert _goal(db_session, goal["id"]).completed is True

        response = authed_client.delete(f"/api/{root.id}/sessions/{session.id}/activities/{instance.id}")

        assert response.status_code == 200
        stored = _goal(db_session, goal["id"])
        assert stored.completed is False
        assert stored.completion_reason == "condition_unmet"

    def test_deleting_the_session_reverts_the_goal(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1)))

        assert authed_client.delete(f"/api/{root.id}/sessions/{session.id}").status_code == 200
        assert _goal(db_session, goal["id"]).completed is False

    def test_manual_override_survives_losing_evidence(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))
        response = authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/complete", json={"completed": True})

        assert response.status_code == 200
        assert _goal(db_session, goal["id"]).completion_source == "manual_override"
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        instance = _instance(db_session, session, sample_activity_definition, [{"Weight": 100}], occurred=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, instance)
        assert _goal(db_session, goal["id"]).completed is True

    def test_evidence_before_the_start_date_never_counts(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        early = _now() - timedelta(days=3)
        session = _session(db_session, root, started=early)
        _instance(db_session, session, sample_activity_definition, [{"Weight": 300}], occurred=early, completed=True)
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))

        assert goal["condition_pending_completion"] is False
        moved = authed_client.put(f"/api/{root.id}/goals/{goal['id']}", json={
            "started_at": (early - timedelta(days=1)).date().isoformat(),
        })

        assert moved.status_code == 200
        assert moved.get_json()["condition_pending_completion"] is True
        assert _goal(db_session, goal["id"]).completed is False

        confirmed = authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/complete", json={"completed": True})
        assert confirmed.status_code == 200
        assert _goal(db_session, goal["id"]).completion_source == "condition"

    def test_only_an_explicit_start_date_must_precede_the_due_date(self, authed_client, sample_ultimate_goal):
        root = sample_ultimate_goal
        past_due = (_now() - timedelta(days=30)).date()
        backfilled = _create_goal(authed_client, root.id, root.id, deadline=past_due.isoformat())

        response = authed_client.put(f"/api/{root.id}/goals/{backfilled['id']}", json={
            "started_at": (past_due + timedelta(days=1)).isoformat(),
        })

        assert response.status_code == 400
        assert response.get_json() == {"error": "The start date must be on or before the due date"}

    def test_evidence_after_the_due_date_never_counts(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        due = (_now() + timedelta(days=1)).date()
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition), deadline=due.isoformat())
        late = datetime.combine(due + timedelta(days=1), datetime.min.time())
        last_moment = datetime.combine(due, datetime.max.time()).replace(microsecond=0)
        session = _session(db_session, root, started=late)

        _complete(authed_client, root.id, _instance(db_session, session, sample_activity_definition, [{"Weight": 300}], occurred=late))
        assert _goal(db_session, goal["id"]).completed is False
        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 300}], occurred=last_moment))
        assert _goal(db_session, goal["id"]).completed is True

    def test_paused_goals_ignore_evidence_from_the_pause_and_resume_reevaluates(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition),
                            started_at=(_now() - timedelta(days=1)).date().isoformat())
        session = _session(db_session, root, started=_now() - timedelta(hours=3))
        _instance(db_session, session, sample_activity_definition, [{"Weight": 100}],
                  occurred=_now() - timedelta(hours=2), completed=True)
        assert authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/pause", json={"paused": True}).status_code == 200
        paused_at = _goal(db_session, goal["id"]).pause_intervals[-1].paused_at
        _instance(db_session, session, sample_activity_definition, [{"Weight": 300}],
                  occurred=paused_at + timedelta(milliseconds=1), completed=True)

        assert authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/pause", json={"paused": False}).status_code == 200
        assert _goal(db_session, goal["id"]).completed is False

        before_pause = _instance(db_session, session, sample_activity_definition, [{"Weight": 300}],
                                 occurred=_now() - timedelta(hours=1), completed=True)
        authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/pause", json={"paused": True})
        authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/pause", json={"paused": False})

        stored = _goal(db_session, goal["id"])
        assert stored.completed is True
        assert stored.completed_at == before_pause.time_start

    def test_manual_uncompletion_holds_until_newer_evidence(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition),
                            started_at=(_now() - timedelta(days=1)).date().isoformat())
        session = _session(db_session, root, started=_now() - timedelta(hours=3))
        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 300}], occurred=_now() - timedelta(hours=2)))
        assert _goal(db_session, goal["id"]).completed is True
        authed_client.patch(f"/api/{root.id}/goals/{goal['id']}/complete", json={"completed": False})

        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 100}], occurred=_now() - timedelta(hours=1)))
        assert _goal(db_session, goal["id"]).completed is False

        newer = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(seconds=1)
        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 300}], occurred=newer))
        assert _goal(db_session, goal["id"]).completed is True

    def test_changing_the_condition_reverts_a_goal_it_no_longer_satisfies(
        self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition,
    ):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition))
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        _complete(authed_client, root.id, _instance(
            db_session, session, sample_activity_definition, [{"Weight": 230}], occurred=_now() + timedelta(minutes=1)))

        response = authed_client.put(f"/api/{root.id}/goals/{goal['id']}/condition", json={
            "completion_condition": "activity_threshold", "condition": _threshold(sample_activity_definition, weight=250),
        })

        assert response.status_code == 200
        assert response.get_json()["completed"] is False
        assert db_session.query(GoalCompletionCondition).filter_by(goal_id=goal["id"]).count() == 1

    def test_children_condition_completes_the_parent_with_its_last_child(
        self, authed_client, db_session, sample_ultimate_goal,
    ):
        root = sample_ultimate_goal
        parent = _create_goal(authed_client, root.id, root.id, type="MidTermGoal", completion_condition="children")
        first = _create_goal(authed_client, root.id, parent["id"])
        second = _create_goal(authed_client, root.id, parent["id"])

        authed_client.patch(f"/api/{root.id}/goals/{first['id']}/complete", json={"completed": True})
        assert _goal(db_session, parent["id"]).completed is False
        authed_client.patch(f"/api/{root.id}/goals/{second['id']}/complete", json={"completed": True})

        stored = _goal(db_session, parent["id"])
        assert stored.completed is True
        assert stored.completion_source == "children"


@pytest.mark.integration
class TestConditionReads:
    def test_progress_and_evidence_reads(self, authed_client, db_session, sample_ultimate_goal, sample_activity_definition):
        root = sample_ultimate_goal
        goal = _create_goal(authed_client, root.id, root.id, _threshold(sample_activity_definition, min_sets=2))
        manual = _create_goal(authed_client, root.id, root.id)
        session = _session(db_session, root, started=_now() + timedelta(minutes=1))
        _instance(db_session, session, sample_activity_definition, [{"Weight": 225}, {"Weight": 200}],
                  occurred=_now() + timedelta(minutes=1), completed=True)

        progress = authed_client.get(
            f"/api/{root.id}/goals/condition-progress?goal_ids={goal['id']},{manual['id']},missing"
        ).get_json()["goals"]
        evidence = authed_client.get(f"/api/{root.id}/goals/{goal['id']}/condition/evidence").get_json()

        assert set(progress) == {goal["id"], manual["id"]}
        assert progress[goal["id"]]["met"] is False
        assert progress[goal["id"]]["current"] == 1
        assert progress[goal["id"]]["progress"] == pytest.approx((1 + 200 / 225) / 2, abs=1e-4)
        assert progress[manual["id"]] == {
            "goal_id": manual["id"], "completion_condition": "manual", "completed": False,
            "completion_source": None, "progress": 0.0,
        }
        assert len(evidence["instances"]) == 1
        assert evidence["activity_definition"]["name"] == "Bench Press"
        assert evidence["progress"]["evidence_count"] == 1

    def test_progress_requests_are_bounded(self, authed_client, sample_ultimate_goal):
        ids = ",".join(f"g{index}" for index in range(201))
        response = authed_client.get(f"/api/{sample_ultimate_goal.id}/goals/condition-progress?goal_ids={ids}")
        assert response.status_code == 400
