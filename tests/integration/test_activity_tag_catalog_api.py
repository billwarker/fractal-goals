from uuid import uuid4

import pytest

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityInstanceTag,
    ActivityProgressView,
    ActivitySet,
    ActivitySetTag,
    ActivityTag,
    ActivityTagDefinition,
)


@pytest.mark.integration
def test_global_tag_catalog_applies_to_existing_and_future_activities(
    authed_client,
    db_session,
    sample_ultimate_goal,
    sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    second = ActivityDefinition(
        id=str(uuid4()), root_id=root_id, name="Second activity", has_sets=False, has_metrics=False,
    )
    db_session.add(second)
    db_session.commit()

    created = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "Rehab", "color": "#22AA77", "scope": "global", "activity_ids": []},
    )
    assert created.status_code == 201, created.get_json()
    tag = created.get_json()
    assert tag["scope"] == "global"
    assert set(tag["activity_ids"]) == {sample_activity_definition.id, second.id}
    assert len({binding["id"] for binding in tag["bindings"]}) == 2

    future = authed_client.post(
        f"/api/{root_id}/activities",
        json={"name": "Future activity", "has_metrics": False},
    )
    assert future.status_code == 201, future.get_json()
    future_id = future.get_json()["id"]
    catalog = authed_client.get(f"/api/{root_id}/activity-tags").get_json()
    refreshed = next(item for item in catalog["tags"] if item["id"] == tag["id"])
    assert set(refreshed["activity_ids"]) == {sample_activity_definition.id, second.id, future_id}

    activities = authed_client.get(f"/api/{root_id}/activities").get_json()
    assert all(any(item["definition_id"] == tag["id"] for item in activity["tags"]) for activity in activities)


@pytest.mark.integration
def test_hard_delete_cleans_dependencies_and_bumps_versions(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    created = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "Typoo", "scope": "selected", "activity_ids": [sample_activity_definition.id]},
    ).get_json()
    binding = created["bindings"][0]
    assigned = authed_client.put(
        f"/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags",
        json={"tag_ids": [binding["id"]], "version": 1},
    )
    assert assigned.status_code == 200
    view = authed_client.post(
        f"/api/{root_id}/activities/{sample_activity_definition.id}/progress-views",
        json={"name": "Typo view", "config": {"all_tag_ids": [binding["id"]]}},
    ).get_json()

    impact = authed_client.get(f"/api/{root_id}/activity-tags/{created['id']}/impact")
    assert impact.status_code == 200
    assert impact.get_json()["usage"]["instances"] == 1
    assert impact.get_json()["usage"]["progress_views"] == 1
    rejected = authed_client.post(
        f"/api/{root_id}/activity-tags/{created['id']}/hard-delete",
        json={"version": created["version"], "confirmation_name": "wrong"},
    )
    assert rejected.status_code == 400

    deleted = authed_client.post(
        f"/api/{root_id}/activity-tags/{created['id']}/hard-delete",
        json={"version": created["version"], "confirmation_name": "Typoo"},
    )
    assert deleted.status_code == 200, deleted.get_json()
    db_session.expire_all()
    assert db_session.get(ActivityTagDefinition, created["id"]) is None
    assert db_session.query(ActivityInstanceTag).filter_by(activity_tag_id=binding["id"]).count() == 0
    assert db_session.get(ActivityInstance, sample_activity_instance.id).tag_assignment_version == 3
    updated_view = db_session.get(ActivityProgressView, view["id"])
    assert updated_view.version == view["version"] + 1
    assert updated_view.config["all_tag_ids"] == []


@pytest.mark.integration
def test_duplicate_catalog_tags_require_review_and_merge_without_losing_assignments(
    authed_client,
    db_session,
    sample_ultimate_goal,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_ultimate_goal.id
    second = ActivityDefinition(
        id=str(uuid4()), root_id=root_id, name="Other", has_sets=False, has_metrics=False,
    )
    db_session.add(second)
    db_session.commit()
    first = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "Rehab", "scope": "selected", "activity_ids": [sample_activity_definition.id]},
    ).get_json()
    second_tag = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "rehab", "scope": "selected", "activity_ids": [second.id]},
    ).get_json()
    authed_client.put(
        f"/api/{root_id}/activity-instances/{sample_activity_instance.id}/tags",
        json={"tag_ids": [first["bindings"][0]["id"]]},
    )

    catalog = authed_client.get(f"/api/{root_id}/activity-tags").get_json()
    assert catalog["duplicate_groups"] == [{
        "normalized_name": "rehab",
        "definition_ids": [first["id"], second_tag["id"]],
    }]
    merged = authed_client.post(
        f"/api/{root_id}/activity-tags/merge",
        json={
            "target_id": first["id"],
            "source_ids": [second_tag["id"]],
            "versions": {first["id"]: first["version"], second_tag["id"]: second_tag["version"]},
            "scope": "selected",
        },
    )
    assert merged.status_code == 200, merged.get_json()
    assert set(merged.get_json()["activity_ids"]) == {sample_activity_definition.id, second.id}
    assert db_session.query(ActivityTagDefinition).filter_by(root_id=root_id).count() == 1
    assert db_session.query(ActivityInstanceTag).filter_by(
        activity_instance_id=sample_activity_instance.id,
    ).count() == 1


@pytest.mark.integration
def test_catalog_normalizes_names_enforces_overlap_and_versions(
    authed_client,
    db_session,
    sample_ultimate_goal,
    sample_activity_definition,
):
    root_id = sample_ultimate_goal.id
    other = ActivityDefinition(
        id=str(uuid4()), root_id=root_id, name="Other", has_sets=False, has_metrics=False,
    )
    db_session.add(other)
    db_session.commit()
    first = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "  High   Range  ", "scope": "selected", "activity_ids": [sample_activity_definition.id]},
    )
    assert first.status_code == 201
    tag = first.get_json()
    assert tag["name"] == "High Range"

    overlapping = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "high range", "scope": "selected", "activity_ids": [sample_activity_definition.id]},
    )
    assert overlapping.status_code == 409
    separate = authed_client.post(
        f"/api/{root_id}/activity-tags",
        json={"name": "HIGH RANGE", "scope": "selected", "activity_ids": [other.id]},
    )
    assert separate.status_code == 201

    conflicting_expansion = authed_client.put(
        f"/api/{root_id}/activity-tags/{tag['id']}",
        json={"version": tag["version"], "activity_ids": [sample_activity_definition.id, other.id]},
    )
    assert conflicting_expansion.status_code == 409
    updated = authed_client.put(
        f"/api/{root_id}/activity-tags/{tag['id']}",
        json={"version": tag["version"], "color": "#112233"},
    )
    assert updated.status_code == 200
    stale = authed_client.put(
        f"/api/{root_id}/activity-tags/{tag['id']}",
        json={"version": tag["version"], "color": "#445566"},
    )
    assert stale.status_code == 409
    archived = authed_client.post(
        f"/api/{root_id}/activity-tags/{tag['id']}/archive",
        json={"version": updated.get_json()["version"]},
    )
    assert archived.status_code == 200
    restored = authed_client.post(
        f"/api/{root_id}/activity-tags/{tag['id']}/restore",
        json={"version": archived.get_json()["version"]},
    )
    assert restored.status_code == 200
    assert restored.get_json()["archived"] is False


@pytest.mark.integration
def test_catalog_and_merge_preview_are_tenant_isolated(
    authed_client,
    db_session,
    sample_ultimate_goal,
):
    from models import Goal, User

    outsider = User(id=str(uuid4()), username="outsider", email="outsider@example.com")
    outsider.set_password("Password123")
    other_root = Goal(
        id=str(uuid4()), root_id=None, owner_id=outsider.id, name="Other fractal", description="",
    )
    other_root.root_id = other_root.id
    db_session.add_all([outsider, other_root])
    db_session.commit()
    assert authed_client.get(f"/api/{other_root.id}/activity-tags").status_code == 404
    assert authed_client.post(
        f"/api/{other_root.id}/activity-tags",
        json={"name": "Private", "scope": "global", "activity_ids": []},
    ).status_code == 404

    root_id = sample_ultimate_goal.id
    missing_preview = authed_client.post(
        f"/api/{root_id}/activity-tags/merge-preview",
        json={"target_id": "missing", "source_ids": ["also-missing"], "versions": {"missing": 1, "also-missing": 1}},
    )
    assert missing_preview.status_code == 404


@pytest.mark.integration
def test_merge_deduplicates_same_activity_junctions_and_saved_view_ids(
    authed_client,
    db_session,
    sample_activity_definition,
    sample_activity_instance,
):
    root_id = sample_activity_definition.root_id
    definitions = []
    for name in ("Rehab", " rehab "):
        definition = ActivityTagDefinition(root_id=root_id, name=name, scope="selected")
        definition.bindings.append(ActivityTag(
            root_id=root_id,
            activity_definition_id=sample_activity_definition.id,
        ))
        definitions.append(definition)
    db_session.add_all(definitions)
    db_session.flush()
    target_definition_id = definitions[0].id
    source_definition_id = definitions[1].id
    target_binding = definitions[0].bindings[0]
    source_binding = definitions[1].bindings[0]
    activity_set = ActivitySet(
        id=str(uuid4()), activity_instance_id=sample_activity_instance.id, sort_order=0, status="completed",
    )
    view = ActivityProgressView(
        root_id=root_id,
        activity_definition_id=sample_activity_definition.id,
        name="Both legacy tags",
        config={"schema_version": 1, "all_tag_ids": [], "any_tag_ids": [target_binding.id, source_binding.id], "none_tag_ids": []},
    )
    db_session.add_all([
        activity_set,
        view,
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, activity_tag_id=target_binding.id),
        ActivityInstanceTag(activity_instance_id=sample_activity_instance.id, activity_tag_id=source_binding.id),
    ])
    db_session.flush()
    db_session.add_all([
        ActivitySetTag(activity_set_id=activity_set.id, activity_tag_id=target_binding.id),
        ActivitySetTag(activity_set_id=activity_set.id, activity_tag_id=source_binding.id),
    ])
    db_session.commit()
    instance_version = sample_activity_instance.tag_assignment_version
    set_version = activity_set.tag_assignment_version
    view_version = view.version

    preview = authed_client.post(
        f"/api/{root_id}/activity-tags/merge-preview",
        json={
            "target_id": target_definition_id,
            "source_ids": [source_definition_id],
            "versions": {target_definition_id: 1, source_definition_id: 1},
        },
    )
    assert preview.status_code == 200
    assert preview.get_json()["binding_rewrites"] == 1
    merged = authed_client.post(
        f"/api/{root_id}/activity-tags/merge",
        json={
            "target_id": target_definition_id,
            "source_ids": [source_definition_id],
            "versions": {target_definition_id: 1, source_definition_id: 1},
        },
    )
    assert merged.status_code == 200, merged.get_json()
    db_session.expire_all()
    assert db_session.query(ActivityInstanceTag).filter_by(activity_instance_id=sample_activity_instance.id).count() == 1
    assert db_session.query(ActivitySetTag).filter_by(activity_set_id=activity_set.id).count() == 1
    assert db_session.get(ActivityInstance, sample_activity_instance.id).tag_assignment_version == instance_version + 1
    assert db_session.get(ActivitySet, activity_set.id).tag_assignment_version == set_version + 1
    updated_view = db_session.get(ActivityProgressView, view.id)
    assert updated_view.config["any_tag_ids"] == [target_binding.id]
    assert updated_view.version == view_version + 1
    refreshed = authed_client.get(f"/api/{root_id}/activity-tags")
    assert refreshed.status_code == 200
    assert [tag["id"] for tag in refreshed.get_json()["tags"]].count(target_definition_id) == 1
    assert source_definition_id not in {tag["id"] for tag in refreshed.get_json()["tags"]}
