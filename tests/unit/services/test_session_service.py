import pytest
import json
from uuid import uuid4
from datetime import datetime, timezone

from models import Goal, ActivityDefinition, ActivityInstance, Session, get_session_by_id
from services.session_service import SessionService

@pytest.fixture
def session_service(db_session):
    return SessionService(db_session)

# ==============================================================================
# Extract Activity Definition ID Helper
# ==============================================================================
def test_extract_activity_definition_id_legacy(session_service):
    raw_item = {'activity_id': 'legacy-id-123'}
    assert session_service._extract_activity_definition_id(raw_item) == 'legacy-id-123'

def test_extract_activity_definition_id_new(session_service):
    raw_item = {
        'activity_definition_id': 'new-id-456'
    }
    assert session_service._extract_activity_definition_id(raw_item) == 'new-id-456'

def test_extract_activity_definition_id_fallback(session_service):
    raw_item = {'id': 'fallback-id-789'}
    assert session_service._extract_activity_definition_id(raw_item) == 'fallback-id-789'

def test_extract_activity_definition_id_none(session_service):
    raw_item = {'name': 'just a name'}
    assert session_service._extract_activity_definition_id(raw_item) is None

# ==============================================================================
# Derive Session Goals from Activities
# ==============================================================================
def test_derive_session_goals_from_activities(
    db_session, session_service, sample_practice_session, sample_goal_hierarchy, sample_activity_definition
):
    # Link the activity definition to a specific goal
    from models.goal import activity_goal_associations
    db_session.execute(
        activity_goal_associations.insert().values(
            activity_id=sample_activity_definition.id,
            goal_id=sample_goal_hierarchy['short_term'].id
        )
    )
    db_session.commit()
    
    # Create an activity instance for the session
    instance = ActivityInstance(
        id=str(uuid4()),
        session_id=sample_practice_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=sample_practice_session.root_id,
        created_at=datetime.now(timezone.utc)
    )
    db_session.add(instance)
    db_session.commit()
    
    # Reload session with join to ensure instances are available
    session_obj = get_session_by_id(db_session, sample_practice_session.id)
    
    derived_goals = session_service._derive_session_goals_from_activities(session_obj)
    
    assert len(derived_goals) == 1
    assert derived_goals[0].id == sample_goal_hierarchy['short_term'].id
    assert derived_goals[0].name == sample_goal_hierarchy['short_term'].name

# ==============================================================================
# Create Session
# ==============================================================================
def test_create_session_empty_data(db_session, session_service, sample_ultimate_goal, test_user):
    data = {}
    
    result, error_msg, status_code = session_service.create_session(sample_ultimate_goal.id, test_user.id, data)
    assert status_code == 201
    assert result['name'] == 'Untitled Session'

def test_create_session_success(db_session, session_service, sample_goal_hierarchy, test_user, sample_activity_definition):
    # Setup data with a template-like structure involving an activity
    data = {
        'name': 'My New Workout',
        'description': 'A rigorous test',
        'template_id': None,
        'session_start': datetime.now(timezone.utc).isoformat(),
        'activity_ids': [sample_activity_definition.id],
        'session_data': json.dumps({
            'sections': [
                {
                    'name': 'Main Work',
                    'exercises': [
                        {
                            'activity_id': sample_activity_definition.id,
                            'name': sample_activity_definition.name
                        }
                    ]
                }
            ]
        })
    }
    
    result, error_msg, status_code = session_service.create_session(sample_goal_hierarchy['ultimate'].id, test_user.id, data)
    
    assert error_msg is None
    assert status_code == 201
    assert 'id' in result
    session_id = result['id']
    
    # Verify session persists in db
    session_obj = get_session_by_id(db_session, session_id)
    assert session_obj is not None
    assert session_obj.name == 'My New Workout'
    
    # Reload session completely to fetch activity_instances
    db_session.refresh(session_obj)
    
    print(f"ACTIVITY INSTANCES: {session_obj.activity_instances}")
    print(f"SESSION ATTRS: {session_obj.attributes}")
    
    # Verify the activity instance was created from the template section
    assert len(session_obj.activity_instances) >= 1
    assert session_obj.activity_instances[0].activity_definition_id == sample_activity_definition.id

# ==============================================================================
# Update Session (Completion flow trigger)
# ==============================================================================
def test_update_session_completion(db_session, session_service, sample_practice_session, test_user):
    # Complete the session
    update_data = {
        'completed': True
    }
    
    root_id = sample_practice_session.root_id
    
    result, error_msg, status_code = session_service.update_session(root_id, sample_practice_session.id, test_user.id, update_data)
    
    assert error_msg is None
    assert status_code == 200
    
    # Reload session and check completed
    session_obj = get_session_by_id(db_session, sample_practice_session.id)
    assert session_obj.completed is True
    assert session_obj.completed_at is not None

def test_delete_session(db_session, session_service, sample_practice_session, test_user):
    root_id = sample_practice_session.root_id
    session_id = sample_practice_session.id
    
    result, error_msg, status_code = session_service.delete_session(root_id, session_id, test_user.id)
    
    assert error_msg is None
    assert status_code == 200
    
    # Session should no longer exist
    session_obj = get_session_by_id(db_session, session_id)
    assert session_obj is None

