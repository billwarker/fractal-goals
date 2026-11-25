"""Writes a device makes offline: its own ids, safe retries, and clashing edits."""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import time
import uuid

import pytest

from config import config
from models import CalendarPeriod, Goal, Note, Program, SessionTemplate, SyncConflict, User
from tests.conftest import session_headers_for


def _id():
    return str(uuid.uuid4())


def _at(minutes):
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


@pytest.fixture
def root(db_session, test_user):
    root = Goal(id=_id(), name='Root', description='Original', owner_id=test_user.id)
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


@pytest.fixture
def stranger(db_session):
    user = User(username='stranger', email='stranger@example.test',
                terms_accepted_version=config.TERMS_VERSION, privacy_accepted_version=config.PRIVACY_VERSION)
    user.set_password('Stranger123!')
    db_session.add(user)
    db_session.commit()
    return user


CREATES = {
    'calendar-periods': (CalendarPeriod, {'name': 'Holiday', 'start_date': '2026-01-01', 'end_date': '2026-01-02'}),
    'programs': (Program, {'name': 'Plan', 'start_date': '2026-01-01', 'end_date': '2026-02-01'}),
    'session-templates': (SessionTemplate, {'name': 'Template', 'template_data': {'sections': [{'name': 'Main', 'activities': []}]}}),
    'activity-groups': (None, {'name': 'Group'}),
    'activities': (None, {'name': 'Activity'}),
    'activity-tags': (None, {'name': 'Tag'}),
    'activity-tag-families': (None, {'name': 'Family'}),
    'fractal-metrics': (None, {'name': 'Reps', 'unit': 'reps'}),
    'goals': (None, {'name': 'Child', 'type': 'LongTermGoal'}),
    'sessions': (None, {'name': 'Session'}),
}


@pytest.mark.parametrize('path', CREATES)
def test_creates_use_the_devices_id(client, test_user, root, path):
    headers, entity_id = session_headers_for(test_user), _id()
    body = {**CREATES[path][1], 'id': entity_id}
    if path == 'sessions':
        body['parent_id'] = root.id
    if path == 'goals':
        body['parent_id'] = root.id
    url = f'/api/{root.id}/{path}'
    response = client.post(url, json=body, headers=headers)
    assert response.status_code in (200, 201), response.get_json()
    assert entity_id in response.get_data(as_text=True)
    again = client.post(url, json=body, headers=headers)
    assert again.status_code == 409
    assert (again.get_json()['code'], again.get_json()['already_created']) == ('client_id_taken', True)
    # The id was for that one request: the next create gets its own.
    without = {key: value for key, value in body.items() if key != 'id'}
    if path == 'sessions':
        return  # one unfinished session at a time
    without['name'] = 'Another'
    assert entity_id not in client.post(url, json=without, headers=headers).get_data(as_text=True)


def test_an_id_must_be_a_uuid_and_says_nothing_of_other_accounts(client, test_user, stranger, root):
    url = f'/api/{root.id}/activity-groups'
    for bad in ('nope', 7, ''):
        assert client.post(url, json={'name': 'G', 'id': bad}, headers=session_headers_for(test_user)).status_code == 400
    response = client.post('/api/fractals', json={'name': 'Mine', 'id': root.id}, headers=session_headers_for(stranger))
    assert response.status_code == 409
    assert response.get_json()['already_created'] is False


def test_any_fractal_write_can_be_retried(client, db_session, test_user, root):
    headers = {**session_headers_for(test_user), 'Idempotency-Key': _id()}
    url, body = f'/api/{root.id}/activity-groups', {'name': 'Once'}
    first, second = (client.post(url, json=body, headers=headers) for _ in range(2))
    assert first.get_json()['id'] == second.get_json()['id']
    assert second.headers['Idempotent-Replayed'] == 'true'
    assert client.post(url, json={'name': 'Other'}, headers=headers).status_code == 422


def _edit(client, user, root, **body):
    return client.put(f'/api/{root.id}/goals/{root.id}', json=body, headers=session_headers_for(user))


def _conflicts(client, user):
    return client.get('/api/sync/conflicts', headers=session_headers_for(user)).get_json()['conflicts']


def test_edits_to_different_fields_both_apply(client, db_session, test_user, root):
    assert _edit(client, test_user, root, name='From Mac').status_code == 200
    response = _edit(client, test_user, root, description='From phone', _base={'description': 'Original'}, _edited_at=_at(-60))
    assert response.status_code == 200
    db_session.refresh(root)
    assert (root.name, root.description) == ('From Mac', 'From phone')
    assert _conflicts(client, test_user) == []


@pytest.mark.parametrize('minutes,kept,lost', [(-60, 'From Mac', 'From phone'), (60, 'From phone', 'From Mac')])
def test_the_later_edit_wins_and_the_other_is_kept_aside(client, db_session, test_user, root, minutes, kept, lost):
    assert _edit(client, test_user, root, description='From Mac').status_code == 200
    response = _edit(client, test_user, root, description='From phone',
                     _base={'description': 'Original'}, _edited_at=_at(minutes))
    assert response.status_code == 200
    db_session.refresh(root)
    assert root.description == kept
    [conflict] = _conflicts(client, test_user)
    assert (conflict['field'], conflict['kept_value'], conflict['lost_value']) == ('description', kept, lost)
    assert conflict['entity_name'] == 'Root'
    resolved = client.post(f"/api/sync/conflicts/{conflict['id']}/resolve", headers=session_headers_for(test_user))
    assert resolved.status_code == 200
    assert _conflicts(client, test_user) == []


def test_a_losing_field_does_not_take_its_neighbours_with_it(client, db_session, test_user, root):
    _edit(client, test_user, root, description='From Mac')
    _edit(client, test_user, root, name='Phone name', description='From phone',
          _base={'name': 'Root', 'description': 'Original'}, _edited_at=_at(-60))
    db_session.refresh(root)
    assert (root.name, root.description) == ('Phone name', 'From Mac')


def test_the_same_edit_on_both_devices_is_not_a_conflict(client, test_user, root):
    _edit(client, test_user, root, description='Same')
    _edit(client, test_user, root, description='Same', _base={'description': 'Original'}, _edited_at=_at(-60))
    assert _conflicts(client, test_user) == []


def test_a_rejected_update_records_nothing(client, db_session, test_user, root):
    _edit(client, test_user, root, description='From Mac')
    response = _edit(client, test_user, root, name='', description='From phone',
                     _base={'description': 'Original'}, _edited_at=_at(60))
    assert response.status_code == 400
    assert db_session.query(SyncConflict).count() == 0
    db_session.refresh(root)
    assert root.description == 'From Mac'


def test_losing_note_text_is_recoverable(client, db_session, test_user, root):
    note = Note(id=_id(), root_id=root.id, context_type='root', context_id=root.id, content='Original')
    db_session.add(note)
    db_session.commit()
    url, headers = f'/api/{root.id}/notes/{note.id}', session_headers_for(test_user)
    client.put(url, json={'content': 'Mac text'}, headers=headers)
    response = client.put(url, json={'content': 'Phone text', '_base': {'content': 'Original'}, '_edited_at': _at(-5)},
                          headers=headers)
    assert response.status_code == 200
    assert response.get_json()['content'] == 'Mac text'
    assert _conflicts(client, test_user)[0]['lost_value'] == 'Phone text'


def test_strangers_cannot_merge_or_see_conflicts(client, db_session, test_user, stranger, root):
    _edit(client, test_user, root, description='From Mac')
    _edit(client, test_user, root, description='Phone', _base={'description': 'Original'}, _edited_at=_at(60))
    [conflict] = _conflicts(client, test_user)
    assert _edit(client, stranger, root, description='X', _base={}, _edited_at=_at(0)).status_code in (403, 404)
    assert _conflicts(client, stranger) == []
    assert client.post(f"/api/sync/conflicts/{conflict['id']}/resolve",
                       headers=session_headers_for(stranger)).status_code == 404


@pytest.mark.parametrize('metadata', [{'_base': 'x'}, {'_edited_at': 'yesterday'}, {'_edited_at': 5}])
def test_bad_merge_metadata_is_refused(client, test_user, root, metadata):
    assert _edit(client, test_user, root, name='N', **metadata).status_code == 400


def test_changes_name_the_instance_that_made_them(client, test_user, root):
    headers = session_headers_for(test_user)
    cursor = client.get('/api/sync/cursor', headers=headers).get_json()['cursor']
    instance = _id()
    client.post(f'/api/{root.id}/activity-groups', json={'name': 'A'}, headers={**headers, 'X-Client-Instance': instance})
    client.post(f'/api/{root.id}/activity-groups', json={'name': 'B'}, headers=headers)
    for _ in range(1200):  # transactions from other test runs on this server hold the feed back
        body = client.get('/api/sync/changes', query_string={'cursor': cursor, 'view': 'ids'}, headers=headers).get_json()
        if len([change for change in body['changes'] if change['type'] == 'activity_group']) == 2:
            break
        time.sleep(0.05)
    origins = [change['origin'] for change in body['changes'] if change['type'] == 'activity_group']
    assert origins == [instance, None]
    assert 'data' not in body['changes'][0]


def test_two_devices_create_under_one_parent_at_once(app, test_user, root):
    headers, root_id = session_headers_for(test_user), root.id

    def create(number):
        return app.test_client().post(f'/api/{root_id}/goals', headers=headers, json={
            'name': f'Child {number}', 'type': 'LongTermGoal', 'parent_id': root_id,
        }).status_code

    with ThreadPoolExecutor(max_workers=6) as pool:
        assert set(pool.map(create, range(12))) == {201}


def test_an_unchanged_field_resent_with_an_edit_is_not_an_edit(client, db_session, test_user, root):
    _edit(client, test_user, root, description='From Mac')
    response = _edit(client, test_user, root, name='Phone', description='Original',
                     _base={'name': 'Root', 'description': 'Original'}, _edited_at=_at(60))
    assert response.status_code == 200
    db_session.refresh(root)
    assert (root.name, root.description) == ('Phone', 'From Mac')
    assert _conflicts(client, test_user) == []


def test_an_offline_activitys_metrics_have_the_ids_its_device_expects(client, test_user, root):
    from services.circuit_ids import activity_metric_id, activity_split_id
    activity_id = _id()
    response = client.post(f'/api/{root.id}/activities', headers=session_headers_for(test_user), json={
        'id': activity_id, 'name': 'Press', 'has_metrics': True, 'has_splits': True,
        'metrics': [{'name': 'Reps', 'unit': 'reps'}, {'name': 'Weight', 'unit': 'kg'}],
        'splits': [{'name': 'Left'}, {'name': 'Right'}],
    })
    assert response.status_code in (200, 201), response.get_json()
    body = response.get_json()
    assert {m['name']: m['id'] for m in body['metric_definitions']} == {
        'Reps': activity_metric_id(activity_id, 0), 'Weight': activity_metric_id(activity_id, 1),
    }
    assert {s['id'] for s in body['split_definitions']} == {activity_split_id(activity_id, i) for i in range(2)}


def test_a_stale_template_edit_is_refused_not_merged(client, test_user, root):
    headers = session_headers_for(test_user)
    sections = lambda name: {'sections': [{'name': name, 'activities': []}]}
    template = client.post(f'/api/{root.id}/session-templates', headers=headers,
                           json={'name': 'T', 'template_data': sections('A')}).get_json()
    url = f"/api/{root.id}/session-templates/{template['id']}"

    def save(name, revision=None):
        body = {'template_data': sections(name), **({'expected_revision': revision} if revision else {})}
        return client.put(url, json=body, headers=headers)
    assert save('Mac', template['revision']).get_json()['revision'] == template['revision'] + 1
    stale = save('Phone', template['revision'])
    assert (stale.status_code, stale.get_json()['code']) == (409, 'template_changed')
    # The same content again is not a clash, and other fields are never blocked.
    assert save('Mac', template['revision']).status_code == 200
    assert client.put(url, json={'name': 'Renamed', 'expected_revision': 1}, headers=headers).status_code == 200
    assert save('Older app').status_code == 200


def test_a_session_started_offline_keeps_every_id_its_device_chose(client, db_session, test_user, root):
    from models import ActivitySet, CircuitRun
    from services import circuit_ids
    headers = session_headers_for(test_user)

    def make(path, body):
        response = client.post(f'/api/{root.id}/{path}', json=body, headers=headers)
        assert response.status_code in (200, 201), response.get_json()
        return response.get_json()
    press = make('activities', {'name': 'Press', 'has_sets': True, 'has_metrics': False})
    jump = make('activities', {'name': 'Jump', 'has_sets': False, 'has_metrics': False})
    circuit = make('circuits', {'name': 'Finisher', 'slots': [{'activity_definition_id': press['id']},
                                                             {'activity_definition_id': jump['id']}]})
    template = make('session-templates', {'name': 'T', 'template_data': {'sections': [{'name': 'Main', 'items': [
        {'type': 'activity', 'activity_id': press['id'], 'item_key': 'press-item', 'name': 'Press',
         'prescription': {'schema': 1, 'sets': [{'metrics': []}, {'metrics': []}]}},
        {'type': 'circuit', 'circuit_definition_id': circuit['id'], 'item_key': 'circuit-item'},
    ]}]}})
    session_id, instance_id, run_id = _id(), _id(), _id()
    body = {
        'id': session_id, 'name': 'T', 'template_id': template['id'], 'session_start': '2026-11-20T10:00:00Z',
        'session_data': {'template_id': template['id'], 'sections': [{'name': 'Main', 'items': [
            {'type': 'activity', 'activity_definition_id': press['id'], 'item_key': 'press-item', 'instance_id': instance_id},
            {'type': 'circuit', 'circuit_definition_id': circuit['id'], 'item_key': 'circuit-item', 'circuit_run_id': run_id},
        ]}]},
    }
    session = make('sessions', body)
    assert session['id'] == session_id
    items = session['attributes']['session_data']['sections'][0]['items']
    assert [item.get('activity_instance_id') or item.get('circuit_run_id') for item in items] == [instance_id, run_id]
    planned = db_session.query(ActivitySet.id).filter_by(activity_instance_id=instance_id).order_by(ActivitySet.sort_order)
    assert [row.id for row in planned] == [circuit_ids.planned_set_id(instance_id, index) for index in range(2)]
    run = db_session.get(CircuitRun, run_id)
    assert [item.id for item in run.rounds] == [circuit_ids.initial_round_id(run_id, 1)]
    again = client.post(f'/api/{root.id}/sessions', json=body, headers=headers)
    assert (again.status_code, again.get_json()['already_created']) == (409, True)
