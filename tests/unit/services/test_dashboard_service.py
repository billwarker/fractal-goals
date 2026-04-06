from services.dashboard_service import DashboardService
import models


def test_dashboard_service_creates_and_lists_dashboards(db_session, sample_ultimate_goal, test_user):
    service = DashboardService(db_session)
    layout = {
        "version": 1,
        "layout": {"type": "window", "id": "window-1"},
        "window_states": {"window-1": {"selectedCategory": "sessions"}},
        "selected_window_id": "window-1",
    }

    created, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "Default Layout",
        "layout": layout,
    })

    assert error is None
    assert status == 201
    assert created["data"]["name"] == "Default Layout"
    assert created["data"]["layout"]["layout"]["id"] == "window-1"

    listed, error, status = service.list_dashboards(sample_ultimate_goal.id, test_user.id)

    assert error is None
    assert status == 200
    assert [dashboard["name"] for dashboard in listed["data"]] == ["Default Layout"]


def test_dashboard_service_rejects_duplicate_active_names(db_session, sample_ultimate_goal, test_user):
    service = DashboardService(db_session)
    payload = {
        "name": "Default Layout",
        "layout": {
            "version": 1,
            "layout": {"type": "window", "id": "window-1"},
            "window_states": {"window-1": {}},
            "selected_window_id": "window-1",
        },
    }

    created, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, payload)
    assert error is None
    assert status == 201

    duplicate, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, payload)

    assert duplicate is None
    assert status == 409
    assert error == "An analytics view with that name already exists"


def test_dashboard_service_preserves_nested_layout_positions(db_session, sample_ultimate_goal, test_user):
    service = DashboardService(db_session)
    layout = {
        "version": 1,
        "layout": {
            "type": "split",
            "direction": "vertical",
            "position": 61.25,
            "first": {
                "type": "split",
                "direction": "horizontal",
                "position": 37.5,
                "first": {"type": "window", "id": "window-1"},
                "second": {"type": "window", "id": "window-2"},
            },
            "second": {"type": "window", "id": "window-3"},
        },
        "window_states": {
            "window-1": {"selectedCategory": "goals"},
            "window-2": {"selectedCategory": "sessions"},
            "window-3": {"selectedCategory": "activities"},
        },
        "selected_window_id": "window-2",
    }

    created, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "Split Layout",
        "layout": layout,
    })

    assert error is None
    assert status == 201
    assert created["data"]["layout"]["layout"]["position"] == 61.25
    assert created["data"]["layout"]["layout"]["first"]["position"] == 37.5

    updated_layout = {
        **layout,
        "layout": {
            **layout["layout"],
            "position": 44.5,
        },
    }
    updated, error, status = service.update_dashboard(
        sample_ultimate_goal.id,
        created["data"]["id"],
        test_user.id,
        {"layout": updated_layout},
    )

    assert error is None
    assert status == 200
    assert updated["data"]["layout"]["layout"]["position"] == 44.5
    assert updated["data"]["layout"]["layout"]["first"]["position"] == 37.5


def test_dashboard_service_reuses_soft_deleted_name_on_create(db_session, sample_ultimate_goal, test_user):
    service = DashboardService(db_session)
    layout = {
        "version": 1,
        "layout": {"type": "window", "id": "window-1"},
        "window_states": {"window-1": {"selectedCategory": "goals"}},
        "selected_window_id": "window-1",
    }

    created, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "Test",
        "layout": layout,
    })

    assert error is None
    assert status == 201

    deleted, error, status = service.delete_dashboard(
        sample_ultimate_goal.id,
        created["data"]["id"],
        test_user.id,
    )

    assert error is None
    assert status == 200

    recreated_layout = {
        **layout,
        "window_states": {"window-1": {"selectedCategory": "sessions"}},
    }
    recreated, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "Test",
        "layout": recreated_layout,
    })

    assert error is None
    assert status == 201
    assert recreated["data"]["id"] == created["data"]["id"]
    assert recreated["data"]["layout"]["window_states"]["window-1"]["selectedCategory"] == "sessions"

    persisted = db_session.query(models.AnalyticsDashboard).filter_by(id=created["data"]["id"]).first()
    assert persisted is not None
    assert persisted.deleted_at is None


def test_dashboard_service_rejects_rename_to_soft_deleted_name(db_session, sample_ultimate_goal, test_user):
    service = DashboardService(db_session)
    layout = {
        "version": 1,
        "layout": {"type": "window", "id": "window-1"},
        "window_states": {"window-1": {}},
        "selected_window_id": "window-1",
    }

    first, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "First",
        "layout": layout,
    })
    assert error is None
    assert status == 201

    second, error, status = service.create_dashboard(sample_ultimate_goal.id, test_user.id, {
        "name": "Second",
        "layout": layout,
    })
    assert error is None
    assert status == 201

    deleted, error, status = service.delete_dashboard(sample_ultimate_goal.id, first["data"]["id"], test_user.id)
    assert error is None
    assert status == 200

    updated, error, status = service.update_dashboard(
        sample_ultimate_goal.id,
        second["data"]["id"],
        test_user.id,
        {"name": "First"},
    )

    assert updated is None
    assert status == 409
    assert error == "An analytics view with that name already exists"
