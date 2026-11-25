"""Simulated devices against the real API: shared merge cases, then seeded faults.

Each device keeps a local copy from the feed, edits it while offline, and replays its queue in order
with lost answers, repeated sends and a wrong clock. When everything has synced, every device holds what
a fresh snapshot holds, and nothing a user wrote has vanished.
"""
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
import json
from pathlib import Path
import random
import time
import uuid

import pytest
from sqlalchemy import text

import models
from models import Goal, SyncConflict
from tests.conftest import session_headers_for

CASES = json.loads((Path(__file__).resolve().parents[1] / 'fixtures' / 'sync_merge_cases.json').read_text())
BASE_TIME = datetime.now(timezone.utc) - timedelta(days=1)


def _at(minutes):
    return (BASE_TIME + timedelta(minutes=minutes)).isoformat()


@pytest.fixture
def root(db_session, test_user):
    # Older than every simulated edit, as a goal being edited is.
    created = (BASE_TIME - timedelta(days=1)).replace(tzinfo=None)
    root = Goal(id=str(uuid.uuid4()), name='Root', description='Original', owner_id=test_user.id,
                created_at=created, updated_at=created)
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


@pytest.mark.parametrize('case', CASES['cases'], ids=lambda case: case['name'])
def test_shared_merge_cases(client, db_session, test_user, root, case):
    headers = session_headers_for(test_user)
    for edit in case['edits']:
        response = client.put(f'/api/{root.id}/goals/{root.id}', headers=headers, json={
            **edit['set'], '_base': {field: CASES['start'][field] for field in edit['set']}, '_edited_at': _at(edit['at']),
        })
        assert response.status_code == 200, response.get_json()
    result = client.get(f'/api/{root.id}/goals/{root.id}', headers=headers).get_json()
    assert {field: result[field] for field in case['result']} == case['result']
    db_session.expire_all()
    assert sorted(row.lost_value or '' for row in db_session.query(SyncConflict)) == sorted(case['lost'])


class Device:
    def __init__(self, client, headers, root_id, rng, name):
        self.client, self.headers, self.root_id, self.rng, self.name = client, headers, root_id, rng, name
        self.instance = str(uuid.uuid4())
        self.skew = rng.choice([0, 0, -3, 3])
        self.queue = []
        self.mirror, self.cursor = {}, None
        self._snapshot()

    def _get(self, path, **query):
        response = self.client.get(path, query_string={'limit': self.rng.choice([1, 3, 100]), **query}, headers=self.headers)
        assert response.status_code == 200, response.get_json()
        return response.get_json()

    def _snapshot(self):
        self.mirror, page = {}, None
        while self.cursor is None:
            body = self._get('/api/sync/snapshot', **({'page': page} if page else {}))
            self.mirror.update({(c['type'], c['id']): c['data'] for c in body['changes']})
            page, self.cursor = body['next_page'], body['cursor']

    def pull(self):
        while True:
            body = self._get('/api/sync/changes', cursor=self.cursor)
            for change in body['changes']:
                key = (change['type'], change['id'])
                if change['deleted']:
                    self.mirror.pop(key, None)
                else:
                    self.mirror[key] = change['data']
            self.cursor = body['cursor']
            if not body['has_more']:
                return

    def goals(self):
        return sorted(entity_id for kind, entity_id in self.mirror if kind == 'goal')

    def edit(self, goal_id, field, value, minute):
        goal = self.mirror['goal', goal_id]
        queued = [op for op in self.queue if op['url'].endswith(goal_id) and field in op['body']]
        seen = queued[-1]['body'][field] if queued else goal[field]
        self._queue('put', f'/api/{self.root_id}/goals/{goal_id}', {
            field: value, '_base': {field: seen}, '_edited_at': _at(minute + self.skew),
        })
        return seen

    def create_goal(self, name):
        goal_id = str(uuid.uuid4())
        self._queue('post', f'/api/{self.root_id}/goals', {
            'id': goal_id, 'name': name, 'type': 'LongTermGoal', 'parent_id': self.root_id,
        })
        return goal_id

    def create_note(self, content):
        self._queue('post', f'/api/{self.root_id}/notes', {
            'id': str(uuid.uuid4()), 'content': content, 'context_type': 'root', 'context_id': self.root_id,
        })

    def _queue(self, method, url, body):
        self.queue.append({'method': method, 'url': url, 'body': body, 'key': str(uuid.uuid4())})

    def push(self, faults):
        """Send in order. A lost answer stops the run; the next one resends the same write."""
        while self.queue:
            op = self.queue[0]
            if faults and self.rng.random() < 0.15:
                return  # never reached the server
            response = getattr(self.client, op['method'])(op['url'], json=op['body'], headers={
                **self.headers, 'Idempotency-Key': op['key'], 'X-Client-Instance': self.instance,
            })
            assert response.status_code in (200, 201), (op, response.get_json())
            if faults and self.rng.random() < 0.2:
                return  # applied, but the answer was lost
            self.queue.pop(0)


def _settle():
    for _ in range(1200):
        with models.get_engine().connect() as connection:
            held = connection.execute(text(
                'SELECT coalesce(max(xid), 0) >= pg_snapshot_xmin(pg_current_snapshot())::text::bigint FROM sync_changes'
            )).scalar()
        if not held:
            return
        time.sleep(0.05)


@pytest.mark.parametrize('seed', range(12))
def test_devices_converge_and_lose_nothing(client, db_session, test_user, root, seed):
    rng = random.Random(seed)
    headers, root_id = session_headers_for(test_user), root.id
    _settle()
    devices = [Device(client, headers, root_id, rng, name) for name in ('mac', 'phone')]
    written, seen_as_base, goals, notes = [], set(), set(), []
    for step in range(40):
        device = rng.choice(devices)
        action = rng.random()
        if action < 0.5:
            value, field = f'{device.name}-{step}', rng.choice(['name', 'description'])
            goal_id = rng.choice(device.goals())
            seen_as_base.add((goal_id, field, device.edit(goal_id, field, value, minute=step)))
            written.append((goal_id, field, value))
        elif action < 0.6:
            goals.add(device.create_goal(f'goal-{step}'))
        elif action < 0.7:
            notes.append(f'note-{seed}-{step}')
            device.create_note(notes[-1])
        elif action < 0.85:
            device.push(faults=True)
        else:
            device.pull()
    for device in devices:
        device.push(faults=False)
    _settle()
    for device in devices:
        device.pull()

    fresh = Device(client, headers, root_id, rng, 'fresh')
    for device in devices:
        assert device.mirror == fresh.mirror
    assert goals <= set(fresh.goals())
    # Each note exactly once, whatever was resent.
    assert sorted(data['content'] for (kind, _), data in fresh.mirror.items() if kind == 'note') == sorted(notes)
    # What a user wrote is there, set aside for them, or was replaced by someone looking at it.
    set_aside = {(row.entity_id, row.field, row.lost_value) for row in db_session.query(SyncConflict)}
    for goal_id, field, value in written:
        kept = fresh.mirror['goal', goal_id][field] == value
        assert kept or (goal_id, field, value) in set_aside or (goal_id, field, value) in seen_as_base, (goal_id, field, value)


def test_edits_arriving_at_once_are_all_kept_or_set_aside(app, db_session, test_user, root):
    headers, root_id = session_headers_for(test_user), root.id
    edits = [f'edit {number}' for number in range(16)]

    def send(number):
        return app.test_client().put(f'/api/{root_id}/goals/{root_id}', headers=headers, json={
            'description': edits[number], '_base': {'description': 'Original'}, '_edited_at': _at(number),
        }).status_code

    with ThreadPoolExecutor(max_workers=8) as pool:
        assert set(pool.map(send, range(16))) == {200}
    db_session.expire_all()
    set_aside = [row.lost_value for row in db_session.query(SyncConflict)]
    kept = db_session.get(Goal, root_id).description
    assert kept == edits[-1]
    assert sorted([*set_aside, kept]) == sorted(edits)
