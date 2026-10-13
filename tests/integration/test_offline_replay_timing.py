"""Timer writes honour the client's action time (``occurred_at``) within trust bounds."""
import uuid
from datetime import datetime, timedelta, timezone

import pytest

from models import ActivityDefinition, ActivityInstance, CircuitRun, Session


def _now():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _iso(value):
    return value.replace(tzinfo=timezone.utc).isoformat()


def _close(actual, expected, tolerance=timedelta(seconds=2)):
    actual = actual.replace(tzinfo=None) if actual.tzinfo else actual
    return abs(actual - expected) <= tolerance


@pytest.fixture
def started_session(db_session, sample_goal_hierarchy):
    root = sample_goal_hierarchy['ultimate']
    session = Session(
        id=str(uuid.uuid4()),
        root_id=root.id,
        owner_id=root.owner_id,
        name="Gym",
        session_start=_now() - timedelta(hours=1),
        attributes={"session_data": {"sections": [{"name": "Main", "items": []}]}},
    )
    db_session.add(session)
    db_session.commit()
    return session


@pytest.fixture
def instance(db_session, started_session, sample_activity_definition):
    row = ActivityInstance(
        id=str(uuid.uuid4()),
        session_id=started_session.id,
        activity_definition_id=sample_activity_definition.id,
        root_id=started_session.root_id,
    )
    db_session.add(row)
    db_session.commit()
    return row


def _start(client, instance, **body):
    return client.post(
        f'/api/{instance.root_id}/activity-instances/{instance.id}/start',
        json={'session_id': instance.session_id, 'activity_definition_id': instance.activity_definition_id, **body},
    )


def _refresh(db_session, model, row_id):
    db_session.expire_all()
    return db_session.get(model, row_id)


@pytest.mark.integration
class TestActivityTimerOccurredAt:
    def test_start_and_complete_use_client_time(self, authed_client, db_session, instance):
        tapped_start = _now() - timedelta(minutes=12)
        tapped_stop = _now() - timedelta(minutes=4)

        assert _start(authed_client, instance, occurred_at=_iso(tapped_start)).status_code == 200
        complete = authed_client.post(
            f'/api/{instance.root_id}/activity-instances/{instance.id}/complete',
            json={'occurred_at': _iso(tapped_stop)},
        )

        assert complete.status_code == 200
        row = _refresh(db_session, ActivityInstance, instance.id)
        assert _close(row.time_start, tapped_start)
        assert _close(row.time_stop, tapped_stop)
        assert 470 <= row.duration_seconds <= 490

    def test_missing_occurred_at_keeps_server_time(self, authed_client, db_session, instance):
        assert _start(authed_client, instance).status_code == 200
        assert _close(_refresh(db_session, ActivityInstance, instance.id).time_start, _now())

    def test_time_before_session_start_clamps_to_session_start(
        self, authed_client, db_session, instance, started_session,
    ):
        _start(authed_client, instance, occurred_at=_iso(started_session.session_start - timedelta(minutes=30)))
        assert _close(_refresh(db_session, ActivityInstance, instance.id).time_start, started_session.session_start)

    def test_future_time_clamps_to_now(self, authed_client, db_session, instance):
        _start(authed_client, instance, occurred_at=_iso(_now() + timedelta(minutes=5)))
        assert _close(_refresh(db_session, ActivityInstance, instance.id).time_start, _now())

    def test_completion_cannot_precede_its_start(self, authed_client, db_session, instance):
        tapped_start = _now() - timedelta(minutes=5)
        _start(authed_client, instance, occurred_at=_iso(tapped_start))
        authed_client.post(
            f'/api/{instance.root_id}/activity-instances/{instance.id}/complete',
            json={'occurred_at': _iso(tapped_start - timedelta(minutes=10))},
        )
        row = _refresh(db_session, ActivityInstance, instance.id)
        assert _close(row.time_stop, tapped_start)
        assert row.duration_seconds == 0

    @pytest.mark.parametrize('bad_value, message', [
        ('yesterday-ish', 'ISO 8601'),
        (_iso(_now() - timedelta(hours=30)), 'too old'),
    ])
    def test_invalid_or_stale_time_is_rejected(self, authed_client, instance, bad_value, message):
        response = _start(authed_client, instance, occurred_at=bad_value)
        assert response.status_code == 400
        assert message in response.get_json()['error']


@pytest.mark.integration
class TestSessionOccurredAt:
    def test_pause_and_resume_use_client_time_and_stay_ordered(
        self, authed_client, db_session, instance, started_session,
    ):
        base = f'/api/{started_session.root_id}/timers/session/{started_session.id}'
        _start(authed_client, instance, occurred_at=_iso(_now() - timedelta(minutes=20)))
        paused_at = _now() - timedelta(minutes=15)

        assert authed_client.post(f'{base}/pause', json={'occurred_at': _iso(paused_at)}).status_code == 200
        assert _close(_refresh(db_session, Session, started_session.id).last_paused_at, paused_at)

        # A resume that claims to precede the pause is clamped to the pause boundary.
        resume = authed_client.post(f'{base}/resume', json={'occurred_at': _iso(paused_at - timedelta(minutes=1))})
        assert resume.status_code == 200
        assert _refresh(db_session, Session, started_session.id).total_paused_seconds <= 2

    def test_session_completion_records_client_time(self, authed_client, db_session, started_session):
        completed_at = _now() - timedelta(minutes=7)
        response = authed_client.put(
            f'/api/{started_session.root_id}/sessions/{started_session.id}',
            json={'completed': True, 'occurred_at': _iso(completed_at)},
        )
        assert response.status_code == 200
        assert _close(_refresh(db_session, Session, started_session.id).completed_at, completed_at)


@pytest.mark.integration
def test_circuit_start_and_complete_use_client_time(
    authed_client, db_session, started_session, sample_activity_definition,
):
    root_id = started_session.root_id
    burpee = ActivityDefinition(
        id=str(uuid.uuid4()), root_id=root_id, name="Burpee",
        has_sets=False, has_metrics=False, metrics_multiplicative=False, has_splits=False,
    )
    db_session.add(burpee)
    db_session.commit()
    definition = authed_client.post(f'/api/{root_id}/circuits', json={
        'name': 'Finisher',
        'slots': [{'activity_definition_id': sample_activity_definition.id}, {'activity_definition_id': burpee.id}],
    }).get_json()
    run = authed_client.post(
        f'/api/{root_id}/sessions/{started_session.id}/circuit-runs',
        json={'circuit_definition_id': definition['id'], 'section_index': 0},
    ).get_json()
    tapped_start = _now() - timedelta(minutes=9)
    tapped_stop = _now() - timedelta(minutes=2)

    assert authed_client.post(
        f'/api/{root_id}/circuit-runs/{run["id"]}/start', json={'occurred_at': _iso(tapped_start)},
    ).status_code == 200
    assert authed_client.post(
        f'/api/{root_id}/circuit-runs/{run["id"]}/complete', json={'occurred_at': _iso(tapped_stop)},
    ).status_code == 200

    row = _refresh(db_session, CircuitRun, run['id'])
    assert _close(row.time_start, tapped_start)
    assert _close(row.time_stop, tapped_stop)
