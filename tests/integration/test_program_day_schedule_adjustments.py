"""Occurrence adjustments preserve recurrence and execution evidence across read models."""
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from threading import Barrier

import pytest
from sqlalchemy.exc import IntegrityError

from models import (
    ProgramDayOccurrenceSchedule,
    ProgramDayStatusOverride, ProgramSessionPlan, Session, get_session,
)
from services.programs import ProgramService


@pytest.fixture
def schedule_world(authed_client, sample_ultimate_goal):
    root = sample_ultimate_goal.id
    response = authed_client.post(f'/api/{root}/programs', json={
        'name': 'Adjustments', 'start_date': '2026-09-01', 'end_date': '2026-09-30',
        'weeklySchedule': [], 'selectedGoals': [],
    })
    assert response.status_code == 201
    program = response.get_json()['id']
    base = f'/api/{root}/programs/{program}'
    def create(name, **fields):
        result = authed_client.post(f'{base}/days', json={'name': name, **fields})
        assert result.status_code == 201, result.get_json()
        return result.get_json()['id']
    return root, program, base, create


def occurrences(client, base, value):
    response = client.get(f'{base}/day-read-model?range_start={value}&range_end={value}&detail_date={value}&timezone=UTC')
    assert response.status_code == 200
    return response.get_json()['detail']['occurrences']


@pytest.mark.integration
def test_weekly_interval_read_models_explicit_dates_and_adjustments(authed_client, schedule_world, sample_session_template):
    root, program, base, create = schedule_world
    day = create('Fortnight', day_of_week=['Tuesday'], repeat_every_weeks=2,
                 template_ids=[sample_session_template.id], scheduled_dates=['2026-09-08'])
    saved = next(row for row in authed_client.get(base).get_json()['days'] if row['id'] == day)
    assert saved['repeat_every_weeks'] == 2
    feed = authed_client.get(f'/api/{root}/programs/calendar-feed?range_start=2026-09-01&range_end=2026-09-30&timezone=UTC').get_json()
    assert [row['date'] for row in feed['program_days'] if row['scheduled']] == [
        '2026-09-01', '2026-09-08', '2026-09-15', '2026-09-29',
    ]
    metrics = authed_client.get(f'{base}/metrics?timezone=UTC').get_json()
    assert metrics['consistency']['scheduled_days_total'] == 4
    for value, expected in [('2026-09-15', True), ('2026-09-22', False)]:
        assert bool(occurrences(authed_client, base, value)) == expected
        assert bool(authed_client.get(f'/api/{root}/programs/day-options?date={value}&timezone=UTC').get_json()) == expected
    response = authed_client.post(f'{base}/days/{day}/move', json={'source_date': '2026-09-15', 'target_date': '2026-09-22'})
    assert response.status_code == 200
    assert occurrences(authed_client, base, '2026-09-15') == []
    assert occurrences(authed_client, base, '2026-09-22')[0]['program_day_id'] == day
    assert occurrences(authed_client, base, '2026-09-29')[0]['program_day_id'] == day
    # Changing unrelated fields preserves cadence and its ad hoc exceptions.
    response = authed_client.put(f'{base}/days/{day}', json={'name': 'Renamed'})
    assert response.status_code == 200
    assert response.get_json()['repeat_every_weeks'] == 2
    assert response.get_json()['excluded_dates'] == ['2026-09-15']


@pytest.mark.integration
def test_weekly_interval_conflicts_are_atomic(authed_client, schedule_world):
    _root, _program, base, create = schedule_world
    day = create('Fortnight', day_of_week=['Tuesday'], repeat_every_weeks=2)
    create('Off week', scheduled_dates=['2026-09-08'])
    response = authed_client.put(f'{base}/days/{day}', json={'repeat_every_weeks': 1})
    assert response.status_code == 409, response.get_json()
    saved = next(row for row in authed_client.get(base).get_json()['days'] if row['id'] == day)
    assert saved['repeat_every_weeks'] == 2
    response = authed_client.put(f'{base}/days/{day}', json={'repeat_every_weeks': 3})
    assert response.status_code == 200
    assert bool(occurrences(authed_client, base, '2026-09-22'))
    assert occurrences(authed_client, base, '2026-09-15') == []


@pytest.mark.integration
@pytest.mark.parametrize('interval', [0, -1, 1.5, True, '2', None, 2147483648])
def test_weekly_interval_rejects_invalid_values(authed_client, schedule_world, interval):
    _root, _program, base, create = schedule_world
    day = create('Weekly', day_of_week=['Tuesday'])
    assert authed_client.post(f'{base}/days', json={'name': 'Invalid', 'repeat_every_weeks': interval}).status_code == 400
    assert authed_client.put(f'{base}/days/{day}', json={'repeat_every_weeks': interval}).status_code == 400



@pytest.mark.integration
@pytest.mark.parametrize('source_recurs', [False, True])
@pytest.mark.parametrize('target_recurs', [False, True])
def test_move_replaces_one_occurrence_and_preserves_other_dates(
    authed_client, schedule_world, sample_session_template, source_recurs, target_recurs,
):
    root, program, base, create = schedule_world
    source = create('Strength', template_ids=[sample_session_template.id], **({'day_of_week': ['Monday']} if source_recurs else {'scheduled_dates': ['2026-09-07']}))
    target = create('Mobility', **({'day_of_week': ['Tuesday']} if target_recurs else {'scheduled_dates': ['2026-09-08']}))
    response = authed_client.post(f'{base}/days/{source}/move', json={
        'source_date': '2026-09-07', 'target_date': '2026-09-08',
    })
    assert response.status_code == 200, response.get_json()
    assert response.get_json() == {
        'program_day_id': source, 'program_id': program, 'source_date': '2026-09-07',
        'target_date': '2026-09-08', 'displaced_day_id': target,
    }
    assert occurrences(authed_client, base, '2026-09-07') == []
    assert [row['program_day_id'] for row in occurrences(authed_client, base, '2026-09-08')] == [source]
    assert bool(occurrences(authed_client, base, '2026-09-14')) == source_recurs
    assert bool(occurrences(authed_client, base, '2026-09-15')) == target_recurs
    detail = authed_client.get(base).get_json()
    source_day = next(day for day in detail['days'] if day['id'] == source)
    assert source_day['excluded_dates'] == (['2026-09-07'] if source_recurs else [])
    feed = authed_client.get(f'/api/{root}/programs/calendar-feed?range_start=2026-09-07&range_end=2026-09-08&timezone=UTC').get_json()
    scheduled = [row for row in feed['program_days'] if row['scheduled']]
    assert [(row['date'], row['occurrences'][0]['program_day_id']) for row in scheduled] == [('2026-09-08', source)]
    for value, expected in [('2026-09-07', []), ('2026-09-08', [source])]:
        options = authed_client.get(f'/api/{root}/programs/day-options?date={value}&timezone=UTC').get_json()
        assert [row['day_id'] for row in options] == expected
    metrics = authed_client.get(f'{base}/metrics?range_start=2026-09-07&range_end=2026-09-08&timezone=UTC')
    assert metrics.status_code == 200


@pytest.mark.integration
def test_move_transfers_plans_resets_statuses_and_keeps_sessions(
    authed_client, db_session, test_user, schedule_world, sample_session_template,
):
    root, program, base, create = schedule_world
    day = create('Strength', day_of_week=['Monday'], template_ids=[sample_session_template.id])
    source, target = date(2026, 9, 7), date(2026, 9, 14)
    plans = [ProgramSessionPlan(
        root_id=root, program_id=program, program_day_id=day,
        session_template_id=sample_session_template.id, date=value,
        plan_data={'sections': [], 'marker': marker},
    ) for value, marker in [(source, 'source'), (target, 'destination')]]
    session = Session(owner_id=test_user.id, root_id=root, name='Logged', completed=True,
                      program_id=program, program_day_id=day,
                      session_start=datetime(2026, 9, 7, 12, tzinfo=timezone.utc))
    db_session.add_all([*plans, session, *[ProgramDayStatusOverride(program_id=program, date=value, status='rest') for value in (source, target)]])
    db_session.commit()
    original_id = plans[0].id
    response = authed_client.post(f'{base}/days/{day}/move', json={'source_date': str(source), 'target_date': str(target)})
    assert response.status_code == 200, response.get_json()
    assert response.get_json()['displaced_day_id'] == day
    for plan in plans:
        db_session.refresh(plan)
    assert plans[0].id == original_id and plans[0].date == target
    assert plans[0].plan_data['marker'] == 'source' and plans[0].deleted_at is None
    assert plans[1].deleted_at is not None
    assert db_session.query(ProgramDayStatusOverride).filter_by(program_id=program).count() == 0
    db_session.refresh(session)
    assert session.deleted_at is None and session.session_start.date() == source
    assert occurrences(authed_client, base, str(source)) == []
    assert len(occurrences(authed_client, base, str(target))) == 1


@pytest.mark.integration
def test_remove_recurring_day_is_idempotent_and_can_be_rescheduled(authed_client, schedule_world):
    _, _, base, create = schedule_world
    day = create('Strength', day_of_week=['Monday'])
    url = f'{base}/days/{day}'
    for _ in range(2):
        response = authed_client.post(f'{url}/unschedule', json={'date': '2026-09-07'})
        assert response.status_code == 200
        assert response.get_json()['day']['excluded_dates'] == ['2026-09-07']
    assert occurrences(authed_client, base, '2026-09-07') == []
    assert len(occurrences(authed_client, base, '2026-09-14')) == 1
    assert authed_client.put(url, json={'name': 'Updated'}).status_code == 200
    assert occurrences(authed_client, base, '2026-09-07') == []
    assert authed_client.post(f'{url}/schedule', json={'date': '2026-09-07'}).status_code == 201
    assert len(occurrences(authed_client, base, '2026-09-07')) == 1
    assert authed_client.get(base).get_json()['days'][0]['excluded_dates'] == []


@pytest.mark.integration
@pytest.mark.parametrize('source,target,status', [
    ('2026-09-07', '2026-09-07', 400), ('2026-09-07', '2026-10-01', 400),
    ('2026-08-31', '2026-09-08', 400), ('2026-09-06', '2026-09-08', 409),
    ('bad', '2026-09-08', 400),
])
def test_invalid_move_leaves_schedule_unchanged(authed_client, schedule_world, source, target, status):
    _, _, base, create = schedule_world
    day = create('Strength', scheduled_dates=['2026-09-07'])
    response = authed_client.post(f'{base}/days/{day}/move', json={'source_date': source, 'target_date': target})
    assert response.status_code == status
    assert len(occurrences(authed_client, base, '2026-09-07')) == 1
    assert occurrences(authed_client, base, '2026-09-08') == []


@pytest.mark.integration
def test_move_failure_rolls_back_schedule_and_does_not_emit(authed_client, schedule_world, monkeypatch):
    _, _, base, create = schedule_world
    day = create('Strength', day_of_week=['Monday'])
    emitted = []
    monkeypatch.setattr('services.events.event_bus.emit', emitted.append)
    def fail(*args, **kwargs):
        raise IntegrityError('forced failure', {}, Exception('forced'))
    monkeypatch.setattr(ProgramService, '_commit', fail)
    response = authed_client.post(f'{base}/days/{day}/move', json={'source_date': '2026-09-07', 'target_date': '2026-09-08'})
    assert response.status_code == 500
    assert emitted == []
    assert len(occurrences(authed_client, base, '2026-09-07')) == 1
    assert occurrences(authed_client, base, '2026-09-08') == []


@pytest.mark.integration
def test_concurrent_moves_serialize_and_reject_stale_source(authed_client, schedule_world, test_user, db_session):
    root, program, base, create = schedule_world
    day = create('Strength', scheduled_dates=['2026-09-07'])
    owner = test_user.id
    engine = db_session.get_bind()
    barrier = Barrier(2)
    def move(target):
        session = get_session(engine)
        try:
            barrier.wait(timeout=10)
            ProgramService.move_program_day_occurrence(session, root, program, day,
                {'source_date': '2026-09-07', 'target_date': target}, owner)
            return 200
        except ValueError:
            session.rollback()
            return 409
        finally:
            session.close()
    with ThreadPoolExecutor(max_workers=2) as pool:
        assert sorted(pool.map(move, ['2026-09-08', '2026-09-09'])) == [200, 409]
    assert db_session.query(ProgramDayOccurrenceSchedule).filter_by(program_day_id=day).count() == 1
    assert occurrences(authed_client, base, '2026-09-07') == []


@pytest.mark.integration
def test_move_into_same_definition_explicit_date_and_move_back(authed_client, schedule_world):
    _, _, base, create = schedule_world
    day = create('Strength', scheduled_dates=['2026-09-07', '2026-09-08'])
    for source, target in [('2026-09-07', '2026-09-08'), ('2026-09-08', '2026-09-07')]:
        response = authed_client.post(f'{base}/days/{day}/move', json={'source_date': source, 'target_date': target})
        assert response.status_code == 200, response.get_json()
        assert occurrences(authed_client, base, source) == []
        assert len(occurrences(authed_client, base, target)) == 1


@pytest.mark.integration
def test_move_rejects_wrong_program_day_and_unowned_fractal(authed_client, schedule_world):
    root, _, base, create = schedule_world
    day = create('Strength', scheduled_dates=['2026-09-07'])
    payload = {'source_date': '2026-09-07', 'target_date': '2026-09-08'}
    assert authed_client.post(f'{base}/days/missing/move', json=payload).status_code == 404
    assert authed_client.post(f'{base.replace(root, "unowned")}/days/{day}/move', json=payload).status_code == 404
    assert len(occurrences(authed_client, base, '2026-09-07')) == 1


@pytest.mark.integration
def test_day_create_preserves_copy_exclusions_and_explicit_scheduling_restores_date(authed_client, schedule_world):
    _, _, base, create = schedule_world
    day = create('Copied Strength', day_of_week=['Monday'], excluded_dates=['2026-09-07'])
    assert occurrences(authed_client, base, '2026-09-07') == []
    assert len(occurrences(authed_client, base, '2026-09-14')) == 1
    response = authed_client.post(f'{base}/days', json={
        'name': 'Restored', 'day_of_week': ['Tuesday'], 'excluded_dates': ['2026-09-08'],
        'scheduled_dates': ['2026-09-08'],
    })
    assert response.status_code == 201
    assert response.get_json()['excluded_dates'] == []
    assert len(occurrences(authed_client, base, '2026-09-08')) == 1
    outside = authed_client.post(f'{base}/days', json={'name': 'Invalid', 'excluded_dates': ['2026-10-01']})
    assert outside.status_code == 400
    assert authed_client.get(base).get_json()['days'][0]['id'] == day
