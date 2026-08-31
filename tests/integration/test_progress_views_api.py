from uuid import uuid4

import pytest

from models import ActivityDefinition, ActivitySet, MetricValue


def _create_tag(client, root_id, activity_id, name, **extra):
    response = client.post(
        f'/api/{root_id}/activity-tags',
        json={'name': name, 'scope': 'selected', 'activity_ids': [activity_id], **extra},
    )
    if response.status_code != 201:
        return response, None
    definition = response.get_json()
    binding = next(row for row in definition['bindings'] if row['activity_definition_id'] == activity_id)
    return response, binding


@pytest.mark.integration
def test_saved_progress_view_lifecycle_and_non_mutating_preview(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    activity_id = sample_activity_definition.id
    tag_response, tag = _create_tag(authed_client, root_id, activity_id, 'Competition', color='#3366AA')
    assert tag_response.status_code == 201

    duplicate, _ = _create_tag(authed_client, root_id, activity_id, 'competition')
    assert duplicate.status_code == 409

    other_activity = ActivityDefinition(
        id=str(uuid4()),
        root_id=root_id,
        name='Other activity',
        has_sets=False,
        has_metrics=False,
    )
    db_session.add(other_activity)
    db_session.commit()
    _, other_tag = _create_tag(authed_client, root_id, other_activity.id, 'Other cohort')
    cross_activity_view = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-views',
        json={'name': 'Invalid view', 'config': {'any_tag_ids': [other_tag['id']]}},
    )
    assert cross_activity_view.status_code == 400

    activity_set = ActivitySet(
        id=str(uuid4()),
        activity_instance_id=sample_activity_instance.id,
        sort_order=0,
        status='completed',
    )
    db_session.add(activity_set)
    db_session.commit()
    assigned = authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': [tag['id']]},
    )
    assert assigned.status_code == 200

    session_payload = authed_client.get(
        f'/api/{root_id}/sessions/{sample_activity_instance.session_id}/activities'
    ).get_json()
    serialized_instance = next(item for item in session_payload if item['id'] == sample_activity_instance.id)
    assert [item['id'] for item in serialized_instance['tags']] == [tag['id']]
    serialized_set = next(item for item in serialized_instance['sets'] if item['id'] == activity_set.id)
    assert serialized_set['tags'] == []
    assert [item['id'] for item in serialized_set['inherited_tags']] == [tag['id']]
    assert [item['id'] for item in serialized_set['effective_tags']] == [tag['id']]

    created = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-views',
        json={
            'name': 'Competition only',
            'config': {'all_tag_ids': [tag['id']]},
            'activate': True,
        },
    )
    assert created.status_code == 201
    view = created.get_json()
    assert view['active'] is True

    timeline = authed_client.get(f'/api/{root_id}/activities/{activity_id}/progress-timeline')
    assert timeline.status_code == 200
    assert timeline.get_json()['active_view_id'] == view['id']
    assert timeline.get_json()['items'][0]['included'] is True
    assert [item['id'] for item in timeline.get_json()['items'][0]['tags']] == [tag['id']]

    preview = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-query',
        json={'config': {'none_tag_ids': [tag['id']]}, 'limit': 20, 'offset': 0},
    )
    assert preview.status_code == 200
    assert preview.get_json()['items'][0]['included'] is False

    views_after_preview = authed_client.get(f'/api/{root_id}/activities/{activity_id}/progress-views')
    assert views_after_preview.get_json()['active_view_id'] == view['id']

    updated = authed_client.put(
        f'/api/{root_id}/activities/{activity_id}/progress-views/{view["id"]}',
        json={'version': view['version'], 'name': 'Meet prep'},
    )
    assert updated.status_code == 200
    assert updated.get_json()['version'] == view['version'] + 1

    conflict = authed_client.put(
        f'/api/{root_id}/activities/{activity_id}/progress-views/{view["id"]}',
        json={'version': view['version'], 'name': 'Stale edit'},
    )
    assert conflict.status_code == 409
    assert conflict.get_json()['details']['current']['name'] == 'Meet prep'

    archived = authed_client.post(
        f'/api/{root_id}/activity-tags/{tag["definition_id"]}/archive', json={'version': tag['version']},
    )
    assert archived.status_code == 200
    retained = authed_client.get(f'/api/{root_id}/activities/{activity_id}/progress-timeline')
    assert retained.get_json()['items'][0]['included'] is True
    retained_assignment = authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': [tag['id']]},
    )
    assert retained_assignment.status_code == 200
    assert authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': []},
    ).status_code == 200
    unavailable = authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': [tag['id']]},
    )
    assert unavailable.status_code == 400

    deleted = authed_client.delete(
        f'/api/{root_id}/activities/{activity_id}/progress-views/{view["id"]}'
    )
    assert deleted.status_code == 200
    assert deleted.get_json()['active_view_id'] is None


@pytest.mark.integration
def test_set_tag_filter_uses_only_matching_sets_and_preserves_source_index(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    activity_id = sample_activity_definition.id
    metric = sample_activity_definition.metric_definitions[0]
    sets = [
        ActivitySet(id=str(uuid4()), activity_instance_id=sample_activity_instance.id, sort_order=index, status='completed')
        for index in range(2)
    ]
    db_session.add_all(sets)
    db_session.flush()
    db_session.add_all([
        MetricValue(
            activity_instance_id=sample_activity_instance.id,
            activity_set_id=activity_set.id,
            metric_definition_id=metric.id,
            value=value,
        )
        for activity_set, value in zip(sets, (10, 20))
    ])
    db_session.commit()

    _, tag = _create_tag(authed_client, root_id, activity_id, 'Heavy')
    assigned = authed_client.put(
        f'/api/{root_id}/activity-sets/{sets[1].id}/tags',
        json={'tag_ids': [tag['id']]},
    )
    assert assigned.status_code == 200

    preview = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-query',
        json={'config': {'all_tag_ids': [tag['id']]}, 'limit': 20, 'offset': 0},
    )
    assert preview.status_code == 200
    progress = preview.get_json()['items'][0]['progress_comparison']
    assert progress['included'] is True
    auto = progress['derived_summary']['auto_aggregations']
    assert auto['additive_totals'][metric.id] == 20
    assert auto['best_set_index'] == 1


@pytest.mark.integration
def test_multiple_saved_views_config_round_trip_activation_and_assignment_versions(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    activity_id = sample_activity_definition.id
    tags = []
    for name in ('Competition', 'Heavy'):
        response, binding = _create_tag(authed_client, root_id, activity_id, name)
        assert response.status_code == 201
        tags.append(binding)

    assigned = authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': [tags[0]['id']], 'version': 1},
    )
    assert assigned.status_code == 200
    assert assigned.get_json()['version'] == 2
    stale = authed_client.put(
        f'/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags',
        json={'tag_ids': [tags[1]['id']], 'version': 1},
    )
    assert stale.status_code == 409
    assert stale.get_json()['details']['version'] == 2

    first = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-views',
        json={'name': 'Meet prep', 'config': {'all_tag_ids': [tags[0]['id']]}, 'activate': True},
    )
    assert first.status_code == 201
    first_view = first.get_json()
    second = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-views',
        json={'name': 'Heavy days', 'config': {'all_tag_ids': [tags[1]['id']]}, 'activate': False},
    )
    assert second.status_code == 201
    second_view = second.get_json()
    duplicate = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-views',
        json={'name': 'MEET PREP'},
    )
    assert duplicate.status_code == 409

    updated = authed_client.put(
        f'/api/{root_id}/activities/{activity_id}/progress-views/{first_view["id"]}',
        json={
            'version': first_view['version'],
            'config': {'none_tag_ids': [tags[0]['id']]},
        },
    )
    assert updated.status_code == 200
    updated_view = updated.get_json()
    assert updated_view['config']['none_tag_ids'] == [tags[0]['id']]
    assert updated_view['version'] == first_view['version'] + 1

    listed = authed_client.get(f'/api/{root_id}/activities/{activity_id}/progress-views')
    assert listed.status_code == 200
    listed_by_id = {view['id']: view for view in listed.get_json()['views']}
    assert listed_by_id[first_view['id']]['config']['none_tag_ids'] == [tags[0]['id']]
    timeline = authed_client.get(f'/api/{root_id}/activities/{activity_id}/progress-timeline')
    assert timeline.get_json()['items'][0]['included'] is False

    activated = authed_client.put(
        f'/api/{root_id}/activities/{activity_id}/active-progress-view',
        json={'view_id': second_view['id']},
    )
    assert activated.status_code == 200
    assert activated.get_json()['active_view_id'] == second_view['id']
    deleted_inactive = authed_client.delete(
        f'/api/{root_id}/activities/{activity_id}/progress-views/{first_view["id"]}'
    )
    assert deleted_inactive.status_code == 200
    assert deleted_inactive.get_json()['active_view_id'] == second_view['id']

    overlap = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/progress-query',
        json={'config': {'all_tag_ids': [tags[0]['id']], 'none_tag_ids': [tags[0]['id']]}},
    )
    assert overlap.status_code == 400

    archived = authed_client.post(
        f'/api/{root_id}/activity-tags/{tags[0]["definition_id"]}/archive', json={'version': tags[0]['version']},
    )
    assert archived.status_code == 200
    duplicate_archived_name, _ = _create_tag(authed_client, root_id, activity_id, 'competition')
    assert duplicate_archived_name.status_code == 409
    restored = authed_client.post(
        f'/api/{root_id}/activity-tags/{tags[0]["definition_id"]}/restore',
        json={'version': archived.get_json()['version']},
    )
    assert restored.status_code == 200
    assert restored.get_json()['archived'] is False
