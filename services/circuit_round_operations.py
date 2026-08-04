from __future__ import annotations

from sqlalchemy import or_

from models import ActivityInstance, ActivitySet, Note
from services.circuit_rules import (
    ESTIMATED_CIRCUIT_RESULT_BYTES,
    MAX_CIRCUIT_ROUNDS,
    validate_circuit_shape,
)
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.serializers import serialize_circuit_run
from services.work_interval_service import utc_now_naive


class CircuitRoundOperations:
    """Mutates round structure under the owner's session-first lock order."""

    def __init__(self, owner):
        self.owner = owner
        self.db_session = owner.db_session

    def add(self, root_id, run_id, user_id):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, session = locked
        if session.completed:
            return None, "Completed sessions cannot add circuit rounds", 409

        additional_instances = sum(1 for slot in run.slots if not slot.has_sets)
        quota = QuotaService(self.db_session)
        _, quota_error, quota_status = quota.check_available(
            user_id, "activity_instances", additional_instances
        )
        if quota_error:
            return None, quota_error, quota_status
        next_round_number = max((row.round_number for row in run.rounds), default=0) + 1
        if next_round_number > MAX_CIRCUIT_ROUNDS:
            return None, f"A circuit cannot contain more than {MAX_CIRCUIT_ROUNDS} rounds", 409
        shape_error = validate_circuit_shape(next_round_number, len(run.slots))
        if shape_error:
            return None, shape_error, 409
        _, storage_error, storage_status = quota.check_storage_available(
            user_id,
            quota._payload_size(
                run.id, next_round_number, [slot.activity_definition_id for slot in run.slots]
            ) + (len(run.slots) * ESTIMATED_CIRCUIT_RESULT_BYTES),
        )
        if storage_error:
            return None, storage_error, storage_status

        added_round = self.owner._create_round_occurrences(
            run, next_round_number, completed=run.status == "completed"
        )
        run.planned_rounds = next_round_number
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_ROUND_ADDED, {
            "circuit_run_id": run.id,
            "circuit_round_id": added_round.id,
            "round_number": next_round_number,
            "session_id": run.session_id,
            "root_id": root_id,
        }, source="circuit_service.add_round"))
        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 201

    def delete(self, root_id, run_id, round_id, user_id):
        locked = self.owner._authorized_locked_run(root_id, run_id, user_id)
        if isinstance(locked, tuple) and len(locked) == 3:
            return locked
        run, session = locked
        if session.completed:
            return None, "Completed sessions cannot remove circuit rounds", 409

        circuit_round = next((row for row in run.rounds if row.id == round_id), None)
        if not circuit_round:
            return None, "Circuit round not found", 404
        if len(run.rounds) <= 1:
            return None, "A circuit run must keep at least one round", 409

        result_rows = []
        result_instance_ids = []
        result_set_ids = []
        for member in circuit_round.members:
            if member.activity_set_id:
                result_set_ids.append(member.activity_set_id)
                result_rows.append(self.db_session.get(ActivitySet, member.activity_set_id))
            if member.activity_instance_id:
                result_instance_ids.append(member.activity_instance_id)
                result_rows.append(self.db_session.get(ActivityInstance, member.activity_instance_id))

        note_conditions = [
            (Note.context_type == "circuit_round") & (Note.context_id == circuit_round.id),
        ]
        if result_set_ids:
            note_conditions.append(Note.activity_set_id.in_(result_set_ids))
        if result_instance_ids:
            note_conditions.append(Note.activity_instance_id.in_(result_instance_ids))
        self.db_session.query(Note).filter(
            Note.root_id == root_id,
            Note.deleted_at.is_(None),
            or_(*note_conditions),
        ).update({Note.deleted_at: utc_now_naive()}, synchronize_session=False)

        self.db_session.delete(circuit_round)
        self.db_session.flush()
        for result_row in result_rows:
            if result_row is not None:
                self.db_session.delete(result_row)
        self.db_session.flush()

        remaining_rounds = sorted(
            (row for row in run.rounds if row.id != round_id), key=lambda row: row.round_number
        )
        temporary_offset = max(row.round_number for row in remaining_rounds) + len(remaining_rounds) + 1
        for index, row in enumerate(remaining_rounds):
            row.round_number = temporary_offset + index
            for member in row.members:
                if member.activity_set_id and member.activity_set:
                    member.activity_set.sort_order = temporary_offset + index - 1
        self.db_session.flush()
        for index, row in enumerate(remaining_rounds, start=1):
            row.round_number = index
            for member in row.members:
                if member.activity_set_id and member.activity_set:
                    member.activity_set.sort_order = index - 1
        run.planned_rounds = len(remaining_rounds)
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_ROUND_DELETED, {
            "circuit_run_id": run.id,
            "circuit_round_id": round_id,
            "session_id": run.session_id,
            "root_id": root_id,
        }, source="circuit_service.delete_round"))
        return serialize_circuit_run(self.owner._run(root_id, run.id)), None, 200
