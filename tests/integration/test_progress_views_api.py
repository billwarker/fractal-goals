from uuid import uuid4

import pytest

from models import ActivityDefinition, ActivitySet, MetricValue


@pytest.mark.integration
def test_saved_progress_view_lifecycle_and_non_mutating_preview(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    activity_id = sample_activity_definition.id
    tag_response = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/tags',
        json={'name': 'Competition', 'color': '#3366AA'},
    )
    assert tag_response.status_code == 201
    tag = tag_response.get_json()

    duplicate = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/tags',
        json={'name': 'competition'},
    )
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
    other_tag = authed_client.post(
        f'/api/{root_id}/activities/{other_activity.id}/tags',
        json={'name': 'Other cohort'},
    ).get_json()
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

    archived = authed_client.delete(f'/api/{root_id}/activities/{activity_id}/tags/{tag["id"]}')
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

    tag = authed_client.post(
        f'/api/{root_id}/activities/{activity_id}/tags',
        json={'name': 'Heavy'},
    ).get_json()
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
