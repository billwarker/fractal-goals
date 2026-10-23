"""Tag assignment on activity instances and sets, and per-instance progress comparison.

Any active tag in the fractal can be assigned to any activity. Tags owned by a circuit
or round scope can only be removed from that scope's control, and a "pick one" family
allows at most one of its tags directly on an instance or set.
"""

from __future__ import annotations

from collections import defaultdict

from models import (
    ActivityInstance,
    ActivityProgressDefault,
    ActivitySet,
    ActivityTagDefinition,
    CircuitRound,
    CircuitRoundMember,
    CircuitRun,
    CircuitRunSlot,
    CircuitScopeTag,
    Goal,
)
from services.activity_tags import serialize_compare_context, serialize_tags
from services.events import Event, Events, event_bus
from services.ops_log import log_ops_event
from services.owned_entity_queries import get_owned_activity_instance


def single_select_conflict(tags, *, previous_ids=()):
    """Return details for a "pick one" family that a change would give two direct tags.

    Families that already held several tags before the change (because they became
    "pick one" later) are tolerated until one of their tags is added again.
    """
    previous = set(previous_ids)
    by_family = defaultdict(list)
    for tag in tags:
        family = tag.family
        if family is not None and family.single_select:
            by_family[family.id].append(tag)
    for family_tags in by_family.values():
        if len(family_tags) > 1 and any(tag.id not in previous for tag in family_tags):
            family = family_tags[0].family
            return {
                "code": "tag_family_single_select",
                "family_id": family.id,
                "family_name": family.name,
                "tag_ids": [tag.id for tag in family_tags],
            }
    return None


class ActivityTagAssignmentService:
    def __init__(self, db_session):
        self.db = db_session

    @staticmethod
    def _emit(**data):
        event_bus.emit(Event(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED, data, source="activity_tag_assignment_service"))

    def _owned_root(self, root_id, user_id):
        return self.db.query(Goal.id).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.deleted_at.is_(None),
        ).first()

    def _locked_instance(self, root_id, instance_id, user_id):
        if not self._owned_root(root_id, user_id):
            return None
        instance = get_owned_activity_instance(self.db, root_id, instance_id)
        if not instance:
            return None
        return self.db.query(ActivityInstance).filter(
            ActivityInstance.id == instance.id,
            ActivityInstance.deleted_at.is_(None),
        ).with_for_update().one()

    def _assignable_tags(self, root_id, tag_ids, *, retained_ids=()):
        """Active fractal tags by id, in request order; already-assigned archived tags may stay."""
        normalized = list(dict.fromkeys(tag_ids or []))
        if not normalized:
            return [], None
        retained = set(retained_ids)
        tags = self.db.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.id.in_(normalized),
        ).all()
        by_id = {
            tag.id: tag for tag in tags
            if tag.deleted_at is None or tag.id in retained
        }
        if set(by_id) != set(normalized):
            return None, "One or more tags are unavailable"
        return [by_id[tag_id] for tag_id in normalized], None

    def _required_scope_tag_ids(self, target):
        """Catalog ids that a circuit run or round scope applies to this target."""
        if isinstance(target, ActivitySet):
            rows = self.db.query(CircuitScopeTag.activity_tag_definition_id).join(
                CircuitRound, CircuitRound.id == CircuitScopeTag.circuit_round_id,
            ).join(
                CircuitRoundMember, CircuitRoundMember.circuit_round_id == CircuitRound.id,
            ).filter(CircuitRoundMember.activity_set_id == target.id).all()
            return {row[0] for row in rows}
        parent = self.db.query(CircuitScopeTag.activity_tag_definition_id).join(
            CircuitRun, CircuitRun.id == CircuitScopeTag.circuit_run_id,
        ).join(
            CircuitRunSlot, CircuitRunSlot.circuit_run_id == CircuitRun.id,
        ).filter(
            CircuitRunSlot.activity_instance_id == target.id,
            CircuitScopeTag.circuit_round_id.is_(None),
        )
        member = self.db.query(CircuitScopeTag.activity_tag_definition_id).join(
            CircuitRound, CircuitRound.circuit_run_id == CircuitScopeTag.circuit_run_id,
        ).join(
            CircuitRoundMember, CircuitRoundMember.circuit_round_id == CircuitRound.id,
        ).filter(
            CircuitRoundMember.activity_instance_id == target.id,
            (CircuitScopeTag.circuit_round_id.is_(None)) | (CircuitScopeTag.circuit_round_id == CircuitRound.id),
        )
        return {row[0] for row in parent.union(member).all()}

    def _progress(self, instance_id):
        from services.progress_service import ProgressService
        return ProgressService(self.db).get_progress_for_instance(instance_id)

    def _replace(self, root_id, target, tag_ids, version, *, instance):
        current = list(target.tags or [])
        conflict_body = {"current": serialize_tags(current), "version": target.tag_assignment_version}
        if version is not None and target.tag_assignment_version != version:
            log_ops_event(
                "activity_tag.assignment_conflict",
                level="warning",
                root_id=root_id,
                activity_id=instance.activity_definition_id,
                instance_id=instance.id,
                activity_set_id=target.id if isinstance(target, ActivitySet) else None,
                requested_version=version,
                current_version=target.tag_assignment_version,
            )
            return conflict_body, "Tag assignments were changed elsewhere", 409
        if not self._required_scope_tag_ids(target).issubset(set(tag_ids or [])):
            return conflict_body, "Circuit- or round-owned tags must be removed from their scope control", 409
        current_ids = {tag.id for tag in current}
        tags, error = self._assignable_tags(root_id, tag_ids, retained_ids=current_ids)
        if error or tags is None:
            return None, error, 400
        family_conflict = single_select_conflict(tags, previous_ids=current_ids)
        if family_conflict:
            return family_conflict, f"Pick one tag from {family_conflict['family_name']}", 422
        target.tags = tags
        target.tag_assignment_version += 1
        self.db.commit()
        self._emit(
            root_id=root_id,
            activity_id=instance.activity_definition_id,
            instance_id=instance.id,
            activity_set_id=target.id if isinstance(target, ActivitySet) else None,
            tag_ids=[tag.id for tag in tags],
        )
        return {
            "tags": serialize_tags(target.tags),
            "version": target.tag_assignment_version,
            "progress_comparison": self._progress(instance.id),
        }, None, 200

    def replace_instance_tags(self, root_id, instance_id, user_id, tag_ids, *, version=None):
        instance = self._locked_instance(root_id, instance_id, user_id)
        if not instance:
            return None, "Activity instance not found", 404
        return self._replace(root_id, instance, tag_ids, version, instance=instance)

    def replace_set_tags(self, root_id, set_id, user_id, tag_ids, *, version=None):
        if not self._owned_root(root_id, user_id):
            return None, "Activity set not found", 404
        activity_set = self.db.query(ActivitySet).join(ActivityInstance).filter(
            ActivitySet.id == set_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
        ).with_for_update().first()
        if not activity_set:
            return None, "Activity set not found", 404
        return self._replace(root_id, activity_set, tag_ids, version, instance=activity_set.activity_instance)

    def _remember_comparison(self, instance, compare_tags):
        """Keep this choice as the default for the activity in this template/program day.

        A database trigger pre-applies it to the activity's next instances there. The plain
        default (same tags, any session) is stored as no row at all.
        """
        session = instance.session
        template_id = getattr(session, "template_id", None)
        program_day_id = getattr(session, "program_day_id", None)
        if template_id is None and program_day_id is None:
            return
        existing = self.db.query(ActivityProgressDefault).filter(
            ActivityProgressDefault.activity_definition_id == instance.activity_definition_id,
            ActivityProgressDefault.session_template_id.is_(None) if template_id is None
            else ActivityProgressDefault.session_template_id == template_id,
            ActivityProgressDefault.program_day_id.is_(None) if program_day_id is None
            else ActivityProgressDefault.program_day_id == program_day_id,
        ).with_for_update().first()
        is_plain = (
            instance.progress_compare_mode is None
            and not instance.progress_compare_same_template
            and not instance.progress_compare_same_program_day
        )
        if is_plain:
            if existing is not None:
                self.db.delete(existing)
            return
        choice = {
            "compare_mode": instance.progress_compare_mode,
            "same_template": instance.progress_compare_same_template,
            "same_program_day": instance.progress_compare_same_program_day,
            "compare_tags": list(compare_tags),
        }
        if existing is None:
            self.db.add(ActivityProgressDefault(
                root_id=instance.root_id,
                activity_definition_id=instance.activity_definition_id,
                session_template_id=template_id,
                program_day_id=program_day_id,
                **choice,
            ))
            return
        for field, value in choice.items():
            setattr(existing, field, value)
        existing.version += 1

    def set_progress_comparison(self, root_id, instance_id, user_id, data):
        """Choose what one instance compares against, and remember it for its template/program day.

        Other instances keep their own comparisons; only the activity's future instances in
        the same template and program day start from this choice.
        """
        instance = self._locked_instance(root_id, instance_id, user_id)
        if not instance:
            return None, "Activity instance not found", 404
        if data.get("version") is not None and data["version"] != instance.progress_compare_version:
            return {"current": serialize_compare_context(instance)}, "Comparison was changed elsewhere", 409
        mode = data["mode"]
        same_template = bool(data.get("same_template"))
        same_program_day = bool(data.get("same_program_day"))
        session = instance.session
        if (same_template and getattr(session, "template_id", None) is None) or (
            same_program_day and getattr(session, "program_day_id", None) is None
        ):
            return (
                {"code": "scope_unavailable", "same_template": same_template, "same_program_day": same_program_day},
                "This session has no session template or program day to compare within",
                422,
            )
        compare_tags = []
        if mode == "tags":
            requested = list(dict.fromkeys(data.get("tag_ids") or []))
            compare_tags = self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.root_id == root_id,
                ActivityTagDefinition.id.in_(requested),
            ).all() if requested else []
            if len(compare_tags) != len(requested):
                return None, "One or more tags are unavailable", 400
        instance.progress_compare_mode = None if mode == "same_tags" else mode
        instance.progress_compare_same_template = same_template
        instance.progress_compare_same_program_day = same_program_day
        instance.compare_tags = compare_tags
        instance.progress_compare_version += 1
        self._remember_comparison(instance, compare_tags)
        self.db.commit()
        event_bus.emit(Event(Events.ACTIVITY_PROGRESS_COMPARISON_UPDATED, {
            "root_id": root_id,
            "activity_id": instance.activity_definition_id,
            "instance_id": instance.id,
            "mode": mode,
            "tag_ids": [tag.id for tag in compare_tags],
            "same_template": same_template,
            "same_program_day": same_program_day,
        }, source="activity_tag_assignment_service"))
        return {
            "comparison_context": serialize_compare_context(instance),
            "progress_comparison": self._progress(instance.id),
        }, None, 200
