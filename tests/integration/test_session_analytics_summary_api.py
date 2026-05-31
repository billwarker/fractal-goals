import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from models import ActivityInstance, MetricDefinition, MetricValue, ProgressRecord, Session


@pytest.mark.integration
def test_session_analytics_summary_returns_lightweight_sessions_and_activity_instances(
    authed_client,
    db_session,
    sample_practice_session,
    sample_activity_instance,
    sample_activity_definition,
):
    root_id = sample_practice_session.root_id
    sample_practice_session.session_start = datetime(2026, 3, 8, 10, 0, tzinfo=timezone.utc)
    sample_practice_session.created_at = datetime(2026, 3, 8, 10, 0, tzinfo=timezone.utc)
    sample_practice_session.completed = True
    sample_practice_session.total_duration_seconds = 900
    sample_activity_instance.data = json.dumps({
        "sets": [
            {
                "metrics": [
                    {
                        "metric_id": sample_activity_definition.metric_definitions[0].id,
                        "value": 185,
                    },
                ],
            },
        ],
    })

    metric_value = MetricValue(
        id=str(uuid4()),
        activity_instance_id=sample_activity_instance.id,
        metric_definition_id=sample_activity_definition.metric_definitions[0].id,
        value=185,
    )
    db_session.add(metric_value)
    progress_record = ProgressRecord(
        id=str(uuid4()),
        root_id=root_id,
        activity_definition_id=sample_activity_definition.id,
        activity_instance_id=sample_activity_instance.id,
        session_id=sample_practice_session.id,
        is_first_instance=False,
        has_change=True,
        has_improvement=True,
        has_regression=False,
        comparison_type='flat_metrics',
        metric_comparisons=[{
            "metric_id": sample_activity_definition.metric_definitions[0].id,
            "metric_name": sample_activity_definition.metric_definitions[0].name,
            "previous_value": 175,
            "current_value": 185,
            "pct_change": 5.7,
            "improved": True,
            "regressed": False,
        }],
        derived_summary={},
        created_at=datetime(2026, 3, 8, 10, 5, tzinfo=timezone.utc),
    )
    db_session.add(progress_record)

    legacy_session = Session(
        id=str(uuid4()),
        name='Legacy Session',
        description='Legacy analytics fallback',
        root_id=root_id,
        session_start=datetime(2026, 3, 7, 9, 0, tzinfo=timezone.utc),
        created_at=datetime(2026, 3, 7, 9, 0, tzinfo=timezone.utc),
        completed=True,
        total_duration_seconds=600,
        attributes=json.dumps({
            "session_data": {
                "sections": [
                    {
                        "exercises": [
                            {
                                "type": "activity",
                                "activity_id": sample_activity_definition.id,
                                "instance_id": "legacy-1",
                            },
                        ],
                    },
                ],
            },
        }),
    )
    db_session.add(legacy_session)
    db_session.commit()

    response = authed_client.get(f'/api/{root_id}/sessions/analytics-summary?limit=10')

    assert response.status_code == 200
    data = json.loads(response.data)
    assert data['limit'] == 10
    assert [session['id'] for session in data['sessions']] == [
        sample_practice_session.id,
        legacy_session.id,
    ]
    assert 'attributes' not in data['sessions'][0]
    assert 'notes' not in data['sessions'][0]
    assert data['sessions'][0]['total_duration_seconds'] == 900
    assert data['sessions'][0]['session_end'] is None

    instances = data['activity_instances'][sample_activity_definition.id]
    assert len(instances) == 2
    persisted_instance = next(instance for instance in instances if instance['id'] == sample_activity_instance.id)
    legacy_instance = next(instance for instance in instances if instance['id'] == 'legacy-1')

    assert persisted_instance['session_id'] == sample_practice_session.id
    assert persisted_instance['session_name'] == sample_practice_session.name
    assert persisted_instance['metrics'][0]['metric_id'] == sample_activity_definition.metric_definitions[0].id
    assert persisted_instance['progress_comparison']['metric_comparisons'][0]['pct_change'] == 5.7
    assert legacy_instance['session_id'] == legacy_session.id
    assert legacy_instance['activity_definition_id'] == sample_activity_definition.id


@pytest.mark.integration
def test_session_analytics_summary_derives_duration_from_start_and_end_when_missing(
    authed_client,
    db_session,
    sample_practice_session,
):
    sample_practice_session.session_start = datetime(2026, 4, 26, 20, 41, tzinfo=timezone.utc)
    sample_practice_session.session_end = datetime(2026, 4, 26, 21, 56, tzinfo=timezone.utc)
    sample_practice_session.completed = True
    sample_practice_session.total_duration_seconds = None
    sample_practice_session.duration_minutes = None
    db_session.commit()

    response = authed_client.get(f'/api/{sample_practice_session.root_id}/sessions/analytics-summary?limit=10')

    assert response.status_code == 200
    data = json.loads(response.data)
    session = next(item for item in data['sessions'] if item['id'] == sample_practice_session.id)
    assert session['total_duration_seconds'] == 75 * 60
    assert session['session_end'] == '2026-04-26T21:56:00Z'


@pytest.mark.integration
def test_session_analytics_summary_rejects_invalid_limit(authed_client, sample_practice_session):
    response = authed_client.get(f'/api/{sample_practice_session.root_id}/sessions/analytics-summary?limit=oops')
    assert response.status_code == 400
