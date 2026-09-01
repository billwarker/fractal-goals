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
from uuid import uuid4

from sqlalchemy.exc import IntegrityError

from models import ActivityInstance, Goal, Session, SessionTemplate, SessionWorkInterval


@pytest.mark.integration
@pytest.mark.critical
class TestActivityInstanceCreation:
    """Test activity instance creation endpoints."""
    
    def test_create_activity_instance(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test creating an activity instance without starting timer."""
        root_id = sample_practice_session.root_id
        
        payload = {
            'session_id': sample_practice_session.id,
            'activity_definition_id': sample_activity_definition.id
        }
        response = authed_client.post(
            f'/api/{root_id}/activity-instances',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code == 201
        data = json.loads(response.data)
        assert data['session_id'] == sample_practice_session.id
        assert data['activity_definition_id'] == sample_activity_definition.id
        assert data['time_start'] is None
        assert data['time_stop'] is None
    
    def test_create_instance_missing_fields(self, authed_client, sample_ultimate_goal):
        """Test creating instance with missing required fields."""
        payload = {
            'session_id': 'some-id'
            # Missing activity_definition_id
        }
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/activity-instances',
            data=json.dumps(payload),
            content_type='application/json'
        )
        assert response.status_code in [400, 422]

    def test_create_instance_rejects_non_string_ids(self, authed_client, sample_ultimate_goal):
        """Creation payload should reject malformed identifier shapes."""
        response = authed_client.post(
            f'/api/{sample_ultimate_goal.id}/activity-instances',
            json={'session_id': {'bad': 'shape'}, 'activity_definition_id': 'activity-1'}
        )
        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'


@pytest.mark.integration
@pytest.mark.critical
class TestTimerStartStop:
    """Test timer start and stop functionality."""
    
    def test_start_timer(self, authed_client, db_session, sample_activity_instance):
        """Test starting an activity timer."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        )
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['time_start'] is not None
        assert data['time_stop'] is None

    def test_pause_resume_keeps_the_logical_timer_visible(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
    ):
        session = db_session.get(Session, sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id

        started = authed_client.post(f'/api/{root_id}/activity-instances/{instance_id}/start')
        assert started.status_code == 200

        paused = authed_client.post(f'/api/{root_id}/timers/session/{session.id}/pause')
        assert paused.status_code == 200
        paused_instance = next(
            item for item in paused.get_json()['activity_instances'] if item['id'] == instance_id
        )
        assert paused_instance['is_paused'] is True
        assert paused_instance['time_stop'] is None
        assert db_session.query(SessionWorkInterval).filter_by(
            session_id=session.id,
            ended_at=None,
        ).count() == 0

        resumed = authed_client.post(f'/api/{root_id}/timers/session/{session.id}/resume')
        assert resumed.status_code == 200
        resumed_instance = next(
            item for item in resumed.get_json()['activity_instances'] if item['id'] == instance_id
        )
        assert resumed_instance['is_paused'] is False
        assert resumed_instance['time_stop'] is None
        assert resumed_instance['completed'] is False
        assert db_session.query(SessionWorkInterval).filter_by(
            session_id=session.id,
            ended_at=None,
        ).count() == 1

        listed = authed_client.get(f'/api/{root_id}/sessions/{session.id}/activities')
        listed_instance = next(item for item in listed.get_json() if item['id'] == instance_id)
        assert listed_instance['time_stop'] is None

    def test_open_interval_repairs_a_legacy_stale_stop_in_session_reads(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
    ):
        session = db_session.get(Session, sample_activity_instance.session_id)
        now = datetime.utcnow()
        sample_activity_instance.time_start = now - timedelta(minutes=2)
        sample_activity_instance.time_stop = now - timedelta(minutes=1)
        db_session.add(SessionWorkInterval(
            root_id=session.root_id,
            session_id=session.id,
            activity_instance_id=sample_activity_instance.id,
            started_at=now,
        ))
        db_session.commit()

        response = authed_client.get(
            f'/api/{session.root_id}/sessions/{session.id}/activities',
        )

        assert response.status_code == 200
        payload = next(item for item in response.get_json() if item['id'] == sample_activity_instance.id)
        assert payload['time_stop'] is None

    def test_start_timer_persists_countdown_target(self, authed_client, db_session, sample_activity_instance):
        """Starting with a target duration stores countdown metadata."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        root_id = session.root_id

        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/start',
            json={'target_duration_seconds': 90},
        )

        assert response.status_code == 200
        data = response.get_json()
        assert data['target_duration_seconds'] == 90

    def test_start_timer_rejects_invalid_countdown_target(self, authed_client, db_session, sample_activity_instance):
        """Countdown targets must be positive durations."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        root_id = session.root_id

        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/start',
            json={'target_duration_seconds': -30},
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_target_duration_database_constraint_rejects_non_positive_values(self, db_session, sample_activity_instance):
        """The database should reject invalid countdown targets even outside the API."""
        sample_activity_instance.target_duration_seconds = 0

        with pytest.raises(IntegrityError):
            db_session.commit()

        db_session.rollback()
    
    def test_stop_timer(self, authed_client, db_session, sample_activity_instance):
        """Test stopping an activity timer."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        
        # Try to stop without starting
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/complete'
        )
        # Instant completion is allowed (duration=0)
        assert response.status_code == 200
        data = json.loads(response.data)
        assert data['completed'] is True
        assert data['duration_seconds'] == 0
    
    def test_start_timer_creates_instance_if_missing(self, authed_client, sample_practice_session, sample_activity_definition):
        """Test that starting timer creates instance if it doesn't exist."""
        root_id = sample_practice_session.root_id
        
        # Create instance first
        payload = {
            'session_id': sample_practice_session.id,
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

    def test_quick_session_rejects_timer_actions(
        self,
        authed_client,
        db_session,
        sample_ultimate_goal,
        sample_activity_definition,
    ):
        root_id = sample_ultimate_goal.id
        quick_template = SessionTemplate(
            id=f'quick-{sample_activity_definition.id}',
            name='Quick Template',
            root_id=root_id,
            template_data=json.dumps({
                'session_type': 'quick',
                'activities': [{'activity_id': sample_activity_definition.id}],
            }),
        )
        db_session.add(quick_template)
        db_session.commit()

        create_response = authed_client.post(
            f'/api/{root_id}/sessions',
            json={
                'name': 'Quick Session',
                'template_id': quick_template.id,
            }
        )
        assert create_response.status_code == 201
        session = create_response.get_json()
        instance_id = session['activity_instances'][0]['id']

        start_response = authed_client.post(f'/api/{root_id}/activity-instances/{instance_id}/start')
        assert start_response.status_code == 400
        assert 'Quick sessions do not support timers' in start_response.get_json()['error']

        pause_response = authed_client.post(f'/api/{root_id}/timers/session/{session["id"]}/pause')
        assert pause_response.status_code == 400
        assert 'Quick sessions do not support timers' in pause_response.get_json()['error']


@pytest.mark.integration
@pytest.mark.critical
class TestManualTimeEntry:
    """Test manual time entry functionality."""
    
    def test_update_instance_times_manually(self, authed_client, db_session, sample_activity_instance):
        """Test manually setting start and stop times."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        assert response.status_code == 409
        assert 'end at or after its start' in response.get_json()['error']
    
    def test_update_only_start_time(self, authed_client, db_session, sample_activity_instance):
        """Historical correction requires a complete boundary pair."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        assert response.status_code == 400
        assert 'both time_start and time_stop' in response.get_json()['error']

    def test_update_start_time_while_activity_is_live(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
    ):
        session = db_session.get(Session, sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        assert authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        ).status_code == 200

        interval = db_session.query(SessionWorkInterval).filter_by(
            activity_instance_id=instance_id,
            ended_at=None,
        ).one()
        adjusted_start = (interval.started_at - timedelta(minutes=3)).replace(microsecond=0)

        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            json={'time_start': adjusted_start.isoformat()},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert datetime.fromisoformat(payload['time_start'].replace('Z', '+00:00')).replace(
            tzinfo=None
        ) == adjusted_start
        assert payload['time_stop'] is None
        db_session.refresh(interval)
        assert interval.started_at == adjusted_start
        assert interval.ended_at is None

    def test_update_start_time_while_activity_is_paused(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
    ):
        session = db_session.get(Session, sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        assert authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        ).status_code == 200
        assert authed_client.post(
            f'/api/{root_id}/timers/session/{session.id}/pause'
        ).status_code == 200

        interval = db_session.query(SessionWorkInterval).filter_by(
            activity_instance_id=instance_id,
        ).one()
        adjusted_start = (interval.started_at - timedelta(minutes=3)).replace(microsecond=0)

        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            json={'time_start': adjusted_start.isoformat()},
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert datetime.fromisoformat(payload['time_start'].replace('Z', '+00:00')).replace(
            tzinfo=None
        ) == adjusted_start
        assert payload['time_stop'] is None
        assert payload['is_paused'] is True
        assert payload['duration_seconds'] >= 180
        db_session.refresh(interval)
        assert interval.started_at == adjusted_start
        assert interval.duration_seconds >= 180

    def test_live_start_adjustment_rejects_another_items_interval(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
        sample_activity_definition,
    ):
        session = db_session.get(Session, sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id
        assert authed_client.post(
            f'/api/{root_id}/activity-instances/{instance_id}/start'
        ).status_code == 200

        live_interval = db_session.query(SessionWorkInterval).filter_by(
            activity_instance_id=instance_id,
        ).one()
        original_start = live_interval.started_at
        other_instance_id = str(uuid4())
        db_session.add(ActivityInstance(
            id=other_instance_id,
            root_id=root_id,
            session_id=session.id,
            activity_definition_id=sample_activity_definition.id,
        ))
        db_session.add(SessionWorkInterval(
            root_id=root_id,
            session_id=session.id,
            activity_instance_id=other_instance_id,
            started_at=original_start - timedelta(minutes=5),
            ended_at=original_start - timedelta(minutes=2),
            duration_seconds=180,
        ))
        db_session.commit()

        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            json={'time_start': (original_start - timedelta(minutes=3)).isoformat()},
        )

        assert response.status_code == 409
        assert 'overlaps another session item' in response.get_json()['error']
        db_session.expire_all()
        persisted_interval = db_session.query(SessionWorkInterval).filter_by(
            activity_instance_id=instance_id,
        ).one()
        persisted_instance = db_session.get(ActivityInstance, instance_id)
        assert persisted_interval.started_at == original_start
        assert persisted_instance.time_start == original_start

    def test_update_only_stop_time(self, authed_client, db_session, sample_activity_instance):
        """Test updating only the stop time."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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

    def test_update_instance_rejects_non_array_sets(self, authed_client, db_session, sample_activity_instance):
        """Manual update payload should reject malformed sets shape."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
        root_id = session.root_id
        instance_id = sample_activity_instance.id

        response = authed_client.put(
            f'/api/{root_id}/activity-instances/{instance_id}',
            json={'sets': {'bad': 'shape'}}
        )

        assert response.status_code == 400
        assert response.get_json()['error'] == 'Validation failed'

    def test_add_empty_set_ignores_blank_metric_placeholders(
        self,
        authed_client,
        db_session,
        sample_activity_instance,
        sample_activity_definition,
    ):
        """A new set can be saved before the user enters any metric values."""
        from models import MetricDefinition, Session

        session = db_session.query(Session).get(sample_activity_instance.session_id)
        metrics = (
            db_session.query(MetricDefinition)
            .filter(MetricDefinition.activity_id == sample_activity_definition.id)
            .order_by(MetricDefinition.name)
            .all()
        )

        response = authed_client.put(
            f'/api/{session.root_id}/activity-instances/{sample_activity_instance.id}',
            json={
                'sets': [{
                    'instance_id': str(uuid4()),
                    'completed': False,
                    'metrics': [
                        {'metric_id': metrics[0].id, 'value': ''},
                        {'metric_id': metrics[1].id, 'value': '   '},
                        {'metric_id': metrics[1].id, 'value': None},
                    ],
                }],
            },
        )

        assert response.status_code == 200
        data = response.get_json()
        assert len(data['sets']) == 1
        assert data['sets'][0]['status'] == 'planned'
        assert data['sets'][0]['metrics'] == []


@pytest.mark.integration
@pytest.mark.critical
class TestTimerDurationCalculation:
    """Test duration calculation for timers."""
    
    def test_duration_calculated_on_stop(self, authed_client, db_session, sample_activity_instance):
        """Test that duration is calculated when timer is stopped."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
    """Test exclusive timer ownership within a session."""
    
    def test_switches_between_timers_in_same_session(
        self,
        authed_client,
        db_session,
        sample_practice_session,
        sample_activity_definition,
    ):
        """Only one timer accrues work, with an explicit atomic switch."""
        root_id = sample_practice_session.root_id

        # Create two instances
        instances = []
        for i in range(2):
            payload = {
                'session_id': sample_practice_session.id,
                'activity_definition_id': sample_activity_definition.id
            }
            response = authed_client.post(
                f'/api/{root_id}/activity-instances',
                data=json.dumps(payload),
                content_type='application/json'
            )
            data = json.loads(response.data)
            instances.append(data['id'])
        
        first_start = authed_client.post(
            f'/api/{root_id}/activity-instances/{instances[0]}/start'
        )
        assert first_start.status_code == 200
        conflict = authed_client.post(
            f'/api/{root_id}/activity-instances/{instances[1]}/start'
        )
        assert conflict.status_code == 409
        assert conflict.get_json()['code'] == 'active_work_exists'
        assert conflict.get_json()['active_work']['activity_name'] == sample_activity_definition.name
        switched = authed_client.post(
            f'/api/{root_id}/activity-instances/{instances[1]}/start',
            json={'switch': True},
        )
        assert switched.status_code == 200
        switched_data = switched.get_json()
        assert switched_data['id'] == instances[1]
        assert switched_data['time_stop'] is None
        assert switched_data['completed'] is False
        assert switched_data['completed_activity']['id'] == instances[0]
        assert switched_data['completed_activity']['completed'] is True
        assert switched_data['completed_activity']['time_stop'] is not None

        db_session.expire_all()
        open_intervals = db_session.query(SessionWorkInterval).filter(
            SessionWorkInterval.session_id == sample_practice_session.id,
            SessionWorkInterval.ended_at.is_(None),
        ).all()
        assert len(open_intervals) == 1
        assert open_intervals[0].activity_instance_id == instances[1]
        
        response = authed_client.post(
            f'/api/{root_id}/activity-instances/{instances[1]}/complete'
        )
        assert response.status_code == 200
        assert response.get_json()['duration_seconds'] is not None


@pytest.mark.integration
@pytest.mark.critical
class TestTimerEdgeCases:
    """Test edge cases and error handling for timers."""
    
    def test_start_already_started_timer(self, authed_client, db_session, sample_activity_instance):
        """Test starting a timer that's already running."""
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
        from models import Session
        session = db_session.query(Session).get(sample_activity_instance.session_id)
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
