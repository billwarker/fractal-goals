def make_surface_config(*, tree_mode="tree", detail_panel="auto"):
    return {
        "version": 1,
        "layout": {
            "type": "grid",
            "panels": [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}],
        },
        "layout_bounds": {"columns": 96, "rows": 48},
        "detail_panel": detail_panel,
        "panel_contents": {
            "tree-1": {
                "kind": "tree",
                "treeView": {"mode": tree_mode},
            },
        },
        "view_configs": {
            "overview": {
                "layout": {
                    "type": "grid",
                    "panels": [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}],
                },
                "layout_bounds": {"columns": 96, "rows": 48},
                "panel_contents": {
                    "tree-1": {
                        "kind": "tree",
                        "treeView": {"mode": tree_mode},
                    },
                },
            },
            "scoped": {
                "layout": {
                    "type": "grid",
                    "panels": [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}],
                },
                "layout_bounds": {"columns": 96, "rows": 48},
                "panel_contents": {
                    "tree-1": {
                        "kind": "tree",
                        "treeView": {"mode": tree_mode},
                    },
                },
            },
        },
    }


def make_payload(name="Studio"):
    return {
        "page": "goals",
        "name": name,
        "is_default": True,
        "desktop_config": make_surface_config(),
        "mobile_config": make_surface_config(tree_mode="hierarchy", detail_panel="fullscreen"),
    }


def test_page_surface_routes_create_list_and_update(authed_client, sample_ultimate_goal):
    create_response = authed_client.post(
        f"/api/roots/{sample_ultimate_goal.id}/page-surfaces",
        json=make_payload("Studio"),
    )

    assert create_response.status_code == 201
    created = create_response.get_json()["data"]
    assert created["name"] == "Studio"
    assert created["desktop_config"]["view_configs"]["overview"]["layout"]["type"] == "grid"

    list_response = authed_client.get(
        f"/api/roots/{sample_ultimate_goal.id}/page-surfaces?page=goals",
    )

    assert list_response.status_code == 200
    assert [surface["id"] for surface in list_response.get_json()["data"]] == [created["id"]]

    update_response = authed_client.put(
        f"/api/roots/{sample_ultimate_goal.id}/page-surfaces/{created['id']}",
        json={
            "name": "Studio v2",
            "desktop_config": make_surface_config(tree_mode="hierarchy"),
        },
    )

    assert update_response.status_code == 200
    updated = update_response.get_json()["data"]
    assert updated["name"] == "Studio v2"
    assert updated["desktop_config"]["panel_contents"]["tree-1"]["treeView"]["mode"] == "hierarchy"
