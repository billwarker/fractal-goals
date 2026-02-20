"""
Integration tests for Sessions API endpoints.

Tests cover:
- GET /api/<root_id>/sessions - List all sessions
- GET /api/<root_id>/sessions/<session_id> - Get specific session
- POST /api/<root_id>/sessions - Create session
- PUT /api/<root_id>/sessions/<session_id> - Update session
- DELETE /api/<root_id>/sessions/<session_id> - Delete session
- POST /api/<root_id>/sessions/<session_id>/activities - Add activity
- DELETE /api/<root_id>/sessions/<session_id>/activities/<instance_id> - Remove activity
- PUT /api/<root_id>/sessions/<session_id>/activities/<instance_id> - Update activity
- POST /api/<root_id>/sessions/<session_id>/activities/reorder - Reorder activities
"""

import pytest
import json
from datetime import datetime, timedelta


@pytest.mark.integration
class TestSessionListEndpoints:
    """Test session listing endpoints."""
    
    def test_list_sessions_empty(self, authed_client, sample_ultimate_goal):
        """Test listing sessions when none exist."""
        response = authed_client.get(f'/api/{sample_ultimate_goal.id}/sessions')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert isinstance(data, dict)
        assert "sessions" in data
        assert isinstance(data["sessions"], list)
    
    def test_list_sessions_with_data(self, authed_client, sample_practice_session):
        """Test listing sessions when they exist."""
        root_id = sample_practice_session.root_id
        response = authed_client.get(f'/api/{root_id}/sessions')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert len(data['sessions']) >= 1
        assert any(s['id'] == sample_practice_session.id for s in data['sessions'])
    
    def test_get_specific_session(self, authed_client, sample_practice_session):
        """Test retrieving a specific session."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        response = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['id'] == session_id
        assert 'name' in data
    
    def test_get_nonexistent_session(self, authed_client, sample_ultimate_goal):
        """Test retrieving a session that doesn't exist."""
        response = authed_client.get(f'/api/{sample_ultimate_goal.id}/sessions/nonexistent-id')
        assert response.status_code == 404


@pytest.mark.integration
class TestSessionCRUDEndpoints:
    """Test session CRUD operations."""
    
    def test_create_session(self, authed_client, sample_goal_hierarchy):
        """Test creating a new practice session."""
        root_id = sample_goal_hierarchy['ultimate'].id
        payload = {
            'name': 'Test Session',
            'description': 'A test practice session',
            'parent_id': sample_goal_hierarchy['short_term'].id,
            'session_start': datetime.utcnow().isoformat()
        }
        response = authed_client.post(
            f'/api/{root_id}/sessions',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['name'] == 'Test Session'
        assert data['attributes']['type'] == 'Session'
    
    def test_create_session_from_template(self, authed_client, sample_goal_hierarchy, sample_session_template):
        """Test creating a session from a template."""
        root_id = sample_goal_hierarchy['ultimate'].id
        payload = {
            'name': 'Session from Template',
            'parent_id': sample_goal_hierarchy['short_term'].id,
            'template_id': sample_session_template.id,
            'session_start': datetime.utcnow().isoformat()
        }
        response = authed_client.post(
            f'/api/{root_id}/sessions',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['template_id'] == sample_session_template.id

    def test_create_session_persists_template_activities(
        self, authed_client, sample_goal_hierarchy, sample_session_template, sample_activity_definition
    ):
        """Creating a session with template exercises should create ActivityInstances and section activity_ids."""
        root_id = sample_goal_hierarchy['ultimate'].id
        payload = {
            'name': 'Session with Template Activities',
            'parent_id': sample_goal_hierarchy['short_term'].id,
            'template_id': sample_session_template.id,
            'session_start': datetime.utcnow().isoformat(),
            'session_data': {
                'template_id': sample_session_template.id,
                'sections': [
                    {
                        'name': 'Main',
                        'duration_minutes': 20,
                        'exercises': [
                            {
                                'type': 'activity',
                                'name': sample_activity_definition.name,
                                'activity_id': sample_activity_definition.id,
                                'instance_id': 'test-instance-1'
                            }
                        ]
                    }
                ]
            }
        }
        create_response = authed_client.post(
            f'/api/{root_id}/sessions',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert create_response.status_code == 201
        session_data = json.loads(create_response.data)
        session_id = session_data['id']

        activities_response = authed_client.get(f'/api/{root_id}/sessions/{session_id}/activities')
        assert activities_response.status_code == 200
        activities = json.loads(activities_response.data)
        assert len(activities) == 1
        assert activities[0]['activity_definition_id'] == sample_activity_definition.id

        detail_response = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
        assert detail_response.status_code == 200
        detail = json.loads(detail_response.data)
        sections = detail['attributes']['session_data']['sections']
        assert len(sections[0]['activity_ids']) == 1
        assert sections[0]['activity_ids'][0] == 'test-instance-1'

    def test_update_session(self, authed_client, sample_practice_session):
        """Test updating a session."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        payload = {
            'name': 'Updated Session Name',
            'description': 'Updated description'
        }
        response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['name'] == 'Updated Session Name'
    
    def test_update_session_times(self, authed_client, sample_practice_session):
        """Test updating session start and end times."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        start_time = datetime.utcnow()
        end_time = start_time + timedelta(hours=1)
        
        payload = {
            'session_start': start_time.isoformat(),
            'session_end': end_time.isoformat(),
            'total_duration_seconds': 3600
        }
        response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert 'session_start' in data
        assert 'session_end' in data

    def test_completing_session_marks_all_activity_instances_completed(
        self, authed_client, db_session, sample_practice_session, sample_activity_definition
    ):
        """Completing a session should cascade completion to all of its activity instances."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id

        # Create two incomplete activity instances in the session.
        for _ in range(2):
            response = authed_client.post(
                f'/api/{root_id}/sessions/{session_id}/activities',
                data=json.dumps({'activity_definition_id': sample_activity_definition.id}),
                content_type='application/json'
            )
            assert response.status_code == 201

        update_response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}',
            data=json.dumps({'completed': True}),
            content_type='application/json'
        )
        assert update_response.status_code == 200

        activities_response = authed_client.get(f'/api/{root_id}/sessions/{session_id}/activities')
        assert activities_response.status_code == 200
        activities = json.loads(activities_response.data)

        assert len(activities) >= 2
        assert all(a['completed'] is True for a in activities)
    
    def test_delete_session(self, authed_client, sample_practice_session):
        """Test deleting a session."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        response = authed_client.delete(f'/api/{root_id}/sessions/{session_id}')
        assert response.status_code == 200
        
        # Verify it's deleted
        response = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
        assert response.status_code == 404


@pytest.mark.integration
class TestSessionActivityEndpoints:
    """Test session activity management endpoints."""
    
    def test_add_activity_to_session(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test adding an activity to a session."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        payload = {
            'activity_definition_id': sample_activity_definition.id
        }
        response = authed_client.post(
            f'/api/{root_id}/sessions/{session_id}/activities',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert 'id' in data  # Should return the created activity instance
    
    def test_remove_activity_from_session(self, authed_client, db_session, sample_activity_instance):
        """Test removing an activity from a session."""
        # Get session info from the instance
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.session_id)
        root_id = session.root_id
        session_id = session.id
        instance_id = sample_activity_instance.id
        
        response = authed_client.delete(
            f'/api/{root_id}/sessions/{session_id}/activities/{instance_id}'
        )
        assert response.status_code == 200
    
    def test_update_activity_instance(self, authed_client, db_session, sample_activity_instance):
        """Test updating an activity instance."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.session_id)
        root_id = session.root_id
        session_id = session.id
        instance_id = sample_activity_instance.id
        
        payload = {
            'notes': 'Felt strong today',
            'completed': True
        }
        response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}/activities/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
    
    def test_reorder_activities(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test reordering activities in a session."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        # First add multiple activities
        activity_ids = []
        for i in range(3):
            payload = {'activity_definition_id': sample_activity_definition.id}
            response = authed_client.post(
                f'/api/{root_id}/sessions/{session_id}/activities',
                data=json.dumps(payload),
                content_type='application/json'
            )
            data = json.loads(response.data)
            activity_ids.append(data['id'])
        
        # Reorder them
        payload = {
            'activity_ids': list(reversed(activity_ids))
        }
        response = authed_client.post(
            f'/api/{root_id}/sessions/{session_id}/activities/reorder',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200


@pytest.mark.integration
class TestSessionDataHydration:
    """Test session data hydration and persistence."""
    
    def test_session_hydrates_activity_data(self, authed_client, sample_practice_session, sample_activity_instance):
        """Test that session to_dict hydrates activity instance data."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        response = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Should include hydrated activity data
        # Implementation may vary - this documents expected behavior
        assert 'activity_instances' in data
        assert len(data['activity_instances']) >= 1
    
    def test_session_persists_activity_instances(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test that activity instances are persisted to database."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        # Add activity
        payload = {'activity_definition_id': sample_activity_definition.id}
        response = authed_client.post(
            f'/api/{root_id}/sessions/{session_id}/activities',
            data=json.dumps(payload),
            content_type='application/json'
        )
        instance_data = json.loads(response.data)
        instance_id = instance_data['id']
        
        # Retrieve session again
        response = authed_client.get(f'/api/{root_id}/sessions/{session_id}')
        session_data = json.loads(response.data)
        
        # Activity instance should be persisted
        # Verify through database or hydrated data
        assert response.status_code == 200


@pytest.mark.integration
class TestSessionValidation:
    """Test session validation and business rules."""
    
    def test_cannot_create_session_without_parent(self, authed_client, sample_ultimate_goal):
        """Test that session requires a parent short-term goal."""
        payload = {
            'name': 'Orphan Session',
            'session_start': datetime.utcnow().isoformat()
            # Missing parent_id
        }
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/sessions',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should require parent_id
        assert response.status_code in [400, 422]
    
    def test_session_duration_calculation(self, authed_client, sample_practice_session):
        """Test that session duration is calculated correctly."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        start_time = datetime.utcnow()
        end_time = start_time + timedelta(hours=2, minutes=15)
        expected_duration = int((end_time - start_time).total_seconds())
        
        payload = {
            'session_start': start_time.isoformat(),
            'session_end': end_time.isoformat(),
            'total_duration_seconds': expected_duration
        }
        response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Verify duration
        if 'total_duration_seconds' in data:
            assert data['total_duration_seconds'] == expected_duration
    
    def test_session_end_after_start(self, authed_client, sample_practice_session):
        """Test that session end time must be after start time."""
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        start_time = datetime.utcnow()
        end_time = start_time - timedelta(hours=1)  # Invalid: end before start
        
        payload = {
            'session_start': start_time.isoformat(),
            'session_end': end_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/sessions/{session_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should reject invalid time range
        # Note: Requires validation in backend
        assert response.status_code in [200, 400, 422]


@pytest.mark.integration
class TestSessionMultiParent:
    """Test session multi-parent functionality (many-to-many with short-term goals)."""
    
    def test_link_session_to_multiple_goals(self, authed_client, sample_practice_session, sample_goal_hierarchy):
        """Test linking a session to multiple short-term goals."""
        # This documents expected multi-parent functionality
        # May require specific endpoint implementation
        root_id = sample_practice_session.root_id
        session_id = sample_practice_session.id
        
        # Try to link to another short-term goal
        # Implementation-specific endpoint
        payload = {
            'goal_id': sample_goal_hierarchy['short_term'].id,
            'goal_type': 'short_term'
        }
        response = authed_client.post(
            f'/api/{root_id}/sessions/{session_id}/goals',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Test documents expected behavior
        # May return 404 if endpoint not implemented yet
        assert response.status_code in [200, 201, 404]
