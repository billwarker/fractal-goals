import pytest
import uuid
import json
from datetime import datetime, timezone

from models.goal import Goal
from models.program import Program, ProgramBlock, ProgramDay
from models.user import User

# Test 1: Cross-fractal parent assignment
def test_cross_fractal_reparenting(authed_client, db_session, test_user):
    """
    Test 1: Ensure users cannot reparent a goal to a parent goal inside a different user's fractal (root_id mismatch).
    """
    # Create another user and their root goal
    other_user = User(
        id=str(uuid.uuid4()),
        username="otheruser",
        email="other@example.com"
    )
    other_user.set_password("Password123!")
    db_session.add(other_user)
    
    other_root = Goal(
        id=str(uuid.uuid4()),
        name="Other Root",
        owner_id=other_user.id
    )
    other_root.root_id = other_root.id
    db_session.add(other_root)
    
    # Create my own root
    my_root = Goal(
        id=str(uuid.uuid4()),
        name="My Root",
        owner_id=test_user.id
    )
    my_root.root_id = my_root.id
    db_session.add(my_root)
    
    # Create my goal
    my_goal = Goal(
        id=str(uuid.uuid4()),
        name="My Goal",
        owner_id=test_user.id,
        root_id=my_root.id,
        parent_id=my_root.id
    )
    db_session.add(my_goal)
    db_session.commit()
    
    # Attempt to update 'my_goal' to have 'other_root' as parent 
    response = authed_client.put(
        f'/api/{my_root.id}/goals/{my_goal.id}',
        json={'parent_id': other_root.id}
    )
    assert response.status_code == 400
    data = response.get_json()
    assert "New parent goal not found in this fractal" in data['error']

# Test 2: attach_goal_to_day validation
def test_attach_goal_to_day_validation(authed_client, db_session, test_user):
    """
    Test 2: Ensure empty/None payload correctly trigger a 400 Bad Request error.
    """
    root_id = str(uuid.uuid4())
    prog_id = str(uuid.uuid4())
    block_id = str(uuid.uuid4())
    day_id = str(uuid.uuid4())
    
    # We don't even need the models to exist to hit the payload validation 400 first
    
    # Try with empty body
    response = authed_client.post(
        f'/api/{root_id}/programs/{prog_id}/blocks/{block_id}/days/{day_id}/goals',
        # No JSON
    )
    assert response.status_code in [400, 415] # Flask validation error or unsupported media type
    
    # Try with empty JSON
    response2 = authed_client.post(
        f'/api/{root_id}/programs/{prog_id}/blocks/{block_id}/days/{day_id}/goals',
        json={}
    )
    assert response2.status_code == 400
    data = response2.get_json()
    assert "error" in data or "errors" in data

# Test 3: day_of_week Validation
def test_day_of_week_schema_validation(authed_client, test_user):
    """
    Test 3: Ensure invalid day names are rejected in ProgramDayCreateSchema.
    """
    root_id = str(uuid.uuid4())
    prog_id = str(uuid.uuid4())
    block_id = str(uuid.uuid4())
    
    response = authed_client.post(
        f'/api/{root_id}/programs/{prog_id}/blocks/{block_id}/days',
        json={
            'name': 'Day 1',
            'day_of_week': ['Funday'] # Invalid string
        }
    )
    assert response.status_code == 400
    data = response.get_json()
    # It should say Invalid day of week
    assert "Invalid day of week" in json.dumps(data)

# Test 4: Transaction validation on idempotency
def test_idempotent_attach_goal(authed_client, db_session, test_user):
    """
    Test 4: attach_goal_to_day idempotency
    Ensure that attaching the same goal multiple times returns a 201 without throwing a 500 error.
    """
    my_root = Goal(
        id=str(uuid.uuid4()),
        name="Root",
        owner_id=test_user.id
    )
    my_root.root_id = my_root.id
    db_session.add(my_root)
    
    program = Program(
        id=str(uuid.uuid4()), 
        root_id=my_root.id, 
        name="Prog", 
        start_date=datetime.now(timezone.utc), 
        end_date=datetime.now(timezone.utc), 
        weekly_schedule={}
    )
    block = ProgramBlock(
        id=str(uuid.uuid4()), 
        program_id=program.id, 
        name="Block"
    )
    day = ProgramDay(
        id=str(uuid.uuid4()), 
        block_id=block.id, 
        name="Day"
    )
    goal = Goal(id=str(uuid.uuid4()), root_id=my_root.id, name="Goal")
    
    db_session.add_all([program, block, day, goal])
    db_session.commit()
    
    # First attach
    resp1 = authed_client.post(
        f'/api/{my_root.id}/programs/{program.id}/blocks/{block.id}/days/{day.id}/goals',
        json={'goal_id': goal.id}
    )
    assert resp1.status_code == 201
    
    # Second attach identically
    resp2 = authed_client.post(
        f'/api/{my_root.id}/programs/{program.id}/blocks/{block.id}/days/{day.id}/goals',
        json={'goal_id': goal.id}
    )
    assert resp2.status_code == 201
    
    # Verification query
    db_session.expire_all()
    # check relationships without breaking
    from models.goal import program_day_goals
    count = db_session.execute(
        program_day_goals.select().where(
            (program_day_goals.c.program_day_id == day.id) &
            (program_day_goals.c.goal_id == goal.id)
        )
    ).fetchall()
    
    # Expected: exactly 1 entry, not exploded
    assert len(count) == 1
