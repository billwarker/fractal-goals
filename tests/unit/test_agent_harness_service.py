import pytest
from datetime import date, timedelta
from concurrent.futures import ThreadPoolExecutor
from threading import Barrier, Event
from sqlalchemy.orm import sessionmaker
from config import config

from models import (
    AgentApproval, AgentChangeCursor, AgentGrant, AgentOAuthClient,
    AgentOperation, AgentOutboxEvent,
    AgentProposal, AgentRun, AgentTaskBrief, AppSetting, EventLog, Note, Program,
    ProgramBlock, ProgramDay, SessionTemplate, program_day_templates,
    Goal, Session, utc_now,
)
from services.agent_harness_service import AgentHarnessError, AgentHarnessService
from services.agent_operation_versions import operation_state_hash
from services.agent_harness_runs import _enabled_run_origins
from services.feature_flag_service import FEATURE_FLAGS_SETTING_KEY


def _enable_agent_flags(db_session):
    setting = db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
    if setting is None:
        setting = AppSetting(key=FEATURE_FLAGS_SETTING_KEY, value={})
        db_session.add(setting)
    setting.value = {"ai_agent_connectors": True, "ai_agent_writes": True}
    db_session.commit()


def _note_proposal():
    return {
        "operations": [{
            "operation_id": "note-1",
            "type": "create_note",
            "data": {
                "content": "An untrusted note does not grant permission.",
                "context_type": "root",
                "context_id": "ROOT_ID",
            },
        }],
    }


@pytest.mark.parametrize(("flags", "privacy_approved", "expected"), [
    ({"ai_agent_writes": False, "ai_agent_connectors": True}, True, set()),
    ({"ai_agent_writes": True, "ai_agent_connectors": False}, False, {"first_party"}),
    ({"ai_agent_writes": True, "ai_agent_connectors": True}, False, {"first_party", "connector"}),
    ({"ai_agent_writes": True, "ai_agent_embedded": True, "ai_agent_embedded_openai": True}, True,
     {"first_party", "embedded_openai"}),
    ({"ai_agent_writes": True, "ai_agent_embedded": True, "ai_agent_embedded_openai": False,
      "ai_agent_embedded_anthropic": True}, True, {"first_party", "embedded_anthropic"}),
    ({"ai_agent_writes": True, "ai_agent_connectors": True, "ai_agent_embedded": True,
      "ai_agent_embedded_openai": True}, True, {"first_party", "connector", "embedded_openai"}),
])
@pytest.mark.unit
def test_run_origin_gates_are_independent(flags, privacy_approved, expected, monkeypatch):
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", privacy_approved)
    assert _enabled_run_origins(flags) == expected


@pytest.mark.unit
def test_embedded_only_origin_executes_without_enabling_external_connectors(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    setting = db_session.get(AppSetting, "feature_flags") or AppSetting(key="feature_flags", value={})
    setting.value = {
        "ai_agent_connectors": False,
        "ai_agent_writes": True,
        "ai_agent_embedded": True,
        "ai_agent_embedded_openai": True,
    }
    db_session.add(setting)
    db_session.commit()
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a planning note.",
        "timezone": "UTC",
    }, execution_origin="embedded_openai")
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")

    result = service.run_once("worker-embedded-origin")

    assert result["status"] == "succeeded"
    assert db_session.get(AppSetting, "feature_flags").value["ai_agent_connectors"] is False


@pytest.mark.unit
def test_embedded_provider_flag_change_stops_unstarted_operations(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    setting = AppSetting(key="feature_flags", value={
        "ai_agent_connectors": False,
        "ai_agent_writes": True,
        "ai_agent_embedded": True,
        "ai_agent_embedded_openai": True,
    })
    db_session.add(setting)
    db_session.commit()
    monkeypatch.setattr(config, "AGENT_EMBEDDED_PRIVACY_APPROVED", True)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave two reviewed notes.",
        "timezone": "UTC",
    }, execution_origin="embedded_openai")
    payload = _note_proposal()
    payload["operations"] = [
        {**payload["operations"][0], "operation_id": "first"},
        {**payload["operations"][0], "operation_id": "second"},
    ]
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    payload["operations"][1]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")
    execute = service._execute_operation

    def disable_after_first(run, operation, worker_id, fencing_token):
        result = execute(run, operation, worker_id, fencing_token)
        if operation.operation_id == "first":
            current_flags = db_session.get(AppSetting, "feature_flags")
            current_flags.value = {**current_flags.value, "ai_agent_embedded_openai": False}
            db_session.commit()
        return result

    service._execute_operation = disable_after_first
    result = service.run_once("worker-origin-change")

    assert result["status"] == "partially_succeeded"
    assert [operation["status"] for operation in result["operations"]] == ["succeeded", "failed"]
    assert result["operations"][1]["error"]["code"] == "feature_disabled"


def test_approved_proposal_commits_domain_write_with_operation_ledger_and_is_idempotent(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "America/Toronto",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)

    with pytest.raises(AgentHarnessError, match="changed after review"):
        service.decide_proposal(test_user.id, proposal["id"], "0" * 64, "approve")

    approved = service.decide_proposal(
        test_user.id,
        proposal["id"],
        proposal["proposal_hash"],
        "approve",
    )
    duplicate = service.queue_approved_proposal(proposal["id"], test_user.id)
    assert duplicate["id"] == approved["id"]

    completed = service.run_once("worker-test")
    assert completed["status"] == "succeeded"
    assert len(completed["operations"]) == 1
    assert completed["operations"][0]["status"] == "succeeded"
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 1
    assert db_session.query(AgentOperation).filter_by(run_id=approved["id"], status="succeeded").count() == 1

    # Re-running an already completed run has no candidate work to claim and
    # cannot duplicate its note or ledger result.
    assert service.run_once("worker-test") is None
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 1


@pytest.mark.unit
def test_two_approved_updates_to_one_goal_share_a_deterministic_precondition(
    db_session, test_user, sample_ultimate_goal,
):
    """Earlier reviewed edits must not invalidate later edits in the same proposal."""
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Rename the goal and clarify its description.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {"operations": [
        {
            "operation_id": "rename-goal",
            "type": "update_goal",
            "goal_id": sample_ultimate_goal.id,
            "data": {"name": "Renamed goal"},
        },
        {
            "operation_id": "describe-goal",
            "type": "update_goal",
            "goal_id": sample_ultimate_goal.id,
            "data": {"description": "Clarified after the rename."},
        },
    ]})
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")

    result = service.run_once("worker-sequential-updates")

    assert result["status"] == "succeeded"
    assert [item["status"] for item in result["operations"]] == ["succeeded", "succeeded"]
    db_session.refresh(sample_ultimate_goal)
    assert sample_ultimate_goal.name == "Renamed goal"
    assert sample_ultimate_goal.description == "Clarified after the rename."


def test_proposal_cannot_reference_an_entity_from_another_fractal(
    db_session, test_user, sample_ultimate_goal,
):
    from models import Goal

    other_root = Goal(
        name="Other fractal",
        owner_id=test_user.id,
        root_id=None,
    )
    db_session.add(other_root)
    db_session.flush()
    other_root.root_id = other_root.id
    db_session.commit()

    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Make a goal in this fractal.",
        "timezone": "UTC",
    })
    with pytest.raises(AgentHarnessError, match="Parent goal not found"):
        service.create_proposal(test_user.id, task["id"], {
            "operations": [{
                "operation_id": "goal-1",
                "type": "create_goal",
                "data": {
                    "name": "Escaped goal",
                    "type": "LongTermGoal",
                    "parent_id": other_root.id,
                },
            }],
        })

    assert db_session.query(AgentProposal).count() == 0


def test_task_context_rejects_soft_deleted_entities(
    db_session, test_user, sample_ultimate_goal,
):
    deleted_child = Goal(
        name="Deleted context target",
        owner_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        parent_id=sample_ultimate_goal.id,
        level_id=sample_ultimate_goal.level_id,
        deleted_at=utc_now(),
    )
    db_session.add(deleted_child)
    db_session.commit()

    service = AgentHarnessService(db_session)
    with pytest.raises(AgentHarnessError, match="unavailable or out-of-scope"):
        service.create_task(test_user.id, {
            "root_id": sample_ultimate_goal.id,
            "request_text": "Use this saved context.",
            "timezone": "UTC",
            "context": {"goal_ids": [deleted_child.id]},
        })

    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Create a child under the saved parent.",
        "timezone": "UTC",
    })
    with pytest.raises(AgentHarnessError, match="Parent goal not found"):
        service.create_proposal(test_user.id, task["id"], {"operations": [{
            "operation_id": "deleted-parent",
            "type": "create_goal",
            "data": {
                "name": "Must not attach to deleted parent",
                "type": "LongTermGoal",
                "parent_id": deleted_child.id,
            },
        }]})


def test_task_operation_quota_rejects_oversized_proposal(
    db_session, test_user, sample_ultimate_goal,
):
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave one note.",
        "timezone": "UTC",
        "limits": {"max_operations": 1},
    })
    with pytest.raises(AgentHarnessError, match="at most 1 operations"):
        service.create_proposal(test_user.id, task["id"], {"operations": [
            {
                "operation_id": "note-1",
                "type": "create_note",
                "data": {
                    "content": "First note",
                    "context_type": "root",
                    "context_id": sample_ultimate_goal.id,
                },
            },
            {
                "operation_id": "note-2",
                "type": "create_note",
                "data": {
                    "content": "Second note",
                    "context_type": "root",
                    "context_id": sample_ultimate_goal.id,
                },
            },
        ]})


def test_goal_proposal_rejects_invalid_type_and_unrecognized_fields(
    db_session, test_user, sample_ultimate_goal,
):
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Create a child goal.",
        "timezone": "UTC",
    })
    with pytest.raises(ValueError, match="Invalid goal type"):
        service.create_proposal(test_user.id, task["id"], {"operations": [{
            "operation_id": "bad-level",
            "type": "create_goal",
            "data": {
                "name": "Invalid level",
                "type": "NotARealGoalLevel",
                "parent_id": sample_ultimate_goal.id,
            },
        }]})

    with pytest.raises(ValueError, match="Extra inputs are not permitted"):
        service.create_proposal(test_user.id, task["id"], {"operations": [{
            "operation_id": "hidden-completion",
            "type": "create_goal",
            "data": {
                "name": "Must stay an ordinary goal",
                "type": "LongTermGoal",
                "parent_id": sample_ultimate_goal.id,
                "completed": True,
            },
        }]})


def test_program_day_proposals_reject_duplicate_dates_and_missing_templates(
    db_session, test_user, sample_ultimate_goal,
):
    from services.programs import ProgramService

    start_date = date.today() + timedelta(days=120)
    end_date = start_date + timedelta(days=14)
    program = ProgramService.create_program(
        db_session,
        sample_ultimate_goal.id,
        {
            "name": "Agent proposal dates",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "selectedGoals": [sample_ultimate_goal.id],
        },
        test_user.id,
    )
    block = ProgramService.create_block(
        db_session,
        sample_ultimate_goal.id,
        program["id"],
        {
            "name": "Agent proposal block",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
        test_user.id,
    )
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Add one program day.",
        "timezone": "UTC",
    })

    duplicate_day = {
        "name": "Repeated date",
        "date": start_date.isoformat(),
    }
    with pytest.raises(ValueError, match="already exists on this date"):
        service.create_proposal(test_user.id, task["id"], {"operations": [
            {
                "operation_id": "day-1",
                "type": "create_program_day",
                "program_id": program["id"],
                "block_id": block["id"],
                "data": duplicate_day,
            },
            {
                "operation_id": "day-2",
                "type": "create_program_day",
                "program_id": program["id"],
                "block_id": block["id"],
                "data": duplicate_day,
            },
        ]})

    with pytest.raises(ValueError, match="Session templates not found"):
        service.create_proposal(test_user.id, task["id"], {"operations": [{
            "operation_id": "missing-template-day",
            "type": "create_program_day",
            "program_id": program["id"],
            "block_id": block["id"],
            "data": {
                "name": "Unknown template",
                "date": (start_date + timedelta(days=1)).isoformat(),
                "template_ids": ["not-a-template"],
            },
        }]})


def test_write_feature_flag_stops_worker_before_claiming_queued_run(db_session, test_user, sample_ultimate_goal):
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    run = service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")

    assert service.run_once("worker-test") is None
    assert service.get_run(test_user.id, run["id"])["status"] == "queued"


def test_reviewed_workflow_resolves_temporary_references_through_program_day_and_note(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Build a practice program and explain its plan.",
        "timezone": "America/Toronto",
    })
    start_date = date.today() + timedelta(days=60)
    end_date = start_date + timedelta(days=27)
    proposal = service.create_proposal(test_user.id, task["id"], {
        "operations": [
            {
                "operation_id": "template",
                "type": "create_template",
                "data": {
                    "name": "Practice session",
                    "template_data": {
                        "session_type": "normal",
                        "sections": [{"name": "Main", "activities": []}],
                    },
                },
            },
            {
                "operation_id": "program",
                "type": "create_program",
                "data": {
                    "name": "Four week practice plan",
                    "start_date": start_date.isoformat(),
                    "end_date": end_date.isoformat(),
                    "selectedGoals": [sample_ultimate_goal.id],
                },
            },
            {
                "operation_id": "block",
                "type": "create_block",
                "program_id": "$ref:program",
                "data": {"name": "Foundation", "start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
            },
            {
                "operation_id": "day",
                "type": "create_program_day",
                "program_id": "$ref:program",
                "block_id": "$ref:block",
                "data": {"name": "Practice day", "day_of_week": ["Monday", "Wednesday", "Friday"], "template_ids": ["$ref:template"]},
            },
            {
                "operation_id": "schedule",
                "type": "schedule_program_day",
                "program_id": "$ref:program",
                "block_id": "$ref:block",
                "day_id": "$ref:day",
                "data": {"session_start": f"{start_date.isoformat()}T09:00:00Z"},
            },
            {
                "operation_id": "note",
                "type": "create_note",
                "data": {
                    "content": "Practice consistently and review progress weekly.",
                    "context_type": "program",
                    "context_id": "$ref:program",
                },
            },
        ],
    })
    assert [item["action"] for item in proposal["preview"]] == [
        "Create session template",
        "Create program",
        "Create program block",
        "Create program day",
        "Schedule program day",
        "Add note",
    ]
    assert db_session.query(Session).filter_by(root_id=sample_ultimate_goal.id).count() == 0

    run = service.decide_proposal(
        test_user.id,
        proposal["id"],
        proposal["proposal_hash"],
        "approve",
    )
    completed = service.run_once("worker-test")

    assert completed["status"] == "succeeded"
    assert all(row["status"] == "succeeded" for row in completed["operations"])
    assert completed["operations"][1]["result"]["id"]
    scheduled_result = completed["operations"][4]["result"]
    scheduled_session = db_session.query(Session).filter_by(
        id=scheduled_result["session_id"],
        root_id=sample_ultimate_goal.id,
    ).one()
    assert scheduled_session.program_day_id == scheduled_result["program_day_id"]
    assert db_session.query(Session).filter_by(root_id=sample_ultimate_goal.id).count() == 1
    assert run["id"] == completed["id"]

    context = service.get_goal_context(test_user.id, sample_ultimate_goal.id)
    assert context["programs"]["items"][0]["name"] == "Four week practice plan"
    assert context["programs"]["items"][0]["blocks"][0]["name"] == "Foundation"
    practice_day = context["programs"]["items"][0]["blocks"][0]["days"][0]
    assert practice_day["name"] == "Practice day"
    assert practice_day["templates"][0]["name"] == "Practice session"


def test_scheduling_existing_program_day_rejects_stale_preview(
    db_session, test_user, sample_ultimate_goal,
):
    from services.programs import ProgramService

    _enable_agent_flags(db_session)
    start_date = date.today() + timedelta(days=80)
    end_date = start_date + timedelta(days=14)
    program = ProgramService.create_program(
        db_session,
        sample_ultimate_goal.id,
        {
            "name": "Reviewed schedule",
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
            "selectedGoals": [sample_ultimate_goal.id],
        },
        test_user.id,
    )
    block = ProgramService.create_block(
        db_session,
        sample_ultimate_goal.id,
        program["id"],
        {"name": "Block", "start_date": start_date.isoformat(), "end_date": end_date.isoformat()},
        test_user.id,
    )
    day = ProgramService.add_block_day(
        db_session,
        sample_ultimate_goal.id,
        program["id"],
        block["id"],
        {"name": "Reviewed day", "day_of_week": ["Monday"]},
        test_user.id,
    )["days"][0]

    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Schedule this day.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {
        "operations": [{
            "operation_id": "schedule",
            "type": "schedule_program_day",
            "program_id": program["id"],
            "block_id": block["id"],
            "day_id": day["id"],
            "data": {"session_start": f"{start_date.isoformat()}T09:00:00Z"},
        }],
    })
    ProgramService.schedule_block_day(
        db_session,
        sample_ultimate_goal.id,
        program["id"],
        block["id"],
        day["id"],
        {"session_start": f"{start_date.isoformat()}T09:00:00Z"},
        test_user.id,
    )
    assert db_session.query(Session).filter_by(root_id=sample_ultimate_goal.id).count() == 1

    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")
    run = service.run_once("worker-test")

    assert run["status"] == "failed"
    assert run["operations"][0]["error"]["code"] == "stale_context"
    assert db_session.query(Session).filter_by(root_id=sample_ultimate_goal.id).count() == 1


def test_goal_update_is_version_checked_and_undo_requires_a_new_approval(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Rename this fractal.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {
        "operations": [{
            "operation_id": "rename-root",
            "type": "update_goal",
            "goal_id": sample_ultimate_goal.id,
            "data": {"name": "Updated fractal name"},
        }],
    })
    sample_ultimate_goal.name = "Changed after preview"
    db_session.commit()
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")
    stale_run = service.run_once("worker-test")

    assert stale_run["status"] == "failed"
    assert stale_run["operations"][0]["error"]["code"] == "stale_context"
    assert sample_ultimate_goal.name == "Changed after preview"

    next_task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Rename this fractal.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, next_task["id"], {
        "operations": [{
            "operation_id": "rename-root-again",
            "type": "update_goal",
            "goal_id": sample_ultimate_goal.id,
            "data": {"name": "Updated fractal name"},
        }],
    })
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")
    updated_run = service.run_once("worker-test")
    assert updated_run["status"] == "succeeded"
    assert sample_ultimate_goal.name == "Updated fractal name"

    sample_ultimate_goal.name = "Manual edit after run"
    db_session.commit()
    task_count_before_stale_undo = db_session.query(AgentTaskBrief).filter_by(
        user_id=test_user.id,
    ).count()
    with pytest.raises(AgentHarnessError, match="changed after the original run"):
        service.create_undo_proposal(test_user.id, updated_run["id"])
    assert sample_ultimate_goal.name == "Manual edit after run"


    assert db_session.query(AgentTaskBrief).filter_by(user_id=test_user.id).count() == task_count_before_stale_undo

    safe_undo_task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Make one more reviewed rename.",
        "timezone": "UTC",
    })
    safe_undo_proposal = service.create_proposal(test_user.id, safe_undo_task["id"], {
        "operations": [{
            "operation_id": "rename-after-manual-edit",
            "type": "update_goal",
            "goal_id": sample_ultimate_goal.id,
            "data": {"name": "Changed after manual edit"},
        }],
    })
    service.decide_proposal(
        test_user.id,
        safe_undo_proposal["id"],
        safe_undo_proposal["proposal_hash"],
        "approve",
    )
    safe_undo_run = service.run_once("worker-test")
    assert safe_undo_run["status"] == "succeeded"
    safe_undo_operation = {
        "type": "update_goal",
        "goal_id": sample_ultimate_goal.id,
    }
    assert operation_state_hash(
        db_session, sample_ultimate_goal.id, safe_undo_operation,
    ) == safe_undo_run["operations"][0]["result"]["inverse"]["post_state_hash"]

    undo_proposal = service.create_undo_proposal(test_user.id, safe_undo_run["id"])
    assert undo_proposal["status"] == "awaiting_approval"
    assert undo_proposal["preview"][0]["changes"]["name"] == "Manual edit after run"
    service.decide_proposal(
        test_user.id,
        undo_proposal["id"],
        undo_proposal["proposal_hash"],
        "approve",
    )
    undo_run = service.run_once("worker-test")
    assert undo_run["status"] == "succeeded"
    assert sample_ultimate_goal.name == "Manual edit after run"

@pytest.mark.unit
def test_manual_goal_edit_between_review_hash_and_execution_lock_survives(
    db_session, test_user, sample_ultimate_goal, monkeypatch,
):
    from sqlalchemy.orm import sessionmaker
    import services.agent_harness_runs as runs_module

    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Rename the root goal.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {"operations": [{
        "operation_id": "rename-root-race",
        "type": "update_goal",
        "goal_id": sample_ultimate_goal.id,
        "data": {"name": "Agent name"},
    }]})
    service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")

    hash_read = Event()
    resume_execution = Event()
    original_hash = runs_module.operation_state_hash

    def pause_after_initial_hash(*args, for_update=False, **kwargs):
        result = original_hash(*args, for_update=for_update, **kwargs)
        if not for_update and not hash_read.is_set():
            hash_read.set()
            assert resume_execution.wait(timeout=10)
        return result

    monkeypatch.setattr(runs_module, "operation_state_hash", pause_after_initial_hash)
    independent_sessions = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)

    def execute_on_independent_connection():
        with independent_sessions() as worker_session:
            return AgentHarnessService(worker_session).run_once("worker-race")

    with ThreadPoolExecutor(max_workers=1) as executor:
        execution = executor.submit(execute_on_independent_connection)
        assert hash_read.wait(timeout=10)
        with independent_sessions() as manual_session:
            manual_goal = manual_session.query(Goal).filter_by(id=sample_ultimate_goal.id).one()
            manual_goal.name = "Manual name survives"
            manual_session.commit()
        resume_execution.set()
        run = execution.result(timeout=15)

    db_session.expire_all()
    assert run["status"] == "failed"
    assert run["operations"][0]["error"]["code"] == "stale_context"
    assert db_session.get(Goal, sample_ultimate_goal.id).name == "Manual name survives"


@pytest.mark.unit
def test_goal_subtree_snapshot_queries_are_bounded(query_counter, db_session, sample_goal_hierarchy):
    query_counter["total"] = 0

    operation_state_hash(db_session, sample_goal_hierarchy["ultimate"].id, {
        "type": "update_goal",
        "goal_id": sample_goal_hierarchy["ultimate"].id,
    })

    assert query_counter["total"] <= 12


@pytest.mark.unit
def test_selected_program_and_template_pagination_reaches_beyond_initial_context(
    db_session, test_user, sample_ultimate_goal,
):
    from datetime import datetime, timedelta

    start = datetime(2026, 1, 1)
    programs = [Program(
        id=f"program-page-{index}",
        root_id=sample_ultimate_goal.id,
        name=f"Program {index}",
        start_date=start + timedelta(days=index),
        end_date=start + timedelta(days=index + 14),
        weekly_schedule={},
    ) for index in range(6)]
    selected_block = ProgramBlock(
        id="selected-program-block",
        program_id=programs[5].id,
        name="Selected block",
        start_date=start.date(),
        end_date=(start + timedelta(days=14)).date(),
    )
    selected_day = ProgramDay(
        id="selected-program-day",
        block_id=selected_block.id,
        name="Selected day",
        day_number=1,
    )
    templates = [SessionTemplate(
        id=f"selected-template-{index}",
        root_id=sample_ultimate_goal.id,
        name=f"Template {index}",
        template_data={"session_type": "normal", "sections": []},
    ) for index in range(8)]
    db_session.add_all([*programs, selected_block, selected_day, *templates])
    db_session.flush()
    db_session.execute(program_day_templates.insert(), [
        {"program_day_id": selected_day.id, "session_template_id": template.id,
         "order": index, "is_required": True}
        for index, template in enumerate(templates)
    ])
    db_session.commit()

    service = AgentHarnessService(db_session)
    catalog_page = service.get_goal_context(
        test_user.id,
        sample_ultimate_goal.id,
        programs_offset=5,
        page_size=1,
    )["programs"]["catalog"]
    detail = service.get_program_context(
        test_user.id,
        sample_ultimate_goal.id,
        program_id=programs[5].id,
        block_id=selected_block.id,
        day_id=selected_day.id,
        templates_offset=7,
        limit=1,
    )

    assert catalog_page["items"][0]["id"] == programs[5].id
    assert detail["selected"]["day"]["templates"]["items"][0]["id"] == templates[7].id


@pytest.mark.unit
def test_outbox_dispatch_commits_deduplicated_event_history_before_ack(
    db_session, test_user, sample_ultimate_goal,
):
    event_id = "agent-outbox-event-once"
    db_session.add(AgentOutboxEvent(
        event_type="goal.updated",
        payload={
            "id": event_id,
            "data": {"root_id": sample_ultimate_goal.id, "goal_id": sample_ultimate_goal.id,
                     "name": "Updated goal"},
            "source": "agent-harness",
            "timestamp": utc_now().isoformat(),
        },
    ))
    db_session.commit()

    service = AgentHarnessService(db_session)
    assert service.dispatch_outbox() == 1
    assert db_session.query(EventLog).filter_by(event_id=event_id).count() == 1
    assert service.dispatch_outbox() == 0
    assert db_session.query(EventLog).filter_by(event_id=event_id).count() == 1


def test_proposal_rejects_forward_or_unknown_temporary_references(
    db_session, test_user, sample_ultimate_goal,
):
    task = AgentHarnessService(db_session).create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Create a goal after its parent.",
        "timezone": "UTC",
    })
    with pytest.raises(AgentHarnessError, match="earlier operation"):
        AgentHarnessService(db_session).create_proposal(test_user.id, task["id"], {
            "operations": [{
                "operation_id": "child",
                "type": "create_goal",
                "data": {
                    "name": "Child goal",
                    "type": "LongTermGoal",
                    "parent_id": "$ref:future-parent",
                },
            }],
        })
    assert db_session.query(AgentProposal).count() == 0


def test_run_lease_renews_only_while_its_fence_is_current(
    db_session, test_user, sample_ultimate_goal,
):
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    run = service.decide_proposal(test_user.id, proposal["id"], proposal["proposal_hash"], "approve")
    run_row = db_session.get(AgentRun, run["id"])
    run_row.status = "running"
    run_row.lease_owner = "worker-test"
    run_row.fencing_token = 7
    run_row.lease_expires_at = utc_now() + timedelta(seconds=30)
    db_session.commit()

    before = run_row.lease_expires_at
    renewed = service._renew_run_lease(run["id"], "worker-test", 7)
    assert renewed.lease_expires_at > before
    assert service._renew_run_lease(run["id"], "another-worker", 7) is None
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 0


def test_proposal_mutation_after_approval_is_rejected_before_any_write(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )

    row = db_session.get(AgentProposal, proposal["id"])
    row.operations = [{
        **row.operations[0],
        "data": {**row.operations[0]["data"], "content": "Changed after approval"},
    }]
    db_session.commit()

    result = service.run_once("worker-test")

    assert result["status"] == "failed"
    assert result["operations"][0]["error"]["code"] == "approval_required"
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 0


def test_concurrent_apply_after_approval_creates_one_run_and_operation_ledger(
    db_session, test_user, sample_ultimate_goal,
):
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    proposal_row = db_session.get(AgentProposal, proposal["id"])
    proposal_row.status = "approved"
    db_session.add(AgentApproval(
        proposal_id=proposal_row.id,
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
        proposal_hash=proposal_row.proposal_hash,
        decision="approve",
    ))
    db_session.commit()

    factory = sessionmaker(bind=db_session.get_bind(), expire_on_commit=False)
    start = Barrier(2)

    def apply_from_independent_session():
        session = factory()
        try:
            start.wait(timeout=5)
            return AgentHarnessService(session).queue_approved_proposal(
                proposal["id"], test_user.id,
            )["id"]
        finally:
            session.close()

    with ThreadPoolExecutor(max_workers=2) as pool:
        run_ids = list(pool.map(lambda _: apply_from_independent_session(), range(2)))

    assert run_ids[0] == run_ids[1]
    assert db_session.query(AgentRun).filter_by(proposal_id=proposal["id"]).count() == 1
    assert db_session.query(AgentOperation).filter_by(run_id=run_ids[0]).count() == 1


def test_revoked_grant_stops_remaining_operations_after_committed_work(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    client = AgentOAuthClient(
        client_id="revocation-test-client",
        client_name="Revocation test",
        redirect_uris=["https://connector.example.test/callback"],
    )
    db_session.add(client)
    db_session.flush()
    grant = AgentGrant(
        user_id=test_user.id,
        client_id=client.id,
        allowed_roots=[sample_ultimate_goal.id],
        scopes="notes:write",
        audience="https://mcp.example.test/mcp",
        expires_at=utc_now() + timedelta(days=1),
    )
    db_session.add(grant)
    db_session.commit()

    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave two planning notes.",
        "timezone": "UTC",
    }, grant_id=grant.id)
    proposal = service.create_proposal(test_user.id, task["id"], {"operations": [
        {
            "operation_id": "first-note",
            "type": "create_note",
            "data": {
                "content": "Committed before revocation.",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        },
        {
            "operation_id": "second-note",
            "type": "create_note",
            "data": {
                "content": "Must not be written after revocation.",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        },
    ]}, grant_id=grant.id)
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )
    execute = service._execute_operation

    def revoke_after_first_commit(run, operation, worker_id, fencing_token):
        result = execute(run, operation, worker_id, fencing_token)
        if operation.operation_id == "first-note":
            grant.revoked_at = utc_now()
            db_session.commit()
        return result

    service._execute_operation = revoke_after_first_commit
    result = service.run_once("worker-test")

    assert result["status"] == "partially_succeeded"
    assert [item["status"] for item in result["operations"]] == ["succeeded", "failed"]
    assert result["operations"][1]["error"]["code"] == "grant_revoked"
    notes = db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).all()
    assert [note.content for note in notes] == ["Committed before revocation."]


def test_post_commit_worker_crash_reuses_the_committed_operation_result(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )
    execute = service._execute_operation

    def lose_worker_response_after_commit(*args):
        execute(*args)
        raise RuntimeError("simulated process interruption after commit")

    service._execute_operation = lose_worker_response_after_commit
    result = service.run_once("worker-test")

    assert result["status"] == "succeeded"
    assert result["operations"][0]["status"] == "succeeded"
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 1


def test_pre_commit_worker_crash_rolls_back_domain_write_cursor_and_outbox(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave a short planning note.",
        "timezone": "UTC",
    })
    payload = _note_proposal()
    payload["operations"][0]["data"]["context_id"] = sample_ultimate_goal.id
    proposal = service.create_proposal(test_user.id, task["id"], payload)
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )
    execute = service._execute_operation

    def fail_immediately_before_commit(run, operation, worker_id, fencing_token):
        commit = db_session.commit

        def interrupt_commit():
            raise RuntimeError("simulated process interruption before commit")

        db_session.commit = interrupt_commit
        try:
            return execute(run, operation, worker_id, fencing_token)
        finally:
            db_session.commit = commit

    service._execute_operation = fail_immediately_before_commit
    result = service.run_once("worker-test")

    assert result["status"] == "failed"
    assert result["operations"][0]["error"]["code"] == "execution_failed"
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 0
    assert db_session.query(AgentChangeCursor).filter_by(
        user_id=test_user.id,
        root_id=sample_ultimate_goal.id,
    ).count() == 0
    assert db_session.query(AgentOutboxEvent).count() == 0


def test_restarted_worker_reclaims_expired_run_without_repeating_committed_operation(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave two planning notes.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {"operations": [
        {
            "operation_id": f"restart-note-{index}",
            "type": "create_note",
            "data": {
                "content": f"Restart note {index}",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        }
        for index in range(2)
    ]})
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )
    run_row = db_session.query(AgentRun).filter_by(proposal_id=proposal["id"]).one()
    run_row.status = "running"
    run_row.lease_owner = "crashed-worker"
    run_row.lease_expires_at = utc_now() + timedelta(seconds=30)
    run_row.fencing_token = 4
    db_session.commit()
    operations = db_session.query(AgentOperation).filter_by(
        run_id=run_row.id,
    ).order_by(AgentOperation.sequence).all()

    service._execute_operation(run_row, operations[0], "crashed-worker", 4)
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 1

    run_row = db_session.get(AgentRun, run_row.id)
    run_row.lease_expires_at = utc_now() - timedelta(seconds=1)
    db_session.commit()
    resumed = service.run_once("recovery-worker")

    assert resumed["status"] == "succeeded"
    assert [operation["status"] for operation in resumed["operations"]] == [
        "succeeded", "succeeded",
    ]
    assert db_session.get(AgentRun, run_row.id).fencing_token == 5
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 2


def test_later_operation_failure_preserves_committed_progress_and_skips_dependents(
    db_session, test_user, sample_ultimate_goal,
):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    task = service.create_task(test_user.id, {
        "root_id": sample_ultimate_goal.id,
        "request_text": "Leave notes in order.",
        "timezone": "UTC",
    })
    proposal = service.create_proposal(test_user.id, task["id"], {"operations": [
        {
            "operation_id": f"note-{index}",
            "type": "create_note",
            "data": {
                "content": f"Note {index}",
                "context_type": "root",
                "context_id": sample_ultimate_goal.id,
            },
        }
        for index in range(3)
    ]})
    service.decide_proposal(
        test_user.id, proposal["id"], proposal["proposal_hash"], "approve",
    )
    execute = service._execute_operation

    def fail_second_operation(run, operation, worker_id, fencing_token):
        if operation.operation_id == "note-1":
            raise AgentHarnessError("Injected dependency failure", 409, "dependency_failed")
        return execute(run, operation, worker_id, fencing_token)

    service._execute_operation = fail_second_operation
    result = service.run_once("worker-test")

    assert result["status"] == "partially_succeeded"
    assert [item["status"] for item in result["operations"]] == [
        "succeeded", "failed", "skipped",
    ]
    assert result["operations"][1]["error"]["code"] == "dependency_failed"
    assert db_session.query(Note).filter_by(root_id=sample_ultimate_goal.id).count() == 1
