from __future__ import annotations

from collections import Counter, defaultdict

from sqlalchemy import func, select, union
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityInstanceCompareTag,
    ActivityInstanceTag,
    ActivitySet,
    ActivitySetTag,
    ActivityTagDefinition,
    ActivityTagFamily,
    CircuitScopeTag,
    Goal,
    utc_now,
)
from services.activity_tags import canonical_tag_name, name_taken_details, normalize_tag_name
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.tag_reference_rewrites import rewrite_planned_tags

USAGE_KEYS = ("instances", "sets", "circuit_scopes")


def serialize_family(family) -> dict:
    return {
        "id": family.id,
        "name": family.name,
        "sort_order": family.sort_order,
        "single_select": family.single_select,
        "version": family.version,
    }


class ActivityTagCatalogService:
    """Owns tag identity, naming, ordering, merging, and destructive lifecycle."""

    def __init__(self, db_session):
        self.db = db_session

    def _emit(self, event_name, **data):
        event_bus.emit(Event(event_name, data, source="activity_tag_catalog_service"))

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

    def _by_name(self, root_id, name, *, exclude_id=None):
        query = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.normalized_name == normalize_tag_name(name),
        )
        if exclude_id:
            query = query.filter(ActivityTagDefinition.id != exclude_id)
        return query.first()

    def _family(self, root_id, family_id):
        if family_id is None:
            return None
        return self.db.query(ActivityTagFamily).filter(
            ActivityTagFamily.id == family_id,
            ActivityTagFamily.root_id == root_id,
        ).first()

    def _next_sort_order(self, root_id, family_id):
        maximum = self.db.query(func.max(ActivityTagDefinition.sort_order)).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.family_id.is_(None) if family_id is None
            else ActivityTagDefinition.family_id == family_id,
        ).scalar()
        return (maximum if maximum is not None else -1) + 1

    def _usage_maps(self, root_id, definition_ids):
        usage = defaultdict(Counter)
        # tag id -> {activity id: distinct instances tagged directly or through a set}
        activities = defaultdict(Counter)
        if not definition_ids:
            return usage, activities
        for definition_id, activity_id, count in self.db.query(
            ActivityInstanceTag.tag_definition_id,
            ActivityInstance.activity_definition_id,
            func.count(ActivityInstanceTag.activity_instance_id),
        ).join(ActivityInstance, ActivityInstance.id == ActivityInstanceTag.activity_instance_id).filter(
            ActivityInstanceTag.tag_definition_id.in_(definition_ids),
            ActivityInstance.deleted_at.is_(None),
        ).group_by(ActivityInstanceTag.tag_definition_id, ActivityInstance.activity_definition_id).all():
            usage[definition_id]["instances"] += count
        for definition_id, activity_id, count in self.db.query(
            ActivitySetTag.tag_definition_id,
            ActivityInstance.activity_definition_id,
            func.count(ActivitySetTag.activity_set_id),
        ).join(ActivitySet, ActivitySet.id == ActivitySetTag.activity_set_id).join(
            ActivityInstance, ActivityInstance.id == ActivitySet.activity_instance_id,
        ).filter(
            ActivitySetTag.tag_definition_id.in_(definition_ids),
            ActivityInstance.deleted_at.is_(None),
        ).group_by(ActivitySetTag.tag_definition_id, ActivityInstance.activity_definition_id).all():
            usage[definition_id]["sets"] += count
        for definition_id, count in self.db.query(
            CircuitScopeTag.activity_tag_definition_id, func.count(CircuitScopeTag.id),
        ).filter(
            CircuitScopeTag.root_id == root_id,
            CircuitScopeTag.activity_tag_definition_id.in_(definition_ids),
        ).group_by(CircuitScopeTag.activity_tag_definition_id).all():
            usage[definition_id]["circuit_scopes"] = count
        tagged = self._tagged_instances(definition_ids)
        for definition_id, activity_id, count in self.db.query(
            tagged.c.tag_id, ActivityInstance.activity_definition_id, func.count(func.distinct(tagged.c.instance_id)),
        ).join(ActivityInstance, ActivityInstance.id == tagged.c.instance_id).filter(
            ActivityInstance.deleted_at.is_(None),
        ).group_by(tagged.c.tag_id, ActivityInstance.activity_definition_id).all():
            activities[definition_id][activity_id] = count
        return usage, activities

    @staticmethod
    def _tagged_instances(definition_ids):
        """(tag_id, instance_id) for instances carrying a tag directly or on any of their sets."""
        return union(
            select(
                ActivityInstanceTag.tag_definition_id.label("tag_id"),
                ActivityInstanceTag.activity_instance_id.label("instance_id"),
            ).where(ActivityInstanceTag.tag_definition_id.in_(definition_ids)),
            select(ActivitySetTag.tag_definition_id, ActivitySet.activity_instance_id)
            .join(ActivitySet, ActivitySet.id == ActivitySetTag.activity_set_id)
            .where(ActivitySetTag.tag_definition_id.in_(definition_ids)),
        ).subquery("tagged_instances")

    def _combined_activity_counts(self, definition_ids):
        """Activity id -> distinct instances carrying any of these tags (an instance counts once)."""
        tagged = self._tagged_instances(definition_ids)
        return Counter(dict(self.db.query(
            ActivityInstance.activity_definition_id, func.count(func.distinct(tagged.c.instance_id)),
        ).join(ActivityInstance, ActivityInstance.id == tagged.c.instance_id).filter(
            ActivityInstance.deleted_at.is_(None),
        ).group_by(ActivityInstance.activity_definition_id).all()))

    @staticmethod
    def _activities_by_use(counts, activity_names):
        """Activities a tag is used on, most-used first, then by name."""
        ordered = sorted(counts.items(), key=lambda item: (-item[1], activity_names.get(item[0], "").casefold()))
        return [
            {"id": activity_id, "name": activity_names.get(activity_id, "Deleted activity"), "instances": count}
            for activity_id, count in ordered
        ]

    def _serialize_definition(self, definition, usage, activities, activity_names):
        counts = {key: int(usage[definition.id].get(key, 0)) for key in USAGE_KEYS}
        counts["total"] = sum(counts.values())
        # Distinct activity instances, however many of their sets carry the tag.
        counts["tagged_instances"] = sum(activities[definition.id].values())
        return {
            "id": definition.id,
            "root_id": definition.root_id,
            "name": definition.name,
            "normalized_name": definition.normalized_name or normalize_tag_name(definition.name),
            "color": definition.color,
            "family_id": definition.family_id,
            "sort_order": definition.sort_order,
            "version": definition.version,
            "archived": definition.deleted_at is not None,
            "activities": self._activities_by_use(activities[definition.id], activity_names),
            "usage": counts,
            "created_at": definition.created_at.isoformat() if definition.created_at else None,
            "updated_at": definition.updated_at.isoformat() if definition.updated_at else None,
        }

    def _activity_names(self, root_id):
        return dict(self.db.query(ActivityDefinition.id, ActivityDefinition.name).filter(
            ActivityDefinition.root_id == root_id,
        ).all())

    def serialize_one(self, definition):
        usage, activities = self._usage_maps(definition.root_id, [definition.id])
        return self._serialize_definition(definition, usage, activities, self._activity_names(definition.root_id))

    def list_catalog(self, root_id, user_id, *, include_archived=True):
        """Families in picker order, then tags in picker order (archived last)."""
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        families = self.db.query(ActivityTagFamily).filter(
            ActivityTagFamily.root_id == root_id,
        ).order_by(ActivityTagFamily.sort_order, ActivityTagFamily.name, ActivityTagFamily.id).all()
        query = self.db.query(ActivityTagDefinition).filter(ActivityTagDefinition.root_id == root_id)
        if not include_archived:
            query = query.filter(ActivityTagDefinition.deleted_at.is_(None))
        definitions = query.order_by(
            ActivityTagDefinition.deleted_at.isnot(None),
            ActivityTagDefinition.sort_order,
            ActivityTagDefinition.name,
            ActivityTagDefinition.id,
        ).all()
        usage, activities = self._usage_maps(root_id, [row.id for row in definitions])
        activity_names = self._activity_names(root_id)
        return {
            "families": [serialize_family(family) for family in families],
            "tags": [self._serialize_definition(row, usage, activities, activity_names) for row in definitions],
        }, None, 200

    def _name_conflict(self, root_id, name, *, exclude_id=None):
        existing = self._by_name(root_id, name, exclude_id=exclude_id)
        if existing is None:
            return None
        message = (
            f'An archived tag named "{existing.name}" exists; restore it instead'
            if existing.deleted_at is not None
            else f'A tag named "{existing.name}" already exists'
        )
        return name_taken_details(existing), message, 409

    def _commit_or_name_conflict(self, root_id, name, *, exclude_id=None):
        try:
            self.db.commit()
        except IntegrityError:
            self.db.rollback()
            conflict = self._name_conflict(root_id, name, exclude_id=exclude_id)
            return conflict or (None, "A conflicting tag was changed at the same time", 409)
        return None

    def create(self, root_id, user_id, data):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        name = canonical_tag_name(data["name"])
        conflict = self._name_conflict(root_id, name)
        if conflict:
            return conflict
        family_id = data.get("family_id")
        if family_id is not None and not self._family(root_id, family_id):
            return None, "Tag family not found", 404
        quota = QuotaService(self.db)
        _, error, status = quota.check_storage_available(user_id, quota.payload_size(name, data.get("color")))
        if error:
            return None, error, status
        definition = ActivityTagDefinition(
            root_id=root_id,
            name=name,
            color=data.get("color"),
            family_id=family_id,
            sort_order=data.get("sort_order", self._next_sort_order(root_id, family_id)),
        )
        self.db.add(definition)
        failure = self._commit_or_name_conflict(root_id, name)
        if failure:
            return failure
        self._emit(Events.ACTIVITY_TAG_CREATED, root_id=root_id, activity_tag_definition_id=definition.id, name=definition.name)
        return self.serialize_one(definition), None, 201

    def update(self, root_id, definition_id, user_id, data):
        definition = self._definition(root_id, definition_id, user_id, include_archived=False)
        if not definition:
            return None, "Tag not found", 404
        if data.get("version") != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        name = canonical_tag_name(data.get("name", definition.name))
        conflict = self._name_conflict(root_id, name, exclude_id=definition.id)
        if conflict:
            return conflict
        if "family_id" in data and data["family_id"] is not None and not self._family(root_id, data["family_id"]):
            return None, "Tag family not found", 404
        quota = QuotaService(self.db)
        old_size = quota.payload_size(definition.name, definition.color)
        new_size = quota.payload_size(name, data.get("color", definition.color))
        _, error, status = quota.check_storage_available(user_id, max(0, new_size - old_size))
        if error:
            return None, error, status
        definition.name = name
        if "color" in data:
            definition.color = data["color"]
        if "family_id" in data and data["family_id"] != definition.family_id:
            definition.family_id = data["family_id"]
            if "sort_order" not in data:
                definition.sort_order = self._next_sort_order(root_id, data["family_id"])
        if "sort_order" in data:
            definition.sort_order = data["sort_order"]
        definition.version += 1
        definition.updated_at = utc_now()
        failure = self._commit_or_name_conflict(root_id, name, exclude_id=definition.id)
        if failure:
            return failure
        self._emit(Events.ACTIVITY_TAG_UPDATED, root_id=root_id, activity_tag_definition_id=definition.id, name=definition.name)
        return self.serialize_one(definition), None, 200

    def reorder(self, root_id, user_id, data):
        """Place tags, in order, into one family (or "Other tags" when family_id is null)."""
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found", 404
        family_id = data.get("family_id")
        if family_id is not None and not self._family(root_id, family_id):
            return None, "Tag family not found", 404
        tag_ids = list(dict.fromkeys(data["tag_ids"]))
        rows = {
            row.id: row
            for row in self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.root_id == root_id,
                ActivityTagDefinition.id.in_(tag_ids),
            ).with_for_update().all()
        }
        if set(rows) != set(tag_ids):
            return None, "One or more tags are unavailable", 400
        now = utc_now()
        for index, tag_id in enumerate(tag_ids):
            row = rows[tag_id]
            if row.family_id != family_id or row.sort_order != index:
                row.family_id = family_id
                row.sort_order = index
                row.version += 1
                row.updated_at = now
        self.db.commit()
        self._emit(Events.ACTIVITY_TAG_UPDATED, root_id=root_id, reordered_tag_ids=tag_ids, family_id=family_id)
        return self.list_catalog(root_id, user_id)

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
        self._emit(Events.ACTIVITY_TAG_ARCHIVED, root_id=root_id, activity_tag_definition_id=definition.id, name=definition.name)
        return {"message": "Tag archived", "id": definition.id, "version": definition.version}, None, 200

    def restore(self, root_id, definition_id, user_id, version):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition or definition.deleted_at is None:
            return None, "Archived tag not found", 404
        if version is not None and version != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
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
        self._emit(Events.ACTIVITY_TAG_RESTORED, root_id=root_id, activity_tag_definition_id=definition.id, name=definition.name)
        return self.serialize_one(definition), None, 200

    def impact(self, root_id, definition_id, user_id):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition:
            return None, "Tag not found", 404
        item = self.serialize_one(definition)
        return {
            "id": definition.id,
            "name": definition.name,
            "usage": item["usage"],
            "activities": item["activities"],
            "requires_typed_confirmation": item["usage"]["total"] > 0,
        }, None, 200

    def _bump_assignment_versions(self, definition_ids):
        instance_ids = {row[0] for row in self.db.query(ActivityInstanceTag.activity_instance_id).filter(
            ActivityInstanceTag.tag_definition_id.in_(definition_ids),
        ).all()}
        set_ids = {row[0] for row in self.db.query(ActivitySetTag.activity_set_id).filter(
            ActivitySetTag.tag_definition_id.in_(definition_ids),
        ).all()}
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
        return instance_ids, set_ids

    def hard_delete(self, root_id, definition_id, user_id, data):
        definition = self._definition(root_id, definition_id, user_id)
        if not definition:
            return None, "Tag not found", 404
        if data.get("version") != definition.version:
            return {"version": definition.version}, "Tag was changed elsewhere", 409
        if normalize_tag_name(data.get("confirmation_name", "")) != normalize_tag_name(definition.name):
            return None, "Type the tag name to confirm permanent deletion", 400
        instance_ids, set_ids = self._bump_assignment_versions([definition.id])
        impact = {
            "instances": len(instance_ids),
            "sets": len(set_ids),
            "circuit_scopes": self.db.query(CircuitScopeTag).filter(
                CircuitScopeTag.activity_tag_definition_id == definition.id,
            ).count(),
            "plans": rewrite_planned_tags(self.db, root_id, {definition.id: None}),
        }
        name = definition.name
        self.db.delete(definition)
        self.db.commit()
        self._emit(
            Events.ACTIVITY_TAG_UPDATED,
            root_id=root_id, activity_tag_definition_id=definition_id,
            name=name, hard_deleted=True, impact=impact,
        )
        return {"message": "Tag permanently deleted", "id": definition_id, "removed": impact}, None, 200

    def _merge_inputs(self, root_id, user_id, data, *, lock):
        target = self._definition(root_id, data["target_id"], user_id, include_archived=False)
        if not target:
            return None, None, (None, "Target tag not found", 404)
        source_ids = list(dict.fromkeys(data["source_ids"]))
        query = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.id.in_(source_ids),
        )
        sources = (query.with_for_update() if lock else query).all()
        if len(sources) != len(source_ids) or target.id in source_ids:
            return None, None, (None, "One or more merge sources are unavailable", 400)
        versions = data.get("versions", {})
        for definition in [target, *sources]:
            if versions.get(definition.id) != definition.version:
                return None, None, ({"id": definition.id, "version": definition.version}, "A tag was changed elsewhere", 409)
        return target, sources, None

    def _union_links(self, model, owner_column, source_ids, target_id):
        """Move links from sources onto the target, dropping ones the target already has."""
        owner = getattr(model, owner_column)
        existing = {row[0] for row in self.db.query(owner).filter(model.tag_definition_id == target_id).all()}
        moved = set()
        for row in self.db.query(model).filter(model.tag_definition_id.in_(source_ids)).all():
            owner_id = getattr(row, owner_column)
            if owner_id in existing or owner_id in moved:
                self.db.delete(row)
            else:
                moved.add(owner_id)
                self.db.add(model(**{owner_column: owner_id, "tag_definition_id": target_id}))
                self.db.delete(row)
        return existing | moved

    def merge(self, root_id, user_id, data):
        target, sources, failure = self._merge_inputs(root_id, user_id, data, lock=True)
        if failure or target is None or sources is None:
            return failure
        source_ids = [source.id for source in sources]
        self._bump_assignment_versions([target.id, *source_ids])
        self._union_links(ActivityInstanceTag, "activity_instance_id", source_ids, target.id)
        self._union_links(ActivitySetTag, "activity_set_id", source_ids, target.id)
        self._union_links(ActivityInstanceCompareTag, "activity_instance_id", source_ids, target.id)
        for scope in self.db.query(CircuitScopeTag).filter(
            CircuitScopeTag.activity_tag_definition_id.in_(source_ids),
        ).all():
            duplicate = self.db.query(CircuitScopeTag.id).filter(
                CircuitScopeTag.circuit_run_id == scope.circuit_run_id,
                CircuitScopeTag.activity_tag_definition_id == target.id,
                (CircuitScopeTag.circuit_round_id == scope.circuit_round_id) if scope.circuit_round_id
                else CircuitScopeTag.circuit_round_id.is_(None),
            ).first()
            if duplicate:
                self.db.delete(scope)
            else:
                scope.activity_tag_definition_id = target.id
        plans = rewrite_planned_tags(self.db, root_id, {source_id: target.id for source_id in source_ids})
        self.db.flush()
        for source in sources:
            self.db.delete(source)
        self.db.flush()
        if "name" in data:
            target.name = canonical_tag_name(data["name"])
        if "color" in data:
            target.color = data["color"]
        target.version += 1
        target.updated_at = utc_now()
        failure = self._commit_or_name_conflict(root_id, target.name, exclude_id=target.id)
        if failure:
            return failure
        self._emit(
            Events.ACTIVITY_TAG_MERGED,
            root_id=root_id, activity_tag_definition_id=target.id,
            merged_ids=source_ids, rewritten_plans=plans,
        )
        return self.serialize_one(target), None, 200

    def preview_merge(self, root_id, user_id, data):
        target, sources, failure = self._merge_inputs(root_id, user_id, data, lock=False)
        if failure or target is None or sources is None:
            return failure
        definitions = [target, *sources]
        usage, _activities = self._usage_maps(root_id, [row.id for row in definitions])
        totals = Counter()
        for definition in definitions:
            totals.update(usage[definition.id])
        totals = {key: int(totals.get(key, 0)) for key in USAGE_KEYS}
        totals["total"] = sum(totals.values())
        activity_names = self._activity_names(root_id)
        combined = self._combined_activity_counts([row.id for row in definitions])
        totals["tagged_instances"] = sum(combined.values())
        return {
            "target": {"id": target.id, "name": target.name},
            "sources": [{"id": source.id, "name": source.name, "archived": source.deleted_at is not None} for source in sources],
            "activities": self._activities_by_use(combined, activity_names),
            "usage": totals,
        }, None, 200
