import models
from sqlalchemy.exc import IntegrityError

from models import AnalyticsDashboard, validate_root_goal
from services.serializers import serialize_analytics_dashboard
from services.service_types import JsonDict, JsonList, ServiceResult


class DashboardService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _label_for_kind(self, kind):
        return "analytics view" if kind == "view" else "analytics dashboard"

    def _configured_window_count(self, layout):
        if not isinstance(layout, dict):
            return 0
        if layout.get("type") == "analytics_view":
            profile = layout.get("profile") if isinstance(layout.get("profile"), dict) else {}
            return 1 if profile.get("selectedCategory") and profile.get("selectedVisualization") else 0
        window_states = layout.get("window_states") if isinstance(layout.get("window_states"), dict) else {}
        return sum(
            1
            for state in window_states.values()
            if isinstance(state, dict)
            and state.get("selectedCategory")
            and state.get("selectedVisualization")
        )

    def _infer_kind(self, layout):
        return "view" if self._configured_window_count(layout) <= 1 else "dashboard"

    def _normalize_kind_and_layout(self, data, *, existing_kind=None):
        layout = data.get("layout")
        kind = data.get("kind") or existing_kind or (self._infer_kind(layout) if layout is not None else "dashboard")
        if kind not in {"view", "dashboard"}:
            return None, "kind must be 'view' or 'dashboard'", 400
        if layout is not None:
            configured_count = self._configured_window_count(layout)
            if kind == "view" and configured_count > 1:
                return None, "Analytics views can contain only one configured chart", 400
            if kind == "dashboard" and layout.get("type") == "analytics_view":
                return None, "Analytics dashboards require a dashboard layout", 400
        return kind, None, None

    def _get_root(self, root_id, current_user_id):
        return validate_root_goal(self.db_session, root_id, owner_id=current_user_id)

    def _get_dashboard(self, root_id, dashboard_id, current_user_id):
        return self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.id == dashboard_id,
            AnalyticsDashboard.root_id == root_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.deleted_at.is_(None),
        ).first()

    def _get_dashboard_by_name(self, root_id, current_user_id, name, *, include_deleted=False, exclude_id=None):
        query = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.root_id == root_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.name == name,
        )
        if not include_deleted:
            query = query.filter(AnalyticsDashboard.deleted_at.is_(None))
        if exclude_id:
            query = query.filter(AnalyticsDashboard.id != exclude_id)
        return query.order_by(AnalyticsDashboard.updated_at.desc(), AnalyticsDashboard.created_at.desc()).first()

    def _commit_dashboard_change(self, conflict_message):
        try:
            self.db_session.commit()
            return None
        except IntegrityError:
            self.db_session.rollback()
            return conflict_message

    def list_dashboards(self, root_id, current_user_id) -> ServiceResult[JsonList]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        dashboards = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.root_id == root_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.deleted_at.is_(None),
        ).order_by(
            AnalyticsDashboard.updated_at.desc(),
            AnalyticsDashboard.created_at.desc(),
        ).all()

        return {
            "data": [serialize_analytics_dashboard(dashboard) for dashboard in dashboards]
        }, None, 200

    def create_dashboard(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        kind, error, status = self._normalize_kind_and_layout(data)
        if error:
            return None, error, status
        label = self._label_for_kind(kind)

        existing = self._get_dashboard_by_name(root_id, current_user_id, data["name"])
        if existing:
            return None, f"An {label} with that name already exists", 409

        deleted_match = self._get_dashboard_by_name(
            root_id,
            current_user_id,
            data["name"],
            include_deleted=True,
        )
        if deleted_match and deleted_match.deleted_at is not None:
            deleted_match.deleted_at = None
            deleted_match.kind = kind
            deleted_match.layout = data["layout"]
            conflict_error = self._commit_dashboard_change(f"An {label} with that name already exists")
            if conflict_error:
                return None, conflict_error, 409
            return {
                "data": serialize_analytics_dashboard(deleted_match),
                "message": f"{label.title()} created successfully",
            }, None, 201

        dashboard = AnalyticsDashboard(
            root_id=root_id,
            user_id=current_user_id,
            name=data["name"],
            kind=kind,
            layout=data["layout"],
        )
        self.db_session.add(dashboard)
        conflict_error = self._commit_dashboard_change(f"An {label} with that name already exists")
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_analytics_dashboard(dashboard),
            "message": f"{label.title()} created successfully",
        }, None, 201

    def update_dashboard(self, root_id, dashboard_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        dashboard = self._get_dashboard(root_id, dashboard_id, current_user_id)
        if not dashboard:
            return None, "Analytics saved object not found", 404

        kind, error, status = self._normalize_kind_and_layout(data, existing_kind=dashboard.kind or "dashboard")
        if error:
            return None, error, status
        label = self._label_for_kind(kind)

        new_name = data.get("name")
        if new_name and new_name != dashboard.name:
            existing = self._get_dashboard_by_name(
                root_id,
                current_user_id,
                new_name,
                include_deleted=True,
                exclude_id=dashboard.id,
            )
            if existing:
                return None, f"An {label} with that name already exists", 409
            dashboard.name = new_name

        if "kind" in data:
            dashboard.kind = kind
        if "layout" in data:
            dashboard.layout = data["layout"]

        conflict_error = self._commit_dashboard_change(f"An {label} with that name already exists")
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_analytics_dashboard(dashboard),
            "message": f"{label.title()} updated successfully",
        }, None, 200

    def delete_dashboard(self, root_id, dashboard_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        dashboard = self._get_dashboard(root_id, dashboard_id, current_user_id)
        if not dashboard:
            return None, "Analytics saved object not found", 404

        dashboard.deleted_at = models.utc_now()
        self.db_session.commit()

        return {"message": f"{self._label_for_kind(dashboard.kind).title()} deleted successfully"}, None, 200
