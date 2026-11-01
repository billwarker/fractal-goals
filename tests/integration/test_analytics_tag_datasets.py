"""Tag datasets in the analytics catalog: queryable like the charts' group-by, tenant-scoped."""
import uuid
from datetime import datetime, timezone

from config import config
from models import (
    ActivityDefinition, ActivityInstance, ActivityInstanceTag, ActivityTagDefinition, ActivityTagFamily, Goal, Session, User,
)


def _fractal_with_tagged_instance(db_session, owner_id, tag_name, *, deleted=False):
    root = Goal(id=str(uuid.uuid4()), name=f'{tag_name} root', owner_id=owner_id)
    root.root_id = root.id
    db_session.add(root)
    db_session.flush()
    family = ActivityTagFamily(root_id=root.id, name=f'{tag_name} family', single_select=True)
    db_session.add(family)
    db_session.flush()
    tag = ActivityTagDefinition(root_id=root.id, name=tag_name, family_id=family.id)
    activity = ActivityDefinition(id=str(uuid.uuid4()), root_id=root.id, name=f'{tag_name} activity')
    session = Session(id=str(uuid.uuid4()), root_id=root.id, owner_id=owner_id, name='Practice',
                      session_start=datetime(2026, 3, 2, tzinfo=timezone.utc))
    db_session.add_all([tag, activity, session])
    db_session.flush()
    instance = ActivityInstance(id=str(uuid.uuid4()), root_id=root.id, session_id=session.id, activity_definition_id=activity.id,
                                deleted_at=datetime(2026, 3, 3, tzinfo=timezone.utc) if deleted else None)
    db_session.add(instance)
    db_session.flush()
    db_session.add(ActivityInstanceTag(activity_instance_id=instance.id, tag_definition_id=tag.id))
    db_session.commit()
    return root, tag


def _run(client, dataset, fields):
    response = client.post('/api/analytics/query/run', json={'query_spec': {'version': 1, 'dataset': dataset, 'fields': fields, 'limit': 50}})
    assert response.status_code == 200, response.get_json()
    return response.get_json()['rows']


def test_tag_datasets_are_scoped_to_the_users_fractals_and_skip_deleted_instances(authed_client, db_session, test_user):
    other = User(id=str(uuid.uuid4()), username='otherowner', email='other-owner@example.com',
                 terms_accepted_version=config.TERMS_VERSION, privacy_accepted_version=config.PRIVACY_VERSION)
    other.set_password('Password123')
    db_session.add(other)
    db_session.commit()
    _root, mine = _fractal_with_tagged_instance(db_session, test_user.id, 'technique')
    _fractal_with_tagged_instance(db_session, test_user.id, 'archived-link', deleted=True)
    _fractal_with_tagged_instance(db_session, other.id, 'not-mine')

    tags = {row['name'] for row in _run(authed_client, 'activity_tag_definitions', ['name'])}
    assert tags == {'technique', 'archived-link'}
    families = _run(authed_client, 'activity_tag_families', ['name', 'single_select'])
    assert {(row['name'], row['single_select']) for row in families} == {('technique family', True), ('archived-link family', True)}
    # Links on a deleted instance are hidden; another user's are never visible.
    links = _run(authed_client, 'activity_instance_tags', ['tag_definition_id'])
    assert links == [{'tag_definition_id': mine.id}]


def test_the_catalog_lists_the_tag_datasets(authed_client):
    datasets = {dataset['id'] for dataset in authed_client.get('/api/analytics/catalog').get_json()['datasets']}
    assert {'activity_tag_families', 'activity_tag_definitions', 'activity_instance_tags', 'activity_set_tags'} <= datasets
