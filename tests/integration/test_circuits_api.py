from datetime import datetime, timedelta, timezone
import uuid

import pytest
from sqlalchemy.exc import IntegrityError

from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    ActivitySet,
    ActivityTag,
    CircuitRun,
    MetricDefinition,
    MetricValue,
    Note,
    Session,
    SessionTemplate,
    SessionWorkInterval,
    session_goals,
)


def _session(db_session, root, user):
    row = Session(
        id=str(uuid.uuid4()),
        root_id=root.id,
        owner_id=user.id,
        name="Circuit session",
        session_start=datetime.now(timezone.utc),
        attributes={"session_data": {"sections": [{"name": "Main", "items": []}]}},
    )
    db_session.add(row)
    db_session.commit()
    return row


def _non_set_activity(db_session, root):
    row = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name="Burpee",
        has_sets=False,
        has_metrics=False,
        metrics_multiplicative=False,
        has_splits=False,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _create_definition(client, root, set_activity, non_set_activity):
    response = client.post(f"/api/{root.id}/circuits", json={
        "name": "Two-station circuit",
        "description": "Strength then conditioning",
        "slots": [
            {"activity_definition_id": set_activity.id},
            {"activity_definition_id": non_set_activity.id},
        ],
    })
    assert response.status_code == 201, response.get_json()
    return response.get_json()


def test_circuit_and_round_tags_materialize_hierarchically_and_survive_new_rounds(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()

    circuit_tag = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Competition", "color": "#123ABC", "assigned": True},
    )
    assert circuit_tag.status_code == 200, circuit_tag.get_json()
    run = circuit_tag.get_json()
    assert [tag["name"] for tag in run["tags"]] == ["Competition"]
    assert run["rounds"][0]["tags"] == []

    tags = db_session.query(ActivityTag).filter_by(root_id=sample_ultimate_goal.id).all()
    competition_by_activity = {
        tag.activity_definition_id: tag
        for tag in tags
        if tag.name == "Competition"
    }
    assert set(competition_by_activity) == {sample_activity_definition.id, non_set.id}
    scoped_activity_tag = competition_by_activity[sample_activity_definition.id]
    blocked_rename = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/activities/{sample_activity_definition.id}/tags/{scoped_activity_tag.id}",
        json={"name": "Meet"},
    )
    assert blocked_rename.status_code == 409
    blocked_archive = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/activities/{sample_activity_definition.id}/tags/{scoped_activity_tag.id}",
    )
    assert blocked_archive.status_code == 409
    set_slot = next(slot for slot in run["slots"] if slot["has_sets"])
    set_parent = db_session.get(ActivityInstance, set_slot["activity_instance_id"])
    set_member = next(member for member in run["rounds"][0]["members"] if member["activity_set_id"])
    activity_set = db_session.get(ActivitySet, set_member["activity_set_id"])
    setless_member = next(member for member in run["rounds"][0]["members"] if member["activity_instance_id"])
    setless_instance = db_session.get(ActivityInstance, setless_member["activity_instance_id"])
    assert [tag.name for tag in set_parent.tags] == ["Competition"]
    assert activity_set.tags == []
    assert [tag.name for tag in setless_instance.tags] == ["Competition"]
    blocked_member_removal = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/activity-instances/{setless_instance.id}/tags",
        json={"tag_ids": [], "version": setless_instance.tag_assignment_version},
    )
    assert blocked_member_removal.status_code == 409
    assert "scope control" in blocked_member_removal.get_json()["error"]

    overlapping_round_tag = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{run['rounds'][0]['id']}/tags",
        json={"name": "Competition", "assigned": True},
    )
    assert overlapping_round_tag.status_code == 200, overlapping_round_tag.get_json()
    db_session.expire_all()
    assert [tag.name for tag in db_session.get(ActivitySet, set_member["activity_set_id"]).tags] == [
        "Competition"
    ]
    removed_overlap = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{run['rounds'][0]['id']}/tags",
        json={"name": "Competition", "assigned": False},
    )
    assert removed_overlap.status_code == 200, removed_overlap.get_json()
    db_session.expire_all()
    assert db_session.get(ActivitySet, set_member["activity_set_id"]).tags == []
    assert [tag.name for tag in db_session.get(
        ActivityInstance, setless_member["activity_instance_id"]
    ).tags] == ["Competition"]

    round_tag = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{run['rounds'][0]['id']}/tags",
        json={"name": "Sprint", "assigned": True},
    )
    assert round_tag.status_code == 200, round_tag.get_json()
    run = round_tag.get_json()
    assert [tag["name"] for tag in run["rounds"][0]["tags"]] == ["Sprint"]
    db_session.expire_all()
    activity_set = db_session.get(ActivitySet, set_member["activity_set_id"])
    setless_instance = db_session.get(ActivityInstance, setless_member["activity_instance_id"])
    assert [tag.name for tag in activity_set.tags] == ["Sprint"]
    assert {tag.name for tag in setless_instance.tags} == {"Competition", "Sprint"}
    blocked_set_removal = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/activity-sets/{activity_set.id}/tags",
        json={"tag_ids": [], "version": activity_set.tag_assignment_version},
    )
    assert blocked_set_removal.status_code == 409

    added = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert added.status_code == 201, added.get_json()
    run = added.get_json()
    second_round = run["rounds"][1]
    assert second_round["tags"] == []
    second_setless_member = next(
        member for member in second_round["members"] if member["activity_instance_id"]
    )
    db_session.expire_all()
    second_setless = db_session.get(ActivityInstance, second_setless_member["activity_instance_id"])
    assert [tag.name for tag in second_setless.tags] == ["Competition"]

    removed = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Competition", "assigned": False},
    )
    assert removed.status_code == 200, removed.get_json()
    assert removed.get_json()["tags"] == []
    db_session.expire_all()
    assert db_session.get(ActivityInstance, set_slot["activity_instance_id"]).tags == []
    assert all(
        "Competition" not in {tag.name for tag in db_session.get(ActivityInstance, member_id).tags}
        for member_id in [setless_member["activity_instance_id"], second_setless_member["activity_instance_id"]]
    )


def test_run_scope_materializes_identically_for_existing_and_inherited_rounds(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    """A run scope must produce the same assignments regardless of round age.

    Set-based slots are tagged on their parent instance only; materializing the
    tag onto per-round sets as well would duplicate it and strand it, because
    run-scope removal only walks parent instances.
    """
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client, sample_ultimate_goal, sample_activity_definition, non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()

    applied = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Competition", "assigned": True},
    )
    assert applied.status_code == 200, applied.get_json()
    run = applied.get_json()
    existing_set_id = next(
        member["activity_set_id"]
        for member in run["rounds"][0]["members"]
        if member["activity_set_id"]
    )

    added = authed_client.post(f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds")
    assert added.status_code == 201, added.get_json()
    run = added.get_json()
    second_round = run["rounds"][1]
    inherited_set_id = next(
        member["activity_set_id"]
        for member in second_round["members"]
        if member["activity_set_id"]
    )
    inherited_setless_id = next(
        member["activity_instance_id"]
        for member in second_round["members"]
        if member["activity_instance_id"]
    )

    db_session.expire_all()
    existing_set_tags = [tag.name for tag in db_session.get(ActivitySet, existing_set_id).tags]
    inherited_set_tags = [tag.name for tag in db_session.get(ActivitySet, inherited_set_id).tags]
    assert existing_set_tags == inherited_set_tags == []
    # The setless member still inherits, matching _run_targets semantics.
    assert [
        tag.name for tag in db_session.get(ActivityInstance, inherited_setless_id).tags
    ] == ["Competition"]

    # Removal must leave nothing stranded on either round.
    removed = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Competition", "assigned": False},
    )
    assert removed.status_code == 200, removed.get_json()
    db_session.expire_all()
    assert db_session.get(ActivitySet, inherited_set_id).tags == []
    assert db_session.get(ActivityInstance, inherited_setless_id).tags == []


def test_inherited_run_scope_rejects_archived_tag_and_rolls_back_round(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    """Round inheritance enforces the same archived-tag guard as the mutate path."""
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client, sample_ultimate_goal, sample_activity_definition, non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    applied = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Competition", "assigned": True},
    )
    assert applied.status_code == 200, applied.get_json()

    # Archive the setless activity's tag directly; the scope guard covers the
    # API path, so bypass it to simulate a tag archived before the scope existed.
    archived_tag = db_session.query(ActivityTag).filter_by(
        root_id=sample_ultimate_goal.id,
        activity_definition_id=non_set.id,
        name="Competition",
    ).one()
    archived_tag.deleted_at = datetime.now(timezone.utc)
    db_session.commit()

    before = db_session.query(CircuitRun).filter_by(id=run["id"]).one()
    rounds_before = len(before.rounds)

    blocked = authed_client.post(f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds")
    assert blocked.status_code == 409, blocked.get_json()
    assert "archived" in blocked.get_json()["error"].lower()

    db_session.expire_all()
    after = db_session.query(CircuitRun).filter_by(id=run["id"]).one()
    assert len(after.rounds) == rounds_before, "rejected round must be rolled back"


def test_circuit_scope_tags_validate_ownership_archives_and_round_membership(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    archived = ActivityTag(
        root_id=sample_ultimate_goal.id,
        activity_definition_id=sample_activity_definition.id,
        name="Archived",
        deleted_at=datetime.now(timezone.utc),
    )
    db_session.add(archived)
    db_session.commit()

    conflict = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Archived", "assigned": True},
    )
    assert conflict.status_code == 409
    assert "restored" in conflict.get_json()["error"]
    invalid_round = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/not-a-round/tags",
        json={"name": "Tempo", "assigned": True},
    )
    assert invalid_round.status_code == 404
    invalid_payload = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/tags",
        json={"name": "Tempo", "assigned": True, "unexpected": True},
    )
    assert invalid_payload.status_code == 400


def test_circuit_snapshot_occurrences_typed_order_and_archive(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_goal_hierarchy,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(authed_client, sample_ultimate_goal, sample_activity_definition, non_set)
    associated_goal = sample_goal_hierarchy["short_term"]
    association = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/activities/{sample_activity_definition.id}/goals",
        json={"goal_ids": [associated_goal.id]},
    )
    assert association.status_code == 200

    response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    )
    assert response.status_code == 201, response.get_json()
    run = response.get_json()
    attached_goal_ids = {
        goal_id for (goal_id,) in db_session.query(session_goals.c.goal_id).filter_by(session_id=session.id).all()
    }
    assert associated_goal.id in attached_goal_ids
    assert run["source_version"] == 1
    assert run["round_count"] == 1
    assert "planned_rounds" not in run
    assert "planned_rounds" not in definition
    second_round = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert second_round.status_code == 201, second_round.get_json()
    run = second_round.get_json()
    assert len(run["rounds"]) == 2
    assert [len(row["members"]) for row in run["rounds"]] == [2, 2]
    assert authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/correction",
        json={"run": {"time_start": None, "time_stop": None}},
    ).status_code == 404

    set_slot = next(slot for slot in run["slots"] if slot["has_sets"])
    assert set_slot["activity_instance_id"]
    stable_sets = (
        db_session.query(ActivitySet)
        .filter_by(activity_instance_id=set_slot["activity_instance_id"])
        .order_by(ActivitySet.sort_order)
        .all()
    )
    assert len(stable_sets) == 2
    stable_ids = [row.id for row in stable_sets]
    set_update = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/activity-instances/{set_slot['activity_instance_id']}",
        json={
            "session_id": session.id,
            "activity_definition_id": sample_activity_definition.id,
            "sets": [
                {
                    "id": row.id,
                    "status": row.status,
                    "duration_seconds": row.duration_seconds,
                    "notes": f"Round {index + 1}",
                    "metrics": [],
                }
                for index, row in enumerate(stable_sets)
            ],
        },
    )
    assert set_update.status_code == 200, set_update.get_json()
    assert [row["id"] for row in set_update.get_json()["sets"]] == stable_ids
    non_set_instance_ids = [
        member["activity_instance_id"]
        for row in run["rounds"]
        for member in row["members"]
        if member["activity_instance_id"]
    ]
    assert len(set(non_set_instance_ids)) == 2

    db_session.refresh(session)
    section_items = session.attributes["session_data"]["sections"][0]["items"]
    assert section_items == [{"type": "circuit", "circuit_run_id": run["id"]}]

    update = authed_client.patch(f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}", json={
        "name": "Changed definition",
        "version": definition["version"],
    })
    assert update.status_code == 200
    historical = authed_client.get(f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}").get_json()
    assert historical["name"] == "Two-station circuit"
    listed_definition = authed_client.get(f"/api/{sample_ultimate_goal.id}/circuits").get_json()[0]
    assert listed_definition["instantiation_summary"]["instance_count"] == 1
    assert listed_definition["instantiation_summary"]["last_used_at"] is not None
    assert listed_definition["instantiation_summary"]["average_duration_seconds"] is None

    archived = authed_client.delete(f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}")
    assert archived.status_code == 200
    assert authed_client.get(f"/api/{sample_ultimate_goal.id}/circuits").get_json() == []
    assert len(authed_client.get(f"/api/{sample_ultimate_goal.id}/circuits?include_archived=true").get_json()) == 1


def test_circuit_is_the_only_timer_and_children_remain_untimed(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(authed_client, sample_ultimate_goal, sample_activity_definition, non_set)
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    run_id = run["id"]
    assert authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/pause",
    ).status_code == 404
    assert authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/resume",
    ).status_code == 404
    child_instance_ids = {
        slot["activity_instance_id"]
        for slot in run["slots"]
        if slot["activity_instance_id"]
    } | {
        member["activity_instance_id"]
        for circuit_round in run["rounds"]
        for member in circuit_round["members"]
        if member["activity_instance_id"]
    }
    blocked_session_completion = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}",
        json={"completed": True},
    )
    assert blocked_session_completion.status_code == 409
    assert "Complete each circuit" in blocked_session_completion.get_json()["error"]

    ordinary = ActivityInstance(
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        activity_definition_id=non_set.id,
    )
    db_session.add(ordinary)
    db_session.commit()
    ordinary_start = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/activity-instances/{ordinary.id}/start",
        json={"session_id": session.id, "activity_definition_id": non_set.id},
    )
    assert ordinary_start.status_code == 200

    ordinary_conflict = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/start",
    )
    assert ordinary_conflict.status_code == 409
    assert ordinary_conflict.get_json()["active_work"]["activity_instance_id"] == ordinary.id
    ordinary_complete = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/activity-instances/{ordinary.id}/complete",
        json={},
    )
    assert ordinary_complete.status_code == 200

    started = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/start",
    )
    assert started.status_code == 200
    started_payload = started.get_json()
    assert started_payload["time_start"] is not None
    assert all(
        key not in circuit_round
        for circuit_round in started_payload["rounds"]
        for key in ("status", "time_start", "time_stop", "duration_seconds")
    )
    assert all(
        key not in member
        for circuit_round in started_payload["rounds"]
        for member in circuit_round["members"]
        for key in ("status", "duration_seconds", "work_intervals")
    )

    blocked_activity = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/activity-instances/{ordinary.id}/start",
        json={"session_id": session.id, "activity_definition_id": non_set.id},
    )
    assert blocked_activity.status_code == 409
    assert "active circuit" in blocked_activity.get_json()["error"].lower()

    pause = authed_client.post(f"/api/{sample_ultimate_goal.id}/timers/session/{session.id}/pause")
    assert pause.status_code == 200, pause.get_json()
    db_session.expire_all()
    paused_run = db_session.get(CircuitRun, run_id)
    assert paused_run.status == "paused"
    assert db_session.query(SessionWorkInterval).filter_by(session_id=session.id, ended_at=None).count() == 0
    resume = authed_client.post(f"/api/{sample_ultimate_goal.id}/timers/session/{session.id}/resume")
    assert resume.status_code == 200, resume.get_json()
    assert db_session.query(SessionWorkInterval).filter_by(session_id=session.id, ended_at=None).count() == 0

    completion = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/complete",
    )
    assert completion.status_code == 200, completion.get_json()
    completed = completion.get_json()
    assert completed["status"] == "completed"
    assert completed["time_start"] is not None
    assert completed["time_stop"] is not None
    assert completed["duration_seconds"] is not None
    db_session.expire_all()
    for instance_id in child_instance_ids:
        child = db_session.get(ActivityInstance, instance_id)
        assert child.completed is True
        assert child.time_start is None
        assert child.time_stop is None
        assert child.duration_seconds is None
        child_timer = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/activity-instances/{instance_id}/start",
        )
        assert child_timer.status_code == 409
        assert "owned by its circuit run" in child_timer.get_json()["error"]

    listed_definition = authed_client.get(f"/api/{sample_ultimate_goal.id}/circuits").get_json()[0]
    summary = listed_definition["instantiation_summary"]
    assert summary["instance_count"] == 1
    assert summary["last_used_at"] is not None
    assert summary["average_duration_seconds"] == completed["duration_seconds"]

    session_completion = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}",
        json={"completed": True},
    )
    assert session_completion.status_code == 200, session_completion.get_json()
    blocked_reset = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={"time_start": None, "time_stop": None},
    )
    assert blocked_reset.status_code == 409

    assert authed_client.get(f"/api/{sample_ultimate_goal.id}/circuit-history").status_code == 404
    assert authed_client.get(f"/api/{sample_ultimate_goal.id}/circuit-trends").status_code == 404


def test_circuit_timing_adjustment_recalculates_duration_and_reset_restores_planned_results(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    run_id = run["id"]

    assert authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/complete",
    ).status_code == 200

    adjusted = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={
            "time_start": "2026-08-04T13:00:00.000Z",
            "time_stop": "2026-08-04T13:02:00.000Z",
        },
    )
    assert adjusted.status_code == 200, adjusted.get_json()
    adjusted_payload = adjusted.get_json()
    assert adjusted_payload["status"] == "completed"
    assert adjusted_payload["duration_seconds"] == 120

    empty_update = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={},
    )
    assert empty_update.status_code == 400

    rejected = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={"time_start": "2026-08-04T13:03:00.000Z"},
    )
    assert rejected.status_code == 400
    assert "after start" in rejected.get_json()["error"].lower()

    persisted_run = db_session.get(CircuitRun, run_id)
    persisted_run.total_paused_seconds = 30
    db_session.commit()
    paused_correction = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={"time_start": "2026-08-04T12:59:00.000Z"},
    )
    assert paused_correction.status_code == 409
    assert "paused work" in paused_correction.get_json()["error"].lower()

    reset = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/timing",
        json={"time_start": None, "time_stop": None},
    )
    assert reset.status_code == 200, reset.get_json()
    reset_payload = reset.get_json()
    assert reset_payload["status"] == "planned"
    assert reset_payload["time_start"] is None
    assert reset_payload["time_stop"] is None
    assert reset_payload["duration_seconds"] is None

    db_session.expire_all()
    for circuit_round in reset_payload["rounds"]:
        for member in circuit_round["members"]:
            if member["activity_set_id"]:
                assert db_session.get(ActivitySet, member["activity_set_id"]).status == "planned"
            if member["activity_instance_id"]:
                instance = db_session.get(ActivityInstance, member["activity_instance_id"])
                assert instance.completed is False
                assert instance.time_start is None
                assert instance.time_stop is None

    restarted = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/start",
    )
    assert restarted.status_code == 200, restarted.get_json()
    assert restarted.get_json()["status"] == "active"


def test_manual_circuit_timing_rejects_overlapping_work(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    first = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    second = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()

    first_timing = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{first['id']}/timing",
        json={
            "time_start": "2026-08-04T13:00:00.000Z",
            "time_stop": "2026-08-04T14:00:00.000Z",
        },
    )
    assert first_timing.status_code == 200, first_timing.get_json()

    circuit_overlap = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{second['id']}/timing",
        json={
            "time_start": "2026-08-04T13:30:00.000Z",
            "time_stop": "2026-08-04T13:40:00.000Z",
        },
    )
    assert circuit_overlap.status_code == 409
    assert "another circuit" in circuit_overlap.get_json()["error"].lower()

    open_circuit_overlap = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{second['id']}/timing",
        json={"time_start": "2026-08-04T13:30:00.000Z"},
    )
    assert open_circuit_overlap.status_code == 409
    assert "another circuit" in open_circuit_overlap.get_json()["error"].lower()

    ordinary = ActivityInstance(
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        activity_definition_id=non_set.id,
    )
    db_session.add(ordinary)
    db_session.flush()
    db_session.add(SessionWorkInterval(
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        activity_instance_id=ordinary.id,
        started_at=datetime(2026, 8, 4, 15, 0, 0),
        ended_at=datetime(2026, 8, 4, 16, 0, 0),
        duration_seconds=3600,
    ))
    db_session.commit()

    ordinary_overlap = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{second['id']}/timing",
        json={
            "time_start": "2026-08-04T15:30:00.000Z",
            "time_stop": "2026-08-04T15:40:00.000Z",
        },
    )
    assert ordinary_overlap.status_code == 409
    assert "session item's work time" in ordinary_overlap.get_json()["error"]

    open_range_overlap = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{second['id']}/timing",
        json={"time_start": "2026-08-04T15:30:00.000Z"},
    )
    assert open_range_overlap.status_code == 409
    assert "session item's work time" in open_range_overlap.get_json()["error"]


def test_circuit_timing_rejects_future_boundaries_and_legacy_future_completion(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    future_start = datetime.now(timezone.utc) + timedelta(minutes=10)

    rejected = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/timing",
        json={"time_start": future_start.isoformat()},
    )
    assert rejected.status_code == 400
    assert "future" in rejected.get_json()["error"].lower()

    future_stop = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/timing",
        json={
            "time_start": (future_start - timedelta(minutes=20)).isoformat(),
            "time_stop": future_start.isoformat(),
        },
    )
    assert future_stop.status_code == 400
    assert "future" in future_stop.get_json()["error"].lower()

    persisted_run = db_session.get(CircuitRun, run["id"])
    persisted_run.status = "active"
    persisted_run.time_start = future_start.replace(tzinfo=None)
    db_session.commit()
    completion = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/complete",
    )
    assert completion.status_code == 409
    assert "future" in completion.get_json()["error"].lower()


def test_archived_circuit_instantiation_is_internal_only_and_restore_rechecks_quota(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    test_user.quota_overrides = {"circuits": 1}
    db_session.commit()
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    archived = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    assert authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuits/{archived['id']}"
    ).status_code == 200

    bypass = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={
            "circuit_definition_id": archived["id"],
            "section_index": 0,
            "allow_archived": True,
        },
    )
    assert bypass.status_code == 404

    active = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    assert active["id"] != archived["id"]
    restore = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuits/{archived['id']}/restore",
    )
    assert restore.status_code == 403
    assert restore.get_json()["resource"] == "circuits"


def test_restore_rechecks_storage_quota(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    archived = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    assert authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuits/{archived['id']}"
    ).status_code == 200
    test_user.storage_limit_bytes = 1
    db_session.commit()

    restore = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuits/{archived['id']}/restore",
    )

    assert restore.status_code == 403
    assert restore.get_json()["resource"] == "storage"


def test_legacy_planned_rounds_field_cannot_change_initial_round_count(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    response = authed_client.post(f"/api/{sample_ultimate_goal.id}/circuits", json={
        "name": "Legacy planned circuit",
        "planned_rounds": 3,
        "slots": [{"activity_definition_id": sample_activity_definition.id}],
    })

    assert response.status_code == 201, response.get_json()
    definition = response.get_json()
    assert "planned_rounds" not in definition
    run_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    )
    assert run_response.status_code == 201, run_response.get_json()
    assert run_response.get_json()["round_count"] == 1


def test_quick_sessions_explicitly_reject_interactive_circuit_runs(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    session.attributes = {
        "session_data": {
            "session_type": "quick",
            "sections": [{"name": "Main", "items": []}],
        },
    }
    db_session.commit()
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )

    response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    )

    assert response.status_code == 400
    assert response.get_json()["error"] == "Quick sessions do not support circuits"


def test_circuit_notes_support_run_round_activity_and_set_targets(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    circuit_round = run["rounds"][0]
    set_member = next(member for member in circuit_round["members"] if member["activity_set_id"])
    instance_member = next(member for member in circuit_round["members"] if member["activity_instance_id"])
    set_slot = next(slot for slot in run["slots"] if slot["has_sets"])
    non_set_slot = next(slot for slot in run["slots"] if not slot["has_sets"])

    payloads = [
        ({
            "content": "Whole circuit cue",
            "context_type": "circuit_run",
            "context_id": run["id"],
            "session_id": session.id,
        }, "circuit_run_note"),
        ({
            "content": "Round pacing cue",
            "context_type": "circuit_round",
            "context_id": circuit_round["id"],
            "session_id": session.id,
        }, "circuit_round_note"),
        ({
            "content": "Set technique cue",
            "context_type": "activity_instance",
            "context_id": set_slot["activity_instance_id"],
            "session_id": session.id,
            "activity_instance_id": set_slot["activity_instance_id"],
            "activity_definition_id": set_slot["activity_definition_id"],
            "activity_set_id": set_member["activity_set_id"],
        }, "activity_set_note"),
        ({
            "content": "Activity breathing cue",
            "context_type": "activity_instance",
            "context_id": instance_member["activity_instance_id"],
            "session_id": session.id,
            "activity_instance_id": instance_member["activity_instance_id"],
            "activity_definition_id": non_set_slot["activity_definition_id"],
        }, "activity_instance_note"),
    ]

    for payload, expected_type in payloads:
        response = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/notes",
            json=payload,
        )
        assert response.status_code == 201, response.get_json()
        assert response.get_json()["note_type"] == expected_type

    listed = authed_client.get(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/notes",
    )
    assert listed.status_code == 200, listed.get_json()
    assert {note["content"] for note in listed.get_json()} == {
        "Whole circuit cue",
        "Round pacing cue",
        "Set technique cue",
        "Activity breathing cue",
    }

    session.completed = True
    db_session.commit()
    other_session = _session(db_session, sample_ultimate_goal, test_user)
    rejected = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/notes",
        json={
            "content": "Cross-session round",
            "context_type": "circuit_round",
            "context_id": circuit_round["id"],
            "session_id": other_session.id,
        },
    )
    assert rejected.status_code == 400

    db_session.expire_all()
    set_note = db_session.query(Note).filter_by(content="Set technique cue").one()
    assert set_note.activity_set_id == set_member["activity_set_id"]
    assert set_note.activity_instance_id == set_slot["activity_instance_id"]


def test_remove_circuit_round_deletes_results_and_renumbers_remaining_rounds(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    added = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert added.status_code == 201, added.get_json()
    run = added.get_json()
    removed_round = run["rounds"][0]
    removed_set_id = next(
        member["activity_set_id"] for member in removed_round["members"] if member["activity_set_id"]
    )
    removed_instance_id = next(
        member["activity_instance_id"]
        for member in removed_round["members"]
        if member["activity_instance_id"]
    )
    removed_set = db_session.get(ActivitySet, removed_set_id)
    round_note = Note(
        root_id=sample_ultimate_goal.id,
        context_type="circuit_round",
        context_id=removed_round["id"],
        session_id=session.id,
        content="Removed round note",
    )
    set_note = Note(
        root_id=sample_ultimate_goal.id,
        context_type="activity_instance",
        context_id=removed_set.activity_instance_id,
        session_id=session.id,
        activity_instance_id=removed_set.activity_instance_id,
        activity_definition_id=sample_activity_definition.id,
        activity_set_id=removed_set_id,
        content="Removed set note",
    )
    db_session.add_all([round_note, set_note])
    db_session.commit()

    response = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{removed_round['id']}",
    )
    assert response.status_code == 200, response.get_json()
    updated = response.get_json()
    assert updated["round_count"] == 1
    assert [row["round_number"] for row in updated["rounds"]] == [1]

    db_session.expire_all()
    assert db_session.get(ActivitySet, removed_set_id) is None
    assert db_session.get(ActivityInstance, removed_instance_id) is None
    assert db_session.get(Note, round_note.id).deleted_at is not None
    assert db_session.get(Note, set_note.id).deleted_at is not None
    remaining_set_id = next(
        member["activity_set_id"]
        for member in updated["rounds"][0]["members"]
        if member["activity_set_id"]
    )
    assert db_session.get(ActivitySet, remaining_set_id).sort_order == 0

    final_round_response = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{updated['rounds'][0]['id']}",
    )
    assert final_round_response.status_code == 409
    assert "at least one round" in final_round_response.get_json()["error"]


def test_circuit_rounds_remain_mutable_after_run_starts_and_completes(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert response.status_code == 201, response.get_json()
    updated = response.get_json()
    assert updated["round_count"] == 2
    assert [row["round_number"] for row in updated["rounds"]] == [1, 2]

    added_round = updated["rounds"][-1]
    added_set_id = next(
        member["activity_set_id"] for member in added_round["members"] if member["activity_set_id"]
    )
    added_instance_id = next(
        member["activity_instance_id"]
        for member in added_round["members"]
        if member["activity_instance_id"]
    )
    db_session.expire_all()
    added_set = db_session.get(ActivitySet, added_set_id)
    added_instance = db_session.get(ActivityInstance, added_instance_id)
    assert added_set.sort_order == 1
    assert added_set.status == "planned"
    assert added_instance.completed is False
    assert added_instance.time_start is None
    assert added_instance.time_stop is None
    assert added_instance.duration_seconds is None

    start = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/start",
    )
    assert start.status_code == 200, start.get_json()
    active_add_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert active_add_response.status_code == 201, active_add_response.get_json()
    active_updated = active_add_response.get_json()
    assert active_updated["round_count"] == 3
    active_added_round = active_updated["rounds"][-1]
    active_set_id = next(
        member["activity_set_id"] for member in active_added_round["members"] if member["activity_set_id"]
    )
    active_instance_id = next(
        member["activity_instance_id"]
        for member in active_added_round["members"]
        if member["activity_instance_id"]
    )
    db_session.expire_all()
    assert db_session.get(ActivitySet, active_set_id).status == "planned"
    assert db_session.get(ActivityInstance, active_instance_id).completed is False

    active_delete_response = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{active_added_round['id']}",
    )
    assert active_delete_response.status_code == 200, active_delete_response.get_json()
    assert active_delete_response.get_json()["round_count"] == 2

    completion = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/complete",
    )
    assert completion.status_code == 200, completion.get_json()
    completed_add_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert completed_add_response.status_code == 201, completed_add_response.get_json()
    completed_updated = completed_add_response.get_json()
    assert completed_updated["round_count"] == 3
    completed_added_round = completed_updated["rounds"][-1]
    completed_set_id = next(
        member["activity_set_id"]
        for member in completed_added_round["members"]
        if member["activity_set_id"]
    )
    completed_instance_id = next(
        member["activity_instance_id"]
        for member in completed_added_round["members"]
        if member["activity_instance_id"]
    )
    db_session.expire_all()
    assert db_session.get(ActivitySet, completed_set_id).status == "completed"
    assert db_session.get(ActivityInstance, completed_instance_id).completed is True

    completed_delete_response = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{completed_added_round['id']}",
    )
    assert completed_delete_response.status_code == 200, completed_delete_response.get_json()
    assert completed_delete_response.get_json()["round_count"] == 2

    session_completion = authed_client.put(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}",
        json={"completed": True},
    )
    assert session_completion.status_code == 200, session_completion.get_json()
    blocked_add = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
    )
    assert blocked_add.status_code == 409
    assert "Completed sessions" in blocked_add.get_json()["error"]
    blocked_delete = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds/{added_round['id']}",
    )
    assert blocked_delete.status_code == 409
    assert "Completed sessions" in blocked_delete.get_json()["error"]


def test_delete_active_circuit_run_exits_work_and_removes_session_item(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    run_id = run["id"]
    owned_instance_ids = {
        slot["activity_instance_id"]
        for slot in run["slots"]
        if slot["activity_instance_id"]
    } | {
        item["activity_instance_id"]
        for circuit_round in run["rounds"]
        for item in circuit_round["members"]
        if item["activity_instance_id"]
    }
    circuit_note = Note(
        root_id=sample_ultimate_goal.id,
        context_type="circuit_run",
        context_id=run_id,
        session_id=session.id,
        content="Deleted circuit note",
    )
    round_note = Note(
        root_id=sample_ultimate_goal.id,
        context_type="circuit_round",
        context_id=run["rounds"][0]["id"],
        session_id=session.id,
        content="Deleted circuit round note",
    )
    db_session.add_all([circuit_note, round_note])
    db_session.commit()

    assert authed_client.post(f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}/start").status_code == 200

    response = authed_client.delete(f"/api/{sample_ultimate_goal.id}/circuit-runs/{run_id}")

    assert response.status_code == 200, response.get_json()
    db_session.expire_all()
    assert db_session.get(CircuitRun, run_id) is None
    assert db_session.get(Note, circuit_note.id).deleted_at is not None
    assert db_session.get(Note, round_note.id).deleted_at is not None
    assert db_session.query(SessionWorkInterval).filter_by(session_id=session.id, ended_at=None).count() == 0
    assert all(db_session.get(ActivityInstance, instance_id).deleted_at is not None for instance_id in owned_instance_ids)
    refreshed_session = db_session.get(Session, session.id)
    assert refreshed_session.attributes["session_data"]["sections"][0]["items"] == []


def test_circuit_member_metrics_persist_to_each_round_result(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    non_set.has_metrics = True
    effort_metric = MetricDefinition(
        id=str(uuid.uuid4()),
        activity_id=non_set.id,
        root_id=sample_ultimate_goal.id,
        name="Effort",
        unit="rpe",
        is_active=True,
    )
    db_session.add(effort_metric)
    db_session.commit()
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    set_metric = sample_activity_definition.metric_definitions[0]
    set_member, non_set_member = run["rounds"][0]["members"]
    set_slot = run["slots"][0]
    assert [
        metric["name"] for metric in set_slot["activity_schema"]["metric_definitions"]
    ] == ["Weight", "Reps"]

    set_response = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{set_member['id']}/metrics",
        json={"metrics": [{"metric_id": set_metric.id, "value": 135}]},
    )
    assert set_response.status_code == 200, set_response.get_json()
    saved_set_member = set_response.get_json()["rounds"][0]["members"][0]
    assert saved_set_member["metrics"][0]["value"] == 135
    set_value = db_session.query(MetricValue).filter_by(
        activity_set_id=set_member["activity_set_id"],
        metric_definition_id=set_metric.id,
    ).one()
    assert set_value.activity_instance_id == run["slots"][0]["activity_instance_id"]

    set_metric.name = "Renamed after circuit start"
    set_metric.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    fetched = authed_client.get(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}",
    ).get_json()
    snapshotted_metric = fetched["slots"][0]["activity_schema"]["metric_definitions"][0]
    assert snapshotted_metric["name"] == "Weight"
    historical_update = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{set_member['id']}/metrics",
        json={"metrics": [{"metric_id": set_metric.id, "value": 140}]},
    )
    assert historical_update.status_code == 200, historical_update.get_json()

    instance_response = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{non_set_member['id']}/metrics",
        json={"metrics": [{"metric_id": effort_metric.id, "value": 8}]},
    )
    assert instance_response.status_code == 200, instance_response.get_json()
    saved_non_set_member = instance_response.get_json()["rounds"][0]["members"][1]
    assert saved_non_set_member["metrics"][0]["value"] == 8
    assert db_session.query(MetricValue).filter_by(
        activity_instance_id=non_set_member["activity_instance_id"],
        activity_set_id=None,
        metric_definition_id=effort_metric.id,
    ).count() == 1

    sessions_response = authed_client.get(f"/api/{sample_ultimate_goal.id}/sessions?limit=10")
    assert sessions_response.status_code == 200, sessions_response.get_json()
    listed_session = next(
        listed
        for listed in sessions_response.get_json()["sessions"]
        if listed["id"] == session.id
    )
    listed_circuit = listed_session["attributes"]["session_data"]["sections"][0]["items"][0]["circuit"]
    listed_members = listed_circuit["rounds"][0]["members"]
    assert listed_members[0]["metrics"][0]["value"] == 140
    assert listed_members[1]["metrics"][0]["value"] == 8

    rejected = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{set_member['id']}/metrics",
        json={"metrics": [{"metric_id": effort_metric.id, "value": 5}]},
    )
    assert rejected.status_code == 400

    cleared = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{set_member['id']}/metrics",
        json={"metrics": []},
    )
    assert cleared.status_code == 200, cleared.get_json()
    assert cleared.get_json()["rounds"][0]["members"][0]["metrics"] == []


def test_circuit_member_metric_cascade_fills_only_later_empty_rounds(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    for _ in range(2):
        run = authed_client.post(
            f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/rounds",
        ).get_json()

    metric = sample_activity_definition.metric_definitions[0]
    members = [circuit_round["members"][0] for circuit_round in run["rounds"]]
    source = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{members[0]['id']}/metrics",
        json={"metrics": [{"metric_id": metric.id, "value": 135}]},
    )
    assert source.status_code == 200, source.get_json()
    preserved = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{members[2]['id']}/metrics",
        json={"metrics": [{"metric_id": metric.id, "value": 155}]},
    )
    assert preserved.status_code == 200, preserved.get_json()

    response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{members[0]['id']}/metrics/cascade",
        json={"metric_id": metric.id},
    )

    assert response.status_code == 200, response.get_json()
    cascaded = response.get_json()
    values = [
        next(value["value"] for value in circuit_round["members"][0]["metrics"] if value["metric_id"] == metric.id)
        for circuit_round in cascaded["rounds"]
    ]
    assert values == [135, 135, 155]


def test_duplicate_session_preserves_circuit_items_without_flattening_members(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(
        authed_client,
        sample_ultimate_goal,
        sample_activity_definition,
        non_set,
    )
    source_run = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    template_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/create-template",
        json={"name": "Circuit copy"},
    )
    assert template_response.status_code == 201, template_response.get_json()
    assert template_response.get_json()["template_data"]["sections"][0]["activities"] == [{
        "type": "circuit",
        "circuit_definition_id": definition["id"],
    }]
    archived = authed_client.delete(
        f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}",
    )
    assert archived.status_code == 200, archived.get_json()
    session.completed = True
    session.completed_at = datetime.now(timezone.utc)
    db_session.commit()

    response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{session.id}/duplicate",
        json={},
    )

    assert response.status_code == 201, response.get_json()
    duplicate = response.get_json()
    section_items = duplicate["attributes"]["session_data"]["sections"][0]["items"]
    assert len(section_items) == 1
    assert section_items[0]["type"] == "circuit"
    assert section_items[0]["circuit_run_id"] != source_run["id"]
    duplicated_runs = db_session.query(CircuitRun).filter_by(session_id=duplicate["id"]).all()
    assert len(duplicated_runs) == 1
    assert duplicated_runs[0].circuit_definition_id == definition["id"]


def test_completed_circuit_members_receive_dynamic_progress_comparisons(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    metric = sample_activity_definition.metric_definitions[0]
    previous_session = _session(db_session, sample_ultimate_goal, test_user)
    previous_session.name = "Previous circuit baseline"
    previous_session.session_start = datetime.now(timezone.utc) - timedelta(days=1)
    previous_session.completed = True
    previous_instance = ActivityInstance(
        root_id=sample_ultimate_goal.id,
        session_id=previous_session.id,
        activity_definition_id=sample_activity_definition.id,
        completed=True,
        data={},
    )
    previous_set = ActivitySet(
        activity_instance=previous_instance,
        sort_order=0,
        status="completed",
    )
    db_session.add_all([
        previous_instance,
        previous_set,
        MetricValue(
            activity_instance=previous_instance,
            activity_set=previous_set,
            metric_definition_id=metric.id,
            value=100,
        ),
    ])
    db_session.commit()

    current_session = _session(db_session, sample_ultimate_goal, test_user)
    definition_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuits",
        json={
            "name": "Progress circuit",
            "slots": [{"activity_definition_id": sample_activity_definition.id}],
        },
    )
    assert definition_response.status_code == 201, definition_response.get_json()
    run_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/sessions/{current_session.id}/circuit-runs",
        json={"circuit_definition_id": definition_response.get_json()["id"], "section_index": 0},
    )
    assert run_response.status_code == 201, run_response.get_json()
    run = run_response.get_json()
    member = run["rounds"][0]["members"][0]
    metric_response = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/members/{member['id']}/metrics",
        json={"metrics": [{"metric_id": metric.id, "value": 125}]},
    )
    assert metric_response.status_code == 200, metric_response.get_json()
    completion_response = authed_client.post(
        f"/api/{sample_ultimate_goal.id}/circuit-runs/{run['id']}/complete",
    )
    assert completion_response.status_code == 200, completion_response.get_json()

    activities_response = authed_client.get(
        f"/api/{sample_ultimate_goal.id}/sessions/{current_session.id}/activities",
    )
    assert activities_response.status_code == 200, activities_response.get_json()
    circuit_instance = next(
        item for item in activities_response.get_json()
        if item["id"] == run["slots"][0]["activity_instance_id"]
    )
    comparison = next(
        item for item in circuit_instance["progress_comparison"]["metric_comparisons"]
        if item["metric_id"] == metric.id
    )
    set_comparison = comparison["set_comparisons"][0]
    assert set_comparison["set_index"] == 0
    assert set_comparison["current_value"] == 125.0
    assert set_comparison["previous_value"] == 100.0
    assert set_comparison["delta"] == 25.0
    assert set_comparison["pct_change"] == 25.0
    assert set_comparison["improved"] is True
    assert set_comparison["regressed"] is False


def test_circuit_definition_rejects_cross_fractal_activity(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
):
    other_root_id = str(uuid.uuid4())
    from models import Goal
    other_root = Goal(id=other_root_id, root_id=other_root_id, owner_id=test_user.id, name="Other")
    foreign_activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=other_root_id,
        name="Foreign",
        has_sets=False,
        has_metrics=False,
        metrics_multiplicative=False,
        has_splits=False,
    )
    db_session.add(other_root)
    db_session.commit()
    db_session.add(foreign_activity)
    db_session.commit()
    response = authed_client.post(f"/api/{sample_ultimate_goal.id}/circuits", json={
        "name": "Invalid",
        "slots": [{"activity_definition_id": foreign_activity.id}],
    })
    assert response.status_code == 400


def test_circuit_definition_group_placement_and_group_deletion(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    group = ActivityGroup(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Conditioning",
    )
    db_session.add(group)
    db_session.commit()

    response = authed_client.post(f"/api/{sample_ultimate_goal.id}/circuits", json={
        "name": "Grouped circuit",
        "group_id": group.id,
        "slots": [{"activity_definition_id": sample_activity_definition.id}],
    })
    assert response.status_code == 201, response.get_json()
    definition = response.get_json()
    assert definition["group_id"] == group.id

    ungrouped = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}",
        json={"group_id": None, "version": definition["version"]},
    )
    assert ungrouped.status_code == 200, ungrouped.get_json()
    assert ungrouped.get_json()["group_id"] is None

    regrouped = authed_client.patch(
        f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}",
        json={"group_id": group.id, "version": ungrouped.get_json()["version"]},
    )
    assert regrouped.status_code == 200, regrouped.get_json()
    deleted = authed_client.delete(f"/api/{sample_ultimate_goal.id}/activity-groups/{group.id}")
    assert deleted.status_code == 200, deleted.get_json()
    listed = authed_client.get(f"/api/{sample_ultimate_goal.id}/circuits").get_json()
    assert listed[0]["group_id"] is None


def test_template_snapshots_archived_circuit_in_typed_order(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    non_set = _non_set_activity(db_session, sample_ultimate_goal)
    definition = _create_definition(authed_client, sample_ultimate_goal, sample_activity_definition, non_set)
    assert authed_client.delete(f"/api/{sample_ultimate_goal.id}/circuits/{definition['id']}").status_code == 200
    template = SessionTemplate(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Circuit template",
        template_data={
            "session_type": "normal",
            "sections": [{
                "name": "Main",
                "items": [
                    {"type": "activity", "activity_definition_id": non_set.id},
                    {"type": "circuit", "circuit_definition_id": definition["id"]},
                ],
            }],
        },
    )
    db_session.add(template)
    db_session.commit()

    response = authed_client.post(f"/api/{sample_ultimate_goal.id}/sessions", json={
        "name": "From circuit template",
        "template_id": template.id,
        "session_start": datetime.now(timezone.utc).isoformat(),
    })
    assert response.status_code == 201, response.get_json()
    items = response.get_json()["attributes"]["session_data"]["sections"][0]["items"]
    assert [item["type"] for item in items] == ["activity", "circuit"]
    assert items[1]["circuit"]["name"] == definition["name"]
    assert db_session.query(CircuitRun).filter_by(session_id=response.get_json()["id"]).count() == 1

    sessions_response = authed_client.get(f"/api/{sample_ultimate_goal.id}/sessions?limit=10")
    assert sessions_response.status_code == 200, sessions_response.get_json()
    listed_session = next(
        session
        for session in sessions_response.get_json()["sessions"]
        if session["id"] == response.get_json()["id"]
    )
    listed_items = listed_session["attributes"]["session_data"]["sections"][0]["items"]
    assert [item["type"] for item in listed_items] == ["activity", "circuit"]
    assert listed_items[1]["circuit"]["name"] == definition["name"]
    assert len(listed_items[1]["circuit"]["rounds"]) == 1


def test_database_enforces_one_open_work_interval_per_session(
    db_session,
    test_user,
    sample_ultimate_goal,
    sample_activity_definition,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    first = ActivityInstance(root_id=sample_ultimate_goal.id, session_id=session.id, activity_definition_id=sample_activity_definition.id)
    second = ActivityInstance(root_id=sample_ultimate_goal.id, session_id=session.id, activity_definition_id=sample_activity_definition.id)
    db_session.add_all([first, second])
    db_session.flush()
    now = datetime.now(timezone.utc)
    db_session.add_all([
        SessionWorkInterval(root_id=sample_ultimate_goal.id, session_id=session.id, activity_instance_id=first.id, started_at=now),
        SessionWorkInterval(root_id=sample_ultimate_goal.id, session_id=session.id, activity_instance_id=second.id, started_at=now),
    ])
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


def test_database_enforces_circuit_shape_and_lifecycle_constraints(
    db_session,
    test_user,
    sample_ultimate_goal,
):
    session = _session(db_session, sample_ultimate_goal, test_user)
    invalid_active_run = CircuitRun(
        root_id=sample_ultimate_goal.id,
        session_id=session.id,
        name="Invalid active circuit",
        status="active",
    )
    db_session.add(invalid_active_run)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()
