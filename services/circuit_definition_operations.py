from sqlalchemy import and_, case, func

from models import CircuitDefinition, CircuitRun, CircuitSlot, Session
from services.activity_group_service import validate_activity_group_id
from services.circuit_rules import validate_circuit_shape
from services.events import Event, Events, event_bus
from services.quota_service import QuotaService
from services.serializers import format_utc, serialize_circuit_definition
from services.work_interval_service import utc_now_naive


class CircuitDefinitionOperations:
    """Definition catalogue writes composed by the circuit run coordinator."""

    def __init__(self, owner):
        self.owner = owner
        self.db_session = owner.db_session

    def list(self, root_id, user_id, *, include_archived=False):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        query = self.db_session.query(CircuitDefinition).options(
            *self.owner._definition_options()
        ).filter(CircuitDefinition.root_id == root_id)
        if not include_archived:
            query = query.filter(CircuitDefinition.deleted_at.is_(None))
        rows = query.order_by(CircuitDefinition.name, CircuitDefinition.created_at).all()
        if not rows:
            return [], None, 200
        listed_ids = [row.id for row in rows]
        summary_rows = self.db_session.query(
            CircuitRun.circuit_definition_id,
            func.count(CircuitRun.id).label("instance_count"),
            func.max(func.coalesce(
                Session.session_start,
                Session.created_at,
                CircuitRun.completed_at,
                CircuitRun.created_at,
            )).label("last_used_at"),
            func.avg(case(
                (and_(
                    CircuitRun.status == "completed",
                    CircuitRun.duration_seconds.is_not(None),
                ), CircuitRun.duration_seconds),
                else_=None,
            )).label("average_duration_seconds"),
        ).join(Session, Session.id == CircuitRun.session_id).filter(
            CircuitRun.root_id == root_id,
            CircuitRun.circuit_definition_id.in_(listed_ids),
            Session.deleted_at.is_(None),
        ).group_by(CircuitRun.circuit_definition_id).all()
        summaries = {
            definition_id: {
                "instance_count": int(instance_count or 0),
                "last_used_at": format_utc(last_used_at),
                "average_duration_seconds": (
                    int(round(float(average_duration_seconds)))
                    if average_duration_seconds is not None else None
                ),
            }
            for definition_id, instance_count, last_used_at, average_duration_seconds in summary_rows
        }
        return [
            serialize_circuit_definition(row, summaries.get(row.id))
            for row in rows
        ], None, 200

    def get(self, root_id, definition_id, user_id, *, include_archived=False):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        definition = self.owner._definition(
            root_id,
            definition_id,
            include_archived=include_archived,
        )
        if not definition:
            return None, "Circuit not found", 404
        return serialize_circuit_definition(definition), None, 200

    def create(self, root_id, user_id, data):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        fields, error = self.owner._normalize_definition_fields(data)
        if error:
            return None, error, 400
        group_id = data.get("group_id") or None
        group_error = validate_activity_group_id(self.db_session, root_id, group_id)
        if group_error:
            return None, group_error, 400
        fields["group_id"] = group_id
        slots, error = self.owner._validate_slots(root_id, data.get("slots"))
        if error:
            return None, error, 400
        shape_error = validate_circuit_shape(fields["planned_rounds"], len(slots))
        if shape_error:
            return None, shape_error, 400
        quota = QuotaService(self.db_session)
        _, quota_error, quota_status = quota.check_available(user_id, "circuits")
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota.check_storage_available(
            user_id,
            quota._payload_size(fields, data.get("slots")),
        )
        if storage_error:
            return None, storage_error, storage_status
        definition = CircuitDefinition(root_id=root_id, **fields)
        self.db_session.add(definition)
        self.db_session.flush()
        for index, slot in enumerate(slots):
            self.db_session.add(CircuitSlot(
                circuit_definition_id=definition.id,
                activity_definition_id=slot["activity"].id,
                sort_order=index,
            ))
        self.db_session.commit()
        definition = self.owner._definition(root_id, definition.id)
        event_bus.emit(Event(Events.CIRCUIT_CREATED, {
            "circuit_definition_id": definition.id,
            "root_id": root_id,
            "name": definition.name,
        }, source="circuit_definition_operations.create"))
        return serialize_circuit_definition(definition), None, 201

    def update(self, root_id, definition_id, user_id, data):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        locked = self.db_session.query(CircuitDefinition).filter(
            CircuitDefinition.id == definition_id,
            CircuitDefinition.root_id == root_id,
            CircuitDefinition.deleted_at.is_(None),
        ).with_for_update().first()
        definition = self.owner._definition(root_id, definition_id) if locked else None
        if not definition:
            return None, "Circuit not found", 404
        expected_version = data.get("version")
        if expected_version is not None and expected_version != definition.version:
            return {
                "error": "Circuit was updated by another request",
                "code": "stale_version",
                "current": serialize_circuit_definition(definition),
            }, None, 409
        fields, error = self.owner._normalize_definition_fields(data, definition)
        if error:
            return None, error, 400
        if "group_id" in data:
            group_id = data.get("group_id") or None
            group_error = validate_activity_group_id(self.db_session, root_id, group_id)
            if group_error:
                return None, group_error, 400
            fields["group_id"] = group_id
        slots = None
        if "slots" in data:
            slots, error = self.owner._validate_slots(root_id, data.get("slots"))
            if error:
                return None, error, 400
        shape_error = validate_circuit_shape(
            fields["planned_rounds"],
            len(slots) if slots is not None else len(definition.slots),
        )
        if shape_error:
            return None, shape_error, 400
        quota = QuotaService(self.db_session)
        current_size = self._definition_payload_size(quota, definition)
        next_size = quota._payload_size(
            fields["name"],
            fields["description"],
            [{"activity_definition_id": slot["activity"].id} for slot in slots]
            if slots is not None else self._slot_payload(definition.slots),
        )
        additional_storage = max(0, next_size - current_size)
        if additional_storage:
            _, storage_error, storage_status = quota.check_storage_available(user_id, additional_storage)
            if storage_error:
                return None, storage_error, storage_status
        definition.name = fields["name"]
        definition.description = fields["description"]
        definition.planned_rounds = fields["planned_rounds"]
        if "group_id" in fields:
            definition.group_id = fields["group_id"]
        definition.version += 1
        if slots is not None:
            definition.slots.clear()
            self.db_session.flush()
            for index, slot in enumerate(slots):
                definition.slots.append(CircuitSlot(
                    activity_definition_id=slot["activity"].id,
                    sort_order=index,
                ))
        self.db_session.commit()
        definition = self.owner._definition(root_id, definition.id)
        event_bus.emit(Event(Events.CIRCUIT_UPDATED, {
            "circuit_definition_id": definition.id,
            "root_id": root_id,
            "name": definition.name,
        }, source="circuit_definition_operations.update"))
        return serialize_circuit_definition(definition), None, 200

    @staticmethod
    def _slot_payload(slots):
        return [{"activity_definition_id": slot.activity_definition_id} for slot in slots]

    def _definition_payload_size(self, quota, definition):
        return quota._payload_size(
            definition.name,
            definition.description,
            self._slot_payload(definition.slots),
        )

    def archive(self, root_id, definition_id, user_id):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        definition = self.owner._definition(root_id, definition_id)
        if not definition:
            return None, "Circuit not found", 404
        definition.deleted_at = utc_now_naive()
        definition.version += 1
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_DELETED, {
            "circuit_definition_id": definition.id,
            "root_id": root_id,
            "name": definition.name,
        }, source="circuit_definition_operations.archive"))
        return {"message": "Circuit archived", "id": definition.id}, None, 200

    def restore(self, root_id, definition_id, user_id):
        if not self.owner._owned_root(root_id, user_id):
            return None, "Fractal not found or access denied", 404
        definition = self.owner._definition(root_id, definition_id, include_archived=True)
        if not definition:
            return None, "Circuit not found", 404
        if definition.deleted_at is None:
            return serialize_circuit_definition(definition), None, 200
        quota = QuotaService(self.db_session)
        _, quota_error, quota_status = quota.check_available(user_id, "circuits")
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota.check_storage_available(
            user_id,
            self._definition_payload_size(quota, definition),
        )
        if storage_error:
            return None, storage_error, storage_status
        definition.deleted_at = None
        definition.version += 1
        self.db_session.commit()
        event_bus.emit(Event(Events.CIRCUIT_RESTORED, {
            "circuit_definition_id": definition.id,
            "root_id": root_id,
            "name": definition.name,
        }, source="circuit_definition_operations.restore"))
        return serialize_circuit_definition(
            self.owner._definition(root_id, definition.id)
        ), None, 200
