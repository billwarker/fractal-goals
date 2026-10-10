import pytest
import uuid
from datetime import datetime, date, timezone, timedelta
from unittest.mock import patch

import models
from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule, Goal, Session, get_session, program_goals
from services.programs import ProgramService
from services.program_service_errors import ProgramServiceValidationError
from services.events import event_bus, Events, Event

@pytest.fixture
def sample_program(db_session, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    program = Program(
        id=str(uuid.uuid4()),
        root_id=root_id,
        name="Test Program",
        description="A great test program",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=30),
        weekly_schedule=[],
        is_active=True
    )
    db_session.add(program)
    db_session.flush()
    db_session.execute(program_goals.insert().values(program_id=program.id, goal_id=root_id))
    db_session.commit()
    return program

def test_create_program(db_session, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal_id = sample_goal_hierarchy['long_term'].id
    
    data = {
        'name': 'New Program',
        'start_date': datetime.now(timezone.utc).isoformat(),
        'end_date': (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
        'color': '#06A77D',
        'selectedGoals': [goal_id],
        'weeklySchedule': []
    }
    
    result = ProgramService.create_program(db_session, root_id, data)
    assert result['name'] == 'New Program'
    assert result['color'] == '#06A77D'
    assert result['blocks'] == []
    
    program_db = db_session.query(Program).get(result['id'])
    assert len(program_db.goals) == 1
    assert program_db.goals[0].id == goal_id

def test_update_program(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal_id = sample_goal_hierarchy['short_term'].id
    
    data = {
        'name': 'Updated Program',
        'start_date': (date.today() - timedelta(days=1)).isoformat(),
        'end_date': (date.today() + timedelta(days=90)).isoformat(),
        'color': '#EF476F',
        'selectedGoals': [goal_id],
    }
    
    result = ProgramService.update_program(db_session, root_id, sample_program.id, data)
    assert result['name'] == 'Updated Program'
    assert result['color'] == '#EF476F'
    assert result['is_active'] is True
    
    program_db = db_session.query(Program).get(result['id'])
    assert len(program_db.goals) == 1
    assert program_db.goals[0].id == goal_id


def test_create_program_rejects_overlapping_program_dates(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    with pytest.raises(ValueError, match="Programs cannot overlap"):
        ProgramService.create_program(db_session, root_id, {
            'name': 'Overlap',
            'start_date': sample_program.start_date.isoformat(),
            'end_date': (sample_program.start_date + timedelta(days=7)).isoformat(),
            'weeklySchedule': [],
        })


def test_create_program_allows_adjacent_non_overlapping_dates(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    result = ProgramService.create_program(db_session, root_id, {
        'name': 'Adjacent Program',
        'start_date': (sample_program.end_date + timedelta(days=1)).isoformat(),
        'end_date': (sample_program.end_date + timedelta(days=14)).isoformat(),
        'weeklySchedule': [],
    })

    assert result['name'] == 'Adjacent Program'


def test_update_program_rejects_overlapping_program_dates(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    later_program = Program(
        id=str(uuid.uuid4()),
        root_id=root_id,
        name="Later Program",
        start_date=sample_program.end_date + timedelta(days=1),
        end_date=sample_program.end_date + timedelta(days=14),
        weekly_schedule=[],
        is_active=False,
    )
    db_session.add(later_program)
    db_session.commit()

    with pytest.raises(ValueError, match="Programs cannot overlap"):
        ProgramService.update_program(db_session, root_id, later_program.id, {
            'start_date': (sample_program.end_date - timedelta(days=3)).isoformat(),
        })


def test_program_service_mutations_commit_without_caller_commit(db_session, sample_ultimate_goal):
    root_id = sample_ultimate_goal.id

    created = ProgramService.create_program(db_session, root_id, {
        'name': 'Committed Program',
        'start_date': datetime.now(timezone.utc).isoformat(),
        'end_date': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
        'weeklySchedule': [],
    })

    verify_session = get_session(models.get_engine())
    try:
        persisted = verify_session.query(Program).filter_by(id=created['id']).first()
        assert persisted is not None

        ProgramService.update_program(verify_session, root_id, persisted.id, {'name': 'Renamed Program'})

        second_verify = get_session(models.get_engine())
        try:
            updated = second_verify.query(Program).filter_by(id=persisted.id).first()
            assert updated.name == 'Renamed Program'
        finally:
            second_verify.close()
    finally:
        verify_session.close()

def test_create_block_starts_empty_and_can_add_day(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    
    block_data = {
        'name': 'Test Block 1',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=10)).isoformat()
    }
    
    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, block_data)
    assert block_res['name'] == 'Test Block 1'
    block_id = block_res['id']
    
    assert block_res['track_weeks'] is False
    assert block_res['week_start_day'] is None

    day = ProgramService.create_program_day(db_session, root_id, sample_program.id, {
        'name': 'Bonus Day',
        'day_of_week': ['Monday']
    })

    assert day['name'] == 'Bonus Day'
    assert day['program_id'] == sample_program.id
    assert db_session.query(ProgramBlock).get(block_id) is not None


def test_block_week_tracking_round_trips_and_requires_a_start_day(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Tracked',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=20)).isoformat(),
        'track_weeks': True,
        'week_start_day': 6,
    })
    assert (block['track_weeks'], block['week_start_day']) == (True, 6)

    updated = ProgramService.update_block(db_session, root_id, sample_program.id, block['id'], {'track_weeks': False})
    # The start day is remembered for when tracking comes back on.
    assert (updated['track_weeks'], updated['week_start_day']) == (False, 6)

    with pytest.raises(ProgramServiceValidationError) as excinfo:
        ProgramService.update_block(db_session, root_id, sample_program.id, block['id'], {
            'track_weeks': True, 'week_start_day': None,
        })
    assert excinfo.value.payload['field'] == 'week_start_day'


def test_get_active_program_days_filters_to_days_scheduled_today(db_session, sample_program, sample_session_template, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    today = date.today()
    tomorrow = today + timedelta(days=1)
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Active Block',
        start_date=today - timedelta(days=1),
        end_date=today + timedelta(days=2),
    )
    db_session.add(block)
    db_session.flush()

    today_day = ProgramDay(
        program_id=block.program_id,
        name='Today Practice',
        day_number=1,
        day_of_week=[today.strftime('%A')],
    )
    today_day.templates.append(sample_session_template)
    future_day = ProgramDay(
        program_id=block.program_id,
        name='Future Practice',
        day_number=2,
        day_of_week=[tomorrow.strftime('%A')],
    )
    future_day.templates.append(sample_session_template)
    unscheduled_day = ProgramDay(
        program_id=block.program_id,
        name='Unscheduled Practice',
        day_number=3,
    )
    unscheduled_day.templates.append(sample_session_template)
    db_session.add_all([today_day, future_day, unscheduled_day])
    db_session.commit()

    result = ProgramService.get_active_program_days(db_session, root_id, target_date=today)

    assert [day['day_name'] for day in result] == ['Today Practice']


def test_create_block_accepts_camel_case_dates(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Camel Case Block',
        'startDate': date.today().isoformat(),
        'endDate': (date.today() + timedelta(days=3)).isoformat()
    })

    assert block_res['start_date'] == date.today().isoformat()
    assert block_res['end_date'] == (date.today() + timedelta(days=3)).isoformat()


def test_create_block_emits_program_block_created_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    emitted = []
    monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event))

    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Emitted Block',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=3)).isoformat()
    })

    assert block_res['name'] == 'Emitted Block'
    assert [event.name for event in emitted] == [Events.PROGRAM_BLOCK_CREATED]
    assert emitted[0].data['block_name'] == 'Emitted Block'


def test_update_block_emits_program_block_updated_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Original Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
    )
    db_session.add(block)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.update_block(db_session, root_id, sample_program.id, block.id, {
        'name': 'Updated Block',
        'color': '#123456',
    })

    assert result['name'] == 'Updated Block'
    assert [event.name for event in emitted] == [Events.PROGRAM_BLOCK_UPDATED]
    assert emitted[0].data['updated_fields'] == ['name', 'color']
    
def test_attach_goal_to_day(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal = sample_goal_hierarchy['short_term']
    goal.deadline = date.today()
    
    block = ProgramBlock(
        program_id=sample_program.id,
        name="B1",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()
    
    day = ProgramDay(program_id=block.program_id, name="D1", day_number=1, occurrence_schedules=[ProgramDayOccurrenceSchedule(date=date.today())])
    db_session.add(day)
    db_session.commit()
    
    res = ProgramService.attach_goal_to_day(db_session, root_id, sample_program.id, day.id, {'goal_id': goal.id})
    assert res['id'] == day.id
    
    day_db = db_session.query(ProgramDay).get(day.id)
    assert len(day_db.goals) == 1
    assert day_db.goals[0].id == goal.id


def test_schedule_program_day_emits_program_day_scheduled_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Sched Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(program_id=block.program_id, name='Sched Day', day_number=1)
    db_session.add(day)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.schedule_program_day(
        db_session,
        root_id,
        sample_program.id,
        day.id,
        {'date': date.today().isoformat()},
    )

    schedule_row = db_session.query(ProgramDayOccurrenceSchedule).filter_by(program_day_id=day.id).one()
    assert result['id'] == schedule_row.id
    assert result['date'] == date.today().isoformat()
    assert [event.name for event in emitted] == [Events.PROGRAM_DAY_SCHEDULED]
    assert emitted[0].data['day_name'] == 'Sched Day'
    assert emitted[0].data['schedule_id'] == schedule_row.id


def test_unschedule_program_day_occurrence_emits_program_day_unscheduled_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Unsched Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(program_id=block.program_id, name='Unsched Day', day_number=1,
                     occurrence_schedules=[ProgramDayOccurrenceSchedule(date=date.today())])
    db_session.add(day)
    db_session.flush()

    scheduled_session = Session(
        id=str(uuid.uuid4()),
        owner_id=sample_goal_hierarchy['ultimate'].owner_id,
        root_id=root_id,
        name='Scheduled Session',
        session_start=datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0),
        completed=False,
        program_day_id=day.id,
    )
    db_session.add(scheduled_session)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.unschedule_program_day_occurrence(
        db_session,
        root_id,
        sample_program.id,
        day.id,
        {'date': scheduled_session.session_start.date().isoformat(), 'timezone': 'UTC'},
    )

    assert result['removed_schedule_count'] == 1
    assert result['removed_count'] == 0
    assert result['removed_session_ids'] == []
    assert scheduled_session.deleted_at is None
    assert [event.name for event in emitted] == [Events.PROGRAM_DAY_UNSCHEDULED]
    assert emitted[0].data['removed_count'] == 0


def test_unschedule_program_day_occurrence_skips_unscheduled_event_when_nothing_matches(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Quiet Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(program_id=block.program_id, name='Quiet Day', day_number=1)
    db_session.add(day)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.events.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.unschedule_program_day_occurrence(
        db_session,
        root_id,
        sample_program.id,
        day.id,
        {'date': date.today().isoformat(), 'timezone': 'UTC'},
    )

    assert result['removed_count'] == 0
    assert result['removed_session_ids'] == []
    assert emitted == []


def test_set_goal_deadline_for_program_date_enforces_program_range(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    mid_term_goal = sample_goal_hierarchy['mid_term']
    short_term_goal = sample_goal_hierarchy['short_term']

    ProgramService._replace_program_goals(db_session, sample_program.id, [mid_term_goal.id], root_id)

    with pytest.raises(ValueError, match="Goal deadline must be within the program date range"):
        ProgramService.set_goal_deadline_for_program_date(
            db_session,
            root_id,
            sample_program.id,
            {
                'goal_id': short_term_goal.id,
                'deadline': (date.today() + timedelta(days=45)).isoformat(),
            },
        )
