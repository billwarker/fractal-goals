"""
Pytest configuration and shared fixtures for Fractal Goals tests.

This file contains:
- Database fixtures for creating test databases
- Sample data fixtures for common test scenarios
- Configuration for pytest plugins
"""

import os
import sys
import pytest
import tempfile
from datetime import datetime, timedelta
import uuid
import json

# Add parent directory to path so we can import app modules
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from flask import Flask
from flask_cors import CORS
import models
from models import (
    Base, Goal, UltimateGoal, ShortTermGoal, PracticeSession,
    ActivityGroup, ActivityDefinition, MetricDefinition, SplitDefinition,
    ActivityInstance, MetricValue, SessionTemplate,
    get_engine, init_db, get_session
)

# Import blueprints
from blueprints.activities_api import activities_bp
from blueprints.sessions_api import sessions_bp
from blueprints.goals_api import goals_bp
from blueprints.templates_api import templates_bp
from blueprints.timers_api import timers_bp


@pytest.fixture(scope='function')
def app():
    """Create and configure a test Flask application instance."""
    # Create a temporary database file
    db_fd, db_path = tempfile.mkstemp(suffix='.db')
    
    # Create Flask app for testing
    test_app = Flask(__name__)
    test_app.config['TESTING'] = True
    
    # Enable CORS
    CORS(test_app, resources={
        r"/api/*": {
            "origins": "*",
            "methods": ["GET", "POST", "PUT", "PATCH", "DELETE"],
            "allow_headers": ["Content-Type"]
        }
    })
    
    # Register blueprints
    test_app.register_blueprint(activities_bp)
    test_app.register_blueprint(sessions_bp)
    test_app.register_blueprint(goals_bp)
    test_app.register_blueprint(templates_bp)
    test_app.register_blueprint(timers_bp)
    
    # Patch get_engine to use test database
    original_get_engine = models.get_engine
    test_db_uri = f'sqlite:///{db_path}'
    
    # Cache the engine to ensure we share the connection pool/state
    cached_engine = []

    def mock_get_engine(db_path_arg=None):
        if not cached_engine:
            from sqlalchemy import create_engine
            print(f"DEBUG: creating NEW engine for URI: {test_db_uri}")
            cached_engine.append(create_engine(test_db_uri, echo=False))
        else:
             print(f"DEBUG: returning CACHED engine for URI: {test_db_uri}")
        return cached_engine[0]
    
    models.get_engine = mock_get_engine
    
    # Create all tables
    engine = mock_get_engine()
    init_db(engine)
    
    yield test_app
    
    # Restore original get_engine
    models.get_engine = original_get_engine
    
    # Cleanup
    os.close(db_fd)
    os.unlink(db_path)


@pytest.fixture(scope='function')
def client(app):
    """Create a test client for the Flask application."""
    return app.test_client()


@pytest.fixture(scope='function')
def runner(app):
    """Create a test CLI runner for the Flask application."""
    return app.test_cli_runner()


@pytest.fixture(scope='function')
def db_session(app):
    """Create a database session for tests."""
    # Use models.get_engine() which is patched by the app fixture
    engine = models.get_engine()
    session = get_session(engine)
    yield session
    session.close()


# ============================================================================
# Sample Data Fixtures
# ============================================================================

@pytest.fixture
def sample_ultimate_goal(db_session):
    """Create a sample UltimateGoal for testing."""
    goal = UltimateGoal(
        id=str(uuid.uuid4()),
        name="Master Software Engineering",
        description="Become a world-class software engineer",
        created_at=datetime.utcnow(),
        root_id=None  # Will be set to self
    )
    goal.root_id = goal.id
    db_session.add(goal)
    db_session.commit()
    return goal


@pytest.fixture
def sample_goal_hierarchy(db_session, sample_ultimate_goal):
    """Create a complete goal hierarchy for testing."""
    from models import LongTermGoal, MidTermGoal, ShortTermGoal
    
    # Long-term goal
    long_term = LongTermGoal(
        id=str(uuid.uuid4()),
        name="Master Backend Development",
        description="Become expert in backend systems",
        parent_id=sample_ultimate_goal.id,
        root_id=sample_ultimate_goal.id,
        created_at=datetime.utcnow()
    )
    db_session.add(long_term)
    
    # Mid-term goal
    mid_term = MidTermGoal(
        id=str(uuid.uuid4()),
        name="Learn Python Advanced Concepts",
        description="Master decorators, metaclasses, async",
        parent_id=long_term.id,
        root_id=sample_ultimate_goal.id,
        created_at=datetime.utcnow()
    )
    db_session.add(mid_term)
    
    # Short-term goal
    short_term = ShortTermGoal(
        id=str(uuid.uuid4()),
        name="Complete Python Testing Course",
        description="Learn pytest and testing best practices",
        parent_id=mid_term.id,
        root_id=sample_ultimate_goal.id,
        deadline=datetime.utcnow() + timedelta(days=30),
        created_at=datetime.utcnow()
    )
    db_session.add(short_term)
    
    db_session.commit()
    
    return {
        'ultimate': sample_ultimate_goal,
        'long_term': long_term,
        'mid_term': mid_term,
        'short_term': short_term
    }


@pytest.fixture
def sample_activity_group(db_session, sample_ultimate_goal):
    """Create a sample ActivityGroup for testing."""
    group = ActivityGroup(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Strength Training",
        description="Resistance exercises",
        created_at=datetime.utcnow(),
        sort_order=1
    )
    db_session.add(group)
    db_session.commit()
    return group


@pytest.fixture
def sample_activity_definition(db_session, sample_ultimate_goal, sample_activity_group):
    """Create a sample ActivityDefinition with metrics for testing."""
    activity = ActivityDefinition(
        id=str(uuid.uuid4()),
        root_id=sample_ultimate_goal.id,
        name="Bench Press",
        description="Barbell bench press",
        has_sets=True,
        has_metrics=True,
        metrics_multiplicative=False,
        has_splits=False,
        group_id=sample_activity_group.id,
        created_at=datetime.utcnow()
    )
    db_session.add(activity)
    db_session.commit()
    
    # Add metrics
    weight_metric = MetricDefinition(
        id=str(uuid.uuid4()),
        activity_id=activity.id,
        root_id=sample_ultimate_goal.id,
        name="Weight",
        unit="lbs",
        is_top_set_metric=True,
        is_multiplicative=False,
        is_active=True,
        created_at=datetime.utcnow()
    )
    reps_metric = MetricDefinition(
        id=str(uuid.uuid4()),
        activity_id=activity.id,
        root_id=sample_ultimate_goal.id,
        name="Reps",
        unit="reps",
        is_top_set_metric=False,
        is_multiplicative=False,
        is_active=True,
        created_at=datetime.utcnow()
    )
    db_session.add(weight_metric)
    db_session.add(reps_metric)
    db_session.commit()
    
    return activity


@pytest.fixture
def sample_practice_session(db_session, sample_goal_hierarchy):
    """Create a sample PracticeSession for testing."""
    session = PracticeSession(
        id=str(uuid.uuid4()),
        name="Morning Workout",
        description="Strength training session",
        parent_id=sample_goal_hierarchy['short_term'].id,
        root_id=sample_goal_hierarchy['ultimate'].id,
        session_start=datetime.utcnow(),
        created_at=datetime.utcnow(),
        attributes=json.dumps({})
    )
    db_session.add(session)
    db_session.commit()
    return session


@pytest.fixture
def sample_activity_instance(db_session, sample_practice_session, sample_activity_definition):
    """Create a sample ActivityInstance for testing."""
    instance = ActivityInstance(
        id=str(uuid.uuid4()),
        practice_session_id=sample_practice_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=sample_practice_session.root_id,
        created_at=datetime.utcnow(),
        time_start=None,
        time_stop=None,
        duration_seconds=None,
        data=json.dumps({})
    )
    db_session.add(instance)
    db_session.commit()
    return instance


@pytest.fixture
def sample_session_template(db_session, sample_ultimate_goal):
    """Create a sample SessionTemplate for testing."""
    template = SessionTemplate(
        id=str(uuid.uuid4()),
        name="Full Body Workout",
        description="Complete full body training session",
        root_id=sample_ultimate_goal.id,
        created_at=datetime.utcnow(),
        template_data=json.dumps({
            'sections': [
                {
                    'name': 'Warm-up',
                    'exercises': []
                },
                {
                    'name': 'Main Work',
                    'exercises': []
                }
            ]
        })
    )
    db_session.add(template)
    db_session.commit()
    return template


# ============================================================================
# Helper Functions
# ============================================================================

def create_goal(db_session, goal_type, name, parent=None, root=None):
    """Helper function to create a goal of any type."""
    from models import (
        UltimateGoal, LongTermGoal, MidTermGoal, ShortTermGoal,
        ImmediateGoal, MicroGoal, NanoGoal
    )
    
    goal_classes = {
        'UltimateGoal': UltimateGoal,
        'LongTermGoal': LongTermGoal,
        'MidTermGoal': MidTermGoal,
        'ShortTermGoal': ShortTermGoal,
        'ImmediateGoal': ImmediateGoal,
        'MicroGoal': MicroGoal,
        'NanoGoal': NanoGoal,
    }
    
    GoalClass = goal_classes.get(goal_type)
    if not GoalClass:
        raise ValueError(f"Unknown goal type: {goal_type}")
    
    goal = GoalClass(
        id=str(uuid.uuid4()),
        name=name,
        parent_id=parent.id if parent else None,
        root_id=root.id if root else None,
        created_at=datetime.utcnow()
    )
    
    # If this is an UltimateGoal, set root_id to self
    if goal_type == 'UltimateGoal':
        goal.root_id = goal.id
    
    db_session.add(goal)
    db_session.commit()
    return goal
