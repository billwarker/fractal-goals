from __future__ import annotations

from sqlalchemy.exc import IntegrityError

from models import ActivityInstance, ActivitySet, ActivityTagDefinition, CircuitScopeTag
from services.activity_tags import canonical_tag_name, normalize_tag_name
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.serializers import serialize_circuit_run

REPLACED_PREFIX = "replaced:"


class CircuitTagOperations:
    """Materialize persisted circuit scopes into canonical activity tag links."""

    def __init__(self, owner):
        self.owner = owner
        self.db = owner.db_session

    @staticmethod
    def _member_target(member):
        if member.activity_set_id:
            return member.activity_set
        return member.activity_instance

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
            member.activity_instance
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
                targets.append(slot.activity_instance)
                continue
            for member in members_by_slot.get(slot.id, []):
                targets.append(member.activity_instance)
        return targets

    def _locked_targets(self, raw_targets):
        instance_ids = sorted({target.id for target in raw_targets if isinstance(target, ActivityInstance)})
        set_ids = sorted({target.id for target in raw_targets if isinstance(target, ActivitySet)})
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
            (sets if isinstance(target, ActivitySet) else instances)[target.id]
            for target in raw_targets
        ]

    @staticmethod
    def _target_key(target):
        prefix = "set" if isinstance(target, ActivitySet) else "instance"
        return f"{prefix}:{target.id}"

    def _resolve_definition(self, root_id, user_id, data):
        """The catalog tag for a mutation: by id, else by unique name, else a new tag."""
        if data.get("definition_id"):
            definition = self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.id == data["definition_id"],
                ActivityTagDefinition.root_id == root_id,
            ).with_for_update().first()
            if definition is None:
                return None, False, ("Tag not found", 404)
        else:
            name = canonical_tag_name(data["name"])
            definition = self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.root_id == root_id,
                ActivityTagDefinition.normalized_name == normalize_tag_name(name),
            ).with_for_update().first()
            if definition is None:
                quota = QuotaService(self.db)
                _, error, status = quota.check_storage_available(user_id, quota.payload_size(name, data.get("color")))
                if error:
                    return None, False, (error, status)
                from services.activity_tag_catalog_service import ActivityTagCatalogService
                definition = ActivityTagDefinition(
                    root_id=root_id,
                    name=name,
                    color=data.get("color"),
                    sort_order=ActivityTagCatalogService(self.db)._next_sort_order(root_id, None),
                )
                self.db.add(definition)
                self.db.flush()
                return definition, True, None
        if definition.deleted_at is not None:
            return None, False, ("An archived tag with this name must be restored before it can be assigned", 409)
        return definition, False, None

    def _assign(self, targets, definition):
        """Add the tag to each target, replacing a direct sibling from a "pick one" family.

        Returns (changed targets, preserved keys) where the keys record targets that
        already held the tag and the siblings it replaced, so removal can restore them.
        """
        family = definition.family
        pick_one_family_id = family.id if family is not None and family.single_select else None
        changed = []
        preserved = []
        for target in targets:
            if any(tag.id == definition.id for tag in target.tags):
                preserved.append(self._target_key(target))
                continue
            kept = []
            for tag in target.tags:
                if pick_one_family_id is not None and tag.family_id == pick_one_family_id:
                    preserved.append(f"{REPLACED_PREFIX}{self._target_key(target)}:{tag.id}")
                else:
                    kept.append(tag)
            target.tags = [*kept, definition]
            target.tag_assignment_version += 1
            changed.append(target)
        return changed, preserved

    def _remove(self, targets, definition, protected_target_ids, replaced):
        changed = []
        restore_by_target = {}
        for key in replaced:
            _prefix, target_id, tag_id = key[len(REPLACED_PREFIX):].split(":", 2)
            restore_by_target.setdefault(target_id, []).append(tag_id)
        restorable = {
            row.id: row
            for row in self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.id.in_({tag_id for ids in restore_by_target.values() for tag_id in ids}),
                ActivityTagDefinition.deleted_at.is_(None),
            ).all()
        } if restore_by_target else {}
        for target in targets:
            if target.id in protected_target_ids:
                continue
            if not any(tag.id == definition.id for tag in target.tags):
                continue
            remaining = [tag for tag in target.tags if tag.id != definition.id]
            for tag_id in restore_by_target.get(target.id, []):
                tag = restorable.get(tag_id)
                if tag is not None and all(existing.id != tag_id for existing in remaining):
                    remaining.append(tag)
            target.tags = remaining
            target.tag_assignment_version += 1
            changed.append(target)
        return changed

    def _protected_targets(self, run, deleting_scope):
        keys = deleting_scope.preserved_target_keys or []
        protected = {
            key.split(":", 1)[1]
            for key in keys
            if ":" in key and not key.startswith(REPLACED_PREFIX)
        }
        definition_id = deleting_scope.activity_tag_definition_id
        if deleting_scope.circuit_round_id:
            if any(
                scope.circuit_round_id is None
                and scope.id != deleting_scope.id
                and scope.activity_tag_definition_id == definition_id
                for scope in run.scope_tags
            ):
                protected.update(
                    target.id
                    for target in self._round_targets(deleting_scope.round)
                    if isinstance(target, ActivityInstance)
                )
            return protected
        for circuit_round in run.rounds:
            if any(scope.activity_tag_definition_id == definition_id for scope in circuit_round.scope_tags):
                protected.update(target.id for target in self._round_targets(circuit_round))
        return protected

    def _emit_changes(self, root_id, run, changed, created_definition, scope_data, assigned):
        if created_definition is not None:
            event_bus.emit(Event(Events.ACTIVITY_TAG_CREATED, {
                "root_id": root_id,
                "activity_tag_definition_id": created_definition.id,
                "name": created_definition.name,
                "circuit_run_id": run.id,
                "circuit_round_id": scope_data["circuit_round_id"],
            }, source="circuit_tag_operations"))
        for target in changed:
            instance = target.activity_instance if isinstance(target, ActivitySet) else target
            event_bus.emit(Event(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED, {
                "root_id": root_id,
                "activity_id": instance.activity_definition_id,
                "instance_id": instance.id,
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
            "activity_tag_definition_id": scope_data["definition_id"],
            "name": scope_data["name"],
            "assigned": assigned,
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

        raw_targets = self._round_targets(circuit_round) if circuit_round else self._run_targets(run)
        if not raw_targets or any(target is None for target in raw_targets):
            return None, "Circuit tag targets are incomplete", 409

        if data.get("assigned", True):
            definition, created, failure = self._resolve_definition(root_id, user_id, data)
            if failure or definition is None:
                self.db.rollback()
                return None, *(failure or ("Tag not found", 404))
            if any(
                scope.circuit_round_id == round_id and scope.activity_tag_definition_id == definition.id
                for scope in run.scope_tags
            ):
                return serialize_circuit_run(run), None, 200
            targets = self._locked_targets(raw_targets)
            changed, preserved = self._assign(targets, definition)
            scope = CircuitScopeTag(
                root_id=root_id,
                circuit_run_id=run.id,
                circuit_round_id=round_id,
                activity_tag_definition_id=definition.id,
                sort_order=max(
                    (row.sort_order for row in run.scope_tags if row.circuit_round_id == round_id),
                    default=-1,
                ) + 1,
                preserved_target_keys=preserved,
            )
            self.db.add(scope)
            try:
                self.db.commit()
            except IntegrityError:
                self.db.rollback()
                return None, "This tag is already assigned to the circuit scope", 409
            self._emit_changes(root_id, run, changed, definition if created else None, {
                "id": scope.id,
                "definition_id": definition.id,
                "name": definition.name,
                "circuit_round_id": scope.circuit_round_id,
            }, True)
        else:
            definition_id = data.get("definition_id")
            if not definition_id:
                match = self.db.query(ActivityTagDefinition.id).filter(
                    ActivityTagDefinition.root_id == root_id,
                    ActivityTagDefinition.normalized_name == normalize_tag_name(data["name"]),
                ).first()
                definition_id = match[0] if match else None
            scope = next((
                row for row in run.scope_tags
                if row.circuit_round_id == round_id and row.activity_tag_definition_id == definition_id
            ), None)
            if not scope:
                return serialize_circuit_run(run), None, 200
            definition = scope.activity_tag_definition
            targets = self._locked_targets(raw_targets)
            replaced = [key for key in (scope.preserved_target_keys or []) if key.startswith(REPLACED_PREFIX)]
            changed = self._remove(targets, definition, self._protected_targets(run, scope), replaced)
            scope_data = {
                "id": scope.id,
                "definition_id": definition.id,
                "name": definition.name,
                "circuit_round_id": round_id,
            }
            self.db.delete(scope)
            self.db.commit()
            self._emit_changes(root_id, run, changed, None, scope_data, False)

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
        for scope in scopes:
            definition = scope.activity_tag_definition
            if definition.deleted_at is not None:
                return None, "An archived tag with this name must be restored before it can be assigned", 409
            if user_id is not None:
                quota = QuotaService(self.db)
                _, error, status = quota.check_storage_available(
                    user_id,
                    quota.payload_size(*[(definition.name, definition.color) for _ in targets]),
                )
                if error:
                    return None, error, status
            _changed, preserved = self._assign(targets, definition)
            replaced = [key for key in preserved if key.startswith(REPLACED_PREFIX)]
            if replaced:
                scope.preserved_target_keys = [*(scope.preserved_target_keys or []), *replaced]
        return None, None, 200
