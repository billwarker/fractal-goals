import models
from sqlalchemy.exc import IntegrityError

from models import PageSurfaceLayout, validate_root_goal
from services.serializers import serialize_page_surface_layout
from services.service_types import JsonDict, JsonList, ServiceResult


class PageSurfaceService:
    """CRUD for user-configurable page surface layouts.

    Mirrors :class:`DashboardService`: root ownership is validated up front,
    layouts are soft-deleted, and recreating a soft-deleted name restores it.
    Adds a ``page`` discriminator and per-(user, root, page) default exclusivity.
    """

    def __init__(self, db_session):
        self.db_session = db_session

    def _get_root(self, root_id, current_user_id):
        return validate_root_goal(self.db_session, root_id, owner_id=current_user_id)

    def _get_layout(self, root_id, layout_id, current_user_id):
        return self.db_session.query(PageSurfaceLayout).filter(
            PageSurfaceLayout.id == layout_id,
            PageSurfaceLayout.root_id == root_id,
            PageSurfaceLayout.user_id == current_user_id,
            PageSurfaceLayout.deleted_at.is_(None),
        ).first()

    def _get_layout_by_name(self, root_id, current_user_id, page, name, *, include_deleted=False, exclude_id=None):
        query = self.db_session.query(PageSurfaceLayout).filter(
            PageSurfaceLayout.root_id == root_id,
            PageSurfaceLayout.user_id == current_user_id,
            PageSurfaceLayout.page == page,
            PageSurfaceLayout.name == name,
        )
        if not include_deleted:
            query = query.filter(PageSurfaceLayout.deleted_at.is_(None))
        if exclude_id:
            query = query.filter(PageSurfaceLayout.id != exclude_id)
        return query.order_by(
            PageSurfaceLayout.updated_at.desc(),
            PageSurfaceLayout.created_at.desc(),
        ).first()

    def _clear_other_defaults(self, root_id, current_user_id, page, keep_id):
        """Ensure at most one default layout per (user, root, page)."""
        others = self.db_session.query(PageSurfaceLayout).filter(
            PageSurfaceLayout.root_id == root_id,
            PageSurfaceLayout.user_id == current_user_id,
            PageSurfaceLayout.page == page,
            PageSurfaceLayout.is_default.is_(True),
            PageSurfaceLayout.id != keep_id,
            PageSurfaceLayout.deleted_at.is_(None),
        ).all()
        for layout in others:
            layout.is_default = False

    def _commit(self, conflict_message):
        try:
            self.db_session.commit()
            return None
        except IntegrityError:
            self.db_session.rollback()
            return conflict_message

    def list_layouts(self, root_id, current_user_id, page) -> ServiceResult[JsonList]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        layouts = self.db_session.query(PageSurfaceLayout).filter(
            PageSurfaceLayout.root_id == root_id,
            PageSurfaceLayout.user_id == current_user_id,
            PageSurfaceLayout.page == page,
            PageSurfaceLayout.deleted_at.is_(None),
        ).order_by(
            PageSurfaceLayout.is_default.desc(),
            PageSurfaceLayout.updated_at.desc(),
            PageSurfaceLayout.created_at.desc(),
        ).all()

        return {
            "data": [serialize_page_surface_layout(layout) for layout in layouts]
        }, None, 200

    def create_layout(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        page = data["page"]
        conflict_message = "A surface layout with that name already exists"

        existing = self._get_layout_by_name(root_id, current_user_id, page, data["name"])
        if existing:
            return None, conflict_message, 409

        deleted_match = self._get_layout_by_name(
            root_id, current_user_id, page, data["name"], include_deleted=True,
        )
        if deleted_match and deleted_match.deleted_at is not None:
            deleted_match.deleted_at = None
            deleted_match.desktop_config = data["desktop_config"]
            deleted_match.mobile_config = data["mobile_config"]
            deleted_match.is_default = bool(data.get("is_default", False))
            if deleted_match.is_default:
                self._clear_other_defaults(root_id, current_user_id, page, deleted_match.id)
            conflict_error = self._commit(conflict_message)
            if conflict_error:
                return None, conflict_error, 409
            return {
                "data": serialize_page_surface_layout(deleted_match),
                "message": "Surface layout created successfully",
            }, None, 201

        layout = PageSurfaceLayout(
            root_id=root_id,
            user_id=current_user_id,
            page=page,
            name=data["name"],
            is_default=bool(data.get("is_default", False)),
            desktop_config=data["desktop_config"],
            mobile_config=data["mobile_config"],
        )
        self.db_session.add(layout)
        self.db_session.flush()
        if layout.is_default:
            self._clear_other_defaults(root_id, current_user_id, page, layout.id)

        conflict_error = self._commit(conflict_message)
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_page_surface_layout(layout),
            "message": "Surface layout created successfully",
        }, None, 201

    def update_layout(self, root_id, layout_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        layout = self._get_layout(root_id, layout_id, current_user_id)
        if not layout:
            return None, "Surface layout not found", 404

        conflict_message = "A surface layout with that name already exists"

        new_name = data.get("name")
        if new_name and new_name != layout.name:
            existing = self._get_layout_by_name(
                root_id, current_user_id, layout.page, new_name,
                include_deleted=True, exclude_id=layout.id,
            )
            if existing:
                return None, conflict_message, 409
            layout.name = new_name

        if "desktop_config" in data and data["desktop_config"] is not None:
            layout.desktop_config = data["desktop_config"]
        if "mobile_config" in data and data["mobile_config"] is not None:
            layout.mobile_config = data["mobile_config"]
        if data.get("is_default") is not None:
            layout.is_default = bool(data["is_default"])
            if layout.is_default:
                self._clear_other_defaults(root_id, current_user_id, layout.page, layout.id)

        conflict_error = self._commit(conflict_message)
        if conflict_error:
            return None, conflict_error, 409

        return {
            "data": serialize_page_surface_layout(layout),
            "message": "Surface layout updated successfully",
        }, None, 200

    def set_default_layout(self, root_id, layout_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        layout = self._get_layout(root_id, layout_id, current_user_id)
        if not layout:
            return None, "Surface layout not found", 404

        layout.is_default = True
        self._clear_other_defaults(root_id, current_user_id, layout.page, layout.id)
        self.db_session.commit()

        return {
            "data": serialize_page_surface_layout(layout),
            "message": "Default surface layout updated",
        }, None, 200

    def delete_layout(self, root_id, layout_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        layout = self._get_layout(root_id, layout_id, current_user_id)
        if not layout:
            return None, "Surface layout not found", 404

        layout.deleted_at = models.utc_now()
        layout.is_default = False
        self.db_session.commit()

        return {"message": "Surface layout deleted successfully"}, None, 200
