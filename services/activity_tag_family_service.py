"""Tag families: ordered, named groups of tags shown together in pickers."""

from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from models import (
    ActivityInstanceTag,
    ActivitySetTag,
    ActivityTagDefinition,
    ActivityTagFamily,
    Goal,
    utc_now,
)
from services.activity_tag_catalog_service import serialize_family
from services.activity_tags import canonical_tag_name, normalize_tag_name
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService


class ActivityTagFamilyService:
    def __init__(self, db_session):
        self.db = db_session

    def _emit(self, event_name, **data):
        event_bus.emit(Event(event_name, data, source="activity_tag_family_service"))

    def _owned_root(self, root_id, user_id):
        return self.db.query(Goal.id).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.deleted_at.is_(None),
        ).first()

    def _family(self, root_id, family_id, user_id):
        if not self._owned_root(root_id, user_id):
            return None
        return self.db.query(ActivityTagFamily).filter(
            ActivityTagFamily.id == family_id,
            ActivityTagFamily.root_id == root_id,
        ).first()

    def _name_conflict(self, root_id, name, *, exclude_id=None):
        query = self.db.query(ActivityTagFamily).filter(
            ActivityTagFamily.root_id == root_id,
            ActivityTagFamily.normalized_name == normalize_tag_name(name),
        )
        if exclude_id:
            query = query.filter(ActivityTagFamily.id != exclude_id)
        existing = query.first()
        if existing is None:
            return None
        return (
            {"code": "tag_family_name_taken", "existing": {"id": existing.id, "name": existing.name}},
            f'A family named "{existing.name}" already exists',
            409,
        )

    def _commit(self, root_id, name, *, exclude_id=None):
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return self._name_conflict(root_id, name, exclude_id=exclude_id) or (
                None, "A conflicting family was changed at the same time", 409,
            )
        return None

    def conflicting_assignments(self, family_id) -> int:
        """Instances and sets that directly hold more than one of the family's tags."""
        total = 0
        for model, owner in (
            (ActivityInstanceTag, ActivityInstanceTag.activity_instance_id),
            (ActivitySetTag, ActivitySetTag.activity_set_id),
        ):
            grouped = self.db.query(owner).join(
                ActivityTagDefinition, ActivityTagDefinition.id == model.tag_definition_id,
            ).filter(ActivityTagDefinition.family_id == family_id).group_by(owner).having(
                func.count(model.tag_definition_id) > 1,
            ).subquery()
            total += self.db.query(func.count()).select_from(grouped).scalar() or 0
        return total

    def _payload(self, family):
        payload = serialize_family(family)
        if family.single_select:
            payload["conflicting_assignments"] = self.conflicting_assignments(family.id)
        return payload

    def create(self, root_id, user_id, data):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        name = canonical_tag_name(data["name"])
        conflict = self._name_conflict(root_id, name)
        if conflict:
            return conflict
        quota = QuotaService(self.db)
        _, error, status = quota.check_storage_available(user_id, quota.payload_size(name))
        if error:
            return None, error, status
        maximum = self.db.query(func.max(ActivityTagFamily.sort_order)).filter(
            ActivityTagFamily.root_id == root_id,
        ).scalar()
        family = ActivityTagFamily(
            root_id=root_id,
            name=name,
            single_select=data.get("single_select", False),
            sort_order=(maximum if maximum is not None else -1) + 1,
        )
        self.db.add(family)
        failure = self._commit(root_id, name)
        if failure:
            return failure
        self._emit(Events.ACTIVITY_TAG_FAMILY_CREATED, root_id=root_id, family_id=family.id, name=family.name)
        return self._payload(family), None, 201

    def update(self, root_id, family_id, user_id, data):
        family = self._family(root_id, family_id, user_id)
        if not family:
            return None, "Tag family not found", 404
        if data["version"] != family.version:
            return {"current": serialize_family(family)}, "Tag family was changed elsewhere", 409
        name = canonical_tag_name(data.get("name", family.name))
        conflict = self._name_conflict(root_id, name, exclude_id=family.id)
        if conflict:
            return conflict
        family.name = name
        if "single_select" in data:
            family.single_select = data["single_select"]
        family.version += 1
        family.updated_at = utc_now()
        failure = self._commit(root_id, name, exclude_id=family.id)
        if failure:
            return failure
        self._emit(Events.ACTIVITY_TAG_FAMILY_UPDATED, root_id=root_id, family_id=family.id, name=family.name)
        return self._payload(family), None, 200

    def delete(self, root_id, family_id, user_id, version):
        """Delete the family; its tags move to the end of "Other tags" in their family order."""
        family = self._family(root_id, family_id, user_id)
        if not family:
            return None, "Tag family not found", 404
        if version is not None and version != family.version:
            return {"current": serialize_family(family)}, "Tag family was changed elsewhere", 409
        maximum = self.db.query(func.max(ActivityTagDefinition.sort_order)).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.family_id.is_(None),
        ).scalar()
        offset = (maximum if maximum is not None else -1) + 1
        members = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.family_id == family.id,
        ).order_by(ActivityTagDefinition.sort_order, ActivityTagDefinition.name).all()
        now = utc_now()
        for index, tag in enumerate(members):
            tag.family_id = None
            tag.sort_order = offset + index
            tag.version += 1
            tag.updated_at = now
        name = family.name
        self.db.delete(family)
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_FAMILY_DELETED, root_id=root_id, family_id=family_id, name=name)
        return {"message": "Tag family deleted", "id": family_id, "moved_tag_ids": [tag.id for tag in members]}, None, 200

    def reorder(self, root_id, user_id, family_ids):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        ordered = list(dict.fromkeys(family_ids))
        rows = {
            row.id: row
            for row in self.db.query(ActivityTagFamily).filter(
                ActivityTagFamily.root_id == root_id,
            ).with_for_update().all()
        }
        if set(ordered) != set(rows):
            return None, "Send every family exactly once", 400
        now = utc_now()
        for index, family_id in enumerate(ordered):
            row = rows[family_id]
            if row.sort_order != index:
                row.sort_order = index
                row.version += 1
                row.updated_at = now
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_FAMILY_UPDATED, root_id=root_id, reordered_family_ids=ordered)
        return {"families": [serialize_family(rows[family_id]) for family_id in ordered]}, None, 200
