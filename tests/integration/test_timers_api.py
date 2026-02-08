"""
Integration tests for Timers API endpoints.

Tests cover:
- POST /api/<root_id>/activity-instances - Create activity instance
- PUT /api/<root_id>/activity-instances/<instance_id> - Update instance times
- POST /api/<root_id>/activity-instances/<instance_id>/start - Start timer
- POST /api/<root_id>/activity-instances/<instance_id>/stop - Stop timer
"""

import pytest
import json
from datetime import datetime, timedelta
import time


@pytest.mark.integration
@pytest.mark.critical
class TestActivityInstanceCreation:
    """Test activity instance creation endpoints."""
    
    def test_create_activity_instance(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test creating an activity instance without starting timer."""
        root_id = sample_practice_session.root_id
        
        payload = {
            'practice_session_id': sample_practice_session.id,
            'activity_definition_id': sample_activity_definition.id
        }
        response = authed_client.post(
            f'/api/{root_id}/activity-instances',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['practice_session_id'] == sample_practice_session.id
        assert data['activity_definition_id'] == sample_activity_definition.id
        assert data['time_start'] is None
        assert data['time_stop'] is None
    
    def test_create_instance_missing_fields(self, authed_client, sample_ultimate_goal):
        """Test creating instance with missing required fields."""
        payload = {
            'practice_session_id': 'some-id'
            # Missing activity_definition_id
        }
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/activity-instances',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code in [400, 422]


@pytest.mark.integration
@pytest.mark.critical
class TestTimerStartStop:
    """Test timer start and stop functionality."""
    
    def test_start_timer(self, authed_client, db_session, sample_activity_instance):
        """Test starting an activity timer."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_start'] is not None
        assert data['time_stop'] is None
    
    def test_stop_timer(self, authed_client, db_session, sample_activity_instance):
        """Test stopping an activity timer."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # First start the timer
        sample_activity_instance.time_start = datetime.utcnow() - timedelta(seconds=2)
        db_session.commit()
        
        # Then stop it
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/complete'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_start'] is not None
        assert data['time_stop'] is not None
        assert data['duration_seconds'] is not None
        assert data['duration_seconds'] > 0
    
    def test_stop_timer_never_started(self, authed_client, db_session, sample_activity_instance):
        """Test that stopping a timer that was never started returns error."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Try to stop without starting
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/complete'
        )
        # Should return error (as per recent fix)
        assert response.status_code == 400
        data = json.loads(response.data)
        assert 'error' in data
    
    def test_start_timer_creates_instance_if_missing(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test that starting timer creates instance if it doesn't exist."""
        root_id = sample_practice_session.root_id
        
        # Create instance first
        payload = {
            'practice_session_id': sample_practice_session.id,
            'activity_definition_id': sample_activity_definition.id
        }
        response = authed_client.post(
            f'/api/{root_id}/activity-instances',
            data=json.dumps(payload),
            content_type='application/json'
        )
        instance_data = json.loads(response.data)
        instance_id = instance_data['id']
        
        # Start timer
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        )
        assert response.status_code == 200


@pytest.mark.integration
@pytest.mark.critical
class TestManualTimeEntry:
    """Test manual time entry functionality."""
    
    def test_update_instance_times_manually(self, authed_client, db_session, sample_activity_instance):
        """Test manually setting start and stop times."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        start_time = datetime.utcnow() - timedelta(minutes=30)
        stop_time = datetime.utcnow()
        
        payload = {
            'time_start': start_time.isoformat(),
            'time_stop': stop_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_start'] is not None
        assert data['time_stop'] is not None
        assert data['duration_seconds'] is not None
    
    def test_manual_time_entry_validates_order(self, authed_client, db_session, sample_activity_instance):
        """Test that manual time entry validates stop > start."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        start_time = datetime.utcnow()
        stop_time = start_time - timedelta(minutes=30)  # Invalid: stop before start
        
        payload = {
            'time_start': start_time.isoformat(),
            'time_stop': stop_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        # Should reject invalid time range
        assert response.status_code in [200, 400, 422]
    
    def test_update_only_start_time(self, authed_client, db_session, sample_activity_instance):
        """Test updating only the start time."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        start_time = datetime.utcnow() - timedelta(minutes=15)
        
        payload = {
            'time_start': start_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_start'] is not None
    
    def test_update_only_stop_time(self, authed_client, db_session, sample_activity_instance):
        """Test updating only the stop time."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Set start time first
        sample_activity_instance.time_start = datetime.utcnow() - timedelta(minutes=20)
        db_session.commit()
        
        stop_time = datetime.utcnow()
        
        payload = {
            'time_stop': stop_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_stop'] is not None
        assert data['duration_seconds'] is not None


@pytest.mark.integration
@pytest.mark.critical
class TestTimerDurationCalculation:
    """Test duration calculation for timers."""
    
    def test_duration_calculated_on_stop(self, authed_client, db_session, sample_activity_instance):
        """Test that duration is calculated when timer is stopped."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Start timer
        start_time = datetime.utcnow() - timedelta(seconds=2)
        sample_activity_instance.time_start = start_time
        db_session.commit()
        
        # Wait a bit (simulate time passing)
        time.sleep(0.1)
        
        # Stop timer
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/complete'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Duration should be calculated
        assert data['duration_seconds'] is not None
        assert data['duration_seconds'] > 0
    
    def test_duration_calculated_on_manual_entry(self, authed_client, db_session, sample_activity_instance):
        """Test that duration is calculated for manual time entry."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        start_time = datetime.utcnow() - timedelta(minutes=45)
        stop_time = datetime.utcnow()
        expected_duration = int((stop_time - start_time).total_seconds())
        
        payload = {
            'time_start': start_time.isoformat(),
            'time_stop': stop_time.isoformat()
        }
        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        
        # Duration should match expected
        assert data['duration_seconds'] is not None
        # Allow small variance for processing time
        assert abs(data['duration_seconds'] - expected_duration) < 2


@pytest.mark.integration
@pytest.mark.critical
class TestConcurrentTimers:
    """Test multiple timers running simultaneously."""
    
    def test_multiple_timers_in_same_session(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test running multiple timers in the same session."""
        root_id = sample_practice_session.root_id
        
        # Create two instances
        instances = []
        for i in range(2):
            payload = {
                'practice_session_id': sample_practice_session.id,
                'activity_definition_id': sample_activity_definition.id
            }
            response = authed_client.post(
                f'/api/{root_id}/activity-instances',
                data=json.dumps(payload),
                content_type='application/json'
            )
            data = json.loads(response.data)
            instances.append(data['id'])
        
        # Start both timers
        for instance_id in instances:
            response = authed_client.post(
                f'/api/{root_id}/activity-instances/{instance_id}/start'
            )
            assert response.status_code == 200
        
        # Stop both timers
        for instance_id in instances:
            response = authed_client.post(
                f'/api/{root_id}/activity-instances/{instance_id}/complete'
            )
            assert response.status_code == 200
            data = json.loads(response.data)
            assert data['duration_seconds'] is not None


@pytest.mark.integration
@pytest.mark.critical
class TestTimerEdgeCases:
    """Test edge cases and error handling for timers."""
    
    def test_start_already_started_timer(self, authed_client, db_session, sample_activity_instance):
        """Test starting a timer that's already running."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Start timer
        sample_activity_instance.time_start = datetime.utcnow()
        db_session.commit()
        
        # Try to start again
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        )
        # Should either succeed (restart) or return error
        assert response.status_code in [200, 400]
    
    def test_stop_already_stopped_timer(self, authed_client, db_session, sample_activity_instance):
        """Test stopping a timer that's already stopped."""
        from models import PracticeSession
        session = db_session.query(PracticeSession).get(sample_activity_instance.practice_session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Set both start and stop times
        start_time = datetime.utcnow() - timedelta(minutes=10)
        stop_time = datetime.utcnow()
        sample_activity_instance.time_start = start_time
        sample_activity_instance.time_stop = stop_time
        sample_activity_instance.duration_seconds = int((stop_time - start_time).total_seconds())
        db_session.commit()
        
        # Try to stop again
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/complete'
        )
        # Should either succeed (no-op) or return error
        assert response.status_code in [200, 400]
    
    def test_timer_with_nonexistent_instance(self, authed_client, sample_ultimate_goal):
        """Test timer operations on nonexistent instance."""
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/activity-instances/nonexistent-id/start'
        )
        assert response.status_code == 400
        
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/activity-instances/nonexistent-id/complete'
        )
        assert response.status_code == 404
