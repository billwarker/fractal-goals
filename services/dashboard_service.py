import models
from sqlalchemy.exc import IntegrityError

from models import AnalyticsDashboard, validate_root_goal
from services.serializers import serialize_analytics_dashboard
from services.service_types import JsonDict, JsonList, ServiceResult


class DashboardService:
    def __init__(self, db_session):
        self.db_session = db_session

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

        existing = self._get_dashboard_by_name(root_id, current_user_id, data["name"])
        if existing:
            return None, "An analytics view with that name already exists", 409

        deleted_match = self._get_dashboard_by_name(
            root_id,
            current_user_id,
            data["name"],
            include_deleted=True,
        )
        if deleted_match and deleted_match.deleted_at is not None:
            deleted_match.deleted_at = None
            deleted_match.layout = data["layout"]
            conflict_error = self._commit_dashboard_change("An analytics view with that name already exists")
            if conflict_error:
                return None, conflict_error, 409
            return {
                "data": serialize_analytics_dashboard(deleted_match),
                "message": "Analytics view created successfully",
            }, None, 201

        dashboard = AnalyticsDashboard(
            root_id=root_id,
            user_id=current_user_id,
            name=data["name"],
            layout=data["layout"],
        )
        self.db_session.add(dashboard)
        conflict_error = self._commit_dashboard_change("An analytics view with that name already exists")
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_analytics_dashboard(dashboard),
            "message": "Analytics view created successfully",
        }, None, 201

    def update_dashboard(self, root_id, dashboard_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        dashboard = self._get_dashboard(root_id, dashboard_id, current_user_id)
        if not dashboard:
            return None, "Analytics view not found", 404

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
                return None, "An analytics view with that name already exists", 409
            dashboard.name = new_name

        if "layout" in data:
            dashboard.layout = data["layout"]

        conflict_error = self._commit_dashboard_change("An analytics view with that name already exists")
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_analytics_dashboard(dashboard),
            "message": "Analytics view updated successfully",
        }, None, 200

    def delete_dashboard(self, root_id, dashboard_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        dashboard = self._get_dashboard(root_id, dashboard_id, current_user_id)
        if not dashboard:
            return None, "Analytics view not found", 404

        dashboard.deleted_at = models.utc_now()
        self.db_session.commit()

        return {"message": "Analytics view deleted successfully"}, None, 200
