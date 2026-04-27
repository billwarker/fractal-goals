import pytest
import uuid
from datetime import datetime, date, timezone, timedelta
from unittest.mock import patch

import models
from models import Program, ProgramBlock, ProgramDay, Goal, Session, SessionTemplate, ProgramDaySession, get_session
from services.programs import ProgramService
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
    db_session.commit()
    return program

def test_create_program(db_session, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal_id = sample_goal_hierarchy['long_term'].id
    
    data = {
        'name': 'New Program',
        'start_date': datetime.now(timezone.utc).isoformat(),
        'end_date': (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
        'selectedGoals': [goal_id],
        'weeklySchedule': [
            {
                'name': 'Block 1',
                'start_date': datetime.now(timezone.utc).isoformat(),
                'end_date': (datetime.now(timezone.utc) + timedelta(days=30)).isoformat(),
                'color': '#ff0000'
            }
        ]
    }
    
    result = ProgramService.create_program(db_session, root_id, data)
    assert result['name'] == 'New Program'
    assert len(result['blocks']) == 1
    assert result['blocks'][0]['name'] == 'Block 1'
    
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
        'selectedGoals': [goal_id],
    }
    
    result = ProgramService.update_program(db_session, root_id, sample_program.id, data)
    assert result['name'] == 'Updated Program'
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
    
    block_db = db_session.query(ProgramBlock).get(block_id)
    assert len(block_db.days) == 0
    
    day_res_count = ProgramService.add_block_day(db_session, root_id, sample_program.id, block_id, {
        'name': 'Bonus Day',
        'day_of_week': ['Monday']
    })
    
    assert day_res_count['count'] == 1
    assert day_res_count['days'][0]['name'] == 'Bonus Day'


def test_add_block_day_persists_note_condition(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Condition Block',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=3)).isoformat(),
    })

    day_res = ProgramService.add_block_day(db_session, root_id, sample_program.id, block_res['id'], {
        'name': 'Reflect',
        'day_of_week': ['Tuesday'],
        'note_condition': True,
    })

    assert day_res['days'][0]['note_condition'] is True

    persisted = db_session.query(ProgramDay).get(day_res['days'][0]['id'])
    assert persisted.note_condition is True


def test_update_block_day_persists_note_condition(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    block = ProgramBlock(
        program_id=sample_program.id,
        name='Condition Update Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=5),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(block_id=block.id, name='Reflect', day_number=1, note_condition=False)
    db_session.add(day)
    db_session.commit()

    result = ProgramService.update_block_day(db_session, root_id, sample_program.id, block.id, day.id, {
        'note_condition': True,
    })

    assert result['note_condition'] is True

    db_session.refresh(day)
    assert day.note_condition is True


def test_create_block_accepts_camel_case_dates(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id

    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Camel Case Block',
        'startDate': date.today().isoformat(),
        'endDate': (date.today() + timedelta(days=3)).isoformat(),
    })

    assert block_res['start_date'] == date.today().isoformat()
    assert block_res['end_date'] == (date.today() + timedelta(days=3)).isoformat()


def test_create_block_emits_program_block_created_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    emitted = []
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event))

    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, {
        'name': 'Emitted Block',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=3)).isoformat(),
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
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.update_block(db_session, root_id, sample_program.id, block.id, {
        'name': 'Updated Block',
        'color': '#123456',
    })

    assert result['name'] == 'Updated Block'
    assert [event.name for event in emitted] == [Events.PROGRAM_BLOCK_UPDATED]
    assert emitted[0].data['updated_fields'] == ['name', 'color']
    
def test_attach_goal_to_day(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    goal_id = sample_goal_hierarchy['short_term'].id
    
    block = ProgramBlock(program_id=sample_program.id, name="B1")
    db_session.add(block)
    db_session.flush()
    
    day = ProgramDay(block_id=block.id, name="D1", day_number=1)
    db_session.add(day)
    db_session.commit()
    
    res = ProgramService.attach_goal_to_day(db_session, root_id, sample_program.id, block.id, day.id, {'goal_id': goal_id})
    assert res['id'] == day.id
    
    day_db = db_session.query(ProgramDay).get(day.id)
    assert len(day_db.goals) == 1
    assert day_db.goals[0].id == goal_id


def test_schedule_block_day_emits_program_day_scheduled_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Sched Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(block_id=block.id, name='Sched Day', day_number=1)
    db_session.add(day)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event))
    monkeypatch.setattr(
        "services.programs.SessionService.create_session",
        lambda self, root_id, current_user_id, payload: (
            {'id': 'session-1', 'name': payload['name']},
            None,
            201,
        ),
    )

    result = ProgramService.schedule_block_day(
        db_session,
        root_id,
        sample_program.id,
        block.id,
        day.id,
        {'session_start': datetime.now(timezone.utc).isoformat()},
    )

    assert result['id'] == 'session-1'
    assert [event.name for event in emitted] == [Events.PROGRAM_DAY_SCHEDULED]
    assert emitted[0].data['day_name'] == 'Sched Day'


def test_unschedule_block_day_occurrence_emits_program_day_unscheduled_event(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Unsched Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(block_id=block.id, name='Unsched Day', day_number=1)
    db_session.add(day)
    db_session.flush()

    scheduled_session = Session(
        id=str(uuid.uuid4()),
        root_id=root_id,
        name='Scheduled Session',
        session_start=datetime.now(timezone.utc).replace(hour=12, minute=0, second=0, microsecond=0),
        completed=False,
        program_day_id=day.id,
    )
    db_session.add(scheduled_session)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.unschedule_block_day_occurrence(
        db_session,
        root_id,
        sample_program.id,
        block.id,
        day.id,
        {'date': scheduled_session.session_start.date().isoformat(), 'timezone': 'UTC'},
    )

    assert result['removed_count'] == 1
    assert result['removed_session_ids'] == [scheduled_session.id]
    assert [event.name for event in emitted] == [Events.SESSION_DELETED, Events.PROGRAM_DAY_UNSCHEDULED]
    assert emitted[1].data['removed_count'] == 1


def test_unschedule_block_day_occurrence_skips_unscheduled_event_when_nothing_matches(db_session, sample_program, sample_goal_hierarchy, monkeypatch):
    root_id = sample_goal_hierarchy['ultimate'].id
    block = ProgramBlock(
        program_id=sample_program.id,
        name='Quiet Block',
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(block_id=block.id, name='Quiet Day', day_number=1)
    db_session.add(day)
    db_session.commit()

    emitted = []
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event))

    result = ProgramService.unschedule_block_day_occurrence(
        db_session,
        root_id,
        sample_program.id,
        block.id,
        day.id,
        {'date': date.today().isoformat(), 'timezone': 'UTC'},
    )

    assert result['removed_count'] == 0
    assert result['removed_session_ids'] == []
    assert emitted == []


def test_attach_goal_to_block_preserves_program_scope_and_requires_descendant(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    mid_term_goal = sample_goal_hierarchy['mid_term']
    short_term_goal = sample_goal_hierarchy['short_term']

    ProgramService._replace_program_goals(db_session, sample_program.id, [mid_term_goal.id], root_id)

    block = ProgramBlock(
        program_id=sample_program.id,
        name="Scoped Block",
        start_date=date.today(),
        end_date=date.today() + timedelta(days=7),
    )
    db_session.add(block)
    db_session.commit()

    result = ProgramService.attach_goal_to_block(
        db_session,
        root_id,
        sample_program.id,
        block.id,
        {'goal_id': short_term_goal.id, 'deadline': (date.today() + timedelta(days=1)).isoformat()},
    )

    assert result['goal_ids'] == [short_term_goal.id]
    db_session.refresh(sample_program)
    assert [goal.id for goal in sample_program.goals] == [mid_term_goal.id]


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

def test_check_program_day_completion(db_session, sample_program, sample_session_template, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    
    # Setup day and template
    block = ProgramBlock(program_id=sample_program.id, name="B1")
    db_session.add(block)
    db_session.flush()
    
    day = ProgramDay(block_id=block.id, name="D1", day_number=1)
    day.templates.append(sample_session_template)
    db_session.add(day)
    db_session.commit()
    
    # Create the completed session
    completed_sess = Session(
        id=str(uuid.uuid4()),
        root_id=root_id,
        name="Test Session",
        completed=True,
        program_day_id=day.id,
        template_id=sample_session_template.id
    )
    db_session.add(completed_sess)
    db_session.commit()
    
    is_complete = ProgramService.check_program_day_completion(db_session, completed_sess.id)
    assert is_complete is True
    
    db_session.refresh(day)
    assert day.is_completed is True


def test_check_program_day_completion_queues_events_until_commit(
    db_session,
    sample_program,
    sample_session_template,
    sample_goal_hierarchy,
    monkeypatch,
):
    root_id = sample_goal_hierarchy['ultimate'].id

    block = ProgramBlock(program_id=sample_program.id, name="Queued Block")
    db_session.add(block)
    db_session.flush()

    day = ProgramDay(block_id=block.id, name="Queued Day", day_number=1)
    day.templates.append(sample_session_template)
    db_session.add(day)
    db_session.commit()

    completed_sess = Session(
        id=str(uuid.uuid4()),
        root_id=root_id,
        name="Queued Session",
        completed=True,
        program_day_id=day.id,
        template_id=sample_session_template.id,
    )
    db_session.add(completed_sess)
    db_session.commit()

    emitted = []
    pending_events = []
    monkeypatch.setattr("services.programs.event_bus.emit", lambda event: emitted.append(event.name))

    is_complete = ProgramService.check_program_day_completion(
        db_session,
        completed_sess.id,
        pending_events=pending_events,
    )

    assert is_complete is True
    assert emitted == []
    pending_names = [event.name for event in pending_events]
    assert Events.PROGRAM_DAY_COMPLETED in pending_names
    assert Events.PROGRAM_BLOCK_COMPLETED in pending_names
    assert Events.PROGRAM_COMPLETED in pending_names
