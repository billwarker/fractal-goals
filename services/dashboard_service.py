import models
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from models import AnalyticsDashboard, Goal, GoalAnalyticsView, validate_root_goal
from services.goal_chart_service import _view_window
from services.serializers import serialize_analytics_dashboard
from services.service_types import JsonDict, JsonList, ServiceResult
from validators.core import MAX_NAME_LENGTH


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
            AnalyticsDashboard.pinned.desc(),
            AnalyticsDashboard.last_opened_at.desc().nulls_last(),
            AnalyticsDashboard.updated_at.desc(),
            AnalyticsDashboard.created_at.desc(),
            AnalyticsDashboard.id.asc(),
        ).all()
        goals_by_view = self._goals_by_view([dashboard.id for dashboard in dashboards if dashboard.kind == "view"])

        return {
            "data": [self._serialize_listed(dashboard, goals_by_view) for dashboard in dashboards]
        }, None, 200

    def _goals_by_view(self, view_ids):
        """The live goals each view is attached to, in one query (not one per view)."""
        goals_by_view = {view_id: [] for view_id in view_ids}
        if not view_ids:
            return goals_by_view
        rows = self.db_session.execute(select(
            GoalAnalyticsView.dashboard_id, Goal.id, Goal.name, Goal.level_id,
        ).join(Goal, Goal.id == GoalAnalyticsView.goal_id).where(
            GoalAnalyticsView.dashboard_id.in_(view_ids), Goal.deleted_at.is_(None),
        ).order_by(Goal.name))
        for row in rows:
            goals_by_view[row.dashboard_id].append({"id": row.id, "name": row.name, "level_id": row.level_id})
        return goals_by_view

    @staticmethod
    def _serialize_listed(dashboard, goals_by_view):
        window = _view_window(dashboard.layout) if dashboard.kind == "view" else None
        visualization = (
            {"category": window.get("selectedCategory"), "id": window.get("selectedVisualization")} if window else None
        )
        return serialize_analytics_dashboard(
            dashboard, goals=goals_by_view.get(dashboard.id, []) if dashboard.kind == "view" else [], visualization=visualization,
        )

    def mark_opened(self, root_id, dashboard_id, current_user_id) -> ServiceResult[JsonDict]:
        """Remember that a saved view or dashboard was opened (for ordering); its updated date stays."""
        if not self._get_root(root_id, current_user_id):
            return None, "Fractal not found or access denied", 404
        updated = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.id == dashboard_id,
            AnalyticsDashboard.root_id == root_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.deleted_at.is_(None),
        ).update({
            AnalyticsDashboard.last_opened_at: models.utc_now(),
            AnalyticsDashboard.updated_at: AnalyticsDashboard.updated_at,
        }, synchronize_session=False)
        if not updated:
            self.db_session.rollback()
            return None, "Analytics saved object not found", 404
        self.db_session.commit()
        return {"message": "Opened"}, None, 200

    def duplicate_dashboard(self, root_id, dashboard_id, current_user_id) -> ServiceResult[JsonDict]:
        """A copy named "‹name› (copy)" (or "(copy 2)" and on); goal links stay with the original."""
        if not self._get_root(root_id, current_user_id):
            return None, "Fractal not found or access denied", 404
        dashboard = self._get_dashboard(root_id, dashboard_id, current_user_id)
        if not dashboard:
            return None, "Analytics saved object not found", 404
        for attempt in range(1, 100):
            suffix = " (copy)" if attempt == 1 else f" (copy {attempt})"
            name = f"{dashboard.name[:MAX_NAME_LENGTH - len(suffix)]}{suffix}"
            if not self._get_dashboard_by_name(root_id, current_user_id, name, include_deleted=True):
                break
        else:
            return None, "Too many copies with that name", 409
        return self.create_dashboard(root_id, current_user_id, {
            "name": name, "kind": dashboard.kind or "dashboard", "layout": dashboard.layout,
        })

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

        if data.get("pinned") is not None and all(data.get(key) is None for key in ("name", "kind", "layout")):
            # Pinning isn't an edit: the saved object's updated date stays.
            self.db_session.query(AnalyticsDashboard).filter(AnalyticsDashboard.id == dashboard.id).update({
                AnalyticsDashboard.pinned: bool(data["pinned"]),
                AnalyticsDashboard.updated_at: AnalyticsDashboard.updated_at,
            }, synchronize_session=False)
            self.db_session.commit()
            self.db_session.refresh(dashboard)
            return {"data": serialize_analytics_dashboard(dashboard), "message": "Pinned" if dashboard.pinned else "Unpinned"}, None, 200

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
        if data.get("pinned") is not None:
            dashboard.pinned = bool(data["pinned"])

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
        # Goals stop showing a deleted view (the client warns with the goals first).
        self.db_session.query(GoalAnalyticsView).filter_by(dashboard_id=dashboard.id).delete(synchronize_session=False)
        self.db_session.commit()

        return {"message": f"{self._label_for_kind(dashboard.kind).title()} deleted successfully"}, None, 200
