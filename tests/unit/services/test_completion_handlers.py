import pytest
import uuid
import json
from datetime import datetime, timezone, timedelta

from models import Session, ActivityInstance, Target, Goal, MetricDefinition, TargetContributionLedger
from models.goal import activity_goal_associations
from services.events import event_bus, Event, Events
# Ensure handlers are imported so they register
import services.completion_handlers

@pytest.fixture
def sample_metric_target(db_session, sample_goal_hierarchy, sample_activity_definition):
    # Link activity to goal
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=sample_goal_hierarchy['short_term'].id
        )
    )
    
    # Create target
    target = Target(
        id=str(uuid.uuid4()),
        goal_id=sample_goal_hierarchy['short_term'].id,
        root_id=sample_goal_hierarchy['ultimate'].id,
        name="Lift 100 lbs",
        type="threshold",
        activity_id=sample_activity_definition.id,
        created_at=datetime.now(timezone.utc)
    )
    
    # Get the metric definition from the sample activity
    metric_def = sample_activity_definition.metric_definitions[0]
    
    # Add metric condition (via relationship or JSON backcompat depending on implementation)
    from models import TargetMetricCondition
    condition = TargetMetricCondition(
        id=str(uuid.uuid4()),
        target_id=target.id,
        metric_definition_id=metric_def.id,
        operator=">=",
        target_value=100.0
    )
    
    target.metric_conditions = [condition]
    
    # Append the target to the goal to establish the relation eagerly
    goal = db_session.query(Goal).get(sample_goal_hierarchy['short_term'].id)
    goal.targets_rel.append(target)
    
    db_session.add(target)
    db_session.commit()
    
    return target


from unittest.mock import patch

def test_handle_session_completed(db_session, sample_practice_session, sample_metric_target, sample_activity_definition, sample_goal_hierarchy):
    """Test that a completed session evaluates targets correctly."""
    
    # Force handler to use our test session so it sees all state cleanly
    with patch('services.completion_handlers._get_db_session', return_value=db_session), \
         patch.object(db_session, 'close', return_value=None):
        
        # Create an activity instance that meets the target
        from models import MetricValue
        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            session_id=sample_practice_session.id,
            activity_definition_id=sample_activity_definition.id,
            root_id=sample_practice_session.root_id,
            created_at=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            data={}
        )
        metric_val = MetricValue(
            id=str(uuid.uuid4()),
            activity_instance_id=instance.id,
            metric_definition_id=sample_activity_definition.metric_definitions[0].id,
            value=105.0
        )
        db_session.add(instance)
        db_session.add(metric_val)
        
        # Link session to the goal directly via association table
        from models.goal import session_goals
        db_session.execute(
            session_goals.insert().values(
                session_id=sample_practice_session.id,
                goal_id=sample_goal_hierarchy['short_term'].id,
                goal_type='short_term',
                association_source='manual'
            )
        )
            
        db_session.commit()
        
        # Emit completion event
        event = Event(Events.SESSION_COMPLETED, {
            'session_id': sample_practice_session.id,
            'root_id': sample_practice_session.root_id
        })
        
        print(f"[TEST PRE-RUN] Session goals: {sample_practice_session.goals}")
        print(f"[TEST PRE-RUN] Goal targets_rel: {sample_goal_hierarchy['short_term'].targets_rel}")
        
        # Trigger handler
        services.completion_handlers.handle_session_completed(event)
        
        # Reload target and goal
        db_session.refresh(sample_metric_target)
        
        print(f"TARGET CONDITIONS: {sample_metric_target.metric_conditions}")
        if sample_metric_target.metric_conditions:
            print(f"CONDITION 1: {sample_metric_target.metric_conditions[0].metric_definition_id}, {sample_metric_target.metric_conditions[0].target_value}")
        
        short_term_goal = db_session.query(Goal).get(sample_goal_hierarchy['short_term'].id)
        
        assert sample_metric_target.completed is True
        assert sample_metric_target.completed_session_id == sample_practice_session.id
        assert short_term_goal.completed is True


def test_handle_activity_instance_completed(db_session, sample_practice_session, sample_metric_target, sample_activity_definition, sample_goal_hierarchy):
    """Test that completing an activity instance within an uncompleted session evaluates targets."""
    from models import MetricValue
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        session_id=sample_practice_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=sample_practice_session.root_id,
        created_at=datetime.now(timezone.utc),
        time_stop=datetime.now(timezone.utc),
        data={}
    )
    metric_val = MetricValue(
        id=str(uuid.uuid4()),
        activity_instance_id=instance.id,
        metric_definition_id=sample_activity_definition.metric_definitions[0].id,
        value=105.0
    )
    db_session.add(instance)
    
    # Explicitly append to metric_values to avoid lazy loading flakiness
    instance.metric_values.append(metric_val)
    
    from models.goal import session_goals
    db_session.execute(
        session_goals.insert().values(
            session_id=sample_practice_session.id,
            goal_id=sample_goal_hierarchy['short_term'].id,
            goal_type='short_term',
            association_source='manual'
        )
    )
    
    db_session.commit()
    db_session.refresh(instance)
    db_session.refresh(sample_practice_session)
    
    from services.serializers import serialize_activity_instance
    print(f"[TEST PRE-RUN] Instance Serialized: {serialize_activity_instance(instance)}")
    print(f"[TEST PRE-RUN] Session goals: {sample_practice_session.goals}")
    
    with patch('services.completion_handlers._get_db_session', return_value=db_session), \
         patch.object(db_session, 'close', return_value=None):
        
        event = Event(Events.ACTIVITY_INSTANCE_COMPLETED, {
            'instance_id': instance.id,
            'root_id': instance.root_id
        })
        
        services.completion_handlers.handle_activity_instance_completed(event)
        
        db_session.refresh(sample_metric_target)
        assert sample_metric_target.completed is True
        assert sample_metric_target.completed_instance_id == instance.id


def test_handle_goal_completed(db_session, sample_goal_hierarchy):
    """Test that completing a goal completes its parent if auto-complete is active."""
    # Setup auto-complete on parent
    from models.goal import GoalLevel
    mid_goal = db_session.query(Goal).get(sample_goal_hierarchy['mid_term'].id)
    if not mid_goal.level:
        lvl = GoalLevel(id=str(uuid.uuid4()), name="Mid", rank=2, auto_complete_when_children_done=True)
        db_session.add(lvl)
        mid_goal.level = lvl
    mid_goal.level.auto_complete_when_children_done = True
    
    # Complete the child
    short_term_goal = db_session.query(Goal).get(sample_goal_hierarchy['short_term'].id)
    short_term_goal.completed = True
    short_term_goal.completed_at = datetime.now(timezone.utc)
    db_session.commit()
    
    with patch('services.completion_handlers._get_db_session', return_value=db_session), \
         patch.object(db_session, 'close', return_value=None):
        
        event = Event(Events.GOAL_COMPLETED, {
            'goal_id': short_term_goal.id,
            'root_id': short_term_goal.root_id,
            'goal_name': short_term_goal.name
        })
        services.completion_handlers.handle_goal_completed(event)
        
        db_session.refresh(mid_goal)
        # Assuming the handler automatically completes parents when all children are done
        assert mid_goal.completed is True
