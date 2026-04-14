import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    MetricDefinition,
    MetricValue,
    ProgressRecord,
    Session,
)


@pytest.mark.integration
class TestProgressApi:
    def test_root_progress_settings_update_round_trips(self, authed_client, db_session, sample_ultimate_goal):
        response = authed_client.put(
            f'/api/{sample_ultimate_goal.id}/goals/{sample_ultimate_goal.id}',
            json={
                'progress_settings': {
                    'enabled': False,
                    'default_aggregation': 'sum',
                },
            },
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['attributes']['progress_settings'] == {
            'enabled': False,
            'default_aggregation': 'sum',
        }

        db_session.expire_all()
        root = db_session.query(Goal).filter_by(id=sample_ultimate_goal.id).first()
        assert root.progress_settings == {
            'enabled': False,
            'default_aggregation': 'sum',
        }

    def test_activity_creation_persists_progress_settings(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id

        metric_response = authed_client.post(
            f'/api/{root_id}/fractal-metrics',
            json={
                'name': 'Weight',
                'unit': 'lbs',
                'is_multiplicative': True,
                'default_progress_aggregation': 'max',
            },
        )
        assert metric_response.status_code == 201
        fractal_metric = metric_response.get_json()

        response = authed_client.post(
            f'/api/{root_id}/activities',
            json={
                'name': 'Bench Press',
                'has_sets': True,
                'has_metrics': True,
                'metrics': [
                    {
                        'name': 'Weight',
                        'unit': 'lbs',
                        'fractal_metric_id': fractal_metric['id'],
                        'track_progress': False,
                        'progress_aggregation': 'sum',
                    }
                ],
            },
        )

        assert response.status_code == 201
        payload = response.get_json()
        metric = payload['metric_definitions'][0]
        assert metric['track_progress'] is False
        assert metric['progress_aggregation'] == 'sum'
        assert metric['default_progress_aggregation'] == 'max'

        persisted_metric = db_session.query(MetricDefinition).filter_by(id=metric['id']).first()
        assert persisted_metric is not None
        assert persisted_metric.track_progress is False
        assert persisted_metric.progress_aggregation == 'sum'

    def test_progress_endpoints_enforce_root_scoping(self, authed_client, db_session, sample_ultimate_goal, test_user):
        other_root = Goal(
            id=str(uuid4()),
            name='Other Root',
            description='',
            owner_id=test_user.id,
            root_id=None,
            created_at=datetime.now(timezone.utc),
        )
        other_root.root_id = other_root.id
        db_session.add(other_root)
        db_session.flush()

        other_activity = ActivityDefinition(
            id=str(uuid4()),
            root_id=other_root.id,
            name='Other Activity',
            description='',
            has_metrics=True,
            created_at=datetime.now(timezone.utc),
        )
        other_session = Session(
            id=str(uuid4()),
            name='Other Session',
            description='',
            root_id=other_root.id,
            session_start=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
            attributes=json.dumps({}),
        )
        db_session.add_all([other_activity, other_session])
        db_session.flush()

        other_instance = ActivityInstance(
            id=str(uuid4()),
            root_id=other_root.id,
            session_id=other_session.id,
            activity_definition_id=other_activity.id,
            created_at=datetime.now(timezone.utc),
            completed=True,
            time_start=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            duration_seconds=0,
            data=json.dumps({}),
        )
        db_session.add(other_instance)
        db_session.commit()

        progress_response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/activity-instances/{other_instance.id}/progress'
        )
        assert progress_response.status_code == 404
        assert progress_response.get_json()['error'] == 'Activity instance not found'

        history_response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/activities/{other_activity.id}/progress-history'
        )
        assert history_response.status_code == 404
        assert history_response.get_json()['error'] == 'Activity not found'

        summary_response = authed_client.get(
            f'/api/{sample_ultimate_goal.id}/sessions/{other_session.id}/progress-summary'
        )
        assert summary_response.status_code == 404
        assert summary_response.get_json()['error'] == 'Session not found'

    def test_instance_progress_prefers_persisted_record(self, authed_client, db_session, sample_activity_definition, sample_practice_session):
        instance = ActivityInstance(
            id=str(uuid4()),
            root_id=sample_practice_session.root_id,
            session_id=sample_practice_session.id,
            activity_definition_id=sample_activity_definition.id,
            created_at=datetime.now(timezone.utc),
            completed=True,
            time_start=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            duration_seconds=0,
            data=json.dumps({}),
        )
        db_session.add(instance)
        db_session.flush()

        record = ProgressRecord(
            id=str(uuid4()),
            root_id=sample_practice_session.root_id,
            activity_definition_id=sample_activity_definition.id,
            activity_instance_id=instance.id,
            session_id=sample_practice_session.id,
            is_first_instance=False,
            has_change=True,
            has_improvement=True,
            has_regression=False,
            comparison_type='flat_metrics',
            metric_comparisons=[],
            derived_summary={'summary_line': 'Persisted summary'},
            created_at=datetime(2026, 4, 1, tzinfo=timezone.utc),
        )
        db_session.add(record)
        db_session.commit()

        response = authed_client.get(
            f'/api/{sample_practice_session.root_id}/activity-instances/{instance.id}/progress'
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['id'] == record.id
        assert payload['derived_summary']['summary_line'] == 'Persisted summary'
        assert payload['created_at'] is not None

    def test_instance_progress_returns_null_when_root_progress_is_disabled(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        sample_ultimate_goal.progress_settings = {'enabled': False}
        activity = ActivityDefinition(
            id=str(uuid4()),
            root_id=root_id,
            name='Muted Progress Activity',
            description='',
            has_metrics=True,
            created_at=datetime.now(timezone.utc),
        )
        session = Session(
            id=str(uuid4()),
            name='Disabled Progress Session',
            description='',
            root_id=root_id,
            session_start=datetime.now(timezone.utc),
            created_at=datetime.now(timezone.utc),
            attributes=json.dumps({}),
        )
        instance = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=session.id,
            activity_definition_id=activity.id,
            created_at=datetime.now(timezone.utc),
            completed=True,
            time_start=datetime.now(timezone.utc),
            time_stop=datetime.now(timezone.utc),
            duration_seconds=0,
            data=json.dumps({}),
        )
        db_session.add_all([activity, session, instance])
        db_session.commit()

        response = authed_client.get(f'/api/{root_id}/activity-instances/{instance.id}/progress')

        assert response.status_code == 200
        assert response.get_json() is None

    def test_completed_metric_updates_refresh_persisted_progress(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        activity = ActivityDefinition(
            id=str(uuid4()),
            root_id=root_id,
            name='Speed Drill',
            description='',
            has_metrics=True,
            created_at=datetime.now(timezone.utc),
        )
        metric = MetricDefinition(
            id=str(uuid4()),
            activity_id=activity.id,
            root_id=root_id,
            name='Speed',
            unit='BPM',
            track_progress=True,
            progress_aggregation='last',
            is_active=True,
            sort_order=0,
            created_at=datetime.now(timezone.utc),
        )
        prev_session = Session(
            id=str(uuid4()),
            name='Previous Session',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 9, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 9, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        current_session = Session(
            id=str(uuid4()),
            name='Current Session',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 10, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 10, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        db_session.add_all([activity, metric, prev_session, current_session])
        db_session.flush()

        prev_instance = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=prev_session.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 9, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({}),
        )
        current_instance = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=current_session.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 10, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({}),
        )
        db_session.add_all([prev_instance, current_instance])
        db_session.flush()
        db_session.add_all([
            MetricValue(
                activity_instance_id=prev_instance.id,
                metric_definition_id=metric.id,
                value=100,
            ),
            MetricValue(
                activity_instance_id=current_instance.id,
                metric_definition_id=metric.id,
                value=105,
            ),
        ])
        stale_record = ProgressRecord(
            id=str(uuid4()),
            root_id=root_id,
            activity_definition_id=activity.id,
            activity_instance_id=current_instance.id,
            session_id=current_session.id,
            previous_instance_id=prev_instance.id,
            is_first_instance=False,
            has_change=True,
            has_improvement=True,
            has_regression=False,
            comparison_type='flat_metrics',
            metric_comparisons=[{
                'metric_id': metric.id,
                'metric_name': 'Speed',
                'current_value': 105,
                'previous_value': 100,
                'delta': 5,
                'pct_change': 5.0,
                'improved': True,
                'regressed': False,
            }],
            derived_summary={'summary_line': 'Speed up 5.0%'},
            created_at=datetime(2026, 4, 10, 10, 6, tzinfo=timezone.utc),
        )
        db_session.add(stale_record)
        db_session.commit()

        response = authed_client.put(
            f'/api/{root_id}/sessions/{current_session.id}/activities/{current_instance.id}/metrics',
            json={
                'metrics': [
                    {
                        'metric_id': metric.id,
                        'value': 110,
                    }
                ]
            },
        )

        assert response.status_code == 200
        payload = response.get_json()
        assert payload['progress_comparison'] is not None
        assert payload['progress_comparison']['metric_comparisons'][0]['current_value'] == 110.0
        assert payload['progress_comparison']['metric_comparisons'][0]['previous_value'] == 100.0
        assert payload['progress_comparison']['metric_comparisons'][0]['delta'] == 10.0

        refreshed = authed_client.get(f'/api/{root_id}/activity-instances/{current_instance.id}/progress')
        assert refreshed.status_code == 200
        refreshed_payload = refreshed.get_json()
        assert refreshed_payload['metric_comparisons'][0]['current_value'] == 110.0
        assert refreshed_payload['metric_comparisons'][0]['delta'] == 10.0

    def test_deleting_session_rebases_progress_and_excludes_deleted_history(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        activity = ActivityDefinition(
            id=str(uuid4()),
            root_id=root_id,
            name='Bernth Pinky Control Exercise',
            description='',
            has_sets=True,
            has_metrics=True,
            created_at=datetime.now(timezone.utc),
        )
        metric = MetricDefinition(
            id=str(uuid4()),
            activity_id=activity.id,
            root_id=root_id,
            name='Speed',
            unit='BPM',
            track_progress=True,
            progress_aggregation='last',
            is_active=True,
            sort_order=0,
            created_at=datetime.now(timezone.utc),
        )
        session_a = Session(
            id=str(uuid4()),
            name='Session A',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 8, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 8, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        session_b = Session(
            id=str(uuid4()),
            name='Session B',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 9, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 9, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        session_c = Session(
            id=str(uuid4()),
            name='Session C',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 10, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 10, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        db_session.add_all([activity, metric, session_a, session_b, session_c])
        db_session.flush()

        instance_a = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=session_a.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 8, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 8, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 8, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({'sets': [
                {'metrics': [{'metric_id': metric.id, 'value': 100}]},
                {'metrics': [{'metric_id': metric.id, 'value': 120}]},
            ]}),
        )
        instance_b = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=session_b.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 9, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({'sets': [
                {'metrics': [{'metric_id': metric.id, 'value': 110}]},
                {'metrics': [{'metric_id': metric.id, 'value': 130}]},
            ]}),
        )
        instance_c = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=session_c.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 10, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({'sets': [
                {'metrics': [{'metric_id': metric.id, 'value': 40}]},
                {'metrics': [{'metric_id': metric.id, 'value': 130}]},
            ]}),
        )
        db_session.add_all([instance_a, instance_b, instance_c])
        db_session.commit()

        initial_progress = authed_client.get(
            f'/api/{root_id}/activity-instances/{instance_c.id}/progress'
        )
        assert initial_progress.status_code == 200
        initial_payload = initial_progress.get_json()
        assert initial_payload['previous_instance_id'] == instance_b.id
        assert initial_payload['metric_comparisons'][0]['previous_value'] == 130.0

        delete_response = authed_client.delete(f'/api/{root_id}/sessions/{session_b.id}')
        assert delete_response.status_code == 200

        rebased_progress = authed_client.get(
            f'/api/{root_id}/activity-instances/{instance_c.id}/progress'
        )
        assert rebased_progress.status_code == 200
        rebased_payload = rebased_progress.get_json()
        assert rebased_payload['previous_instance_id'] == instance_a.id
        assert rebased_payload['metric_comparisons'][0]['previous_value'] == 120.0
        assert rebased_payload['metric_comparisons'][0]['current_value'] == 130.0
        assert rebased_payload['metric_comparisons'][0]['delta'] == 10.0

        history_response = authed_client.get(
            f'/api/{root_id}/activities/{activity.id}/history?exclude_session={session_c.id}&limit=10'
        )
        assert history_response.status_code == 200
        history_payload = history_response.get_json()
        assert [entry['id'] for entry in history_payload] == [instance_a.id]

    def test_completed_set_updates_return_and_persist_progress(self, authed_client, db_session, sample_ultimate_goal):
        root_id = sample_ultimate_goal.id
        activity = ActivityDefinition(
            id=str(uuid4()),
            root_id=root_id,
            name='Bernth Pinky Control Exercise',
            description='',
            has_sets=True,
            has_metrics=True,
            created_at=datetime.now(timezone.utc),
        )
        metric = MetricDefinition(
            id=str(uuid4()),
            activity_id=activity.id,
            root_id=root_id,
            name='Speed',
            unit='BPM',
            track_progress=True,
            progress_aggregation='last',
            is_active=True,
            sort_order=0,
            created_at=datetime.now(timezone.utc),
        )
        prev_session = Session(
            id=str(uuid4()),
            name='Previous Session',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 9, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 9, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        current_session = Session(
            id=str(uuid4()),
            name='Current Session',
            description='',
            root_id=root_id,
            session_start=datetime(2026, 4, 10, tzinfo=timezone.utc),
            created_at=datetime(2026, 4, 10, tzinfo=timezone.utc),
            attributes=json.dumps({}),
        )
        db_session.add_all([activity, metric, prev_session, current_session])
        db_session.flush()

        prev_instance = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=prev_session.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 9, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({'sets': [
                {'instance_id': 'set-a1', 'metrics': [{'metric_id': metric.id, 'value': 100}]},
                {'instance_id': 'set-a2', 'metrics': [{'metric_id': metric.id, 'value': 120}]},
            ]}),
        )
        current_instance = ActivityInstance(
            id=str(uuid4()),
            root_id=root_id,
            session_id=current_session.id,
            activity_definition_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            completed=True,
            time_start=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            time_stop=datetime(2026, 4, 10, 10, 5, tzinfo=timezone.utc),
            duration_seconds=300,
            data=json.dumps({'sets': [
                {'instance_id': 'set-b1', 'metrics': [{'metric_id': metric.id, 'value': 34}]},
                {'instance_id': 'set-b2', 'metrics': [{'metric_id': metric.id, 'value': 23}]},
            ]}),
        )
        db_session.add_all([prev_instance, current_instance])
        db_session.commit()

        first_progress = authed_client.get(f'/api/{root_id}/activity-instances/{current_instance.id}/progress')
        assert first_progress.status_code == 200
        assert first_progress.get_json()['metric_comparisons'][0]['current_value'] == 23.0

        update_response = authed_client.put(
            f'/api/{root_id}/activity-instances/{current_instance.id}',
            json={
                'session_id': current_session.id,
                'activity_definition_id': activity.id,
                'sets': [
                    {'instance_id': 'set-b1', 'metrics': [{'metric_id': metric.id, 'value': 34}]},
                    {'instance_id': 'set-b2', 'metrics': [{'metric_id': metric.id, 'value': 30}]},
                ],
            },
        )
        assert update_response.status_code == 200
        update_payload = update_response.get_json()
        assert update_payload['progress_comparison'] is not None
        assert update_payload['progress_comparison']['metric_comparisons'][0]['current_value'] == 30.0
        assert update_payload['progress_comparison']['metric_comparisons'][0]['previous_value'] == 120.0
        assert update_payload['progress_comparison']['metric_comparisons'][0]['delta'] == -90.0

        refreshed = authed_client.get(f'/api/{root_id}/activity-instances/{current_instance.id}/progress')
        assert refreshed.status_code == 200
        refreshed_payload = refreshed.get_json()
        assert refreshed_payload['metric_comparisons'][0]['current_value'] == 30.0
        assert refreshed_payload['metric_comparisons'][0]['delta'] == -90.0
