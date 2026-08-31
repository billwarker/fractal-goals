from __future__ import annotations

from sqlalchemy import func
from sqlalchemy.exc import IntegrityError

from models import ActivityInstance, ActivitySet, ActivityTag, ActivityTagDefinition, CircuitScopeTag
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.serializers import serialize_circuit_run


class CircuitTagOperations:
    """Materialize persisted circuit scopes into canonical activity tag links."""

    def __init__(self, owner):
        self.owner = owner
        self.db = owner.db_session

    @staticmethod
    def _normalized_name(name):
        return " ".join((name or "").strip().split()).casefold()

    @staticmethod
    def _scope_payload(scope):
        return {
            "id": scope.id,
            "name": scope.name,
            "color": scope.color,
            "sort_order": scope.sort_order,
        }

    @staticmethod
    def _member_target(member):
        if member.activity_set_id:
            return member.activity_set, member.run_slot.activity_definition_id
        return member.activity_instance, member.run_slot.activity_definition_id

    def _round_targets(self, circuit_round):
        return [
            self._member_target(member)
            for member in sorted(circuit_round.members, key=lambda row: row.sort_order)
        ]

    @staticmethod
    def _run_scope_round_targets(circuit_round):
        """Run-scope targets within one round: setless members only.

        Set-based slots are tagged on their parent activity instance instead,
        because instance tags already inherit to every set at calculation time.
        Materializing them onto sets as well would both duplicate the tag and
        strand it, since run-scope removal only walks parent instances.
        """
        return [
            (member.activity_instance, member.run_slot.activity_definition_id)
            for member in sorted(circuit_round.members, key=lambda row: row.sort_order)
            if not member.activity_set_id
        ]

    def _run_targets(self, run):
        members_by_slot = {}
        for circuit_round in sorted(run.rounds, key=lambda row: row.round_number):
            for member in circuit_round.members:
                members_by_slot.setdefault(member.circuit_run_slot_id, []).append(member)
        targets = []
        for slot in sorted(run.slots, key=lambda row: row.sort_order):
            if slot.has_sets:
                targets.append((slot.activity_instance, slot.activity_definition_id))
                continue
            for member in members_by_slot.get(slot.id, []):
                targets.append((member.activity_instance, slot.activity_definition_id))
        return targets

    def _locked_targets(self, raw_targets):
        instance_ids = sorted({target.id for target, _ in raw_targets if isinstance(target, ActivityInstance)})
        set_ids = sorted({target.id for target, _ in raw_targets if isinstance(target, ActivitySet)})
        instances = {
            row.id: row
            for row in self.db.query(ActivityInstance)
            .filter(ActivityInstance.id.in_(instance_ids))
            .order_by(ActivityInstance.id)
            .with_for_update()
            .all()
        } if instance_ids else {}
        sets = {
            row.id: row
            for row in self.db.query(ActivitySet)
            .filter(ActivitySet.id.in_(set_ids))
            .order_by(ActivitySet.id)
            .with_for_update()
            .all()
        } if set_ids else {}
        return [
            ((sets if isinstance(target, ActivitySet) else instances)[target.id], definition_id)
            for target, definition_id in raw_targets
        ]

    def _tags_by_definition(self, root_id, definition_ids, normalized_name=None, catalog_definition_id=None):
        query = self.db.query(ActivityTag).join(ActivityTagDefinition).filter(
            ActivityTag.root_id == root_id,
            ActivityTag.activity_definition_id.in_(definition_ids),
        )
        if catalog_definition_id:
            query = query.filter(ActivityTag.definition_id == catalog_definition_id)
        else:
            query = query.filter(func.lower(ActivityTagDefinition.name) == normalized_name)
        rows = query.all()
        return {row.activity_definition_id: row for row in rows}

    def _ensure_activity_tags(
        self,
        root_id,
        user_id,
        targets,
        name,
        color,
        *,
        scope_storage_values,
    ):
        definition_ids = sorted({definition_id for _, definition_id in targets})
        normalized_name = self._normalized_name(name)
        by_definition = self._tags_by_definition(root_id, definition_ids, normalized_name)
        archived = [
            tag for tag in by_definition.values()
            if tag.deleted_at is not None or tag.definition.deleted_at is not None
        ]
        if archived:
            return None, [], "An archived tag with this name must be restored before it can be assigned", 409

        catalog_definitions = {tag.definition for tag in by_definition.values()}
        if catalog_definitions:
            canonical = sorted(
                catalog_definitions,
                key=lambda item: (-sum(tag.definition_id == item.id for tag in by_definition.values()), item.id),
            )[0]
            for tag in by_definition.values():
                tag.definition = canonical
            for candidate in catalog_definitions - {canonical}:
                if not candidate.bindings:
                    self.db.delete(candidate)
        else:
            maximum = self.db.query(func.max(ActivityTagDefinition.sort_order)).filter(
                ActivityTagDefinition.root_id == root_id,
                ActivityTagDefinition.deleted_at.is_(None),
            ).scalar()
            canonical = ActivityTagDefinition(
                root_id=root_id,
                name=name,
                color=color,
                scope="selected",
                sort_order=(maximum if maximum is not None else -1) + 1,
            )
            self.db.add(canonical)

        missing = [definition_id for definition_id in definition_ids if definition_id not in by_definition]
        quota = QuotaService(self.db)
        _, error, status = quota.check_storage_available(
            user_id,
            quota.payload_size(scope_storage_values, *[(name, color) for _ in missing]),
        )
        if error:
            return None, [], error, status
        if missing:
            created = []
            for definition_id in missing:
                tag = ActivityTag(
                    root_id=root_id,
                    activity_definition_id=definition_id,
                    definition=canonical,
                )
                self.db.add(tag)
                by_definition[definition_id] = tag
                created.append(tag)
            self.db.flush()
        else:
            created = []
        return by_definition, created, None, 200

    @staticmethod
    def _assign(targets, by_definition):
        changed = []
        for target, definition_id in targets:
            tag = by_definition[definition_id]
            if any(existing.id == tag.id for existing in target.tags):
                continue
            target.tags.append(tag)
            target.tag_assignment_version += 1
            changed.append((target, definition_id))
        return changed

    @staticmethod
    def _target_key(target):
        prefix = "set" if isinstance(target, ActivitySet) else "instance"
        return f"{prefix}:{target.id}"

    @staticmethod
    def _remove(targets, by_definition, protected_target_ids):
        changed = []
        for target, definition_id in targets:
            if target.id in protected_target_ids:
                continue
            tag = by_definition.get(definition_id)
            if not tag or not any(existing.id == tag.id for existing in target.tags):
                continue
            target.tags = [existing for existing in target.tags if existing.id != tag.id]
            target.tag_assignment_version += 1
            changed.append((target, definition_id))
        return changed

    def _protected_targets(self, run, deleting_scope, normalized_name):
        protected = {
            key.split(":", 1)[1]
            for key in (deleting_scope.preserved_target_keys or [])
            if ":" in key
        }
        if deleting_scope.circuit_round_id:
            if any(
                scope.circuit_round_id is None
                and scope.id != deleting_scope.id
                and self._normalized_name(scope.name) == normalized_name
                for scope in run.scope_tags
            ):
                protected.update(
                    target.id
                    for target, _ in self._round_targets(deleting_scope.round)
                    if isinstance(target, ActivityInstance)
                )
            return protected
        for circuit_round in run.rounds:
            if any(
                self._normalized_name(scope.name) == normalized_name
                for scope in circuit_round.scope_tags
            ):
                protected.update(target.id for target, _ in self._round_targets(circuit_round))
        return protected

    def _emit_changes(self, root_id, run, changed, created_tags, scope_data, assigned):
        for tag in created_tags:
            event_bus.emit(Event(Events.ACTIVITY_TAG_CREATED, {
                "root_id": root_id,
                "activity_id": tag.activity_definition_id,
                "activity_tag_id": tag.id,
                "name": tag.name,
                "circuit_run_id": run.id,
                "circuit_round_id": scope_data["circuit_round_id"],
            }, source="circuit_tag_operations"))
        for target, definition_id in changed:
            event_bus.emit(Event(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED, {
                "root_id": root_id,
                "activity_id": definition_id,
                "instance_id": target.activity_instance_id if isinstance(target, ActivitySet) else target.id,
                "activity_set_id": target.id if isinstance(target, ActivitySet) else None,
                "tag_ids": [tag.id for tag in target.tags],
                "circuit_run_id": run.id,
                "circuit_round_id": scope_data["circuit_round_id"],
            }, source="circuit_tag_operations"))
        event_bus.emit(Event(Events.CIRCUIT_SCOPE_TAG_UPDATED, {
            "root_id": root_id,
            "session_id": run.session_id,
            "circuit_run_id": run.id,
            "circuit_round_id": scope_data["circuit_round_id"],
            "scope_tag_id": scope_data["id"],
            "name": scope_data["name"],
            "assigned": assigned,
            "created_activity_tag_ids": [tag.id for tag in created_tags],
        }, source="circuit_tag_operations"))

    def mutate(self, root_id, run_id, user_id, data, *, round_id=None):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, _session = locked
        circuit_round = None
        if round_id:
            circuit_round = next((row for row in run.rounds if row.id == round_id), None)
            if not circuit_round:
                return None, "Circuit round not found", 404

        name = " ".join(data["name"].strip().split())
        normalized_name = self._normalized_name(name)
        scope = next((
            row for row in run.scope_tags
            if row.circuit_round_id == round_id and self._normalized_name(row.name) == normalized_name
        ), None)
        raw_targets = self._round_targets(circuit_round) if circuit_round else self._run_targets(run)
        if not raw_targets or any(target is None for target, _ in raw_targets):
            return None, "Circuit tag targets are incomplete", 409
        targets = self._locked_targets(raw_targets)

        if data.get("assigned", True):
            if scope:
                return serialize_circuit_run(run), None, 200
            by_definition, created_tags, error, status = self._ensure_activity_tags(
                root_id,
                user_id,
                targets,
                name,
                data.get("color"),
                scope_storage_values=(run.id, round_id, name, data.get("color")),
            )
            if error:
                return None, error, status
            sort_order = max(
                (row.sort_order for row in run.scope_tags if row.circuit_round_id == round_id),
                default=-1,
            ) + 1
            scope = CircuitScopeTag(
                root_id=root_id,
                circuit_run_id=run.id,
                circuit_round_id=round_id,
                name=name,
                color=data.get("color"),
                sort_order=sort_order,
                activity_tag_definition_id=next(iter(by_definition.values())).definition_id,
                preserved_target_keys=[
                    self._target_key(target)
                    for target, definition_id in targets
                    if any(tag.id == by_definition[definition_id].id for tag in target.tags)
                ],
            )
            self.db.add(scope)
            changed = self._assign(targets, by_definition)
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                return None, "This tag is already assigned to the circuit scope", 409
            self._emit_changes(root_id, run, changed, created_tags, {
                "id": scope.id,
                "name": scope.name,
                "circuit_round_id": scope.circuit_round_id,
            }, True)
        else:
            if not scope:
                return serialize_circuit_run(run), None, 200
            by_definition = self._tags_by_definition(
                root_id,
                {definition_id for _, definition_id in targets},
                catalog_definition_id=scope.activity_tag_definition_id,
            )
            protected = self._protected_targets(run, scope, normalized_name)
            changed = self._remove(targets, by_definition, protected)
            scope_payload = self._scope_payload(scope)
            self.db.delete(scope)
            self.db.commit()
            self._emit_changes(root_id, run, changed, [], {
                "id": scope_payload["id"],
                "name": scope_payload["name"],
                "circuit_round_id": round_id,
            }, False)

        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 200

    def inherit_run_tags(self, run, circuit_round, user_id=None):
        """Apply persisted run scopes to a newly-created round before commit.

        Mirrors ``_run_targets`` semantics exactly: only setless members are
        materialized, so a scope produces the same assignments whether the round
        existed when it was applied or was added afterwards.
        """
        scopes = [scope for scope in run.scope_tags if scope.circuit_round_id is None]
        if not scopes:
            return None, None, 200
        targets = self._run_scope_round_targets(circuit_round)
        if not targets:
            return None, None, 200
        definition_ids = {definition_id for _, definition_id in targets}
        for scope in scopes:
            by_definition = self._tags_by_definition(
                run.root_id,
                definition_ids,
                catalog_definition_id=scope.activity_tag_definition_id,
            )
            if any(tag.deleted_at is not None or tag.definition.deleted_at is not None for tag in by_definition.values()):
                return (
                    None,
                    "An archived tag with this name must be restored before it can be assigned",
                    409,
                )
            # A definition without a matching tag simply has nothing to inherit.
            inheritable = [
                (target, definition_id)
                for target, definition_id in targets
                if definition_id in by_definition
            ]
            if not inheritable:
                continue
            if user_id is not None:
                quota = QuotaService(self.db)
                _, error, status = quota.check_storage_available(
                    user_id,
                    quota.payload_size(*[(scope.name, scope.color) for _ in inheritable]),
                )
                if error:
                    return None, error, status
            self._assign(inheritable, by_definition)
        return None, None, 200
