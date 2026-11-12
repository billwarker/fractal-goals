"""Demo snapshots: publishing copies the chosen fractals into the demo account (services/demo_snapshot_service.py)."""
import datetime
import uuid

import pytest

from blueprints.demo_access import DEMO_ROOT_READ_ENDPOINTS
from config import config
from models import (
    ActivityInstance, ActivityInstanceTag, ActivityProgressDefault, ActivityProgressDefaultTag, ActivityTagDefinition, ActivityTagFamily, AppSetting, Base, EventLog, Goal, GoalLevel,
    Note, Session, User,
)
from scripts.browser_showcase_seed import SHOWCASE_ROOT_ID, seed_showcase
from services.demo_account_service import DEMO_ACCOUNT_ROLE, DemoAccountService
from services.demo_snapshot_service import (
    COPY_TABLES, EXCLUDED_TABLES, DemoSnapshotService, reachable_fractal_tables,
)
from services.landing_publish_service import LandingPublishService
from tests.conftest import session_headers_for
from tests.integration.test_demo_access import full_app  # noqa: F401  (fixture)

SOURCE = SHOWCASE_ROOT_ID
CLOCK_KEYS = {'cutoff'}


@pytest.fixture
def showcase(db_session):
    """The browser fixture's showcase fractal, plus an owner-wide level override and a deleted goal."""
    now = datetime.datetime.now(datetime.timezone.utc)
    db_session.add(GoalLevel(id='browser-ultimate-level', name='Ultimate Goal', rank=0, color='#000000', icon='circle'))
    db_session.commit()
    seed_showcase(db_session, now, config)
    owner = db_session.get(User, 'sweep-admin')
    owner.preferences = {'completed_primary_color': '#ffaa00', 'theme': 'private'}
    db_session.add(GoalLevel(id='owner-wide-ultimate', name='Ultimate Goal', rank=0, color='#123456',
                             icon='star', owner_id=owner.id))
    db_session.add(Goal(id='sweep-goal-deleted', root_id=SOURCE, parent_id=SOURCE, owner_id=owner.id,
                        name='Dropped idea', deleted_at=now))
    db_session.get(Goal, 'sweep-goal-ii-v-i').completed_session_id = 'sweep-session-0'
    # Tags: their names are database-generated columns, which a copy must leave to the database.
    db_session.add(ActivityTagFamily(id='sweep-tag-family', root_id=SOURCE, name='Feel'))
    db_session.flush()
    db_session.add(ActivityTagDefinition(id='sweep-tag', root_id=SOURCE, name='Swung', family_id='sweep-tag-family'))
    db_session.flush()
    db_session.add(ActivityInstanceTag(activity_instance_id='sweep-instance-0-comping', tag_definition_id='sweep-tag'))
    # A remembered progress default that the source's instances predate: the database applies
    # it to new instances, but the copy must keep each instance as it was.
    db_session.add(ActivityProgressDefault(id='sweep-progress-default', root_id=SOURCE,
                                           activity_definition_id='sweep-activity-comping',
                                           session_template_id='sweep-template', compare_mode='best',
                                           same_template=True))
    db_session.flush()
    db_session.add(ActivityProgressDefaultTag(default_id='sweep-progress-default', tag_definition_id='sweep-tag'))
    # A globally unique value that isn't a reference: the copy needs its own.
    db_session.get(EventLog, 'sweep-event-0-0').event_id = str(uuid.uuid4())
    db_session.commit()
    return owner


def _publish(db_session, **tour):
    service = LandingPublishService(db_session)
    _, error, _ = service.update_landing_example_settings({'examples': [
        {'root_id': SOURCE, 'label': 'Jazz guitar', 'sort_order': 0, 'tour': tour},
    ]})
    assert error is None
    payload, error, _ = service.publish_landing_examples()
    assert error is None, error
    return payload['examples'][0]['snapshot']['root_id']


def _manifest(db_session):
    db_session.expire_all()
    return db_session.get(AppSetting, 'landing_example_cache').value


def _references(db_session, root_id, values):
    """Where the copy at `root_id` still mentions any of `values`, JSON included."""
    def mentions(value):
        if isinstance(value, str):
            return value in values
        if isinstance(value, list):
            return any(mentions(item) for item in value)
        if isinstance(value, dict):
            return any(mentions(key) or mentions(item) for key, item in value.items())
        return False

    return [
        f'{table}.{column}'
        for table, rows in DemoSnapshotService(db_session).collect(root_id).items()
        for row in rows.values()
        for column, value in row.items()
        if mentions(value)
    ]


def _differences(demo, source, path=''):
    if isinstance(demo, dict) and isinstance(source, dict):
        for key in sorted(set(demo) | set(source), key=str):
            yield from _differences(demo.get(key, '<missing>'), source.get(key, '<missing>'), f'{path}.{key}')
    elif isinstance(demo, list) and isinstance(source, list) and len(demo) == len(source):
        for index, (left, right) in enumerate(zip(demo, source)):
            yield from _differences(left, right, f'{path}[{index}]')
    elif demo != source:
        yield f'{path}: demo={demo!r} source={source!r}'


def assert_same(demo, source, label):
    differences = list(_differences(demo, source))
    assert not differences, f'{label}\n' + '\n'.join(differences[:10])


@pytest.mark.integration
class TestDemoSnapshots:
    def test_every_table_a_fractal_reaches_is_classified(self):
        unclassified = reachable_fractal_tables() - COPY_TABLES - set(EXCLUDED_TABLES)
        assert not unclassified, (
            f'New tables reach a fractal: {sorted(unclassified)}. Add each to COPY_TABLES '
            '(visitors should see it in the demo) or EXCLUDED_TABLES (with the reason) in '
            'services/demo_snapshot_service.py.'
        )
        assert not (COPY_TABLES & set(EXCLUDED_TABLES))

    def test_the_demo_matches_the_source_page_for_page(self, full_app, db_session, showcase):  # noqa: F811
        """Every allow-listed fractal page reads the same on the snapshot as on the source, ids mapped back."""
        account = DemoAccountService(db_session).ensure()
        result = DemoSnapshotService(db_session).snapshot(SOURCE, str(uuid.uuid4()), account.id)
        db_session.add(AppSetting(key='landing_example_cache', value={
            'examples': [{'root_id': result.root_id, 'label': 'Jazz guitar'}],
        }))
        db_session.commit()
        client = full_app.test_client()
        demo_headers = {'Authorization': f"Bearer {client.post('/api/public/demo-session').get_json()['token']}"}
        owner_headers = session_headers_for(showcase)
        back = {copy: source for source, copy in result.id_map.items()}
        back[account.id] = showcase.id

        def to_source(value):
            if isinstance(value, str):
                return back.get(value, value)
            if isinstance(value, list):
                return [to_source(item) for item in value]
            if isinstance(value, dict):
                return {back.get(key, key): to_source(item) for key, item in value.items()}
            return value

        def comparable(value):
            # Copied sort values keep any order the app defines; only id tie-breaks and
            # unordered lists can differ (the ids do). Clock-relative values move between requests.
            if isinstance(value, list):
                items = [comparable(item) for item in value]
                if all(isinstance(item, (str, int, float)) or item is None for item in items):
                    return sorted(items, key=repr)
                if all(isinstance(item, dict) and 'id' in item for item in items):
                    return sorted(items, key=lambda item: str(item['id']))
                return items
            if isinstance(value, dict):
                return {key: ('<now>' if key in CLOCK_KEYS else comparable(item)) for key, item in value.items()}
            return value

        compared = []
        for rule in full_app.url_map.iter_rules():
            if rule.endpoint not in DEMO_ROOT_READ_ENDPOINTS or rule.arguments != {'root_id'}:
                continue
            source = client.get(rule.rule.replace('<root_id>', SOURCE), headers=owner_headers)
            demo = client.get(rule.rule.replace('<root_id>', result.root_id), headers=demo_headers)
            assert demo.status_code == source.status_code, rule.rule
            if source.status_code == 200 and source.is_json:
                assert_same(comparable(to_source(demo.get_json())), comparable(source.get_json()), rule.rule)
                compared.append(rule.rule)
        assert len(compared) >= 20, compared

        # Pages that take a second id: a session and a goal, through the map.
        for path in ('/api/{root}/sessions/{session}', '/api/{root}/goals/{goal}'):
            source = client.get(path.format(root=SOURCE, session='sweep-session-0', goal='sweep-goal-ii-v-i'),
                                headers=owner_headers)
            demo = client.get(path.format(root=result.root_id, session=result.id_map['sweep-session-0'],
                                          goal=result.id_map['sweep-goal-ii-v-i']), headers=demo_headers)
            assert demo.status_code == source.status_code, path
            if source.status_code == 200:
                assert_same(comparable(to_source(demo.get_json())), comparable(source.get_json()), path)

    def test_levels_keep_the_fractals_look(self, client, db_session, showcase):
        snapshot_id = _publish(db_session)
        demo_headers = {'Authorization': f"Bearer {client.post('/api/public/demo-session').get_json()['token']}"}
        owner_headers = session_headers_for(showcase)

        def styles(root_id, headers):
            levels = client.get(f'/api/goal-levels?root_id={root_id}', headers=headers).get_json()
            return sorted((level['name'], level['color'], level['icon']) for level in levels)

        assert styles(snapshot_id, demo_headers) == styles(SOURCE, owner_headers)

    def test_the_manifest_is_small_and_points_at_the_snapshot(self, db_session, showcase):
        snapshot_id = _publish(db_session, session_id='sweep-session-3', program_id='sweep-program')
        example = _manifest(db_session)['examples'][0]
        assert set(example) == {'root_id', 'label', 'sort_order', 'root_name', 'icon', 'tour', 'appearance'}
        assert example['root_id'] == snapshot_id
        assert example['root_name'] == 'Play jazz guitar at a jam session'
        assert example['appearance'] == {'completed_primary_color': '#ffaa00'}
        tour = example['tour']
        copied_session = db_session.get(Session, tour['session_id'])
        assert copied_session.root_id == snapshot_id
        assert copied_session.session_start == db_session.get(Session, 'sweep-session-3').session_start
        assert db_session.get(Goal, tour['goal_id']).root_id == snapshot_id
        assert tour['program_id'] and tour['program_id'] != 'sweep-program'

    def test_the_copy_is_isolated_from_the_source(self, db_session, showcase):
        snapshot_id = _publish(db_session)
        source_ids = {
            row['id'] for rows in DemoSnapshotService(db_session).collect(SOURCE).values()
            for row in rows.values() if 'id' in row
        }
        assert snapshot_id not in source_ids
        assert _references(db_session, snapshot_id, source_ids | {showcase.id}) == []
        demo_account = DemoAccountService(db_session).get()
        assert {goal.owner_id for goal in db_session.query(Goal).filter(Goal.root_id == snapshot_id)} == {demo_account.id}
        # Database triggers on insert didn't rewrite the copied instances.
        copied_instances = db_session.query(ActivityInstance).filter(ActivityInstance.root_id == snapshot_id).all()
        assert len(copied_instances) == 42
        assert {instance.progress_compare_mode for instance in copied_instances} == {None}
        assert db_session.query(EventLog).filter(EventLog.root_id == snapshot_id).count() == \
            db_session.query(EventLog).filter(EventLog.root_id == SOURCE).count()
        # The deleted goal and the cycle through a completing session come across as they were.
        copied = {goal.name: goal for goal in db_session.query(Goal).filter(Goal.root_id == snapshot_id)}
        assert copied['Dropped idea'].deleted_at is not None
        assert db_session.get(Session, copied[db_session.get(Goal, 'sweep-goal-ii-v-i').name].completed_session_id).root_id == snapshot_id

        # Later edits to the source stay out of the demo until the next publish.
        db_session.get(Goal, 'sweep-goal-ii-v-i').name = 'Renamed after publishing'
        db_session.add(Note(id='late-note', root_id=SOURCE, context_type='root', context_id=SOURCE, content='Private'))
        db_session.commit()
        assert db_session.query(Goal).filter(Goal.root_id == snapshot_id, Goal.name == 'Renamed after publishing').count() == 0
        assert db_session.query(Note).filter(Note.root_id == snapshot_id, Note.content == 'Private').count() == 0

    def test_republishing_keeps_the_links_and_leaves_nothing_behind(self, db_session, showcase):
        first = _publish(db_session)
        first_tour = _manifest(db_session)['examples'][0]['tour']
        counts = {table.name: db_session.execute(table.select()).fetchall().__len__() for table in Base.metadata.sorted_tables}
        db_session.get(Goal, 'sweep-goal-ii-v-i').name = 'Renamed before republishing'
        db_session.commit()
        second = _publish(db_session)
        assert second == first
        assert _manifest(db_session)['examples'][0]['tour'] == first_tour  # deep links survive
        after = {table.name: db_session.execute(table.select()).fetchall().__len__() for table in Base.metadata.sorted_tables}
        assert {name: count for name, count in after.items() if count != counts[name]} == {}
        assert db_session.query(Goal).filter(Goal.root_id == second, Goal.name == 'Renamed before republishing').count() == 1

        # Unpublishing removes the copy.
        service = LandingPublishService(db_session)
        service.update_landing_example_settings({'examples': []})
        service.publish_landing_examples()
        db_session.expire_all()
        assert db_session.query(Goal).filter(Goal.root_id == first).count() == 0
        assert db_session.query(GoalLevel).filter(GoalLevel.root_id == first).count() == 0

    def test_only_demo_snapshots_can_be_purged(self, db_session, showcase):
        _publish(db_session)
        account = DemoAccountService(db_session).get()
        with pytest.raises(PermissionError):
            DemoSnapshotService(db_session).purge(SOURCE, account.id)

    def test_nobody_signs_in_to_the_demo_account(self, client, db_session, showcase):
        _publish(db_session)
        account = DemoAccountService(db_session).get()
        assert account.role == DEMO_ACCOUNT_ROLE
        response = client.post('/api/auth/login', json={'username_or_email': account.username, 'password': 'x'})
        assert response.status_code == 401
        admin_headers = session_headers_for(showcase)
        users = client.get('/api/admin/users', headers=admin_headers).get_json()['users']
        assert account.id not in {user['id'] for user in users}

    def test_a_failed_delivery_leaves_the_previous_demo(self, db_session, showcase, monkeypatch):
        first = _publish(db_session)
        before = _manifest(db_session)
        monkeypatch.setattr(LandingPublishService, '_write_landing_static_snapshot',
                            classmethod(lambda cls, cache, **kwargs: 'failed'))
        db_session.get(Goal, 'sweep-goal-ii-v-i').name = 'Never published'
        db_session.commit()
        _, error, status = LandingPublishService(db_session).publish_landing_examples()
        assert status == 503 and error
        assert _manifest(db_session) == before
        assert db_session.query(Goal).filter(Goal.root_id == first, Goal.name == 'Never published').count() == 0
        assert db_session.query(Goal).filter(Goal.root_id == first).count() > 0
