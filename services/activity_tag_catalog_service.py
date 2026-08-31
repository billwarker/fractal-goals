from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityInstanceTag,
    ActivityProgressView,
    ActivitySet,
    ActivitySetTag,
    ActivityTag,
    ActivityTagDefinition,
    CircuitScopeTag,
    Goal,
    utc_now,
)
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService


FILTER_KEYS = ("all_tag_ids", "any_tag_ids", "none_tag_ids")


def normalize_tag_name(value: str) -> str:
    return " ".join((value or "").strip().split()).casefold()


class ActivityTagCatalogService:
    """Owns catalog identity, applicability, merging, and destructive lifecycle."""

    def __init__(self, db_session):
        self.db = db_session

    def _owned_root(self, root_id, user_id):
        return self.db.query(Goal).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.deleted_at.is_(None),
        ).first()

    def _definition(self, root_id, definition_id, user_id, *, include_archived=True):
        if not self._owned_root(root_id, user_id):
            return None
        query = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.id == definition_id,
            ActivityTagDefinition.root_id == root_id,
        )
        if not include_archived:
            query = query.filter(ActivityTagDefinition.deleted_at.is_(None))
        return query.first()

    def _activity_ids(self, root_id, requested_ids=None):
        query = self.db.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        )
        if requested_ids is not None:
            normalized = list(dict.fromkeys(requested_ids))
            query = query.filter(ActivityDefinition.id.in_(normalized))
            found = [row[0] for row in query.all()]
            return found if set(found) == set(normalized) else None
        return [row[0] for row in query.order_by(ActivityDefinition.name, ActivityDefinition.id).all()]

    def _desired_activity_ids(self, root_id, scope, requested_ids):
        if scope == "global":
            return self._activity_ids(root_id)
        if not requested_ids:
            return None
        return self._activity_ids(root_id, requested_ids)

    def _conflicts(self, root_id, name, activity_ids, *, exclude_id=None):
        if not activity_ids:
            return []
        query = self.db.query(ActivityTagDefinition).join(ActivityTag).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTag.deleted_at.is_(None),
            ActivityTag.activity_definition_id.in_(activity_ids),
            func.lower(ActivityTagDefinition.name) == name.lower(),
        )
        if exclude_id:
            query = query.filter(ActivityTagDefinition.id != exclude_id)
        return query.distinct().all()

    def _sync_bindings(self, definition, desired_activity_ids):
        desired = set(desired_activity_ids)
        existing = {binding.activity_definition_id: binding for binding in definition.bindings}
        now = utc_now()
        for activity_id in desired:
            binding = existing.get(activity_id)
            if binding:
                binding.deleted_at = None
                binding.updated_at = now
            else:
                self.db.add(ActivityTag(
                    root_id=definition.root_id,
                    activity_definition_id=activity_id,
                    definition=definition,
                ))
        for activity_id, binding in existing.items():
            if activity_id not in desired and binding.deleted_at is None:
                binding.deleted_at = now
                binding.updated_at = now

    @staticmethod
    def serialize_binding(binding):
        definition = binding.definition
        return {
            "id": binding.id,
            "definition_id": definition.id,
            "root_id": binding.root_id,
            "activity_definition_id": binding.activity_definition_id,
            "name": definition.name,
            "color": definition.color,
            "sort_order": definition.sort_order,
            "scope": definition.scope,
            "version": definition.version,
            "archived": definition.deleted_at is not None or binding.deleted_at is not None,
            "catalog_archived": definition.deleted_at is not None,
            "available": definition.deleted_at is None and binding.deleted_at is None,
            "created_at": binding.created_at.isoformat() if binding.created_at else None,
            "updated_at": definition.updated_at.isoformat() if definition.updated_at else None,
        }

    def _usage_maps(self, root_id, definitions):
        definition_ids = [row.id for row in definitions]
        binding_to_definition = {
            binding.id: definition.id
            for definition in definitions
            for binding in definition.bindings
        }
        usage = defaultdict(Counter)
        if not definition_ids:
            return usage
        for definition_id, count in self.db.query(
            ActivityTag.definition_id, func.count(ActivityInstanceTag.activity_instance_id),
        ).join(ActivityInstanceTag, ActivityInstanceTag.activity_tag_id == ActivityTag.id).filter(
            ActivityTag.definition_id.in_(definition_ids),
        ).group_by(ActivityTag.definition_id).all():
            usage[definition_id]["instances"] = count
        for definition_id, count in self.db.query(
            ActivityTag.definition_id, func.count(ActivitySetTag.activity_set_id),
        ).join(ActivitySetTag, ActivitySetTag.activity_tag_id == ActivityTag.id).filter(
            ActivityTag.definition_id.in_(definition_ids),
        ).group_by(ActivityTag.definition_id).all():
            usage[definition_id]["sets"] = count
        for definition_id, count in self.db.query(
            CircuitScopeTag.activity_tag_definition_id, func.count(CircuitScopeTag.id),
        ).filter(
            CircuitScopeTag.root_id == root_id,
            CircuitScopeTag.activity_tag_definition_id.in_(definition_ids),
        ).group_by(CircuitScopeTag.activity_tag_definition_id).all():
            usage[definition_id]["circuit_scopes"] = count
        for view in self.db.query(ActivityProgressView).filter(
            ActivityProgressView.root_id == root_id,
        ).all():
            referenced = {
                binding_to_definition.get(tag_id)
                for key in FILTER_KEYS
                for tag_id in (view.config or {}).get(key, [])
            }
            for definition_id in referenced - {None}:
                usage[definition_id]["progress_views"] += 1
        return usage

    def _serialize_definition(self, definition, activity_names, usage):
        active_bindings = [
            binding for binding in definition.bindings
            if binding.deleted_at is None and binding.activity_definition_id in activity_names
        ]
        counts = {
            key: int(usage[definition.id].get(key, 0))
            for key in ("instances", "sets", "progress_views", "circuit_scopes")
        }
        counts["total"] = sum(counts.values())
        return {
            "id": definition.id,
            "root_id": definition.root_id,
            "name": definition.name,
            "normalized_name": normalize_tag_name(definition.name),
            "color": definition.color,
            "scope": definition.scope,
            "sort_order": definition.sort_order,
            "version": definition.version,
            "archived": definition.deleted_at is not None,
            "activity_ids": [binding.activity_definition_id for binding in active_bindings],
            "activities": [
                {"id": binding.activity_definition_id, "name": activity_names.get(binding.activity_definition_id, "Unknown activity")}
                for binding in sorted(active_bindings, key=lambda item: activity_names.get(item.activity_definition_id, "").casefold())
            ],
            "bindings": [self.serialize_binding(binding) for binding in definition.bindings],
            "usage": counts,
            "created_at": definition.created_at.isoformat() if definition.created_at else None,
            "updated_at": definition.updated_at.isoformat() if definition.updated_at else None,
        }

    def list_catalog(self, root_id, user_id, *, include_archived=True):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        query = self.db.query(ActivityTagDefinition).options(
            selectinload(ActivityTagDefinition.bindings),
        ).filter(ActivityTagDefinition.root_id == root_id)
        if not include_archived:
            query = query.filter(ActivityTagDefinition.deleted_at.is_(None))
        definitions = query.order_by(
            ActivityTagDefinition.deleted_at.asc(),
            ActivityTagDefinition.sort_order,
            ActivityTagDefinition.name,
        ).all()
        activity_names = dict(self.db.query(ActivityDefinition.id, ActivityDefinition.name).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).all())
        usage = self._usage_maps(root_id, definitions)
        items = [self._serialize_definition(row, activity_names, usage) for row in definitions]
        groups = defaultdict(list)
        for item in items:
            if not item["archived"]:
                groups[item["normalized_name"]].append(item["id"])
        duplicate_groups = [
            {"normalized_name": name, "definition_ids": ids}
            for name, ids in sorted(groups.items()) if len(ids) > 1
        ]
        return {"tags": items, "duplicate_groups": duplicate_groups}, None, 200

    def create(self, root_id, user_id, data):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        scope = data.get("scope", "selected")
        activity_ids = self._desired_activity_ids(root_id, scope, data.get("activity_ids"))
        if activity_ids is None:
            return None, "One or more activities are unavailable", 400
        name = " ".join(data["name"].strip().split())
        conflicts = self._conflicts(root_id, name, activity_ids)
        if conflicts:
            return {
                "conflicts": [{"id": row.id, "name": row.name} for row in conflicts],
            }, "A tag with this name already applies to one or more selected activities", 409
        quota = QuotaService(self.db)
        _, error, status = quota.check_storage_available(
            user_id, quota.payload_size(name, data.get("color"), activity_ids),
        )
        if error:
            return None, error, status
        maximum = self.db.query(func.max(ActivityTagDefinition.sort_order)).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.deleted_at.is_(None),
        ).scalar()
        definition = ActivityTagDefinition(
            root_id=root_id,
            name=name,
            color=data.get("color"),
            scope=scope,
            sort_order=data.get("sort_order", (maximum if maximum is not None else -1) + 1),
        )
        self.db.add(definition)
        self._sync_bindings(definition, activity_ids)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A conflicting tag was created at the same time", 409
        event_bus.emit(Event(Events.ACTIVITY_TAG_CREATED, {
            "root_id": root_id, "activity_tag_definition_id": definition.id, "name": definition.name,
        }, source="activity_tag_catalog_service"))
        payload, _, _ = self.list_catalog(root_id, user_id)
        return next(item for item in payload["tags"] if item["id"] == definition.id), None, 201

    def update(self, root_id, definition_id, user_id, data):
        definition = self._definition(root_id, definition_id, user_id, include_archived=False)
        if not definition:
            return None, "Tag not found", 404
        if data.get("version") != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        scope = data.get("scope", definition.scope)
        current_ids = [row.activity_definition_id for row in definition.bindings if row.deleted_at is None]
        requested_ids = data.get("activity_ids", current_ids)
        activity_ids = self._desired_activity_ids(root_id, scope, requested_ids)
        if activity_ids is None:
            return None, "One or more activities are unavailable", 400
        name = " ".join(data.get("name", definition.name).strip().split())
        conflicts = self._conflicts(root_id, name, activity_ids, exclude_id=definition.id)
        if conflicts:
            return {"conflicts": [row.id for row in conflicts]}, "Tag applicability conflicts with an existing tag", 409
        quota = QuotaService(self.db)
        old_size = quota.payload_size(definition.name, definition.color)
        new_size = quota.payload_size(name, data.get("color", definition.color))
        _, error, status = quota.check_storage_available(user_id, max(0, new_size - old_size))
        if error:
            return None, error, status
        definition.name = name
        if "color" in data:
            definition.color = data["color"]
        if "sort_order" in data:
            definition.sort_order = data["sort_order"]
        definition.scope = scope
        self.db.query(CircuitScopeTag).filter(
            CircuitScopeTag.activity_tag_definition_id == definition.id,
        ).update({CircuitScopeTag.name: name, CircuitScopeTag.color: definition.color}, synchronize_session=False)
        definition.version += 1
        definition.updated_at = utc_now()
        self._sync_bindings(definition, activity_ids)
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "A conflicting tag was changed at the same time", 409
        event_bus.emit(Event(Events.ACTIVITY_TAG_UPDATED, {
            "root_id": root_id, "activity_tag_definition_id": definition.id, "name": definition.name,
        }, source="activity_tag_catalog_service"))
        payload, _, _ = self.list_catalog(root_id, user_id)
        return next(item for item in payload["tags"] if item["id"] == definition.id), None, 200

    def archive(self, root_id, definition_id, user_id, version):
        definition = self._definition(root_id, definition_id, user_id, include_archived=False)
        if not definition:
            return None, "Tag not found", 404
        if version is not None and version != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        if self.db.query(CircuitScopeTag.id).filter(
            CircuitScopeTag.activity_tag_definition_id == definition.id,
        ).first():
            return None, "Tags used by a circuit or round scope cannot be archived", 409
        definition.deleted_at = utc_now()
        definition.updated_at = utc_now()
        definition.version += 1
        self.db.commit()
        event_bus.emit(Event(Events.ACTIVITY_TAG_ARCHIVED, {
            "root_id": root_id, "activity_tag_definition_id": definition.id, "name": definition.name,
        }, source="activity_tag_catalog_service"))
        return {"message": "Tag archived", "id": definition.id, "version": definition.version}, None, 200

    def restore(self, root_id, definition_id, user_id, version):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition or definition.deleted_at is None:
            return None, "Archived tag not found", 404
        if version is not None and version != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        activity_ids = [row.activity_definition_id for row in definition.bindings if row.deleted_at is None]
        conflicts = self._conflicts(root_id, definition.name, activity_ids, exclude_id=definition.id)
        if conflicts:
            return {"conflicts": [row.id for row in conflicts]}, "Restoring this tag would create a duplicate", 409
        quota = QuotaService(self.db)
        _, error, status = quota.check_storage_available(
            user_id, quota.payload_size(definition.name, definition.color),
        )
        if error:
            return None, error, status
        definition.deleted_at = None
        definition.updated_at = utc_now()
        definition.version += 1
        self.db.commit()
        event_bus.emit(Event(Events.ACTIVITY_TAG_RESTORED, {
            "root_id": root_id, "activity_tag_definition_id": definition.id, "name": definition.name,
        }, source="activity_tag_catalog_service"))
        payload, _, _ = self.list_catalog(root_id, user_id)
        return next(item for item in payload["tags"] if item["id"] == definition.id), None, 200

    def impact(self, root_id, definition_id, user_id):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition:
            return None, "Tag not found", 404
        activity_names = dict(self.db.query(ActivityDefinition.id, ActivityDefinition.name).filter(
            ActivityDefinition.root_id == root_id,
        ).all())
        usage = self._usage_maps(root_id, [definition])
        item = self._serialize_definition(definition, activity_names, usage)
        return {
            "id": definition.id,
            "name": definition.name,
            "usage": item["usage"],
            "activities": item["activities"],
            "requires_typed_confirmation": item["usage"]["total"] > 0,
        }, None, 200

    def _remove_binding_ids_from_views(self, root_id, binding_ids, replacements=None):
        replacements = replacements or {}
        changed = 0
        for view in self.db.query(ActivityProgressView).filter(
            ActivityProgressView.root_id == root_id,
        ).with_for_update().all():
            config = dict(view.config or {})
            touched = False
            for key in FILTER_KEYS:
                values = []
                for tag_id in config.get(key, []):
                    replacement = replacements.get(tag_id, tag_id)
                    if tag_id in binding_ids and replacement == tag_id:
                        touched = True
                        continue
                    if replacement != tag_id:
                        touched = True
                    if replacement not in values:
                        values.append(replacement)
                config[key] = values
            if touched:
                view.config = config
                view.version += 1
                view.updated_at = utc_now()
                changed += 1
        return changed

    def hard_delete(self, root_id, definition_id, user_id, data):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition:
            return None, "Tag not found", 404
        if data.get("version") != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        if normalize_tag_name(data.get("confirmation_name", "")) != normalize_tag_name(definition.name):
            return None, "Type the tag name to confirm permanent deletion", 400
        binding_ids = [row.id for row in definition.bindings]
        instance_ids = [row[0] for row in self.db.query(ActivityInstanceTag.activity_instance_id).filter(
            ActivityInstanceTag.activity_tag_id.in_(binding_ids),
        ).all()] if binding_ids else []
        set_ids = [row[0] for row in self.db.query(ActivitySetTag.activity_set_id).filter(
            ActivitySetTag.activity_tag_id.in_(binding_ids),
        ).all()] if binding_ids else []
        if instance_ids:
            self.db.query(ActivityInstance).filter(ActivityInstance.id.in_(instance_ids)).update(
                {ActivityInstance.tag_assignment_version: ActivityInstance.tag_assignment_version + 1},
                synchronize_session=False,
            )
        if set_ids:
            self.db.query(ActivitySet).filter(ActivitySet.id.in_(set_ids)).update(
                {ActivitySet.tag_assignment_version: ActivitySet.tag_assignment_version + 1},
                synchronize_session=False,
            )
        changed_views = self._remove_binding_ids_from_views(root_id, set(binding_ids))
        impact = {
            "instances": len(set(instance_ids)),
            "sets": len(set(set_ids)),
            "progress_views": changed_views,
            "circuit_scopes": self.db.query(CircuitScopeTag).filter(
                CircuitScopeTag.activity_tag_definition_id == definition.id,
            ).count(),
        }
        name = definition.name
        self.db.delete(definition)
        self.db.commit()
        event_bus.emit(Event(Events.ACTIVITY_TAG_UPDATED, {
            "root_id": root_id, "activity_tag_definition_id": definition_id,
            "name": name, "hard_deleted": True, "impact": impact,
        }, source="activity_tag_catalog_service"))
        return {"message": "Tag permanently deleted", "id": definition_id, "removed": impact}, None, 200

    def merge(self, root_id, user_id, data):
        target = self._definition(root_id, data["target_id"], user_id, include_archived=False)
        if not target:
            return None, "Target tag not found", 404
        source_ids = list(dict.fromkeys(data["source_ids"]))
        sources = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.id.in_(source_ids),
            ActivityTagDefinition.deleted_at.is_(None),
        ).with_for_update().all()
        if len(sources) != len(source_ids) or target.id in source_ids:
            return None, "One or more merge sources are unavailable", 400
        versions = data.get("versions", {})
        for definition in [target, *sources]:
            if versions.get(definition.id) != definition.version:
                return {"id": definition.id, "version": definition.version}, "A tag was changed elsewhere", 409

        target_by_activity = {row.activity_definition_id: row for row in target.bindings}
        replacement_ids = {}
        affected_instance_ids = set()
        affected_set_ids = set()
        for source in sources:
            for binding in list(source.bindings):
                destination = target_by_activity.get(binding.activity_definition_id)
                if destination is None:
                    binding.definition = target
                    target_by_activity[binding.activity_definition_id] = binding
                    destination = binding
                elif destination.id != binding.id:
                    replacement_ids[binding.id] = destination.id
                    instance_ids = [row[0] for row in self.db.query(ActivityInstanceTag.activity_instance_id).filter(
                        ActivityInstanceTag.activity_tag_id == binding.id,
                    ).all()]
                    set_ids = [row[0] for row in self.db.query(ActivitySetTag.activity_set_id).filter(
                        ActivitySetTag.activity_tag_id == binding.id,
                    ).all()]
                    affected_instance_ids.update(instance_ids)
                    affected_set_ids.update(set_ids)
                    for instance_id in instance_ids:
                        exists = self.db.query(ActivityInstanceTag).filter_by(
                            activity_instance_id=instance_id, activity_tag_id=destination.id,
                        ).first()
                        if not exists:
                            self.db.add(ActivityInstanceTag(
                                activity_instance_id=instance_id, activity_tag_id=destination.id,
                            ))
                    for set_id in set_ids:
                        exists = self.db.query(ActivitySetTag).filter_by(
                            activity_set_id=set_id, activity_tag_id=destination.id,
                        ).first()
                        if not exists:
                            self.db.add(ActivitySetTag(activity_set_id=set_id, activity_tag_id=destination.id))
                    self.db.delete(binding)
            self.db.query(CircuitScopeTag).filter(
                CircuitScopeTag.activity_tag_definition_id == source.id,
            ).update({CircuitScopeTag.activity_tag_definition_id: target.id}, synchronize_session=False)

        self.db.flush()
        if affected_instance_ids:
            self.db.query(ActivityInstance).filter(ActivityInstance.id.in_(affected_instance_ids)).update(
                {ActivityInstance.tag_assignment_version: ActivityInstance.tag_assignment_version + 1},
                synchronize_session=False,
            )
        if affected_set_ids:
            self.db.query(ActivitySet).filter(ActivitySet.id.in_(affected_set_ids)).update(
                {ActivitySet.tag_assignment_version: ActivitySet.tag_assignment_version + 1},
                synchronize_session=False,
            )
        self._remove_binding_ids_from_views(root_id, set(replacement_ids), replacement_ids)
        target.scope = data.get("scope", "global" if any(row.scope == "global" for row in [target, *sources]) else "selected")
        if "name" in data:
            target.name = " ".join(data["name"].strip().split())
        if "color" in data:
            target.color = data["color"]
        self.db.query(CircuitScopeTag).filter(
            CircuitScopeTag.activity_tag_definition_id == target.id,
        ).update({CircuitScopeTag.name: target.name, CircuitScopeTag.color: target.color}, synchronize_session=False)
        target.version += 1
        target.updated_at = utc_now()
        self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.id.in_(source_ids),
        ).delete(synchronize_session=False)
        if target.scope == "global":
            self._sync_bindings(target, self._activity_ids(root_id))
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            return None, "The selected tags cannot be merged because their applicability conflicts", 409
        payload, _, _ = self.list_catalog(root_id, user_id)
        return next(item for item in payload["tags"] if item["id"] == target.id), None, 200

    def preview_merge(self, root_id, user_id, data):
        target = self._definition(root_id, data["target_id"], user_id, include_archived=False)
        if not target:
            return None, "Target tag not found", 404
        source_ids = list(dict.fromkeys(data["source_ids"]))
        sources = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.id.in_(source_ids),
            ActivityTagDefinition.deleted_at.is_(None),
        ).all()
        if len(sources) != len(source_ids) or target.id in source_ids:
            return None, "One or more merge sources are unavailable", 400
        versions = data.get("versions", {})
        definitions = [target, *sources]
        for definition in definitions:
            if versions.get(definition.id) != definition.version:
                return {"id": definition.id, "version": definition.version}, "A tag was changed elsewhere", 409
        usage = self._usage_maps(root_id, definitions)
        totals = Counter()
        for definition in definitions:
            totals.update(usage[definition.id])
        totals = {key: int(totals.get(key, 0)) for key in ("instances", "sets", "progress_views", "circuit_scopes")}
        totals["total"] = sum(totals.values())
        activity_ids = sorted({
            binding.activity_definition_id
            for definition in definitions
            for binding in definition.bindings
            if binding.deleted_at is None
        })
        target_activities = {binding.activity_definition_id for binding in target.bindings}
        binding_rewrites = sum(
            1 for source in sources for binding in source.bindings
            if binding.activity_definition_id in target_activities
        )
        return {
            "target": {"id": target.id, "name": target.name},
            "sources": [{"id": source.id, "name": source.name} for source in sources],
            "result_scope": data.get("scope", "global" if any(row.scope == "global" for row in definitions) else "selected"),
            "activity_ids": activity_ids,
            "usage": totals,
            "binding_rewrites": binding_rewrites,
        }, None, 200

    def create_binding_for_activity(self, root_id, activity_id):
        definitions = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.scope == "global",
            ActivityTagDefinition.deleted_at.is_(None),
        ).all()
        for definition in definitions:
            self.db.add(ActivityTag(
                root_id=root_id,
                activity_definition_id=activity_id,
                definition=definition,
            ))
