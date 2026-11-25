import importlib
from datetime import timedelta
import time
import uuid

import pytest
from sqlalchemy import inspect, text

import models
from config import config
from models import (
    ActivityDefinition, ActivityInstance, ActivitySet, Base, Goal, Note, Session, SyncChange, User, utc_now,
)
from models.sync import SYNC_CHILDREN, SYNC_ENTITIES, SYNC_EXCLUDED, sync_trigger_statements, synced_tables
from services.demo_snapshot_service import reachable_fractal_tables
from services.sync_feed_service import prune_sync_changes, reset_sync_epoch
from tests.conftest import session_headers_for


def _id():
    return str(uuid.uuid4())


@pytest.fixture
def root(db_session, test_user):
    root = Goal(id=_id(), name='Root', owner_id=test_user.id)
    root.root_id = root.id
    db_session.add(root)
    db_session.commit()
    return root


@pytest.fixture
def headers(test_user):
    return session_headers_for(test_user)


def _settle(client):
    """Transactions anywhere on the server hold the feed back; wait out other test runs."""
    for _ in range(1200):
        with models.get_engine().connect() as connection:
            held = connection.execute(text(
                'SELECT coalesce(max(xid), 0) >= pg_snapshot_xmin(pg_current_snapshot())::text::bigint FROM sync_changes'
            )).scalar()
        if not held:
            return
        time.sleep(0.05)


def _snapshot(client, headers, limit=100):
    _settle(client)
    items, page = {}, None
    while True:
        query = {'limit': limit, **({'page': page} if page else {})}
        response = client.get('/api/sync/snapshot', query_string=query, headers=headers)
        assert response.status_code == 200, response.get_json()
        body = response.get_json()
        items.update({(c['type'], c['id']): c['data'] for c in body['changes']})
        page = body['next_page']
        if not page:
            return items, body['cursor']


def _changes(client, headers, cursor, limit=100, settle=True):
    if settle:
        _settle(client)
    items = {}
    while True:
        response = client.get('/api/sync/changes', query_string={'cursor': cursor, 'limit': limit}, headers=headers)
        assert response.status_code == 200, response.get_json()
        body = response.get_json()
        items.update({(c['type'], c['id']): c for c in body['changes']})
        cursor = body['cursor']
        if not body['has_more']:
            return items, cursor


def _session_with_set(db_session, root):
    activity = ActivityDefinition(id=_id(), root_id=root.id, name='Scales', has_sets=True)
    session = Session(id=_id(), root_id=root.id, owner_id=root.owner_id, name='Practice')
    db_session.add_all([activity, session])
    db_session.flush()
    instance = ActivityInstance(id=_id(), root_id=root.id, session_id=session.id, activity_definition_id=activity.id)
    db_session.add(instance)
    db_session.flush()
    activity_set = ActivitySet(id=_id(), activity_instance_id=instance.id, sort_order=0)
    db_session.add(activity_set)
    db_session.commit()
    return activity, session, activity_set


def test_every_fractal_table_is_classified_once():
    synced = set(synced_tables())
    reachable = reachable_fractal_tables() | {'goal_levels'}
    assert reachable - synced - set(SYNC_EXCLUDED) == set(), 'classify new tables in models/sync.py'
    assert not synced & set(SYNC_EXCLUDED)
    assert synced <= set(Base.metadata.tables)


def test_every_path_follows_a_real_foreign_key():
    for table_name, paths in SYNC_CHILDREN.items():
        for entity, path in paths:
            table, column = Base.metadata.tables[table_name], path[0]
            for hop_table, hop_column in path[1:]:
                assert hop_table in {fk.column.table.name for fk in table.c[column].foreign_keys}
                table, column = Base.metadata.tables[hop_table], hop_column
            assert SYNC_ENTITIES[entity] in {fk.column.table.name for fk in table.c[column].foreign_keys}


def test_migration_triggers_match_the_models():
    migration = importlib.import_module('migrations.versions.d4c8a1f6e2b9_device_sessions_and_sync_log')
    assert migration.synced_tables() == synced_tables()
    for table in synced_tables():
        assert list(migration.sync_trigger_statements(table)) == list(sync_trigger_statements(table))


def test_snapshot_pages_equal_one_read_and_are_private(client, db_session, root, headers):
    _session_with_set(db_session, root)
    other = User(username='sync-other', email='sync-other@example.test',
                 terms_accepted_version=config.TERMS_VERSION, privacy_accepted_version=config.PRIVACY_VERSION)
    other.set_password('SyncOther123!')
    db_session.add(other)
    db_session.commit()
    whole, _ = _snapshot(client, headers)
    paged, _ = _snapshot(client, headers, limit=1)
    assert paged == whole
    assert {'goal', 'session', 'activity'} <= {kind for kind, _ in whole}
    others, cursor = _snapshot(client, session_headers_for(other))
    assert not others
    db_session.get(Goal, root.id).name = 'Private'
    db_session.commit()
    assert _changes(client, session_headers_for(other), cursor)[0] == {}


def test_feed_replayed_over_a_snapshot_equals_a_fresh_read(client, db_session, root, headers):
    mirror, cursor = _snapshot(client, headers)
    _activity, session, _set = _session_with_set(db_session, root)
    child = Goal(id=_id(), root_id=root.id, parent_id=root.id, owner_id=root.owner_id, name='Child')
    db_session.add(child)
    db_session.commit()
    db_session.add(Note(id=_id(), root_id=root.id, context_type='session', context_id=session.id,
                        session_id=session.id, content='A note'))
    child.deleted_at = utc_now()
    db_session.commit()
    changes, _ = _changes(client, headers, cursor, limit=1)
    for key, change in changes.items():
        if change['deleted']:
            mirror.pop(key, None)
        else:
            mirror[key] = change['data']
    assert changes[('goal', child.id)]['deleted'] is True
    assert mirror == _snapshot(client, headers)[0]


def test_a_child_write_marks_its_session_once(client, db_session, root, headers):
    _activity, session, activity_set = _session_with_set(db_session, root)
    _, cursor = _snapshot(client, headers)
    activity_set.sort_order = 3
    db_session.commit()
    changes, cursor = _changes(client, headers, cursor)
    assert set(changes) == {('session', session.id)}
    db_session.delete(activity_set)
    db_session.commit()
    changes, cursor = _changes(client, headers, cursor)
    assert ('session', session.id) in changes
    assert _changes(client, headers, cursor)[0] == {}


def test_a_transaction_that_commits_late_is_not_skipped(client, db_session, root, headers):
    """The change that a sequence-numbered feed would lose."""
    _, cursor = _snapshot(client, headers)
    engine = models.get_engine()
    early, late = _id(), _id()
    insert = text("INSERT INTO goals (id, root_id, parent_id, owner_id, name, created_at, completed, row_version, "
                  "inherit_parent_activities, track_activities, paused) "
                  "VALUES (:id, :root, :root, :owner, 'g', now(), false, 1, false, true, false)")
    root_id, owner_id = root.id, root.owner_id
    db_session.rollback()
    with engine.connect() as slow:
        slow.execute(insert, {'id': early, 'root': root_id, 'owner': owner_id})
        with engine.begin() as quick:
            quick.execute(insert, {'id': late, 'root': root_id, 'owner': owner_id})
        seen, cursor = _changes(client, headers, cursor, settle=False)
        assert ('goal', early) not in seen
        slow.commit()
    rest, _ = _changes(client, headers, cursor)
    assert {key for key in {**seen, **rest}} == {('goal', early), ('goal', late)}


def test_deleting_a_fractal_reports_its_root(client, db_session, root, headers):
    root_id = root.id
    _, cursor = _snapshot(client, headers)
    root.deleted_at = utc_now()
    db_session.commit()
    assert _changes(client, headers, cursor)[0][('goal', root_id)]['deleted'] is True
    assert _snapshot(client, headers)[0] == {}


def test_hard_deleting_a_user_leaves_no_log(db_session, root, test_user):
    db_session.execute(text('DELETE FROM goals WHERE id = :id'), {'id': root.id})
    db_session.execute(text('DELETE FROM users WHERE id = :id'), {'id': test_user.id})
    db_session.commit()
    assert db_session.query(SyncChange).count() == 0


@pytest.mark.parametrize('cursor', [None, 'not-base64!', 'e30=', 'WzFd', 'é'])
def test_bad_cursors_are_refused(client, headers, cursor):
    query = {'cursor': cursor} if cursor else {}
    assert client.get('/api/sync/changes', query_string=query, headers=headers).status_code in (400, 410)


def test_pruned_and_restored_logs_send_devices_to_a_snapshot(client, db_session, root, headers):
    _, stale = _snapshot(client, headers)
    root.name = 'Renamed'
    db_session.commit()
    _, current = _changes(client, headers, stale)
    later = utc_now() + timedelta(days=config.SYNC_CHANGE_RETENTION_DAYS + 1)
    assert prune_sync_changes(db_session, now=later) > 0
    db_session.commit()

    def status(cursor):
        return client.get('/api/sync/changes', query_string={'cursor': cursor}, headers=headers).status_code
    assert status(stale) == 410
    assert status(current) == 200
    reset_sync_epoch(db_session)
    db_session.commit()
    assert status(current) == 410
    _, fresh = _snapshot(client, headers)
    assert status(fresh) == 200


def test_triggers_exist_on_every_synced_table(db_session):
    names = set(db_session.execute(text("SELECT tgname FROM pg_trigger WHERE tgname LIKE 'sync\\_%'")).scalars())
    expected = {f'sync_{op}_{table}' for table in synced_tables() for op in ('ins', 'upd', 'del')}
    assert expected <= names
    assert inspect(models.get_engine()).has_table('sync_changes')


def test_the_demo_accounts_snapshots_are_not_logged(db_session, root, test_user):
    db_session.execute(text('DELETE FROM sync_changes'))
    db_session.get(User, test_user.id).role = 'demo'
    db_session.commit()
    root.name = 'Published'
    db_session.commit()
    assert db_session.query(SyncChange).count() == 0
