"""The occurrence-schedule migration backfills rows only from legacy placeholders."""

import importlib.util
from datetime import date, datetime, time, timedelta, timezone
from pathlib import Path
from uuid import uuid4

import pytest

from models import (
    ActivityDefinition, ActivityInstance, Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, Session, User,
)

MIGRATION = Path(__file__).resolve().parents[2] / "migrations" / "versions" / "d8e0f2a4b6c9_add_program_day_occurrence_schedules.py"


def _load_migration():
    spec = importlib.util.spec_from_file_location("occurrence_schedule_migration", MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.mark.integration
def test_backfill_maps_only_uncovered_activity_free_placeholders(db_session, sample_ultimate_goal):
    root = sample_ultimate_goal
    start = date(2026, 9, 7)  # Monday
    program = Program(
        root_id=root.id, name="Legacy", weekly_schedule={},
        start_date=datetime.combine(start, time.min), end_date=datetime.combine(start + timedelta(days=13), time.max),
    )
    db_session.add(program)
    db_session.flush()
    block = ProgramBlock(program_id=program.id, name="Block", start_date=start, end_date=start + timedelta(days=13))
    db_session.add(block)
    db_session.flush()
    reusable = ProgramDay(block_id=block.id, name="Reusable", day_of_week=["Monday"])
    dated = ProgramDay(block_id=block.id, name="Dated", date=start + timedelta(days=2))
    db_session.add_all([reusable, dated])
    db_session.flush()
    activity = ActivityDefinition(id=str(uuid4()), root_id=root.id, name="Drill")
    db_session.add(activity)

    def linked(day, day_value, **overrides):
        # Only one incomplete session may exist per owner and fractal
        # (uq_sessions_one_active_per_owner_root), so each placeholder gets its own owner.
        owner = User(id=str(uuid4()), username=f"legacy-{uuid4().hex[:8]}", email=f"{uuid4().hex[:8]}@example.com")
        owner.set_password("Password123")
        db_session.add(owner)
        db_session.flush()
        session = Session(
            owner_id=owner.id, root_id=root.id, name=day.name, program_id=program.id,
            program_day_id=day.id,
            session_start=datetime.combine(day_value, time(12), tzinfo=timezone.utc),
            **{"completed": False, **overrides},
        )
        db_session.add(session)
        db_session.flush()
        return session

    linked(reusable, start + timedelta(days=1))                    # placeholder: Tuesday
    linked(reusable, start + timedelta(days=1))                    # duplicate placeholder, same date
    linked(reusable, start)                                        # Monday is already covered
    linked(reusable, start + timedelta(days=3), completed=True)    # real completed work
    linked(dated, start + timedelta(days=4))                       # dated definitions are not reusable
    linked(reusable, start + timedelta(days=40))                   # outside the block
    with_work = linked(reusable, start + timedelta(days=5))        # has activity evidence
    db_session.add(ActivityInstance(
        session_id=with_work.id, root_id=root.id, activity_definition_id=activity.id,
    ))
    db_session.commit()

    _load_migration()._backfill_legacy_placeholders(db_session.connection())
    db_session.commit()

    rows = db_session.query(ProgramDayOccurrenceSchedule).all()
    assert [(row.program_day_id, row.date) for row in rows] == [(reusable.id, start + timedelta(days=1))]
    assert db_session.query(Session).filter(Session.deleted_at.is_(None)).count() == 7
