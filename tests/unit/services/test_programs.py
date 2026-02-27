import pytest
import uuid
from datetime import datetime, date, timezone, timedelta
from unittest.mock import patch

from models import Program, ProgramBlock, ProgramDay, Goal, Session, SessionTemplate, ProgramDaySession
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
        'start_date': datetime.now(timezone.utc).isoformat(),
        'end_date': (datetime.now(timezone.utc) + timedelta(days=90)).isoformat(),
        'selectedGoals': [goal_id],
        'is_active': False
    }
    
    result = ProgramService.update_program(db_session, root_id, sample_program.id, data)
    assert result['name'] == 'Updated Program'
    assert result['is_active'] is False
    
    program_db = db_session.query(Program).get(result['id'])
    assert len(program_db.goals) == 1
    assert program_db.goals[0].id == goal_id

def test_create_block_and_day(db_session, sample_program, sample_goal_hierarchy):
    root_id = sample_goal_hierarchy['ultimate'].id
    
    block_data = {
        'name': 'Test Block 1',
        'start_date': date.today().isoformat(),
        'end_date': (date.today() + timedelta(days=10)).isoformat()
    }
    
    block_res = ProgramService.create_block(db_session, root_id, sample_program.id, block_data)
    assert block_res['name'] == 'Test Block 1'
    block_id = block_res['id']
    
    # create_block auto-generates 7 days, check them
    block_db = db_session.query(ProgramBlock).get(block_id)
    assert len(block_db.days) == 7
    
    # Add an explicit extra day just to test the logic
    day_res_count = ProgramService.add_block_day(db_session, root_id, sample_program.id, block_id, {
        'name': 'Bonus Day',
        'day_of_week': ['Monday']
    })
    
    assert day_res_count == 1
    
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
