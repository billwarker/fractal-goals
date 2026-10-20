"""Agent proposals can sequence sibling goals through set_goal_sequence (services/goal_sequence_service.py)."""
import pytest

from models import Goal, GoalSequenceTrack
from services.agent_harness_service import AgentHarnessError, AgentHarnessService
from tests.unit.test_agent_harness_service import _enable_agent_flags


def _goal_op(operation_id, name, parent_id, goal_type="LongTermGoal"):
    return {"operation_id": operation_id, "type": "create_goal",
            "data": {"name": name, "type": goal_type, "parent_id": parent_id}}


def _run(service, user_id, task_id, operations):
    proposal = service.create_proposal(user_id, task_id, {"operations": operations})
    service.decide_proposal(user_id, proposal["id"], proposal["proposal_hash"], "approve")
    return proposal, service.run_once("worker-test")


def _task(service, user_id, root_id):
    return service.create_task(user_id, {
        "root_id": root_id, "request_text": "Order my goals.", "timezone": "America/Toronto",
    })


@pytest.mark.unit
def test_a_proposal_creates_goals_and_sequences_them_by_reference(db_session, test_user, sample_ultimate_goal):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    root = sample_ultimate_goal.id
    task = _task(service, test_user.id, root)

    proposal, run = _run(service, test_user.id, task["id"], [
        _goal_op("first", "Learn scales", root),
        _goal_op("second", "Learn modes", root),
        {"operation_id": "order", "type": "set_goal_sequence", "goal_ids": ["$ref:first", "$ref:second"]},
    ])

    assert proposal["preview"][2]["action"] == "Create sequence"
    assert proposal["preview"][2]["goal_names"] == ["Learn scales", "Learn modes"]
    assert run["status"] == "succeeded"
    db_session.expire_all()
    goals = {goal.name: goal for goal in db_session.query(Goal).filter(Goal.name.in_(["Learn scales", "Learn modes"]))}
    track_id = goals["Learn scales"].sequence_track_id
    assert track_id and goals["Learn modes"].sequence_track_id == track_id
    assert [(goals[name].sequence_position, goals[name].paused) for name in ("Learn scales", "Learn modes")] == [
        (1, False), (2, True),
    ]


@pytest.mark.unit
def test_cousins_are_rejected_when_proposed(db_session, test_user, sample_ultimate_goal):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    root = sample_ultimate_goal.id
    task = _task(service, test_user.id, root)

    with pytest.raises(AgentHarnessError, match="sibling goals of one parent"):
        service.create_proposal(test_user.id, task["id"], {"operations": [
            _goal_op("a", "Branch A", root),
            _goal_op("b", "Branch B", root),
            _goal_op("a1", "Under A", "$ref:a", "MidTermGoal"),
            _goal_op("b1", "Under B", "$ref:b", "MidTermGoal"),
            {"operation_id": "order", "type": "set_goal_sequence", "goal_ids": ["$ref:a1", "$ref:b1"]},
        ]})
    assert db_session.query(GoalSequenceTrack).count() == 0


@pytest.mark.unit
def test_reordering_and_ending_an_existing_sequence(db_session, test_user, sample_ultimate_goal):
    _enable_agent_flags(db_session)
    service = AgentHarnessService(db_session)
    root = sample_ultimate_goal.id
    task = _task(service, test_user.id, root)
    _run(service, test_user.id, task["id"], [
        _goal_op("first", "Step one", root),
        _goal_op("second", "Step two", root),
        {"operation_id": "order", "type": "set_goal_sequence", "goal_ids": ["$ref:first", "$ref:second"]},
    ])
    db_session.expire_all()
    one, two = (db_session.query(Goal).filter_by(name=name).one().id for name in ("Step one", "Step two"))

    proposal, run = _run(service, test_user.id, _task(service, test_user.id, root)["id"], [
        {"operation_id": "reorder", "type": "set_goal_sequence", "goal_ids": [two, one]},
    ])
    assert proposal["preview"][0]["action"] == "Change sequence"
    assert run["status"] == "succeeded"
    db_session.expire_all()
    assert [db_session.get(Goal, goal).sequence_position for goal in (two, one)] == [1, 2]

    proposal, run = _run(service, test_user.id, _task(service, test_user.id, root)["id"], [
        {"operation_id": "end", "type": "set_goal_sequence", "goal_ids": [one]},
    ])
    assert proposal["preview"][0]["action"] == "End sequence"
    assert run["status"] == "succeeded"
    db_session.expire_all()
    assert [(db_session.get(Goal, goal).sequence_track_id, db_session.get(Goal, goal).paused) for goal in (one, two)] == [
        (None, False), (None, False),
    ]
