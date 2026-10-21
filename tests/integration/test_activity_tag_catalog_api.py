"""One tag identity per fractal: unique names, universal assignment, merges, and families."""

import json
from pathlib import Path
from uuid import uuid4

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityInstanceCompareTag,
    ActivityInstanceTag,
    ActivitySet,
    ActivitySetTag,
    ActivityTagDefinition,
    Goal,
    SessionTemplate,
    User,
)

NAME_CASES = json.loads((Path(__file__).resolve().parents[1] / 'fixtures' / 'tag_name_normalization_cases.json').read_text())


def _create(client, root_id, name, **extra):
    return client.post(f'/api/{root_id}/activity-tags', json={'name': name, **extra})


def _catalog(client, root_id):
    return client.get(f'/api/{root_id}/activity-tags').get_json()


def _other_activity_instance(db_session, sample_activity_instance):
    activity = ActivityDefinition(id=str(uuid4()), root_id=sample_activity_instance.root_id, name='Row', has_sets=True)
    db_session.add(activity)
    db_session.flush()
    instance = ActivityInstance(
        id=str(uuid4()), root_id=activity.root_id, session_id=sample_activity_instance.session_id,
        activity_definition_id=activity.id,
    )
    db_session.add(instance)
    db_session.commit()
    return activity, instance


@pytest.mark.integration
def test_any_tag_can_be_assigned_to_any_activity(authed_client, db_session, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    tag = _create(authed_client, root_id, 'Rehab', color='#22AA77').get_json()
    assert set(tag) >= {'id', 'name', 'normalized_name', 'family_id', 'usage', 'activities'}
    assert 'scope' not in tag and 'bindings' not in tag
    activity, other = _other_activity_instance(db_session, sample_activity_instance)

    for instance_id in (sample_activity_instance.id, other.id):
        assigned = authed_client.put(f'/api/{root_id}/activity-instances/{instance_id}/tags', json={'tag_ids': [tag['id']]})
        assert assigned.status_code == 200, assigned.get_json()
        assert [row['id'] for row in assigned.get_json()['tags']] == [tag['id']]

    refreshed = next(row for row in _catalog(authed_client, root_id)['tags'] if row['id'] == tag['id'])
    assert refreshed['usage']['instances'] == 2
    assert {row['name'] for row in refreshed['activities']} == {sample_activity_instance.definition.name, activity.name}
    db_session.expire_all()
    assert db_session.get(ActivityInstance, other.id).tag_signature == tag['id']


@pytest.mark.integration
def test_names_are_unique_per_fractal_including_archived_tags(authed_client, db_session, sample_ultimate_goal, test_user):
    root_id = sample_ultimate_goal.id
    rehab = _create(authed_client, root_id, '  Rehab ').get_json()
    assert rehab['name'] == 'Rehab'

    duplicate = _create(authed_client, root_id, 'REHAB')
    assert duplicate.status_code == 409
    assert duplicate.get_json()['details'] == {'code': 'tag_name_taken', 'existing': {'id': rehab['id'], 'name': 'Rehab', 'archived': False}}

    other = _create(authed_client, root_id, 'Mobility').get_json()
    renamed = authed_client.put(f'/api/{root_id}/activity-tags/{other["id"]}', json={'version': other['version'], 'name': 're hab'})
    assert renamed.status_code == 200
    rename_conflict = authed_client.put(f'/api/{root_id}/activity-tags/{other["id"]}', json={'version': renamed.get_json()['version'], 'name': 'rehab'})
    assert rename_conflict.status_code == 409
    assert rename_conflict.get_json()['details']['existing']['id'] == rehab['id']

    archived = authed_client.post(f'/api/{root_id}/activity-tags/{rehab["id"]}/archive', json={'version': rehab['version']})
    assert archived.status_code == 200
    while_archived = _create(authed_client, root_id, 'rehab')
    assert while_archived.status_code == 409
    assert while_archived.get_json()['details']['existing']['archived'] is True
    restored = authed_client.post(f'/api/{root_id}/activity-tags/{rehab["id"]}/restore', json={'version': archived.get_json()['version']})
    assert restored.status_code == 200

    # The database is the final guard, whatever the write path.
    db_session.add(ActivityTagDefinition(root_id=root_id, name='rehab\t'))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    other_root = Goal(id=str(uuid4()), name='Other', owner_id=test_user.id, level_id=sample_ultimate_goal.level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.commit()
    assert _create(authed_client, other_root.id, 'Rehab').status_code == 201


@pytest.mark.integration
def test_database_normalization_matches_the_shared_fixture(db_session):
    for case in NAME_CASES:
        normalized = db_session.execute(
            text(r"SELECT btrim(regexp_replace(lower(:name), '\s+', ' ', 'g'))"), {'name': case['input']},
        ).scalar()
        assert normalized == case['normalized'], case


@pytest.mark.integration
def test_tag_links_must_stay_inside_their_fractal(db_session, sample_activity_instance, sample_ultimate_goal, test_user):
    other_root = Goal(id=str(uuid4()), name='Other', owner_id=test_user.id, level_id=sample_ultimate_goal.level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.flush()
    foreign = ActivityTagDefinition(root_id=other_root.id, name='Foreign')
    db_session.add(foreign)
    db_session.commit()
    db_session.add(ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=foreign.id))
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()


@pytest.mark.integration
def test_hard_delete_removes_links_plans_and_bumps_versions(authed_client, db_session, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    tag = _create(authed_client, root_id, 'Competition').get_json()
    activity_set = ActivitySet(activity_instance_id=sample_activity_instance.id, sort_order=0, status='completed')
    db_session.add(activity_set)
    db_session.flush()
    db_session.add_all([
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=tag['id']),
        ActivitySetTag(activity_set_id=activity_set.id, tag_definition_id=tag['id']),
        ActivityInstanceCompareTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=tag['id']),
    ])
    template = SessionTemplate(id=str(uuid4()), name='Meet', root_id=root_id, template_data={'sections': [{'items': [{
        'type': 'activity', 'activity_definition_id': sample_activity_instance.activity_definition_id,
        'prescription': {'schema': 1, 'tags': [tag['id']]},
    }]}]})
    db_session.add(template)
    db_session.commit()
    before = (sample_activity_instance.tag_assignment_version, activity_set.tag_assignment_version)

    impact = authed_client.get(f'/api/{root_id}/activity-tags/{tag["id"]}/impact').get_json()
    assert impact['requires_typed_confirmation'] is True
    assert authed_client.post(f'/api/{root_id}/activity-tags/{tag["id"]}/hard-delete', json={'version': tag['version'], 'confirmation_name': 'wrong'}).status_code == 400
    deleted = authed_client.post(f'/api/{root_id}/activity-tags/{tag["id"]}/hard-delete', json={'version': tag['version'], 'confirmation_name': 'competition'})
    assert deleted.status_code == 200, deleted.get_json()
    assert deleted.get_json()['removed'] == {'instances': 1, 'sets': 1, 'circuit_scopes': 0, 'plans': 1}

    db_session.expire_all()
    instance = db_session.get(ActivityInstance, sample_activity_instance.id)
    assert (instance.tag_assignment_version, db_session.get(ActivitySet, activity_set.id).tag_assignment_version) == (before[0] + 1, before[1] + 1)
    assert instance.tags == [] and instance.compare_tags == [] and instance.tag_signature == ''
    assert 'tags' not in db_session.get(SessionTemplate, template.id).template_data['sections'][0]['items'][0]['prescription']


@pytest.mark.integration
def test_merge_unions_links_compare_tags_and_plans(authed_client, db_session, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    target = _create(authed_client, root_id, 'Rehab').get_json()
    source = _create(authed_client, root_id, 'Rehabilitation').get_json()
    activity_set = ActivitySet(activity_instance_id=sample_activity_instance.id, sort_order=0, status='completed')
    db_session.add(activity_set)
    db_session.flush()
    db_session.add_all([
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=target['id']),
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=source['id']),
        ActivitySetTag(activity_set_id=activity_set.id, tag_definition_id=source['id']),
        ActivityInstanceCompareTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=source['id']),
    ])
    sample_activity_instance.prescription = {'schema': 1, 'tags': [source['id'], target['id']]}
    db_session.commit()

    payload = {'target_id': target['id'], 'source_ids': [source['id']], 'versions': {target['id']: target['version'], source['id']: source['version']}}
    preview = authed_client.post(f'/api/{root_id}/activity-tags/merge-preview', json=payload)
    assert preview.status_code == 200
    assert preview.get_json()['usage']['instances'] == 2
    merged = authed_client.post(f'/api/{root_id}/activity-tags/merge', json={**payload, 'name': 'Rehab work'})
    assert merged.status_code == 200, merged.get_json()
    assert merged.get_json()['name'] == 'Rehab work'

    db_session.expire_all()
    instance = db_session.get(ActivityInstance, sample_activity_instance.id)
    assert [tag.id for tag in instance.tags] == [target['id']]
    assert [tag.id for tag in db_session.get(ActivitySet, activity_set.id).tags] == [target['id']]
    assert [tag.id for tag in instance.compare_tags] == [target['id']]
    assert instance.prescription['tags'] == [target['id']]
    assert db_session.get(ActivityTagDefinition, source['id']) is None
    assert _create(authed_client, root_id, 'Rehabilitation').status_code == 201


@pytest.mark.integration
def test_catalog_and_merge_preview_are_tenant_isolated(authed_client, db_session, sample_ultimate_goal, test_user):
    root_id = sample_ultimate_goal.id
    own = _create(authed_client, root_id, 'Own').get_json()
    stranger = User(id=str(uuid4()), username=f'stranger-{uuid4().hex[:8]}', email=f'{uuid4().hex[:8]}@example.com', password_hash='x')
    db_session.add(stranger)
    db_session.flush()
    other_root = Goal(id=str(uuid4()), name='Other', owner_id=stranger.id, level_id=sample_ultimate_goal.level_id)
    other_root.root_id = other_root.id
    db_session.add(other_root)
    db_session.flush()
    foreign = ActivityTagDefinition(root_id=other_root.id, name='Foreign')
    db_session.add(foreign)
    db_session.commit()

    assert authed_client.get(f'/api/{other_root.id}/activity-tags').status_code == 404
    assert [row['name'] for row in _catalog(authed_client, root_id)['tags']] == ['Own']
    preview = authed_client.post(f'/api/{root_id}/activity-tags/merge-preview', json={
        'target_id': own['id'], 'source_ids': [foreign.id], 'versions': {own['id']: 1, foreign.id: 1},
    })
    assert preview.status_code == 400


@pytest.mark.integration
def test_families_order_tags_and_deleting_one_keeps_its_tags(authed_client, sample_ultimate_goal):
    root_id = sample_ultimate_goal.id
    grip = authed_client.post(f'/api/{root_id}/activity-tag-families', json={'name': ' Grip ', 'single_select': True}).get_json()
    surface = authed_client.post(f'/api/{root_id}/activity-tag-families', json={'name': 'Surface'}).get_json()
    assert (grip['name'], grip['sort_order'], surface['sort_order']) == ('Grip', 0, 1)
    assert authed_client.post(f'/api/{root_id}/activity-tag-families', json={'name': 'grip'}).status_code == 409

    wide = _create(authed_client, root_id, 'Wide', family_id=grip['id']).get_json()
    narrow = _create(authed_client, root_id, 'Narrow', family_id=grip['id']).get_json()
    loose = _create(authed_client, root_id, 'Paused').get_json()
    assert (wide['family_id'], wide['sort_order'], narrow['sort_order'], loose['sort_order']) == (grip['id'], 0, 1, 0)

    reordered = authed_client.put(f'/api/{root_id}/activity-tags/order', json={'family_id': grip['id'], 'tag_ids': [narrow['id'], wide['id'], loose['id']]})
    assert reordered.status_code == 200
    by_id = {row['id']: row for row in reordered.get_json()['tags']}
    assert [(by_id[tag_id]['family_id'], by_id[tag_id]['sort_order']) for tag_id in (narrow['id'], wide['id'], loose['id'])] == [(grip['id'], 0), (grip['id'], 1), (grip['id'], 2)]

    families = authed_client.put(f'/api/{root_id}/activity-tag-families/order', json={'family_ids': [surface['id'], grip['id']]})
    assert [row['id'] for row in families.get_json()['families']] == [surface['id'], grip['id']]
    assert authed_client.put(f'/api/{root_id}/activity-tag-families/order', json={'family_ids': [grip['id']]}).status_code == 400

    removed = authed_client.delete(f'/api/{root_id}/activity-tag-families/{grip["id"]}', json={'version': grip['version'] + 1})
    assert removed.status_code == 200, removed.get_json()
    catalog = _catalog(authed_client, root_id)
    assert [row['id'] for row in catalog['families']] == [surface['id']]
    assert {row['name']: row['family_id'] for row in catalog['tags']} == {'Narrow': None, 'Wide': None, 'Paused': None}


@pytest.mark.integration
def test_pick_one_families_allow_one_direct_tag(authed_client, db_session, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    family = authed_client.post(f'/api/{root_id}/activity-tag-families', json={'name': 'Grip'}).get_json()
    wide = _create(authed_client, root_id, 'Wide', family_id=family['id']).get_json()
    narrow = _create(authed_client, root_id, 'Narrow', family_id=family['id']).get_json()
    url = f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags'
    assert authed_client.put(url, json={'tag_ids': [wide['id'], narrow['id']]}).status_code == 200

    pick_one = authed_client.put(f'/api/{root_id}/activity-tag-families/{family["id"]}', json={'version': family['version'], 'single_select': True})
    assert pick_one.status_code == 200
    # Existing entries that already hold both are reported, not rewritten.
    assert pick_one.get_json()['conflicting_assignments'] == 1
    other = _create(authed_client, root_id, 'Outdoor').get_json()
    assert authed_client.put(url, json={'tag_ids': [wide['id'], narrow['id'], other['id']]}).status_code == 200

    assert authed_client.put(url, json={'tag_ids': [wide['id']]}).status_code == 200
    rejected = authed_client.put(url, json={'tag_ids': [wide['id'], narrow['id']]})
    assert rejected.status_code == 422
    assert rejected.get_json()['details']['code'] == 'tag_family_single_select'
    assert authed_client.put(url, json={'tag_ids': [narrow['id']]}).status_code == 200


@pytest.mark.integration
def test_archived_tags_stay_assigned_but_cannot_be_newly_assigned(authed_client, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    tag = _create(authed_client, root_id, 'Old').get_json()
    url = f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags'
    authed_client.put(url, json={'tag_ids': [tag['id']]})
    authed_client.post(f'/api/{root_id}/activity-tags/{tag["id"]}/archive', json={'version': tag['version']})
    kept = authed_client.put(url, json={'tag_ids': [tag['id']]})
    assert kept.status_code == 200
    assert kept.get_json()['tags'][0]['archived'] is True
    assert authed_client.put(url, json={'tag_ids': []}).status_code == 200
    assert authed_client.put(url, json={'tag_ids': [tag['id']]}).status_code == 400


@pytest.mark.integration
def test_catalog_lists_activities_by_distinct_tagged_instances(authed_client, db_session, sample_activity_instance):
    root_id = sample_activity_instance.root_id
    tag = _create(authed_client, root_id, 'Tempo').get_json()
    row_activity, row_instance = _other_activity_instance(db_session, sample_activity_instance)
    second_row = ActivityInstance(
        id=str(uuid4()), root_id=root_id, session_id=sample_activity_instance.session_id,
        activity_definition_id=row_activity.id,
    )
    db_session.add(second_row)
    db_session.flush()
    # One instance tagged directly and through two of its sets still counts once.
    sets = [ActivitySet(activity_instance_id=row_instance.id, sort_order=index, status='completed') for index in range(2)]
    db_session.add_all(sets)
    db_session.flush()
    db_session.add_all([
        ActivityInstanceTag(activity_instance_id=row_instance.id, tag_definition_id=tag['id']),
        *[ActivitySetTag(activity_set_id=activity_set.id, tag_definition_id=tag['id']) for activity_set in sets],
        ActivityInstanceTag(activity_instance_id=second_row.id, tag_definition_id=tag['id']),
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, tag_definition_id=tag['id']),
    ])
    db_session.commit()

    listed = next(row for row in _catalog(authed_client, root_id)['tags'] if row['id'] == tag['id'])
    assert [(row['name'], row['instances']) for row in listed['activities']] == [
        ('Row', 2), (sample_activity_instance.definition.name, 1),
    ]
    # The headline count agrees with the per-activity list; raw link counts stay for impact.
    assert listed['usage']['tagged_instances'] == 3
    assert (listed['usage']['instances'], listed['usage']['sets']) == (3, 2)

    # A merge preview counts an instance holding both tags once.
    other = _create(authed_client, root_id, 'Slow').get_json()
    db_session.add(ActivityInstanceTag(activity_instance_id=second_row.id, tag_definition_id=other['id']))
    db_session.commit()
    catalog = {row['id']: row for row in _catalog(authed_client, root_id)['tags']}
    preview = authed_client.post(f'/api/{root_id}/activity-tags/merge-preview', json={
        'target_id': tag['id'], 'source_ids': [other['id']],
        'versions': {tag['id']: catalog[tag['id']]['version'], other['id']: catalog[other['id']]['version']},
    }).get_json()
    assert preview['usage']['tagged_instances'] == 3
    assert [(row['name'], row['instances']) for row in preview['activities']][0] == ('Row', 2)
