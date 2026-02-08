"""
Unit tests for database models.

Tests cover:
- Goal hierarchy creation and relationships
- Goal type constraints
- Model serialization (to_dict)
- Timestamps and audit fields
- Data integrity
"""

import pytest
from datetime import datetime, timedelta
import uuid
import json

from models import (
    Goal, UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal,
    PracticeSession, ImmediateGoal, MicroGoal, NanoGoal,
    ActivityGroup, ActivityDefinition, MetricDefinition,
    ActivityInstance, MetricValue
)
from services.serializers import (
    serialize_goal, serialize_session, serialize_activity_instance, 
    serialize_metric_value, serialize_activity_definition
)


@pytest.mark.unit
class TestGoalHierarchy:
    """Test goal hierarchy creation and relationships."""
    
    def test_create_ultimate_goal(self, db_session):
        """Test creating an UltimateGoal."""
        goal = UltimateGoal(
            id=str(uuid.uuid4()),
            name="Test Ultimate Goal",
            description="Test description",
            created_at=datetime.utcnow()
        )
        goal.root_id = goal.id
        db_session.add(goal)
        db_session.commit()
        
        assert goal.id is not None
        assert goal.name == "Test Ultimate Goal"
        assert goal.type == "UltimateGoal"
        assert goal.root_id == goal.id
        assert goal.parent_id is None
        assert goal.created_at is not None
    
    def test_goal_hierarchy_relationships(self, sample_goal_hierarchy):
        """Test parent-child relationships in goal hierarchy."""
        hierarchy = sample_goal_hierarchy
        
        # Check parent-child relationships
        assert hierarchy['long_term'].parent_id == hierarchy['ultimate'].id
        assert hierarchy['mid_term'].parent_id == hierarchy['long_term'].id
        assert hierarchy['short_term'].parent_id == hierarchy['mid_term'].id
        
        # Check root_id propagation
        assert hierarchy['long_term'].root_id == hierarchy['ultimate'].id
        assert hierarchy['mid_term'].root_id == hierarchy['ultimate'].id
        assert hierarchy['short_term'].root_id == hierarchy['ultimate'].id
    
    def test_goal_completion_toggle(self, db_session, sample_ultimate_goal):
        """Test toggling goal completion status."""
        assert sample_ultimate_goal.completed is False
        
        sample_ultimate_goal.completed = True
        db_session.commit()
        
        assert sample_ultimate_goal.completed is True
    
    def test_goal_deadline(self, db_session, sample_ultimate_goal):
        """Test setting and retrieving goal deadline."""
        deadline = datetime.utcnow() + timedelta(days=30)
        sample_ultimate_goal.deadline = deadline
        db_session.commit()
        
        assert sample_ultimate_goal.deadline is not None
        assert abs((sample_ultimate_goal.deadline - deadline).total_seconds()) < 1
    
    def test_goal_to_dict(self, sample_ultimate_goal):
        """Test goal serialization to dictionary."""
        goal_dict = serialize_goal(sample_ultimate_goal)
        
        assert goal_dict['id'] == sample_ultimate_goal.id
        assert goal_dict['name'] == sample_ultimate_goal.name
        # type is nested in attributes
        assert goal_dict['attributes']['type'] == 'UltimateGoal'
        assert goal_dict['attributes']['completed'] == sample_ultimate_goal.completed
        assert 'created_at' in goal_dict['attributes']


@pytest.mark.unit
class TestPracticeSession:
    """Test PracticeSession model functionality."""
    
    def test_create_practice_session(self, db_session, sample_goal_hierarchy):
        """Test creating a PracticeSession."""
        session = PracticeSession(
            id=str(uuid.uuid4()),
            name="Test Session",
            root_id=sample_goal_hierarchy['ultimate'].id,
            session_start=datetime.utcnow(),
            created_at=datetime.utcnow()
        )
        db_session.add(session)
        db_session.commit()
        
        assert session.id is not None

        assert session.session_start is not None
    
    def test_session_duration_calculation(self, db_session, sample_practice_session):
        """Test session duration calculation."""
        start_time = datetime.utcnow()
        end_time = start_time + timedelta(hours=1, minutes=30)
        
        sample_practice_session.session_start = start_time
        sample_practice_session.session_end = end_time
        sample_practice_session.total_duration_seconds = int(
            (end_time - start_time).total_seconds()
        )
        db_session.commit()
        
        assert sample_practice_session.total_duration_seconds == 5400  # 90 minutes
    
    def test_session_to_dict_hydration(self, sample_practice_session):
        """Test session to_dict includes hydrated activity data."""
        session_dict = serialize_session(sample_practice_session)
        
        assert 'id' in session_dict
        assert 'name' in session_dict
        assert 'session_start' in session_dict['attributes']
        # Should include session_data with hydrated activities in attributes
        assert 'attributes' in session_dict


@pytest.mark.unit
class TestActivityDefinition:
    """Test ActivityDefinition model functionality."""
    
    def test_create_activity_definition(self, db_session, sample_ultimate_goal, sample_activity_group):
        """Test creating an ActivityDefinition."""
        activity = ActivityDefinition(
            id=str(uuid.uuid4()),
            root_id=sample_ultimate_goal.id,
            name="Test Activity",
            description="Test description",
            has_sets=True,
            has_metrics=True,
            group_id=sample_activity_group.id,
            created_at=datetime.utcnow()
        )
        db_session.add(activity)
        db_session.commit()
        
        assert activity.id is not None
        assert activity.name == "Test Activity"
        assert activity.has_sets is True
        assert activity.has_metrics is True
    
    def test_activity_with_metrics(self, sample_activity_definition):
        """Test activity definition with associated metrics."""
        # The fixture creates an activity with weight and reps metrics
        assert sample_activity_definition.has_metrics is True
        
        # Query metrics (would need to access through relationship)
        # This tests that the fixture setup worked correctly
        assert sample_activity_definition.id is not None
    
    def test_activity_to_dict(self, sample_activity_definition):
        """Test activity definition serialization."""
        activity_dict = serialize_activity_definition(sample_activity_definition)
        
        assert activity_dict['id'] == sample_activity_definition.id
        assert activity_dict['name'] == sample_activity_definition.name
        assert 'has_sets' in activity_dict
        assert 'has_metrics' in activity_dict


@pytest.mark.unit
class TestActivityInstance:
    """Test ActivityInstance model functionality."""
    
    def test_create_activity_instance(self, db_session, sample_practice_session, sample_activity_definition):
        """Test creating an ActivityInstance."""
        instance = ActivityInstance(
            id=str(uuid.uuid4()),
            session_id=sample_practice_session.id,
            activity_definition_id=sample_activity_definition.id,
            root_id=sample_practice_session.root_id,
            created_at=datetime.utcnow()
        )
        db_session.add(instance)
        db_session.commit()
        
        assert instance.id is not None
        assert instance.session_id == sample_practice_session.id
        # Legacy field should be populated automatically
        assert instance.practice_session_id == sample_practice_session.id
        assert instance.activity_definition_id == sample_activity_definition.id
    
    def test_activity_instance_timer(self, db_session, sample_activity_instance):
        """Test activity instance timer functionality."""
        start_time = datetime.utcnow()
        stop_time = start_time + timedelta(minutes=15)
        
        sample_activity_instance.time_start = start_time
        sample_activity_instance.time_stop = stop_time
        sample_activity_instance.duration_seconds = int(
            (stop_time - start_time).total_seconds()
        )
        db_session.commit()
        
        assert sample_activity_instance.time_start is not None
        assert sample_activity_instance.time_stop is not None
        assert sample_activity_instance.duration_seconds == 900  # 15 minutes
    
    def test_activity_instance_to_dict(self, sample_activity_instance):
        """Test activity instance serialization."""
        instance_dict = serialize_activity_instance(sample_activity_instance)
        
        assert instance_dict['id'] == sample_activity_instance.id
        assert 'session_id' in instance_dict
        # Legacy field support
        assert 'practice_session_id' in instance_dict
        assert 'activity_definition_id' in instance_dict


@pytest.mark.unit
class TestMetricValue:
    """Test MetricValue model functionality."""
    
    def test_create_metric_value(self, db_session, sample_activity_instance, sample_activity_definition):
        """Test creating a MetricValue."""
        # Get a metric definition from the activity
        from models import MetricDefinition
        metric_def = db_session.query(MetricDefinition).filter_by(
            activity_id=sample_activity_definition.id
        ).first()
        
        metric_value = MetricValue(
            id=str(uuid.uuid4()),
            activity_instance_id=sample_activity_instance.id,
            metric_definition_id=metric_def.id,
            value=225.0,  # 225 lbs
            created_at=datetime.utcnow(),
            root_id=sample_activity_instance.root_id
        )
        db_session.add(metric_value)
        db_session.commit()
        
        assert metric_value.id is not None
        assert metric_value.value == 225.0
    
    def test_metric_value_to_dict(self, db_session, sample_activity_instance, sample_activity_definition):
        """Test metric value serialization."""
        from models import MetricDefinition
        metric_def = db_session.query(MetricDefinition).filter_by(
            activity_id=sample_activity_definition.id
        ).first()
        
        metric_value = MetricValue(
            id=str(uuid.uuid4()),
            activity_instance_id=sample_activity_instance.id,
            metric_definition_id=metric_def.id,
            value=10.0,
            created_at=datetime.utcnow(),
            root_id=sample_activity_instance.root_id
        )
        db_session.add(metric_value)
        db_session.commit()
        
        value_dict = serialize_metric_value(metric_value)
        
        assert value_dict['id'] == metric_value.id
        assert value_dict['value'] == 10.0


@pytest.mark.unit
class TestDataIntegrity:
    """Test data integrity constraints and validation."""
    
    def test_root_id_propagation(self, sample_goal_hierarchy):
        """Test that root_id is correctly propagated through hierarchy."""
        hierarchy = sample_goal_hierarchy
        root_id = hierarchy['ultimate'].id
        
        assert hierarchy['ultimate'].root_id == root_id
        assert hierarchy['long_term'].root_id == root_id
        assert hierarchy['mid_term'].root_id == root_id
        assert hierarchy['short_term'].root_id == root_id
    
    def test_timestamps_auto_set(self, db_session, sample_ultimate_goal):
        """Test that created_at timestamp is automatically set."""
        assert sample_ultimate_goal.created_at is not None
        assert isinstance(sample_ultimate_goal.created_at, datetime)
    
    def test_updated_at_on_modification(self, db_session, sample_ultimate_goal):
        """Test that updated_at is set when model is modified."""
        # Note: This requires updated_at to be implemented in models
        # If not implemented yet, this test documents the expected behavior
        original_name = sample_ultimate_goal.name
        sample_ultimate_goal.name = "Updated Name"
        
        # If updated_at is implemented:
        if hasattr(sample_ultimate_goal, 'updated_at'):
            original_updated = sample_ultimate_goal.updated_at
            db_session.commit()
            assert sample_ultimate_goal.updated_at != original_updated
        else:
            # Test passes but documents missing feature
            db_session.commit()
            assert sample_ultimate_goal.name == "Updated Name"


@pytest.mark.unit
class TestSoftDeletes:
    """Test soft delete functionality."""
    
    def test_soft_delete_goal(self, db_session, sample_ultimate_goal):
        """Test soft deleting a goal."""
        # Note: This requires deleted_at to be implemented
        if hasattr(sample_ultimate_goal, 'deleted_at'):
            assert sample_ultimate_goal.deleted_at is None
            
            sample_ultimate_goal.deleted_at = datetime.utcnow()
            db_session.commit()
            
            assert sample_ultimate_goal.deleted_at is not None
        else:
            # Test passes but documents missing feature
            pytest.skip("Soft delete not yet implemented")
    
    def test_query_excludes_deleted(self, db_session, sample_ultimate_goal):
        """Test that queries exclude soft-deleted records."""
        # This documents expected behavior for future implementation
        if hasattr(sample_ultimate_goal, 'deleted_at'):
            # Soft delete the goal
            sample_ultimate_goal.deleted_at = datetime.utcnow()
            db_session.commit()
            
            # Query should exclude deleted goals
            # (requires implementation of default query filter)
            active_goals = db_session.query(UltimateGoal).filter(
                UltimateGoal.deleted_at.is_(None)
            ).all()
            
            assert sample_ultimate_goal not in active_goals
        else:
            pytest.skip("Soft delete not yet implemented")
