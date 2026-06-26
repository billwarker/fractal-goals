import pytest
from datetime import datetime, timedelta
import uuid
from models import (
    Goal,
    Session,
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    session_goals,
    activity_goal_associations,
    goal_activity_group_associations,
)
from services.metrics import GoalMetricsService

@pytest.fixture
def db_session(db_session):
    return db_session

def test_recursive_metrics(db_session):
    # Create a hierarchy:
    # Root -> Child A -> Child B
    
    # Create Root
    root_id = str(uuid.uuid4())
    root = Goal(id=root_id, name="Root Goal", root_id=root_id)
    db_session.add(root)
    db_session.flush()
    
    # Create Child A
    child_a_id = str(uuid.uuid4())
    child_a = Goal(id=child_a_id, name="Child A", parent_id=root_id, root_id=root_id)
    db_session.add(child_a)
    db_session.flush()
    
    # Create Child B
    child_b_id = str(uuid.uuid4())
    child_b = Goal(id=child_b_id, name="Child B", parent_id=child_a_id, root_id=root_id)
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

def test_recursive_session_metrics_deduplicate_sessions_linked_to_multiple_subtree_goals(db_session):
    root_id = str(uuid.uuid4())
    root = Goal(id=root_id, name="Root Goal", root_id=root_id)
    child_id = str(uuid.uuid4())
    child = Goal(id=child_id, name="Child Goal", parent_id=root_id, root_id=root_id)
    db_session.add_all([root, child])
    db_session.flush()

    session = Session(
        id=str(uuid.uuid4()),
        name="Shared Session",
        total_duration_seconds=1200,
        root_id=root_id,
        session_start=datetime.utcnow(),
    )
    db_session.add(session)
    db_session.flush()
    db_session.execute(session_goals.insert().values(
        session_id=session.id,
        goal_id=root_id,
        goal_type='UltimateGoal',
        association_source='manual',
    ))
    db_session.execute(session_goals.insert().values(
        session_id=session.id,
        goal_id=child_id,
        goal_type='ShortTermGoal',
        association_source='activity',
    ))
    db_session.commit()

    metrics = GoalMetricsService(db_session).get_metrics_for_goal(root_id)

    assert metrics["recursive"]["sessions_count"] == 1
    assert metrics["recursive"]["sessions_duration_seconds"] == 1200

    daily = GoalMetricsService(db_session).get_goal_daily_durations(root_id)
    assert len(daily["points"]) == 1
    assert daily["points"][0]["session_duration"] == 1200

def test_session_metrics_ignore_soft_deleted_goal_links(db_session):
    root_id = str(uuid.uuid4())
    root = Goal(id=root_id, name="Root Goal", root_id=root_id)
    db_session.add(root)
    db_session.flush()

    session = Session(
        id=str(uuid.uuid4()),
        name="Deleted Link Session",
        total_duration_seconds=600,
        root_id=root_id,
    )
    db_session.add(session)
    db_session.flush()
    db_session.execute(session_goals.insert().values(
        session_id=session.id,
        goal_id=root_id,
        goal_type='UltimateGoal',
        association_source='manual',
        deleted_at=datetime.utcnow(),
    ))
    db_session.commit()

    metrics = GoalMetricsService(db_session).get_metrics_for_goal(root_id)

    assert metrics["direct"]["sessions_count"] == 0
    assert metrics["direct"]["sessions_duration_seconds"] == 0
    assert metrics["recursive"]["sessions_count"] == 0
    assert metrics["recursive"]["sessions_duration_seconds"] == 0

def test_recursive_activity_metrics(db_session):
    # Similar hierarchy
    root_id = str(uuid.uuid4())
    root = Goal(id=root_id, name="Root Activity Goal", root_id=root_id)
    db_session.add(root)
    db_session.flush()
    
    child_id = str(uuid.uuid4())
    child = Goal(id=child_id, name="Child Activity Goal", parent_id=root_id, root_id=root_id)
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

def test_metrics_count_group_activity_evidence_sessions_and_daily_points(db_session):
    root_id = str(uuid.uuid4())
    created_at = datetime(2026, 6, 17, 10, 0)
    root = Goal(id=root_id, name="Root Goal", root_id=root_id, created_at=created_at)
    child = Goal(
        id=str(uuid.uuid4()),
        name="Child Goal",
        parent_id=root_id,
        root_id=root_id,
        created_at=created_at,
    )
    db_session.add_all([root, child])
    db_session.flush()

    group = ActivityGroup(id=str(uuid.uuid4()), root_id=root_id, name="Practice Group")
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        name="Grouped Activity",
        root_id=root_id,
        group_id=group.id,
    )
    session_start = datetime(2026, 6, 25, 18, 15)
    session = Session(
        id=str(uuid.uuid4()),
        name="Evidence Session",
        root_id=root_id,
        session_start=session_start,
        total_duration_seconds=3600,
    )
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=activity.id,
        completed=True,
        created_at=session_start,
        time_start=session_start,
        time_stop=session_start + timedelta(minutes=45),
        duration_seconds=2710,
    )
    db_session.add_all([group, activity, session, instance])
    db_session.flush()
    db_session.execute(goal_activity_group_associations.insert().values(
        goal_id=child.id,
        activity_group_id=group.id,
    ))
    db_session.commit()

    service = GoalMetricsService(db_session)
    metrics = service.get_metrics_for_goal(root_id)

    assert metrics["recursive"]["sessions_count"] == 1
    assert metrics["recursive"]["sessions_duration_seconds"] == 3600
    assert metrics["recursive"]["activities_count"] == 1
    assert metrics["recursive"]["activities_duration_seconds"] == 2710

    daily = service.get_goal_daily_durations(root_id)
    assert daily["points"] == [{
        "date": "2026-06-25",
        "session_duration": 3600,
        "activity_duration": 2710,
    }]

def test_metrics_count_parent_inherited_activity_evidence(db_session):
    root_id = str(uuid.uuid4())
    created_at = datetime(2026, 6, 17, 10, 0)
    parent = Goal(id=root_id, name="Parent Goal", root_id=root_id, created_at=created_at)
    child = Goal(
        id=str(uuid.uuid4()),
        name="Child Goal",
        parent_id=root_id,
        root_id=root_id,
        inherit_parent_activities=True,
        created_at=created_at,
    )
    db_session.add_all([parent, child])
    db_session.flush()

    activity = ActivityDefinition(id=str(uuid.uuid4()), name="Inherited Activity", root_id=root_id)
    session = Session(
        id=str(uuid.uuid4()),
        name="Inherited Evidence Session",
        root_id=root_id,
        session_start=datetime(2026, 6, 25, 23, 17),
        total_duration_seconds=1800,
    )
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        root_id=root_id,
        session_id=session.id,
        activity_definition_id=activity.id,
        completed=True,
        created_at=session.session_start,
        time_start=session.session_start,
        duration_seconds=1662,
    )
    db_session.add_all([activity, session, instance])
    db_session.flush()
    db_session.execute(activity_goal_associations.insert().values(
        activity_id=activity.id,
        goal_id=parent.id,
    ))
    db_session.commit()

    metrics = GoalMetricsService(db_session).get_metrics_for_goal(child.id)

    assert metrics["recursive"]["sessions_count"] == 1
    assert metrics["recursive"]["sessions_duration_seconds"] == 1800
    assert metrics["recursive"]["activities_count"] == 1
    assert metrics["recursive"]["activities_duration_seconds"] == 1662
