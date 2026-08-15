from datetime import datetime
import uuid

import pytest
from sqlalchemy import text
from sqlalchemy.exc import OperationalError

from models import ActivityDefinition, CircuitDefinition, Session, get_session
from services.circuit_service import CircuitService
from services.timer_service import TimerService


def _create_circuit_run(authed_client, db_session, root, user):
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=root.id,
        name="Concurrency station",
        has_sets=False,
        has_metrics=False,
        metrics_multiplicative=False,
        has_splits=False,
    )
    session = Session(
        id=str(uuid.uuid4()),
        root_id=root.id,
        owner_id=user.id,
        name="Concurrency circuit",
        attributes={"session_data": {"sections": [{"name": "Main", "items": []}]}},
    )
    db_session.add_all([activity, session])
    db_session.commit()
    definition = authed_client.post(f"/api/{root.id}/circuits", json={
        "name": "Serialized circuit",
        "planned_rounds": 1,
        "slots": [{"activity_definition_id": activity.id}],
    }).get_json()
    run = authed_client.post(
        f"/api/{root.id}/sessions/{session.id}/circuit-runs",
        json={"circuit_definition_id": definition["id"], "section_index": 0},
    ).get_json()
    return session.id, definition, run


def _set_short_lock_timeout(db_session):
    db_session.execute(text("SET LOCAL lock_timeout = '100ms'"))


def test_round_mutation_waits_for_the_owning_session_lock(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
):
    session_id, _definition, run = _create_circuit_run(
        authed_client,
        db_session,
        sample_ultimate_goal,
        test_user,
    )
    engine = db_session.get_bind()
    lock_holder = get_session(engine)
    contender = get_session(engine)
    try:
        lock_holder.query(Session).filter(Session.id == session_id).with_for_update().one()
        _set_short_lock_timeout(contender)
        with pytest.raises(OperationalError, match="lock timeout"):
            CircuitService(contender).add_round(
                sample_ultimate_goal.id,
                run["id"],
                test_user.id,
            )
        contender.rollback()
    finally:
        lock_holder.rollback()
        contender.close()
        lock_holder.close()


def test_definition_update_serializes_the_version_check(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
):
    _session_id, definition, _run = _create_circuit_run(
        authed_client,
        db_session,
        sample_ultimate_goal,
        test_user,
    )
    engine = db_session.get_bind()
    lock_holder = get_session(engine)
    contender = get_session(engine)
    try:
        lock_holder.query(CircuitDefinition).filter(
            CircuitDefinition.id == definition["id"],
        ).with_for_update().one()
        _set_short_lock_timeout(contender)
        with pytest.raises(OperationalError, match="lock timeout"):
            CircuitService(contender).update_definition(
                sample_ultimate_goal.id,
                definition["id"],
                test_user.id,
                {"name": "Concurrent edit", "version": definition["version"]},
            )
        contender.rollback()
    finally:
        lock_holder.rollback()
        contender.close()
        lock_holder.close()


@pytest.mark.parametrize("lifecycle_action", ["pause", "resume"])
def test_session_pause_resume_waits_for_the_circuit_session_lock(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
    lifecycle_action,
):
    session_id, _definition, _run = _create_circuit_run(
        authed_client,
        db_session,
        sample_ultimate_goal,
        test_user,
    )
    session = db_session.get(Session, session_id)
    if lifecycle_action == "resume":
        session.is_paused = True
        session.last_paused_at = datetime.utcnow()
        db_session.commit()

    engine = db_session.get_bind()
    lock_holder = get_session(engine)
    contender = get_session(engine)
    try:
        lock_holder.query(Session).filter(Session.id == session_id).with_for_update().one()
        _set_short_lock_timeout(contender)
        with pytest.raises(OperationalError, match="lock timeout"):
            service = TimerService(contender)
            if lifecycle_action == "pause":
                service.pause_session(sample_ultimate_goal.id, session_id, test_user.id)
            else:
                service.resume_session(sample_ultimate_goal.id, session_id, test_user.id)
        contender.rollback()
    finally:
        lock_holder.rollback()
        contender.close()
        lock_holder.close()


def test_stale_definition_version_returns_current_snapshot(
    authed_client,
    db_session,
    test_user,
    sample_ultimate_goal,
):
    _session_id, definition, _run = _create_circuit_run(
        authed_client,
        db_session,
        sample_ultimate_goal,
        test_user,
    )
    current = CircuitService(db_session).update_definition(
        sample_ultimate_goal.id,
        definition["id"],
        test_user.id,
        {"name": "First edit", "version": definition["version"]},
    )[0]
    payload, error, status = CircuitService(db_session).update_definition(
        sample_ultimate_goal.id,
        definition["id"],
        test_user.id,
        {"name": "Stale edit", "version": definition["version"]},
    )

    assert error is None
    assert status == 409
    assert payload["code"] == "stale_version"
    assert payload["current"]["version"] == current["version"]
    assert db_session.get(CircuitDefinition, definition["id"]).name == "First edit"
