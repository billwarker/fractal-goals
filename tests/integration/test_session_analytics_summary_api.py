import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from models import ActivityInstance, MetricDefinition, MetricValue, Session


@pytest.mark.integration
@pytest.mark.parametrize('run_count', [0, 1, 3, 12])
def test_analytics_circuit_sections_use_bounded_bulk_reads(
    authed_client, db_session, sample_practice_session, sample_activity_definition, run_count,
):
    from sqlalchemy import event
    from models import ActivitySet, CircuitRun, CircuitRunSlot, CircuitRound, CircuitRoundMember

    session_id, root_id = sample_practice_session.id, sample_practice_session.root_id
    items, expected = [], set()
    for _ in range(run_count):
        run = CircuitRun(id=str(uuid4()), root_id=root_id, session_id=session_id, name='Circuit')
        db_session.add(run)
        items.append({'type': 'circuit', 'circuit_run_id': run.id})
        slots = []
        for index in range(2):
            instance = ActivityInstance(id=str(uuid4()), root_id=root_id, session_id=session_id,
                                        activity_definition_id=sample_activity_definition.id)
            slot = CircuitRunSlot(id=str(uuid4()), run=run, activity_instance=instance,
                                  activity_definition_id=sample_activity_definition.id, sort_order=index,
                                  activity_name='Member', has_sets=True, has_metrics=True)
            db_session.add_all([instance, slot])
            slots.append(slot)
            expected.add(instance.id)
        db_session.flush()
        for number in range(1, 4):
            circuit_round = CircuitRound(id=str(uuid4()), run=run, round_number=number)
            db_session.add(circuit_round)
            for index, slot in enumerate(slots):
                activity_set = ActivitySet(id=str(uuid4()), activity_instance_id=slot.activity_instance_id,
                                           sort_order=number - 1)
                db_session.add(activity_set)
                db_session.add(CircuitRoundMember(round=circuit_round, run_slot=slot,
                                                  activity_set_id=activity_set.id, sort_order=index))
    sample_practice_session.attributes = {'session_data': {'sections': [{'items': items}]}}
    db_session.commit()
    db_session.expire_all()
    circuit_queries = []
    def before(_conn, _cursor, statement, _params, _context, _many):
        if statement.lstrip().upper().startswith('SELECT') and 'FROM circuit_' in statement:
            circuit_queries.append(statement)
    engine = db_session.get_bind()
    event.listen(engine, 'before_cursor_execute', before)
    try:
        response = authed_client.get(f'/api/{root_id}/sessions/analytics-summary?limit=200')
    finally:
        event.remove(engine, 'before_cursor_execute', before)
    assert response.status_code == 200
    section = response.get_json()['sessions'][0]['sections'][0]
    assert set(section['activity_ids']) == expected
    assert len(section['activity_ids']) == len(expected)
    assert len(circuit_queries) == (3 if run_count else 1)


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

    legacy_session = Session(
        owner_id=sample_practice_session.owner_id,
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
    assert persisted_instance['progress_comparison']['previous_instance_id'] is None
    assert persisted_instance['progress_comparison']['is_first_instance'] is True
    assert persisted_instance['progress_comparison']['metric_comparisons'] == []
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


@pytest.mark.integration
def test_analytics_evidence_pages_do_not_repeat_or_hydrate_unselected_rows(authed_client, db_session, sample_practice_session, sample_activity_definition):
    from sqlalchemy import event
    instances = [ActivityInstance(id=str(uuid4()), root_id=sample_practice_session.root_id,
                 session_id=sample_practice_session.id, activity_definition_id=sample_activity_definition.id) for _ in range(7)]
    db_session.add_all(instances)
    db_session.commit()
    ids = {row.id for row in instances}
    root_id = sample_practice_session.root_id
    db_session.expunge_all()
    loaded = []
    def on_load(row, _context):
        loaded.append(row.id)
    event.listen(ActivityInstance, 'load', on_load)
    try:
        seen = set()
        offset = 0
        while True:
            loaded.clear()
            payload = authed_client.get(f'/api/{root_id}/sessions/analytics-summary?instance_limit=2&instance_offset={offset}').get_json()
            page = {row['id'] for rows in payload['activity_instances'].values() for row in rows}
            assert len(page) <= 2
            assert len(set(loaded)) <= 3  # One lookahead identity.
            assert not seen & page
            seen.update(page)
            pagination = payload['evidence_pagination']
            if not pagination['has_more']:
                break
            offset = pagination['next_offset']
        assert seen == ids
    finally:
        event.remove(ActivityInstance, 'load', on_load)


@pytest.mark.integration
@pytest.mark.parametrize('session_count', [0, 1, 2, 3, 4, 51])
def test_analytics_pages_cover_all_session_windows(
    authed_client, db_session, sample_practice_session, sample_activity_definition, session_count,
):
    root_id = sample_practice_session.root_id
    sample_practice_session.deleted_at = datetime.now(timezone.utc)
    expected_sessions = set()
    expected_instances = set()
    for index in range(session_count):
        session = Session(id=str(uuid4()), root_id=root_id, owner_id=sample_practice_session.owner_id,
                          name=f'History {index}', completed=True, session_start=datetime(2025, 1, 1, tzinfo=timezone.utc))
        db_session.add(session)
        expected_sessions.add(session.id)
        for _ in range(3):
            instance = ActivityInstance(id=str(uuid4()), root_id=root_id, session_id=session.id,
                                        activity_definition_id=sample_activity_definition.id)
            db_session.add(instance)
            expected_instances.add(instance.id)
    db_session.commit()
    seen_sessions, seen_instances = set(), set()
    session_offset = instance_offset = 0
    for _ in range(200):
        response = authed_client.get(
            f'/api/{root_id}/sessions/analytics-summary?limit=2&instance_limit=2'
            f'&session_offset={session_offset}&instance_offset={instance_offset}')
        assert response.status_code == 200
        payload = response.get_json()
        assert len(payload['sessions']) <= 2
        seen_sessions.update(row['id'] for row in payload['sessions'])
        page_ids = {row['id'] for rows in payload['activity_instances'].values() for row in rows}
        assert len(page_ids) <= 2
        assert not seen_instances & page_ids
        seen_instances.update(page_ids)
        if payload['evidence_pagination']['next_offset'] is not None:
            instance_offset = payload['evidence_pagination']['next_offset']
        elif payload['session_pagination']['next_offset'] is not None:
            session_offset = payload['session_pagination']['next_offset']
            instance_offset = 0
        else:
            break
    else:
        pytest.fail('Analytics pagination failed to terminate')
    assert seen_sessions == expected_sessions
    assert seen_instances == expected_instances


@pytest.mark.integration
@pytest.mark.parametrize('offset', ['-1', 'oops'])
def test_analytics_rejects_invalid_session_offset(authed_client, sample_practice_session, offset):
    response = authed_client.get(
        f'/api/{sample_practice_session.root_id}/sessions/analytics-summary?session_offset={offset}')
    assert response.status_code == 400


@pytest.mark.integration
@pytest.mark.parametrize('instance_count', [0, 1, 499, 500, 501])
def test_analytics_instance_page_maximum(authed_client, db_session, sample_practice_session,
                                         sample_activity_definition, instance_count):
    rows = [ActivityInstance(id=str(uuid4()), root_id=sample_practice_session.root_id,
                             session_id=sample_practice_session.id,
                             activity_definition_id=sample_activity_definition.id)
            for _ in range(instance_count)]
    db_session.add_all(rows)
    db_session.commit()
    url = f'/api/{sample_practice_session.root_id}/sessions/analytics-summary'
    first = authed_client.get(url).get_json()
    ids = {row['id'] for values in first['activity_instances'].values() for row in values}
    assert len(ids) == min(instance_count, 500)
    assert first['evidence_pagination']['has_more'] == (instance_count > 500)
    if instance_count > 500:
        second = authed_client.get(url + '?instance_offset=500').get_json()
        next_ids = {row['id'] for values in second['activity_instances'].values() for row in values}
        assert not ids & next_ids
        assert ids | next_ids == {row.id for row in rows}
        assert second['evidence_pagination']['next_offset'] is None
