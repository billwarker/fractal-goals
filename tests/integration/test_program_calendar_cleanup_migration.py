"""The f1b3d5a7c9e2 migration repairs existing calendar conflicts before adding constraints."""

import importlib.util
import uuid
from datetime import date, datetime
from pathlib import Path

import pytest
from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession

import models
from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, Session

MIGRATION = Path(__file__).resolve().parents[2] / 'migrations' / 'versions' / 'f1b3d5a7c9e2_program_blocks_no_overlap.py'


def _load_migration():
    spec = importlib.util.spec_from_file_location('calendar_cleanup_migration', MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def conflicted(app, sample_goal_hierarchy, test_user):
    """A connection whose transaction holds the dev-database conflicts; rolled back afterwards."""
    connection = models.get_engine().connect()
    transaction = connection.begin()
    connection.execute(text('ALTER TABLE program_blocks DROP CONSTRAINT ex_program_blocks_no_overlap'))
    session = OrmSession(bind=connection, join_transaction_mode='create_savepoint')
    root_id = sample_goal_hierarchy['ultimate'].id
    session.info['owner_id'] = test_user.id
    try:
        yield connection, session, root_id
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _program(session, root_id, start, end):
    program = Program(
        id=str(uuid.uuid4()), root_id=root_id, name='Program', weekly_schedule=[],
        start_date=datetime.combine(start, datetime.min.time()), end_date=datetime.combine(end, datetime.min.time()),
    )
    session.add(program)
    session.flush()
    return program


def test_overlapping_blocks_undate_the_least_substantive_block(conflicted):
    connection, session, root_id = conflicted
    program = _program(session, root_id, date(2026, 3, 1), date(2026, 4, 30))
    weeks = [
        ProgramBlock(program_id=program.id, name=f'Week {n}', start_date=start, end_date=end)
        for n, (start, end) in enumerate([
            (date(2026, 3, 15), date(2026, 3, 21)),
            (date(2026, 3, 22), date(2026, 3, 28)),
        ], start=2)
    ]
    japan = ProgramBlock(program_id=program.id, name='Japan', start_date=date(2026, 3, 19), end_date=date(2026, 4, 6))
    session.add_all([*weeks, japan])
    session.flush()
    session.add(ProgramDay(block_id=japan.id, name='Travel', day_of_week=[]))
    session.flush()

    _load_migration()._repair_block_overlaps(connection)

    rows = dict(connection.execute(text(
        'SELECT name, start_date FROM program_blocks WHERE program_id = :p'
    ), {'p': program.id}).fetchall())
    assert rows == {'Week 2': date(2026, 3, 15), 'Week 3': date(2026, 3, 22), 'Japan': None}
    assert connection.execute(text(
        "SELECT count(*) FROM program_days WHERE name = 'Travel'"
    )).scalar() == 1


def test_blocks_with_logged_sessions_keep_their_dates(conflicted):
    connection, session, root_id = conflicted
    program = _program(session, root_id, date(2026, 3, 1), date(2026, 4, 30))
    short = ProgramBlock(program_id=program.id, name='Short', start_date=date(2026, 3, 10), end_date=date(2026, 3, 12))
    busy = ProgramBlock(program_id=program.id, name='Busy', start_date=date(2026, 3, 1), end_date=date(2026, 3, 31))
    session.add_all([short, busy])
    session.flush()
    busy_day = ProgramDay(block_id=busy.id, name='Busy day', day_of_week=['Monday'])
    session.add(busy_day)
    session.flush()
    session.add(Session(root_id=root_id, owner_id=session.info['owner_id'], name='Logged', program_day_id=busy_day.id))
    session.flush()

    _load_migration()._repair_block_overlaps(connection)

    rows = dict(connection.execute(text(
        'SELECT name, start_date FROM program_blocks WHERE program_id = :p'
    ), {'p': program.id}).fetchall())
    assert rows == {'Busy': date(2026, 3, 1), 'Short': None}


def test_day_conflicts_keep_the_day_with_sessions_and_drop_only_colliding_entries(conflicted):
    connection, session, root_id = conflicted
    program = _program(session, root_id, date(2026, 9, 1), date(2026, 12, 31))
    block = ProgramBlock(program_id=program.id, name='Month 1', start_date=date(2026, 9, 1), end_date=date(2026, 9, 30))
    session.add(block)
    session.flush()
    daily = ProgramDay(block_id=block.id, name='Daily Practice', day_number=1, day_of_week=[
        'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday',
    ])
    testing = ProgramDay(block_id=block.id, name='Testing', day_number=2, day_of_week=[])
    upper = ProgramDay(block_id=block.id, name='Upper', day_number=3, day_of_week=['Monday'])
    session.add_all([daily, testing, upper])
    session.flush()
    session.add_all([
        ProgramDayOccurrenceSchedule(program_day_id=testing.id, date=value)
        for value in (date(2026, 9, 25), date(2026, 9, 29), date(2026, 9, 30))
    ])
    session.add(Session(root_id=root_id, owner_id=session.info['owner_id'], name='Practice', program_day_id=daily.id))
    session.flush()

    migration = _load_migration()
    migration._repair_day_conflicts(connection)

    assert connection.execute(text(
        'SELECT count(*) FROM program_day_occurrence_schedules WHERE program_day_id = :d'
    ), {'d': testing.id}).scalar() == 0
    weekdays = dict(connection.execute(text(
        'SELECT name, day_of_week FROM program_days WHERE block_id = :b'
    ), {'b': block.id}).fetchall())
    assert len(weekdays['Daily Practice']) == 7
    assert weekdays['Upper'] == []
    assert connection.execute(text("SELECT count(*) FROM program_days WHERE name = 'Testing'")).scalar() == 1

    # Nothing is left to repair: every date holds one program day.
    grouped = migration._occurrences(migration._load_calendar(connection, program.id))
    assert all(len(entries) == 1 for entries in grouped.values())
