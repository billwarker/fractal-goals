from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityProgressView,
    ActivitySet,
    ActivityTag,
    Goal,
    utc_now,
)
from services.owned_entity_queries import get_owned_activity_definition, get_owned_activity_instance
from services.quota_service import QuotaService
from services.events import Event, Events, event_bus


EMPTY_PROGRESS_VIEW_CONFIG = {
    "schema_version": 1,
    "all_tag_ids": [],
    "any_tag_ids": [],
    "none_tag_ids": [],
}


def normalize_progress_view_config(raw_config) -> dict:
    raw = raw_config.model_dump() if hasattr(raw_config, "model_dump") else (raw_config or {})
    normalized = {"schema_version": 1}
    for key in ("all_tag_ids", "any_tag_ids", "none_tag_ids"):
        values = raw.get(key) or []
        normalized[key] = list(dict.fromkeys(str(value) for value in values if value))
    return normalized


def serialize_activity_tag(tag: ActivityTag) -> dict:
    return {
        "id": tag.id,
        "root_id": tag.root_id,
        "activity_definition_id": tag.activity_definition_id,
        "name": tag.name,
        "color": tag.color,
        "sort_order": tag.sort_order,
        "archived": tag.deleted_at is not None,
        "created_at": tag.created_at.isoformat() if tag.created_at else None,
        "updated_at": tag.updated_at.isoformat() if tag.updated_at else None,
    }


def serialize_progress_view(view: ActivityProgressView) -> dict:
    return {
        "id": view.id,
        "root_id": view.root_id,
        "activity_definition_id": view.activity_definition_id,
        "name": view.name,
        "config": normalize_progress_view_config(view.config),
        "version": view.version,
        "created_at": view.created_at.isoformat() if view.created_at else None,
        "updated_at": view.updated_at.isoformat() if view.updated_at else None,
    }


class ActivityProgressViewService:
    def __init__(self, db_session):
        self.db = db_session

    @staticmethod
    def _emit(event_name, **data):
        event_bus.emit(Event(event_name, data, source='activity_progress_view_service'))

    def _owned_root(self, root_id, user_id):
        return self.db.query(Goal).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.deleted_at.is_(None),
        ).first()

    def _activity(self, root_id, activity_id, user_id):
        if not self._owned_root(root_id, user_id):
            return None
        return get_owned_activity_definition(self.db, root_id, activity_id)

    def _storage_check(self, user_id, *values):
        quota = QuotaService(self.db)
        return quota.check_storage_available(user_id, quota._payload_size(*values))

    def _validate_config_tags(self, activity, config, *, include_archived=True):
        normalized = normalize_progress_view_config(config)
        tag_ids = {
            tag_id
            for key in ("all_tag_ids", "any_tag_ids", "none_tag_ids")
            for tag_id in normalized[key]
        }
        if not tag_ids:
            return normalized, None
        query = self.db.query(ActivityTag.id).filter(
            ActivityTag.id.in_(tag_ids),
            ActivityTag.root_id == activity.root_id,
            ActivityTag.activity_definition_id == activity.id,
        )
        if not include_archived:
            query = query.filter(ActivityTag.deleted_at.is_(None))
        found = {row[0] for row in query.all()}
        if found != tag_ids:
            return None, "Progress view contains tags that do not belong to this activity"
        return normalized, None

    def list_tags(self, root_id, activity_id, user_id, *, include_archived=True):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        query = self.db.query(ActivityTag).filter(
            ActivityTag.activity_definition_id == activity.id,
            ActivityTag.root_id == root_id,
        )
        if not include_archived:
            query = query.filter(ActivityTag.deleted_at.is_(None))
        rows = query.order_by(ActivityTag.deleted_at.asc(), ActivityTag.sort_order, ActivityTag.name).all()
        return [serialize_activity_tag(row) for row in rows], None, 200

    def create_tag(self, root_id, activity_id, user_id, data):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        _, error, status = self._storage_check(user_id, data.get("name"), data.get("color"))
        if error:
            return None, error, status
        name = data["name"].strip()
        existing = self.db.query(ActivityTag).filter(
            ActivityTag.activity_definition_id == activity.id,
            func.lower(ActivityTag.name) == name.lower(),
            ActivityTag.deleted_at.is_(None),
        ).first()
        if existing:
            return None, "A tag with this name already exists for this activity", 409
        sort_order = data.get("sort_order")
        if sort_order is None:
            maximum = self.db.query(func.max(ActivityTag.sort_order)).filter(
                ActivityTag.activity_definition_id == activity.id,
                ActivityTag.deleted_at.is_(None),
            ).scalar()
            sort_order = (maximum if maximum is not None else -1) + 1
        tag = ActivityTag(
            root_id=root_id,
            activity_definition_id=activity.id,
            name=name,
            color=data.get("color"),
            sort_order=sort_order,
        )
        self.db.add(tag)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A tag with this name already exists for this activity", 409
        self._emit(Events.ACTIVITY_TAG_CREATED, root_id=root_id, activity_id=activity.id, activity_tag_id=tag.id, name=tag.name)
        return serialize_activity_tag(tag), None, 201

    def update_tag(self, root_id, activity_id, tag_id, user_id, data):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        tag = self.db.query(ActivityTag).filter(
            ActivityTag.id == tag_id,
            ActivityTag.activity_definition_id == activity.id,
            ActivityTag.deleted_at.is_(None),
        ).first()
        if not tag:
            return None, "Tag not found", 404
        _, quota_error, quota_status = self._storage_check(
            user_id,
            data.get("name"),
            data.get("color"),
        )
        if quota_error:
            return None, quota_error, quota_status
        if "name" in data and data["name"] is not None:
            name = data["name"].strip()
            conflict = self.db.query(ActivityTag.id).filter(
                ActivityTag.activity_definition_id == activity.id,
                ActivityTag.id != tag.id,
                func.lower(ActivityTag.name) == name.lower(),
                ActivityTag.deleted_at.is_(None),
            ).first()
            if conflict:
                return None, "A tag with this name already exists for this activity", 409
            tag.name = name
        for field in ("color", "sort_order"):
            if field in data:
                setattr(tag, field, data[field])
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A tag with this name already exists for this activity", 409
        self._emit(Events.ACTIVITY_TAG_UPDATED, root_id=root_id, activity_id=activity.id, activity_tag_id=tag.id, name=tag.name)
        return serialize_activity_tag(tag), None, 200

    def archive_tag(self, root_id, activity_id, tag_id, user_id):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        tag = self.db.query(ActivityTag).filter(
            ActivityTag.id == tag_id,
            ActivityTag.activity_definition_id == activity.id,
            ActivityTag.deleted_at.is_(None),
        ).first()
        if not tag:
            return None, "Tag not found", 404
        tag.deleted_at = utc_now()
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_ARCHIVED, root_id=root_id, activity_id=activity.id, activity_tag_id=tag.id, name=tag.name)
        return {"message": "Tag archived", "id": tag.id}, None, 200

    def _assignable_tags(self, activity, tag_ids, *, retained_archived_ids=()):
        normalized = list(dict.fromkeys(tag_ids or []))
        if not normalized:
            return [], None
        retained = set(retained_archived_ids)
        tags = self.db.query(ActivityTag).filter(
            ActivityTag.id.in_(normalized),
            ActivityTag.root_id == activity.root_id,
            ActivityTag.activity_definition_id == activity.id,
            (ActivityTag.deleted_at.is_(None)) | (ActivityTag.id.in_(retained)),
        ).all()
        if {tag.id for tag in tags} != set(normalized):
            return None, "One or more tags are unavailable for this activity"
        by_id = {tag.id: tag for tag in tags}
        return [by_id[tag_id] for tag_id in normalized], None

    def replace_instance_tags(self, root_id, instance_id, user_id, tag_ids):
        if not self._owned_root(root_id, user_id):
            return None, "Activity instance not found", 404
        instance = get_owned_activity_instance(self.db, root_id, instance_id)
        if not instance:
            return None, "Activity instance not found", 404
        tags, error = self._assignable_tags(
            instance.definition,
            tag_ids,
            retained_archived_ids={tag.id for tag in instance.tags if tag.deleted_at is not None},
        )
        if error:
            return None, error, 400
        instance.tags = tags
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED, root_id=root_id, activity_id=instance.activity_definition_id, instance_id=instance.id, tag_ids=[tag.id for tag in tags])
        return [serialize_activity_tag(tag) for tag in instance.tags], None, 200

    def replace_set_tags(self, root_id, set_id, user_id, tag_ids):
        if not self._owned_root(root_id, user_id):
            return None, "Activity set not found", 404
        activity_set = self.db.query(ActivitySet).join(ActivityInstance).filter(
            ActivitySet.id == set_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
        ).first()
        if not activity_set:
            return None, "Activity set not found", 404
        tags, error = self._assignable_tags(
            activity_set.activity_instance.definition,
            tag_ids,
            retained_archived_ids={tag.id for tag in activity_set.tags if tag.deleted_at is not None},
        )
        if error:
            return None, error, 400
        activity_set.tags = tags
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED, root_id=root_id, activity_id=activity_set.activity_instance.activity_definition_id, instance_id=activity_set.activity_instance_id, activity_set_id=activity_set.id, tag_ids=[tag.id for tag in tags])
        return [serialize_activity_tag(tag) for tag in activity_set.tags], None, 200

    def list_views(self, root_id, activity_id, user_id):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        rows = self.db.query(ActivityProgressView).filter(
            ActivityProgressView.activity_definition_id == activity.id,
            ActivityProgressView.deleted_at.is_(None),
        ).order_by(ActivityProgressView.updated_at.desc(), ActivityProgressView.name).all()
        return {
            "active_view_id": activity.active_progress_view_id,
            "views": [serialize_progress_view(row) for row in rows],
        }, None, 200

    def create_view(self, root_id, activity_id, user_id, data):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        config, error = self._validate_config_tags(activity, data.get("config"))
        if error:
            return None, error, 400
        name = data["name"].strip()
        conflict = self.db.query(ActivityProgressView.id).filter(
            ActivityProgressView.activity_definition_id == activity.id,
            func.lower(ActivityProgressView.name) == name.lower(),
            ActivityProgressView.deleted_at.is_(None),
        ).first()
        if conflict:
            return None, "A progress view with this name already exists", 409
        _, quota_error, quota_status = self._storage_check(user_id, name, config)
        if quota_error:
            return None, quota_error, quota_status
        view = ActivityProgressView(root_id=root_id, activity_definition_id=activity.id, name=name, config=config)
        self.db.add(view)
        try:
            self.db.flush()
            if data.get("activate", True):
                activity.active_progress_view_id = view.id
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A progress view with this name already exists", 409
        self._emit(Events.ACTIVITY_PROGRESS_VIEW_CREATED, root_id=root_id, activity_id=activity.id, activity_progress_view_id=view.id, name=view.name, active=activity.active_progress_view_id == view.id)
        return {**serialize_progress_view(view), "active": activity.active_progress_view_id == view.id}, None, 201

    def _view(self, activity, view_id):
        return self.db.query(ActivityProgressView).filter(
            ActivityProgressView.id == view_id,
            ActivityProgressView.activity_definition_id == activity.id,
            ActivityProgressView.deleted_at.is_(None),
        ).first()

    def update_view(self, root_id, activity_id, view_id, user_id, data):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        view = self._view(activity, view_id)
        if not view:
            return None, "Progress view not found", 404
        if view.version != data["version"]:
            return {"current": serialize_progress_view(view)}, "Progress view was changed elsewhere", 409
        _, quota_error, quota_status = self._storage_check(
            user_id,
            data.get("name"),
            data.get("config"),
        )
        if quota_error:
            return None, quota_error, quota_status
        updates = {}
        if data.get("name") is not None:
            name = data["name"].strip()
            conflict = self.db.query(ActivityProgressView.id).filter(
                ActivityProgressView.activity_definition_id == activity.id,
                ActivityProgressView.id != view.id,
                func.lower(ActivityProgressView.name) == name.lower(),
                ActivityProgressView.deleted_at.is_(None),
            ).first()
            if conflict:
                return None, "A progress view with this name already exists", 409
            updates["name"] = name
        if data.get("config") is not None:
            config, error = self._validate_config_tags(activity, data["config"])
            if error:
                return None, error, 400
            updates["config"] = config
        updates.update(version=data["version"] + 1, updated_at=utc_now())
        changed = self.db.query(ActivityProgressView).filter(
            ActivityProgressView.id == view.id,
            ActivityProgressView.version == data["version"],
            ActivityProgressView.deleted_at.is_(None),
        ).update(updates, synchronize_session=False)
        if changed != 1:
            self.db.rollback()
            current = self._view(activity, view_id)
            return {"current": serialize_progress_view(current)} if current else None, "Progress view was changed elsewhere", 409
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A progress view with this name already exists", 409
        self.db.refresh(view)
        self._emit(Events.ACTIVITY_PROGRESS_VIEW_UPDATED, root_id=root_id, activity_id=activity.id, activity_progress_view_id=view.id, name=view.name, version=view.version)
        return serialize_progress_view(view), None, 200

    def activate_view(self, root_id, activity_id, user_id, view_id):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        activity = self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity.id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).with_for_update().one()
        if view_id is not None and not self._view(activity, view_id):
            return None, "Progress view not found", 404
        activity.active_progress_view_id = view_id
        self.db.commit()
        self._emit(Events.ACTIVITY_PROGRESS_VIEW_ACTIVATED, root_id=root_id, activity_id=activity.id, activity_progress_view_id=view_id)
        return {"active_view_id": view_id}, None, 200

    def delete_view(self, root_id, activity_id, view_id, user_id):
        activity = self._activity(root_id, activity_id, user_id)
        if not activity:
            return None, "Activity not found", 404
        activity = self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity.id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).with_for_update().one()
        view = self._view(activity, view_id)
        if not view:
            return None, "Progress view not found", 404
        if activity.active_progress_view_id == view.id:
            activity.active_progress_view_id = None
        view.deleted_at = utc_now()
        self.db.commit()
        self._emit(Events.ACTIVITY_PROGRESS_VIEW_DELETED, root_id=root_id, activity_id=activity.id, activity_progress_view_id=view.id, name=view.name, active_view_id=activity.active_progress_view_id)
        return {"message": "Progress view deleted", "active_view_id": activity.active_progress_view_id}, None, 200

    def resolve_config(self, activity, *, view_id=None, inline_config=None):
        if inline_config is not None:
            return self._validate_config_tags(activity, inline_config)
        resolved_id = view_id if view_id is not None else activity.active_progress_view_id
        if resolved_id is None:
            return dict(EMPTY_PROGRESS_VIEW_CONFIG), None
        view = self._view(activity, resolved_id)
        if not view:
            return None, "Progress view not found"
        return normalize_progress_view_config(view.config), None
