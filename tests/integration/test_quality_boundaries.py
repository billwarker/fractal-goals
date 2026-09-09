"""Regression boundaries for atomic completion and transaction-scoped row locks."""

import pytest
from sqlalchemy import event
from sqlalchemy.exc import SQLAlchemyError

from models import ActivityDurationStats, ActivityInstance
from services.session_template_stats_service import SessionTemplateStatsService
from services.work_interval_service import WorkIntervalService


@pytest.mark.integration
def test_completion_rolls_back_when_derived_statistics_fail(
    authed_client,
    db_session,
    sample_activity_instance,
    monkeypatch,
):
    instance_id = sample_activity_instance.id
    root_id = sample_activity_instance.root_id

    def fail_stats(*_args):
        raise SQLAlchemyError("injected statistics failure")

    monkeypatch.setattr(
        SessionTemplateStatsService, "recompute_for_session", fail_stats
    )
    response = authed_client.post(
        f"/api/{root_id}/activity-instances/{instance_id}/complete"
    )
    assert response.status_code == 500
    db_session.expire_all()
    instance = db_session.get(ActivityInstance, instance_id)
    assert instance.completed is False
    assert instance.time_stop is None
    assert (
        db_session.query(ActivityDurationStats).filter_by(root_id=root_id).count() == 0
    )


@pytest.mark.integration
def test_session_lock_is_reused_only_until_transaction_ends(
    db_session, sample_practice_session
):
    session_id = sample_practice_session.id
    service = WorkIntervalService(db_session)
    statements = []
    engine = db_session.get_bind()

    def count_lock(_connection, _cursor, statement, _params, _context, _many):
        if "FOR UPDATE" in statement:
            statements.append(statement)

    event.listen(engine, "before_cursor_execute", count_lock)
    try:
        assert service.lock_session(session_id) is not None
        assert service.lock_session(session_id) is not None
        assert len(statements) == 1
        db_session.rollback()
        assert service.lock_session(session_id) is not None
        assert len(statements) == 2
        with db_session.begin_nested():
            assert service.lock_session(session_id) is not None
            assert len(statements) == 3
        assert service.lock_session(session_id) is not None
        assert len(statements) == 4
    finally:
        event.remove(engine, "before_cursor_execute", count_lock)
