import models
import pytest

from services.page_surface_service import PageSurfaceService


def make_config(*, tree_id="tree-1", widgets=None, detail_panel="auto"):
    """Build a valid surface config payload (matches validate_surface_config)."""
    panels = [{"id": tree_id, "x": 0, "y": 0, "w": 96, "h": 48}]
    panel_contents = {tree_id: {"kind": "tree", "treeView": {"mode": "tree"}}}
    for index, widget in enumerate(widgets or []):
        wid = widget["id"]
        panels.append({"id": wid, "x": 0, "y": 0, "w": 24, "h": 12})
        panel_contents[wid] = {"kind": "widget", "widgetType": widget["widgetType"], "state": {}}
    return {
        "version": 1,
        "layout": {"type": "grid", "panels": panels},
        "layout_bounds": {"columns": 96, "rows": 48},
        "detail_panel": detail_panel,
        "panel_contents": panel_contents,
    }


def create_payload(name="Default", *, is_default=False):
    return {
        "page": "goals",
        "name": name,
        "is_default": is_default,
        "desktop_config": make_config(),
        "mobile_config": make_config(detail_panel="fullscreen"),
    }


def test_creates_and_lists_layouts(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    created, error, status = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("Focus"),
    )
    assert error is None
    assert status == 201
    assert created["data"]["name"] == "Focus"
    assert created["data"]["page"] == "goals"

    listed, error, status = service.list_layouts(sample_ultimate_goal.id, test_user.id, "goals")
    assert error is None
    assert status == 200
    assert [item["name"] for item in listed["data"]] == ["Focus"]


def test_default_exclusivity_per_page(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    first, _, _ = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("A", is_default=True),
    )
    second, _, _ = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("B", is_default=True),
    )

    # Creating B as default must unset A's default.
    refreshed_a = db_session.query(models.PageSurfaceLayout).filter_by(id=first["data"]["id"]).first()
    refreshed_b = db_session.query(models.PageSurfaceLayout).filter_by(id=second["data"]["id"]).first()
    assert refreshed_a.is_default is False
    assert refreshed_b.is_default is True

    # set_default on A flips it back.
    service.set_default_layout(sample_ultimate_goal.id, first["data"]["id"], test_user.id)
    db_session.refresh(refreshed_a)
    db_session.refresh(refreshed_b)
    assert refreshed_a.is_default is True
    assert refreshed_b.is_default is False


def test_rejects_duplicate_active_names(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    service.create_layout(sample_ultimate_goal.id, test_user.id, create_payload("Dup"))
    duplicate, error, status = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("Dup"),
    )
    assert duplicate is None
    assert status == 409
    assert "already exists" in error


def test_reuses_soft_deleted_name_on_create(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    created, _, _ = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("Recycled"),
    )
    service.delete_layout(sample_ultimate_goal.id, created["data"]["id"], test_user.id)

    recreated, error, status = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("Recycled"),
    )
    assert error is None
    assert status == 201
    assert recreated["data"]["id"] == created["data"]["id"]

    persisted = db_session.query(models.PageSurfaceLayout).filter_by(id=created["data"]["id"]).first()
    assert persisted.deleted_at is None


def test_update_persists_configs(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    created, _, _ = service.create_layout(
        sample_ultimate_goal.id, test_user.id, create_payload("Edit me"),
    )

    new_desktop = make_config(widgets=[{"id": "w1", "widgetType": "calendar"}], detail_panel={"x": 0, "y": 0, "w": 20, "h": 30})
    updated, error, status = service.update_layout(
        sample_ultimate_goal.id, created["data"]["id"], test_user.id,
        {"name": "Renamed", "desktop_config": new_desktop},
    )
    assert error is None
    assert status == 200
    assert updated["data"]["name"] == "Renamed"
    assert "w1" in updated["data"]["desktop_config"]["panel_contents"]


def test_ownership_rejected_for_other_user(db_session, sample_ultimate_goal, test_user):
    service = PageSurfaceService(db_session)
    result, error, status = service.list_layouts(sample_ultimate_goal.id, "not-the-owner", "goals")
    assert result is None
    assert status == 404
