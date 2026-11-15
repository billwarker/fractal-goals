import json
from datetime import datetime, timedelta, timezone
from uuid import uuid4

import pytest

from models import ActivityInstance, MetricDefinition, MetricValue, Session, SessionTemplate
from services.session_runtime import get_session_runtime_data


def _quick_url(root_id):
    return f'/api/{root_id}/sessions/quick-complete'


def _entry(activity_id, **overrides):
    return {'activity_definition_id': activity_id, 'metrics': [], 'sets': [], **overrides}


def _metric_ids(db_session, activity_id):
    return {
        metric.name: metric.id
        for metric in db_session.query(MetricDefinition).filter_by(activity_id=activity_id).all()
    }


@pytest.mark.parametrize('activity_completed', [False, True, None])
@pytest.mark.parametrize('activity_count', [1, 5])
@pytest.mark.parametrize('has_sets', [False, True])
def test_quick_complete_creates_a_completed_session_without_a_template(
    activity_completed,
    activity_count,
    has_sets,
    authed_client,
    db_session,
    sample_goal_hierarchy,
    sample_activity_definition,
):
    sample_activity_definition.has_sets = has_sets
    db_session.commit()
    root_id = sample_goal_hierarchy['ultimate'].id

    response = authed_client.post(_quick_url(root_id), json={
        'session_start': datetime.now(timezone.utc).isoformat(),
        'activity_instances': [
            _entry(sample_activity_definition.id, completed=activity_completed, has_sets=has_sets)
            for _ in range(activity_count)
        ],
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data['completed'] is True
    assert data['session_type'] == 'quick'
    assert data['name'] == 'Quick Session'
    assert data['template_id'] is None

    instances = db_session.query(ActivityInstance).filter_by(session_id=data['id']).all()
    # The same activity logged twice is two instances; nothing is merged or dropped.
    assert len(instances) == activity_count
    assert all(instance.completed for instance in instances)


def test_quick_complete_matches_values_to_entries_by_position(
    authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    sample_activity_definition.has_sets = False
    db_session.commit()
    root_id = sample_goal_hierarchy['ultimate'].id
    weight_id = _metric_ids(db_session, sample_activity_definition.id)['Weight']

    response = authed_client.post(_quick_url(root_id), json={'activity_instances': [
        _entry(sample_activity_definition.id, metrics=[{'metric_id': weight_id, 'value': 100}], notes='first'),
        _entry(sample_activity_definition.id, metrics=[{'metric_id': weight_id, 'value': 120}], notes='second'),
    ]})

    assert response.status_code == 201
    session = db_session.get(Session, response.get_json()['id'])
    ordered_ids = get_session_runtime_data(session)['activity_ids']
    recorded = [
        (
            db_session.get(ActivityInstance, instance_id).notes,
            db_session.query(MetricValue).filter_by(activity_instance_id=instance_id).one().value,
        )
        for instance_id in ordered_ids
    ]
    assert recorded == [('first', 100), ('second', 120)]


def test_quick_complete_keeps_logged_sets_with_their_notes(
    authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    weight_id = _metric_ids(db_session, sample_activity_definition.id)['Weight']

    response = authed_client.post(_quick_url(root_id), json={'activity_instances': [_entry(
        sample_activity_definition.id, has_sets=True, sets=[
            {'completed': True, 'notes': 'easy', 'metrics': [{'metric_id': weight_id, 'value': 100}]},
            {'completed': True, 'metrics': [{'metric_id': weight_id, 'value': 105}]},
        ],
    )]})

    assert response.status_code == 201
    instance = db_session.query(ActivityInstance).filter_by(session_id=response.get_json()['id']).one()
    sets = sorted(instance.sets, key=lambda activity_set: activity_set.sort_order)
    assert [(activity_set.notes, activity_set.status) for activity_set in sets] == [('easy', 'completed'), (None, 'completed')]


def test_quick_complete_saves_nothing_when_a_later_entry_fails(
    authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    sample_activity_definition.has_sets = False
    db_session.commit()
    root_id = sample_goal_hierarchy['ultimate'].id
    weight_id = _metric_ids(db_session, sample_activity_definition.id)['Weight']

    response = authed_client.post(_quick_url(root_id), json={'activity_instances': [
        _entry(sample_activity_definition.id, metrics=[{'metric_id': weight_id, 'value': 100}]),
        _entry(sample_activity_definition.id, metrics=[{'metric_id': str(uuid4()), 'value': 1}]),
    ]})

    assert response.status_code == 400
    db_session.expire_all()
    assert db_session.query(Session).filter(Session.root_id == root_id).count() == 0
    assert db_session.query(ActivityInstance).filter(ActivityInstance.root_id == root_id).count() == 0


@pytest.mark.parametrize('activity_count', [0, 21])
def test_quick_complete_bounds_the_number_of_activities(
    activity_count, authed_client, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    response = authed_client.post(_quick_url(root_id), json={
        'activity_instances': [_entry(sample_activity_definition.id) for _ in range(activity_count)],
    })
    assert response.status_code == 400


def test_quick_complete_accepts_twenty_activities(authed_client, sample_goal_hierarchy, sample_activity_definition):
    root_id = sample_goal_hierarchy['ultimate'].id
    response = authed_client.post(_quick_url(root_id), json={
        'activity_instances': [_entry(sample_activity_definition.id) for _ in range(20)],
    })
    assert response.status_code == 201


def test_quick_complete_refuses_deleted_or_foreign_activities(
    authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    foreign = authed_client.post(_quick_url(root_id), json={'activity_instances': [_entry(str(uuid4()))]})
    sample_activity_definition.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    deleted = authed_client.post(_quick_url(root_id), json={'activity_instances': [_entry(sample_activity_definition.id)]})

    assert foreign.status_code == 400
    assert deleted.status_code == 400
    assert db_session.query(Session).filter(Session.root_id == root_id).count() == 0


def test_quick_complete_ignores_an_older_clients_template_fields(
    authed_client, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    """A completion queued by an older app version names its (now one-section) template."""
    root_id = sample_goal_hierarchy['ultimate'].id
    template = SessionTemplate(
        id=str(uuid4()), name='Daily Weight', root_id=root_id,
        template_data=json.dumps({'sections': [{'name': 'Activities', 'items': []}]}),
    )
    db_session.add(template)
    db_session.commit()

    response = authed_client.post(_quick_url(root_id), json={
        'name': 'Quick Weight Entry',
        'template_id': template.id,
        'duration_minutes': 0,
        'session_data': {'template_id': template.id, 'session_type': 'quick', 'program_context': None},
        'activity_instances': [_entry(sample_activity_definition.id)],
    })

    assert response.status_code == 201
    data = response.get_json()
    assert data['name'] == 'Quick Weight Entry'
    assert data['template_id'] is None
    assert data['session_type'] == 'quick'


def test_quick_complete_keeps_the_drafts_start_within_the_trusted_window(
    authed_client, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    started = datetime.now(timezone.utc) - timedelta(minutes=30)
    in_window = authed_client.post(_quick_url(root_id), json={
        'session_start': started.isoformat(), 'activity_instances': [_entry(sample_activity_definition.id)],
    })
    future = authed_client.post(_quick_url(root_id), json={
        'session_start': (datetime.now(timezone.utc) + timedelta(days=2)).isoformat(),
        'activity_instances': [_entry(sample_activity_definition.id)],
    })

    def start_of(response):
        return datetime.fromisoformat(response.get_json()['session_start'].replace('Z', '+00:00'))

    assert abs((start_of(in_window) - started).total_seconds()) < 2
    assert start_of(future) <= datetime.now(timezone.utc) + timedelta(seconds=2)


def test_create_session_refuses_to_start_a_quick_session(
    authed_client, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    response = authed_client.post(f'/api/{root_id}/sessions', json={
        'name': 'Quick', 'goal_ids': [root_id], 'session_data': {'session_type': 'quick'},
    })
    assert response.status_code == 400
    assert response.get_json()['code'] == 'quick_session_use_complete'


def test_quick_complete_accepts_a_client_id_and_replays_safely(
    client, auth_headers, db_session, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    session_id = str(uuid4())
    body = json.dumps({
        'id': session_id,
        'name': 'Offline quick log',
        'session_start': datetime.now(timezone.utc).isoformat(),
        'activity_instances': [_entry(sample_activity_definition.id)],
    })
    keyed = {**auth_headers, 'Idempotency-Key': str(uuid4())}

    first = client.post(_quick_url(root_id), data=body, headers=keyed)
    replay = client.post(_quick_url(root_id), data=body, headers=keyed)
    # The idempotency record gone (new key): the server finds the session it already saved.
    late_replay = client.post(_quick_url(root_id), data=body, headers=auth_headers)

    assert first.status_code == 201
    assert first.get_json()['id'] == session_id
    assert replay.status_code == 201
    assert replay.headers.get('Idempotent-Replayed') == 'true'
    assert late_replay.status_code == 200
    assert late_replay.get_json()['id'] == session_id
    db_session.expire_all()
    assert db_session.query(Session).filter(Session.root_id == root_id).count() == 1


def test_sessions_list_filters_by_session_type(
    authed_client, db_session, test_user, sample_goal_hierarchy, sample_activity_definition,
):
    root_id = sample_goal_hierarchy['ultimate'].id
    assert authed_client.post(
        _quick_url(root_id), json={'activity_instances': [_entry(sample_activity_definition.id)]},
    ).status_code == 201
    assert authed_client.post(
        f'/api/{root_id}/sessions', json={'name': 'Normal', 'goal_ids': [root_id]},
    ).status_code == 201
    # Rows from before session_data was nested keep the type at the top of attributes.
    legacy = Session(
        id=str(uuid4()), name='Legacy quick', root_id=root_id, owner_id=test_user.id,
        completed=True, attributes={'session_type': 'quick'},
    )
    db_session.add(legacy)
    db_session.commit()

    def names(session_type):
        response = authed_client.get(f'/api/{root_id}/sessions?session_type={session_type}&view=summary')
        assert response.status_code == 200
        return {session['name'] for session in response.get_json()['sessions']}

    assert names('quick') == {'Quick Session', 'Legacy quick'}
    assert names('normal') == {'Normal'}
    assert authed_client.get(f'/api/{root_id}/sessions?session_type=fast').status_code == 400
