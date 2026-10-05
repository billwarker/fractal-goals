"""The b8d4f2a6c1e3 migration moves program days onto programs without moving any calendar date."""

import importlib.util
import json
import uuid
from datetime import date, datetime, timedelta
from pathlib import Path

import pytest
from sqlalchemy import bindparam, text
from sqlalchemy.orm import Session as OrmSession

import models
from models import Program, ProgramBlock, ProgramSessionPlan, Session, SessionTemplate

MIGRATION = (
    Path(__file__).resolve().parents[2]
    / 'migrations' / 'versions' / 'b8d4f2a6c1e3_program_level_days_and_block_weeks.py'
)
# Tuesday, so each week block runs Tuesday to Monday.
START = date(2026, 9, 1)


def _load_migration():
    spec = importlib.util.spec_from_file_location('program_level_days_migration', MIGRATION)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


@pytest.fixture
def legacy(app, sample_goal_hierarchy, test_user):
    """A connection holding the pre-migration program_days shape; rolled back afterwards."""
    connection = models.get_engine().connect()
    transaction = connection.begin()
    connection.execute(text(
        'ALTER TABLE program_days ADD COLUMN block_id varchar, ADD COLUMN date date'
    ))
    session = OrmSession(bind=connection, join_transaction_mode='create_savepoint')
    session.info['owner_id'] = test_user.id
    try:
        yield connection, session, sample_goal_hierarchy, test_user
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _program(session, root_id, weeks=4):
    program = Program(
        id=str(uuid.uuid4()), root_id=root_id, name='Program', weekly_schedule=[],
        start_date=datetime.combine(START, datetime.min.time()),
        end_date=datetime.combine(START + timedelta(days=7 * weeks - 1), datetime.min.time()),
    )
    session.add(program)
    session.flush()
    blocks = []
    for week in range(weeks):
        block = ProgramBlock(
            program_id=program.id, name=f'Week {week + 1}',
            start_date=START + timedelta(days=7 * week), end_date=START + timedelta(days=7 * week + 6),
        )
        session.add(block)
        blocks.append(block)
    session.flush()
    return program, blocks


def _day(connection, block, name, *, weekdays=(), on=None, template=None, number=1):
    day_id = str(uuid.uuid4())
    connection.execute(text(
        'INSERT INTO program_days (id, program_id, block_id, name, day_number, day_of_week, date, row_version)'
        ' VALUES (:id, :program, :block, :name, :number, CAST(:weekdays AS json), :on, 1)'
    ), {
        'id': day_id, 'program': block.program_id, 'block': block.id, 'name': name, 'number': number,
        'weekdays': json.dumps(list(weekdays)), 'on': on,
    })
    if template is not None:
        connection.execute(text(
            'INSERT INTO program_day_templates (program_day_id, session_template_id, "order", is_required)'
            ' VALUES (:day, :template, 0, true)'
        ), {'day': day_id, 'template': template.id})
    return day_id


def _schedule(connection, day_id, value):
    connection.execute(text(
        'INSERT INTO program_day_occurrence_schedules (id, program_day_id, date, created_at)'
        ' VALUES (:id, :day, :date, now())'
    ), {'id': str(uuid.uuid4()), 'day': day_id, 'date': value})


def _days(connection, program):
    rows = connection.execute(text(
        'SELECT id, name, day_of_week, day_number FROM program_days WHERE program_id = :p ORDER BY day_number'
    ), {'p': program.id}).fetchall()
    schedules = {}
    for row in connection.execute(text(
        'SELECT program_day_id, date FROM program_day_occurrence_schedules'
    )).fetchall():
        schedules.setdefault(row.program_day_id, set()).add(row.date)
    return {row.name: (row.id, list(row.day_of_week or []), schedules.get(row.id, set())) for row in rows}


def _template(session, root_id, name):
    template = SessionTemplate(
        id=str(uuid.uuid4()), root_id=root_id, name=name,
        template_data={'session_type': 'normal', 'sections': []},
    )
    session.add(template)
    session.flush()
    return template


def _mondays():
    return [START + timedelta(days=offset) for offset in range(28) if (START + timedelta(days=offset)).weekday() == 0]


def test_copies_in_every_block_merge_into_one_weekday_day_with_their_history(legacy):
    connection, session, goals, user = legacy
    root_id = goals['ultimate'].id
    program, blocks = _program(session, root_id)
    legs = _template(session, root_id, 'Legs')
    copies = [_day(connection, block, 'Leg Day', weekdays=['Monday'], template=legs) for block in blocks]
    plan_date = _mondays()[1]
    session.add(ProgramSessionPlan(
        root_id=root_id, program_id=program.id, program_day_id=copies[1], session_template_id=legs.id,
        date=plan_date, plan_data={'sections': []},
    ))
    logged = Session(
        owner_id=user.id, root_id=root_id, name='Logged', completed=True, program_day_id=copies[2],
        session_start=datetime.combine(_mondays()[2], datetime.min.time()),
    )
    session.add(logged)
    session.flush()
    connection.execute(text(
        'INSERT INTO program_day_goals (program_day_id, goal_id, created_at) VALUES (:day, :goal, now())'
    ), {'day': copies[3], 'goal': goals['mid_term'].id})

    _load_migration().restructure_program_days(connection)

    days = _days(connection, program)
    assert list(days) == ['Leg Day']
    kept, weekdays, explicit = days['Leg Day']
    assert kept == copies[0]
    assert (weekdays, explicit) == (['Monday'], set())
    assert connection.execute(text('SELECT program_day_id FROM sessions WHERE id = :id'), {'id': logged.id}).scalar() == kept
    assert connection.execute(text(
        'SELECT program_day_id FROM program_session_plans WHERE date = :d AND program_id = :p'
    ), {'d': plan_date, 'p': program.id}).scalar() == kept
    assert connection.execute(text(
        'SELECT goal_id FROM program_day_goals WHERE program_day_id = :day AND deleted_at IS NULL'
    ), {'day': kept}).scalars().all() == [goals['mid_term'].id]


def test_differing_and_block_limited_days_keep_exactly_their_old_dates(legacy):
    connection, session, goals, _user = legacy
    root_id = goals['ultimate'].id
    program, blocks = _program(session, root_id)
    upper, upper_b = _template(session, root_id, 'Upper'), _template(session, root_id, 'Upper B')
    _day(connection, blocks[0], 'Upper', weekdays=['Tuesday'], template=upper)
    _day(connection, blocks[1], 'Upper', weekdays=['Tuesday'], template=upper_b, number=2)
    dated = _day(connection, blocks[2], 'Test', on=START + timedelta(days=16), number=3)
    extra = _day(connection, blocks[3], 'Extra', number=4)
    _schedule(connection, extra, START + timedelta(days=23))
    # Outside its block, so the old evaluator never showed it.
    _schedule(connection, extra, START + timedelta(days=2))

    _load_migration().restructure_program_days(connection)

    days = _days(connection, program)
    upper_rows = connection.execute(text(
        "SELECT d.id, d.day_of_week FROM program_days d WHERE d.program_id = :p AND d.name = 'Upper'"
    ), {'p': program.id}).fetchall()
    assert len(upper_rows) == 2
    assert all(list(row.day_of_week) == [] for row in upper_rows)
    tuesdays = {
        row.program_day_id: row.date for row in connection.execute(text(
            'SELECT program_day_id, date FROM program_day_occurrence_schedules WHERE program_day_id IN :ids'
        ).bindparams(bindparam('ids', expanding=True)),
            {'ids': [row.id for row in upper_rows]}).fetchall()
    }
    assert sorted(tuesdays.values()) == [START, START + timedelta(days=7)]
    assert days['Test'] == (dated, [], {START + timedelta(days=16)})
    assert days['Extra'] == (extra, [], {START + timedelta(days=23)})


def test_a_double_booked_calendar_aborts_the_migration(legacy):
    connection, session, goals, _user = legacy
    program, blocks = _program(session, goals['ultimate'].id)
    _day(connection, blocks[0], 'One', weekdays=['Monday'])
    _day(connection, blocks[0], 'Two', weekdays=['Monday'], number=2)

    with pytest.raises(RuntimeError, match='two program days'):
        _load_migration().restructure_program_days(connection)
