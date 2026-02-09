import pytest
from datetime import datetime, timedelta
import uuid
from models import Goal, Session, ActivityDefinition, ActivityInstance, session_goals, activity_goal_associations, UltimateGoal, ShortTermGoal, ImmediateGoal
from services.metrics import GoalMetricsService

@pytest.fixture
def db_session(db_session):
    return db_session

def test_recursive_metrics(db_session):
    # Create a hierarchy:
    # Root -> Child A -> Child B
    
    # Create Root
    root_id = str(uuid.uuid4())
    root = UltimateGoal(id=root_id, name="Root Goal", root_id=root_id)
    db_session.add(root)
    db_session.flush()
    
    # Create Child A
    child_a_id = str(uuid.uuid4())
    child_a = ShortTermGoal(id=child_a_id, name="Child A", parent_id=root_id, root_id=root_id)
    db_session.add(child_a)
    db_session.flush()
    
    # Create Child B
    child_b_id = str(uuid.uuid4())
    child_b = ImmediateGoal(id=child_b_id, name="Child B", parent_id=child_a_id, root_id=root_id)
    db_session.add(child_b)
    db_session.flush()
    
    db_session.commit()
    
    # Create Sessions
    # Session 1 -> Root (direct)
    s1 = Session(id=str(uuid.uuid4()), name="Session 1", total_duration_seconds=3600, root_id=root_id)
    db_session.add(s1)
    db_session.flush()
    # Link s1 to Root
    db_session.execute(session_goals.insert().values(session_id=s1.id, goal_id=root_id, goal_type='UltimateGoal'))
    
    # Session 2 -> Child A
    s2 = Session(id=str(uuid.uuid4()), name="Session 2", total_duration_seconds=1800, root_id=root_id)
    db_session.add(s2)
    db_session.flush()
    # Link s2 to Child A
    db_session.execute(session_goals.insert().values(session_id=s2.id, goal_id=child_a_id, goal_type='ShortTermGoal'))
    
    # Session 3 -> Child B
    s3 = Session(id=str(uuid.uuid4()), name="Session 3", total_duration_seconds=900, root_id=root_id)
    db_session.add(s3)
    db_session.flush()
    # Link s3 to Child B
    db_session.execute(session_goals.insert().values(session_id=s3.id, goal_id=child_b_id, goal_type='ImmediateGoal'))
    
    db_session.commit()
    
    # Verify Metrics
    service = GoalMetricsService(db_session)
    
    # Check Root Metrics
    root_metrics = service.get_metrics_for_goal(root_id)
    assert root_metrics["direct"]["sessions_count"] == 1
    assert root_metrics["direct"]["sessions_duration_seconds"] == 3600
    
    # Recursive should be sum of all (since they are distinct sessions)
    assert root_metrics["recursive"]["sessions_count"] == 3
    assert root_metrics["recursive"]["sessions_duration_seconds"] == 3600 + 1800 + 900
    
    # Check Child A Metrics
    child_a_metrics = service.get_metrics_for_goal(child_a_id)
    assert child_a_metrics["direct"]["sessions_count"] == 1
    assert child_a_metrics["direct"]["sessions_duration_seconds"] == 1800
    
    assert child_a_metrics["recursive"]["sessions_count"] == 2 # Child A + Child B
    assert child_a_metrics["recursive"]["sessions_duration_seconds"] == 1800 + 900
    
    # Check Child B Metrics
    child_b_metrics = service.get_metrics_for_goal(child_b_id)
    assert child_b_metrics["recursive"]["sessions_count"] == 1
    assert child_b_metrics["recursive"]["sessions_duration_seconds"] == 900

def test_recursive_activity_metrics(db_session):
    # Similar hierarchy
    root_id = str(uuid.uuid4())
    root = UltimateGoal(id=root_id, name="Root Activity Goal", root_id=root_id)
    db_session.add(root)
    db_session.flush()
    
    child_id = str(uuid.uuid4())
    child = ShortTermGoal(id=child_id, name="Child Activity Goal", parent_id=root_id, root_id=root_id)
    db_session.add(child)
    db_session.flush()
    
    # Activity Definition
    act_def_id = str(uuid.uuid4())
    act_def = ActivityDefinition(id=act_def_id, name="Test Activity", root_id=root_id)
    db_session.add(act_def)
    
    db_session.commit()
    
    # Associate Activity with Child
    db_session.execute(activity_goal_associations.insert().values(activity_id=act_def_id, goal_id=child_id))
    db_session.commit()
    
    # Create Activity Instance (completed)
    inst_id = str(uuid.uuid4())
    inst = ActivityInstance(
        id=inst_id, 
        activity_definition_id=act_def_id, 
        duration_seconds=600,
        completed=True,
        root_id=root_id
    )
    db_session.add(inst)
    db_session.commit()
    
    service = GoalMetricsService(db_session)
    
    # Child Metrics
    child_metrics = service.get_metrics_for_goal(child_id)
    assert child_metrics["direct"]["activities_count"] == 1
    assert child_metrics["direct"]["activities_duration_seconds"] == 600
    
    # Root Metrics (should rollup activity ASSOCIATION and DURATION)
    root_metrics = service.get_metrics_for_goal(root_id)
    
    # Root has no direct association
    assert root_metrics["direct"]["activities_count"] == 0
    assert root_metrics["direct"]["activities_duration_seconds"] == 0
    
    # Recursive rollup
    assert root_metrics["recursive"]["activities_count"] == 1
    assert root_metrics["recursive"]["activities_duration_seconds"] == 600
