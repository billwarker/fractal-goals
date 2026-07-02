import pytest

from validators import (
    PageSurfaceCreateSchema,
    PageSurfaceUpdateSchema,
    validate_surface_config,
)


def base_config(panels, panel_contents, *, detail_panel="auto"):
    return {
        "version": 1,
        "layout": {"type": "grid", "panels": panels},
        "detail_panel": detail_panel,
        "panel_contents": panel_contents,
    }


def valid_config():
    return base_config(
        [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}],
        {"tree-1": {"kind": "tree", "treeView": {}}},
    )


def test_valid_config_passes():
    assert validate_surface_config(valid_config()) is not None


def test_requires_exactly_one_tree_panel():
    # Zero tree panels.
    config = base_config(
        [{"id": "w1", "x": 0, "y": 0, "w": 24, "h": 12}],
        {"w1": {"kind": "widget", "widgetType": "calendar"}},
    )
    with pytest.raises(ValueError, match="exactly one tree panel"):
        validate_surface_config(config)

    # Two tree panels.
    config = base_config(
        [
            {"id": "t1", "x": 0, "y": 0, "w": 24, "h": 12},
            {"id": "t2", "x": 24, "y": 0, "w": 24, "h": 12},
        ],
        {"t1": {"kind": "tree"}, "t2": {"kind": "tree"}},
    )
    with pytest.raises(ValueError, match="exactly one tree panel"):
        validate_surface_config(config)


def test_rejects_unknown_widget_type():
    config = base_config(
        [
            {"id": "tree-1", "x": 0, "y": 0, "w": 48, "h": 48},
            {"id": "w1", "x": 48, "y": 0, "w": 24, "h": 12},
        ],
        {
            "tree-1": {"kind": "tree"},
            "w1": {"kind": "widget", "widgetType": "bogus"},
        },
    )
    with pytest.raises(ValueError, match="unknown widgetType"):
        validate_surface_config(config)


def test_accepts_metric_card_widget_type():
    config = base_config(
        [
            {"id": "tree-1", "x": 0, "y": 0, "w": 48, "h": 48},
            {"id": "w1", "x": 48, "y": 0, "w": 18, "h": 10},
        ],
        {
            "tree-1": {"kind": "tree"},
            "w1": {"kind": "widget", "widgetType": "metricCard", "state": {"metricKey": "recentSessionsCount"}},
        },
    )
    assert validate_surface_config(config) is not None


def test_rejects_panel_without_content():
    config = base_config(
        [
            {"id": "tree-1", "x": 0, "y": 0, "w": 48, "h": 48},
            {"id": "orphan", "x": 48, "y": 0, "w": 24, "h": 12},
        ],
        {"tree-1": {"kind": "tree"}},
    )
    with pytest.raises(ValueError, match="panels without content"):
        validate_surface_config(config)


def test_rejects_content_without_panel():
    config = base_config(
        [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}],
        {
            "tree-1": {"kind": "tree"},
            "ghost": {"kind": "widget", "widgetType": "calendar"},
        },
    )
    with pytest.raises(ValueError, match="content without panels"):
        validate_surface_config(config)


def test_detail_panel_hint_variants():
    for hint in ("auto", "fullscreen", {"x": 0, "y": 0, "w": 20, "h": 30}):
        config = valid_config()
        config["detail_panel"] = hint
        assert validate_surface_config(config) is not None

    config = valid_config()
    config["detail_panel"] = "sideways"
    with pytest.raises(ValueError, match="detail_panel"):
        validate_surface_config(config)


def test_view_configs_require_overview_and_scoped_configs():
    config = valid_config()
    config["view_configs"] = {
        "overview": {
            "layout": {
                "type": "grid",
                "panels": [
                    {"id": "tree-1", "x": 0, "y": 0, "w": 48, "h": 48},
                    {"id": "w1", "x": 48, "y": 0, "w": 18, "h": 10},
                ],
            },
            "layout_bounds": {"columns": 96, "rows": 48},
            "panel_contents": {
                "tree-1": {"kind": "tree"},
                "w1": {"kind": "widget", "widgetType": "metricCard"},
            },
        },
        "scoped": {
            "layout": {"type": "grid", "panels": [{"id": "tree-1", "x": 0, "y": 0, "w": 96, "h": 48}]},
            "layout_bounds": {"columns": 96, "rows": 48},
            "panel_contents": {"tree-1": {"kind": "tree"}},
        },
    }
    assert validate_surface_config(config) is not None

    config["view_configs"].pop("scoped")
    with pytest.raises(ValueError, match="missing modes"):
        validate_surface_config(config)


def test_create_schema_accepts_valid_payload():
    schema = PageSurfaceCreateSchema(
        page="goals",
        name="My Surface",
        is_default=True,
        desktop_config=valid_config(),
        mobile_config=valid_config(),
    )
    assert schema.name == "My Surface"
    assert schema.is_default is True


def test_create_schema_rejects_unsupported_page():
    with pytest.raises(ValueError):
        PageSurfaceCreateSchema(
            page="sessions",
            name="X",
            desktop_config=valid_config(),
            mobile_config=valid_config(),
        )


def test_update_schema_requires_a_field():
    with pytest.raises(ValueError, match="At least one field"):
        PageSurfaceUpdateSchema()
