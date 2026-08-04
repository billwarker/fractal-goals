from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import joinedload, selectinload
from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    CircuitDefinition,
    CircuitRound,
    CircuitRoundMember,
    CircuitRun,
    CircuitRunSlot,
    CircuitSlot,
    MetricValue,
    Note,
    Session,
    session_goals,
    validate_root_goal,
)
from services.circuit_metric_service import CircuitMetricService
from services.circuit_definition_operations import CircuitDefinitionOperations
from services.circuit_round_operations import CircuitRoundOperations
from services.circuit_run_timing_operations import CircuitRunTimingOperations
from services.circuit_session_items import append_circuit_run_item, remove_circuit_run_item
from services.events import Event, Events, event_bus
from services.owned_entity_queries import get_owned_activity_definition, get_owned_session
from services.quota_service import QuotaService
from services.circuit_rules import (
    ESTIMATED_CIRCUIT_RESULT_BYTES,
    validate_circuit_shape,
)
from services.serializers import (
    serialize_circuit_run,
)
from services.session_runtime import is_quick_session
from services.work_interval_service import utc_now_naive


class CircuitService:
    def __init__(self, db_session):
        self.db_session = db_session
        self.metric_service = CircuitMetricService(db_session)
        self.definition_operations = CircuitDefinitionOperations(self)
        self.round_operations = CircuitRoundOperations(self)
        self.timing_operations = CircuitRunTimingOperations(self)

    @staticmethod
    def _definition_options():
        return (
            joinedload(CircuitDefinition.group),
            selectinload(CircuitDefinition.slots)
            .joinedload(CircuitSlot.activity_definition)
            .joinedload(ActivityDefinition.group),
            selectinload(CircuitDefinition.slots)
            .joinedload(CircuitSlot.activity_definition)
            .selectinload(ActivityDefinition.metric_definitions),
            selectinload(CircuitDefinition.slots)
            .joinedload(CircuitSlot.activity_definition)
            .selectinload(ActivityDefinition.split_definitions),
            selectinload(CircuitDefinition.slots)
            .joinedload(CircuitSlot.activity_definition)
            .selectinload(ActivityDefinition.associated_goals),
        )

    @staticmethod
    def _run_options():
        return (
            selectinload(CircuitRun.slots),
            selectinload(CircuitRun.rounds).selectinload(CircuitRound.members),
            selectinload(CircuitRun.rounds)
            .selectinload(CircuitRound.members)
            .selectinload(CircuitRoundMember.activity_set)
            .selectinload(ActivitySet.metric_values)
            .joinedload(MetricValue.definition),
            selectinload(CircuitRun.rounds)
            .selectinload(CircuitRound.members)
            .selectinload(CircuitRoundMember.activity_set)
            .selectinload(ActivitySet.metric_values)
            .joinedload(MetricValue.split),
            selectinload(CircuitRun.rounds)
            .selectinload(CircuitRound.members)
            .selectinload(CircuitRoundMember.activity_instance)
            .selectinload(ActivityInstance.metric_values)
            .joinedload(MetricValue.definition),
            selectinload(CircuitRun.rounds)
            .selectinload(CircuitRound.members)
            .selectinload(CircuitRoundMember.activity_instance)
            .selectinload(ActivityInstance.metric_values)
            .joinedload(MetricValue.split),
        )

    def _owned_root(self, root_id, user_id):
        return validate_root_goal(self.db_session, root_id, owner_id=user_id)

    def _definition(self, root_id, definition_id, *, include_archived=False):
        query = self.db_session.query(CircuitDefinition).options(*self._definition_options()).filter(
            CircuitDefinition.id == definition_id,
            CircuitDefinition.root_id == root_id,
        )
        if not include_archived:
            query = query.filter(CircuitDefinition.deleted_at.is_(None))
        return query.first()

    def _run(self, root_id, run_id, *, session_id=None, for_update=False):
        query = self.db_session.query(CircuitRun).options(*self._run_options()).filter(
            CircuitRun.id == run_id,
            CircuitRun.root_id == root_id,
        )
        if session_id:
            query = query.filter(CircuitRun.session_id == session_id)
        if for_update:
            query = query.populate_existing().with_for_update()
        return query.first()

    def _validate_slots(self, root_id, slots):
        if not isinstance(slots, list) or not slots:
            return None, "A circuit must contain at least one activity slot"
        normalized = []
        for index, raw_slot in enumerate(slots):
            if not isinstance(raw_slot, dict):
                return None, f"slots[{index}] must be an object"
            activity_id = raw_slot.get("activity_definition_id")
            activity = get_owned_activity_definition(self.db_session, root_id, activity_id)
            if not activity:
                return None, f"slots[{index}].activity_definition_id was not found in this fractal"
            normalized.append({
                "id": raw_slot.get("id"),
                "activity": activity,
            })
        return normalized, None

    @staticmethod
    def _normalize_definition_fields(data, existing=None):
        name = data.get("name", getattr(existing, "name", None))
        name = name.strip() if isinstance(name, str) else ""
        description = data.get("description", getattr(existing, "description", ""))
        description = description.strip() if isinstance(description, str) else ""
        rounds = data.get("planned_rounds", getattr(existing, "planned_rounds", 1))
        if isinstance(rounds, bool):
            return None, "planned_rounds must be a positive integer"
        try:
            rounds = int(rounds)
        except (TypeError, ValueError):
            return None, "planned_rounds must be a positive integer"
        if not name:
            return None, "name is required"
        if rounds <= 0:
            return None, "planned_rounds must be a positive integer"
        return {"name": name, "description": description, "planned_rounds": rounds}, None

    def list_definitions(self, root_id, user_id, *, include_archived=False):
        return self.definition_operations.list(
            root_id,
            user_id,
            include_archived=include_archived,
        )

    def get_definition(self, root_id, definition_id, user_id, *, include_archived=False):
        return self.definition_operations.get(
            root_id,
            definition_id,
            user_id,
            include_archived=include_archived,
        )

    def create_definition(self, root_id, user_id, data):
        return self.definition_operations.create(root_id, user_id, data)

    def update_definition(self, root_id, definition_id, user_id, data):
        return self.definition_operations.update(root_id, definition_id, user_id, data)

    def archive_definition(self, root_id, definition_id, user_id):
        return self.definition_operations.archive(root_id, definition_id, user_id)

    def restore_definition(self, root_id, definition_id, user_id):
        return self.definition_operations.restore(root_id, definition_id, user_id)

    def _create_round_occurrences(self, run, round_number, *, completed=False):
        circuit_round = CircuitRound(circuit_run_id=run.id, round_number=round_number)
        self.db_session.add(circuit_round)
        self.db_session.flush()
        for run_slot in sorted(run.slots, key=lambda slot: slot.sort_order):
            member = CircuitRoundMember(
                circuit_round_id=circuit_round.id,
                circuit_run_slot_id=run_slot.id,
                sort_order=run_slot.sort_order,
            )
            if run_slot.has_sets:
                activity_set = ActivitySet(
                    activity_instance_id=run_slot.activity_instance_id,
                    sort_order=round_number - 1,
                    status="completed" if completed else "planned",
                )
                self.db_session.add(activity_set)
                self.db_session.flush()
                member.activity_set_id = activity_set.id
            else:
                instance = ActivityInstance(
                    session_id=run.session_id,
                    root_id=run.root_id,
                    activity_definition_id=run_slot.activity_definition_id,
                    completed=completed,
                )
                self.db_session.add(instance)
                self.db_session.flush()
                member.activity_instance_id = instance.id
            self.db_session.add(member)
        return circuit_round

    def _attach_member_goals(self, session, definition, root_id):
        """Attach the union of member activity goals; circuits own no goal links."""
        from services.goal_type_utils import get_canonical_goal_type
        from services.session_activity_service import SessionActivityService

        goals = {
            goal.id: goal
            for slot in definition.slots
            for goal in (slot.activity_definition.associated_goals or [])
            if not goal.deleted_at and goal.root_id == root_id
        }
        if not goals:
            return
        if session.program_day_id:
            eligible_ids = set(self.db_session.execute(
                text(
                    "SELECT goal_id FROM program_days "
                    "JOIN program_blocks ON program_blocks.id = program_days.block_id "
                    "JOIN programs ON programs.id = program_blocks.program_id "
                    "JOIN program_goals ON program_goals.program_id = programs.id "
                    "WHERE program_days.id = :day_id AND programs.root_id = :root_id"
                ),
                {"day_id": session.program_day_id, "root_id": root_id},
            ).scalars())
            goals = {goal_id: goal for goal_id, goal in goals.items() if goal_id in eligible_ids}
        if not goals:
            return
        existing = {
            goal_id for (goal_id,) in self.db_session.query(session_goals.c.goal_id).filter(
                session_goals.c.session_id == session.id,
                session_goals.c.goal_id.in_(list(goals)),
            ).all()
        }
        helper = SessionActivityService(self.db_session)
        rows = [
            helper._session_goal_insert_values(
                session.id,
                goal.id,
                get_canonical_goal_type(goal),
                "activity",
            )
            for goal in goals.values()
            if goal.id not in existing
        ]
        if rows:
            self.db_session.execute(session_goals.insert(), rows)

    def create_run(self, root_id, session_id, user_id, data, *, commit=True, emit=True):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        session = self._locked_session(root_id, session_id)
        if not session:
            return None, "Session not found", 404
        if session.completed:
            return None, "Completed sessions cannot accept new circuits", 409
        if is_quick_session(session):
            return None, "Quick sessions do not support circuits", 400
        definition = self._definition(
            root_id,
            data.get("circuit_definition_id"),
            include_archived=bool(data.get("allow_archived")),
        )
        if not definition:
            return None, "Circuit not found", 404
        if not definition.slots:
            return None, "Circuit has no activity slots", 409
        result_count = definition.planned_rounds * len(definition.slots)
        shape_error = validate_circuit_shape(definition.planned_rounds, len(definition.slots))
        if shape_error:
            return None, shape_error, 409
        required_instances = sum(
            1 if slot.activity_definition.has_sets else definition.planned_rounds
            for slot in definition.slots
        )
        quota = QuotaService(self.db_session)
        _, quota_error, quota_status = quota.check_available(user_id, "activity_instances", required_instances)
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota.check_storage_available(
            user_id,
            quota._payload_size(
                definition.id,
                definition.name,
                definition.description,
                [
                    {
                        "activity_definition_id": slot.activity_definition_id,
                        "rounds": definition.planned_rounds,
                    }
                    for slot in definition.slots
                ],
            ) + (result_count * ESTIMATED_CIRCUIT_RESULT_BYTES),
        )
        if storage_error:
            return None, storage_error, storage_status
        run = CircuitRun(
            root_id=root_id,
            session_id=session_id,
            circuit_definition_id=definition.id,
            source_version=definition.version,
            name=definition.name,
            description=definition.description,
            planned_rounds=definition.planned_rounds,
        )
        self.db_session.add(run)
        self.db_session.flush()
        for slot in sorted(definition.slots, key=lambda item: item.sort_order):
            activity = slot.activity_definition
            run_slot = CircuitRunSlot(
                circuit_run_id=run.id,
                source_slot_id=slot.id,
                activity_definition_id=activity.id,
                sort_order=slot.sort_order,
                activity_name=activity.name,
                has_sets=bool(activity.has_sets),
                has_metrics=bool(activity.has_metrics),
                activity_schema=self.metric_service.snapshot_activity_schema(activity),
            )
            if activity.has_sets:
                instance = ActivityInstance(
                    session_id=session_id,
                    root_id=root_id,
                    activity_definition_id=activity.id,
                )
                self.db_session.add(instance)
                self.db_session.flush()
                run_slot.activity_instance_id = instance.id
            self.db_session.add(run_slot)
        self.db_session.flush()
        for round_number in range(1, run.planned_rounds + 1):
            self._create_round_occurrences(run, round_number)
        self._attach_member_goals(session, definition, root_id)
        structure_error = append_circuit_run_item(
            session,
            run.id,
            data.get("section_index"),
            data.get("item_index"),
        )
        if structure_error:
            self.db_session.rollback()
            return None, structure_error, 400
        if commit:
            self.db_session.commit()
        else:
            self.db_session.flush()
        run = self._run(root_id, run.id)
        if emit:
            event_bus.emit(Event(Events.CIRCUIT_RUN_CREATED, {
                "circuit_run_id": run.id,
                "circuit_definition_id": run.circuit_definition_id,
                "session_id": session_id,
                "root_id": root_id,
            }, source="circuit_service.create_run"))
        return serialize_circuit_run(run), None, 201

    def list_session_runs(self, root_id, session_id, user_id):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        if not get_owned_session(self.db_session, root_id, session_id):
            return None, "Session not found", 404
        rows = self.db_session.query(CircuitRun).options(*self._run_options()).filter(
            CircuitRun.root_id == root_id,
            CircuitRun.session_id == session_id,
        ).order_by(CircuitRun.created_at).all()
        return [serialize_circuit_run(row) for row in rows], None, 200

    def get_run(self, root_id, run_id, user_id):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        run = self._run(root_id, run_id)
        if not run:
            return None, "Circuit run not found", 404
        return serialize_circuit_run(run), None, 200

    def delete_run(self, root_id, run_id, user_id):
        locked = self._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, session = locked
        if session.completed:
            return None, "Completed sessions cannot remove circuit runs", 409

        instance_ids = {
            instance_id
            for slot in run.slots
            for instance_id in [slot.activity_instance_id]
            if instance_id
        }
        instance_ids.update(
            member.activity_instance_id
            for circuit_round in run.rounds
            for member in circuit_round.members
            if member.activity_instance_id
        )
        now = utc_now_naive()
        round_ids = [circuit_round.id for circuit_round in run.rounds]
        self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
            (
                ((Note.context_type == "circuit_run") & (Note.context_id == run.id))
                | ((Note.context_type == "circuit_round") & (Note.context_id.in_(round_ids)))
            ),
        ).update({Note.deleted_at: now}, synchronize_session=False)
        if instance_ids:
            for instance in self.db_session.query(ActivityInstance).filter(
                ActivityInstance.id.in_(instance_ids),
                ActivityInstance.session_id == run.session_id,
            ).all():
                instance.deleted_at = now

        remove_circuit_run_item(session, run.id)
        run_payload = {
            "id": run.id,
            "name": run.name,
            "session_id": run.session_id,
        }
        self.db_session.delete(run)
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_RUN_DELETED, {
            "circuit_run_id": run_payload["id"],
            "session_id": run_payload["session_id"],
            "root_id": root_id,
            "name": run_payload["name"],
        }, source="circuit_service.delete_run"))
        return {"message": "Circuit run deleted", **run_payload}, None, 200

    def start_run(self, root_id, run_id, user_id):
        return self.timing_operations.start(root_id, run_id, user_id)

    def _authorized_run(self, root_id, run_id, user_id, *, for_update=False):
        if not self._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        run = self._run(root_id, run_id, for_update=for_update)
        if not run:
            return None, "Circuit run not found", 404
        return run

    def _authorized_locked_run(self, root_id, run_id, user_id):
        """Lock the owning session before the run to match ordinary timer lock order."""
        candidate = self._authorized_run(root_id, run_id, user_id)
        if isinstance(candidate, tuple):
            return candidate
        session = self.db_session.query(Session).filter(
            Session.id == candidate.session_id,
            Session.root_id == root_id,
        ).with_for_update().first()
        if not session:
            return None, "Session not found", 404
        run = self._run(root_id, run_id, session_id=session.id, for_update=True)
        if not run:
            return None, "Circuit run not found", 404
        return run, session

    def _locked_session(self, root_id, session_id):
        return self.db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).with_for_update().first()

    def update_run_timing(self, root_id, run_id, user_id, data):
        return self.timing_operations.update(root_id, run_id, user_id, data)

    def _member_for_run(self, run, member_id):
        for circuit_round in run.rounds:
            for member in circuit_round.members:
                if member.id == member_id:
                    return circuit_round, member
        return None, None

    def update_member_metrics(self, root_id, run_id, member_id, user_id, metrics):
        run = self._authorized_run(root_id, run_id, user_id, for_update=True)
        if isinstance(run, tuple):
            return run
        _, member = self._member_for_run(run, member_id)
        if not member:
            return None, "Circuit member not found", 404
        try:
            self.metric_service.replace_member_metrics(member, metrics)
        except ValueError as error:
            self.db_session.rollback()
            return None, str(error), 400
        self.db_session.commit()
        instance_id = member.activity_instance_id or member.run_slot.activity_instance_id
        event_bus.emit(Event(Events.ACTIVITY_METRICS_UPDATED, {
            "instance_id": instance_id,
            "activity_definition_id": member.run_slot.activity_definition_id,
            "activity_name": member.run_slot.activity_name,
            "session_id": run.session_id,
            "root_id": root_id,
            "circuit_round_member_id": member.id,
            "updated_fields": ["metrics"],
        }, source="circuit_service.update_member_metrics", context={"db_session": self.db_session}))
        return serialize_circuit_run(self._run(root_id, run.id)), None, 200

    def add_round(self, root_id, run_id, user_id):
        return self.round_operations.add(root_id, run_id, user_id)

    def delete_round(self, root_id, run_id, round_id, user_id):
        return self.round_operations.delete(root_id, run_id, round_id, user_id)

    def complete_run(self, root_id, run_id, user_id):
        return self.timing_operations.complete(root_id, run_id, user_id)
