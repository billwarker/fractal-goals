import pytest
from datetime import datetime, timedelta, timezone
import uuid
from models import Goal, GoalLevel

def test_child_deadline_constraint(authed_client, db_session, test_user):
    """Test that a child goal cannot have a deadline later than its parent."""
    # 1. Create parent goal
    parent_deadline = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    r = authed_client.post('/api/goals', json={
        "name": "Parent Goal",
        "type": "UltimateGoal",
        "deadline": parent_deadline
    })
    assert r.status_code == 201
    parent_id = r.get_json()["id"]

    # 2. Try to create child with later deadline
    child_deadline = (datetime.now(timezone.utc) + timedelta(days=40)).date().isoformat()
    r = authed_client.post('/api/goals', json={
        "name": "Child Goal",
        "type": "MidTermGoal",
        "parent_id": parent_id,
        "deadline": child_deadline
    })
    assert r.status_code == 400
    assert "Child deadline cannot be later than parent deadline" in r.get_json()["error"]

def test_deadline_cascade(authed_client, db_session, test_user):
    """Test that shortening a parent deadline cascades to children."""
    # 1. Create parent and child
    p_date = (datetime.now(timezone.utc) + timedelta(days=30)).date().isoformat()
    c_date = (datetime.now(timezone.utc) + timedelta(days=25)).date().isoformat()
    
    r = authed_client.post('/api/goals', json={
        "name": "Parent", "type": "UltimateGoal", "deadline": p_date
    })
    parent_id = r.get_json()["id"]
    
    r = authed_client.post('/api/goals', json={
        "name": "Child", "type": "MidTermGoal", "parent_id": parent_id, "deadline": c_date
    })
    child_id = r.get_json()["id"]

    # 2. Shorten parent deadline to BEFORE child deadline
    new_p_date = (datetime.now(timezone.utc) + timedelta(days=15)).date().isoformat()
    r = authed_client.put(f'/api/goals/{parent_id}', json={"deadline": new_p_date})
    assert r.status_code == 200
    
    # 3. Verify child deadline was clamped
    r = authed_client.get(f'/api/goals/{child_id}')
    child_resp = r.get_json()
    # Extract just the date part from "YYYY-MM-DDTHH:MM:SSZ"
    child_deadline_date = child_resp["deadline"].split('T')[0]
    assert child_deadline_date == new_p_date

def test_transient_goal_constraints(authed_client, db_session, test_user):
    """Removed MicroGoal/NanoGoal types are rejected."""
    r = authed_client.post('/api/goals', json={"name": "Root", "type": "UltimateGoal"})
    root_id = r.get_json()["id"]
    r = authed_client.post('/api/goals', json={"name": "Imm", "type": "ImmediateGoal", "parent_id": root_id})
    imm_id = r.get_json()["id"]

    r = authed_client.post('/api/goals', json={
        "name": "Micro", "type": "MicroGoal", "parent_id": imm_id,
        "deadline": datetime.now().date().isoformat()
    })
    assert r.status_code == 400
    resp = r.get_json()
    error_msgs = [err["message"] for err in resp.get("details", [])]
    assert any("Invalid goal type" in m for m in error_msgs)

    r = authed_client.post('/api/goals', json={
        "name": "Nano", "type": "NanoGoal", "parent_id": imm_id,
        "description": "forbidden"
    })
    assert r.status_code == 400
    resp = r.get_json()
    error_msgs = [err["message"] for err in resp.get("details", [])]
    assert any("Invalid goal type" in m for m in error_msgs)
