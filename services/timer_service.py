from datetime import datetime, timezone
import json
import uuid

from sqlalchemy.orm import joinedload, selectinload

import models
from models import (
    ActivityDefinition,
    ActivityInstance,
    MetricValue,
    ProgramBlock,
    ProgramDay,
    Session,
    validate_root_goal,
)
from services.owned_entity_queries import (
    get_owned_activity_definition,
    get_owned_activity_instance,
    get_owned_session,
)

from services.events import Event, Events, event_bus
from services.session_runtime import is_quick_session
from services.serializers import serialize_activity_instance, serialize_session
from services.service_types import JsonDict, ServiceResult


def _utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _parse_iso_datetime(value) -> datetime | None:
    if not value:
        return None

    normalized = value
    if '.' in normalized and normalized.endswith('Z'):
        normalized = normalized.split('.')[0] + 'Z'
    elif '.' in normalized and '+' in normalized:
        normalized = normalized.split('.')[0] + normalized[normalized.rfind('+'):]

    parsed = datetime.fromisoformat(normalized.replace('Z', '+00:00'))
    if parsed.tzinfo is not None:
        return parsed.astimezone(timezone.utc).replace(tzinfo=None)
    return parsed


class TimerService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _activity_instance_query_options():
        return (
            joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split),
        )

    @staticmethod
    def _session_query_options():
        return (
            selectinload(Session.goals),
            selectinload(Session.template),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(Session.program_day).selectinload(ProgramDay.block).selectinload(ProgramBlock.program),
        )

    def _get_root(self, root_id, current_user_id):
        return validate_root_goal(self.db_session, root_id, owner_id=current_user_id)

    def _load_session_for_response(self, root_id, session_id):
        return self.db_session.query(Session).options(
            *self._session_query_options()
        ).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).first()

    def _build_instance(
        self,
        *,
        root_id,
        instance_id,
        session_id,
        activity_definition_id,
        activity_definition,
    ):
        instance = ActivityInstance(
            id=instance_id,
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id,
        )
        instance.definition = activity_definition
        self.db_session.add(instance)
        return instance

    @staticmethod
    def _quick_session_timer_error(session):
        if session and is_quick_session(session):
            return "Quick sessions do not support timers", 400
        return None

    @staticmethod
    def _normalize_target_duration(value):
        if value is None:
            return None, None
        if isinstance(value, bool):
            return None, "target_duration_seconds must be a positive integer"
        try:
            target_duration = int(value)
        except (TypeError, ValueError):
            return None, "target_duration_seconds must be a positive integer"
        if target_duration <= 0:
            return None, "target_duration_seconds must be greater than 0"
        return target_duration, None

    @staticmethod
    def _activity_event_payload(instance, root_id, activity_name, *, updated_fields=None) -> JsonDict:
        payload = {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': instance.session_id,
            'root_id': root_id,
        }
        if updated_fields:
            payload['updated_fields'] = updated_fields
        return payload

    def create_activity_instance(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        instance_id = data.get('instance_id') or str(uuid.uuid4())
        session_id = data.get('session_id')
        activity_definition_id = data.get('activity_definition_id')
        if not session_id or not activity_definition_id:
            return None, "session_id and activity_definition_id required", 400

        session_record = get_owned_session(self.db_session, root_id, session_id)
        if not session_record:
            return None, "Session not found in this fractal", 404

        activity_definition = get_owned_activity_definition(self.db_session, root_id, activity_definition_id)
        if not activity_definition:
            return None, "Activity definition not found in this fractal", 404

        existing = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            query_options=self._activity_instance_query_options(),
        )
        if existing:
            return {
                "instance": existing,
                "serialized": serialize_activity_instance(existing),
                "activity_name": existing.definition.name if existing.definition else "Unknown",
                "created": False,
            }, None, 200

        instance = self._build_instance(
            root_id=root_id,
            instance_id=instance_id,
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            activity_definition=activity_definition,
        )
        self.db_session.flush()
        self.db_session.commit()
        event_bus.emit_async(Event(
            Events.ACTIVITY_INSTANCE_CREATED,
            self._activity_event_payload(
                instance,
                root_id,
                activity_definition.name if activity_definition else "Unknown",
            ),
            source='timer_service.create_activity_instance',
        ))
        return {
            "instance": instance,
            "serialized": serialize_activity_instance(instance),
            "activity_name": activity_definition.name if activity_definition else "Unknown",
            "created": True,
        }, None, 201

    def list_activity_instances(self, root_id, current_user_id, limit=None, offset=0) -> ServiceResult[list[JsonDict]]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        sessions = self.db_session.query(Session.id).filter(
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).all()
        session_ids = [session_id for (session_id,) in sessions]
        if not session_ids:
            return [], None, 200

        query = self.db_session.query(ActivityInstance).options(
            *self._activity_instance_query_options(),
        ).filter(
            ActivityInstance.session_id.in_(session_ids),
            ActivityInstance.deleted_at.is_(None),
        )
        if limit is not None:
            query = query.offset(offset).limit(limit)
        instances = query.all()
        return [serialize_activity_instance(instance) for instance in instances], None, 200

    def start_activity_timer(self, root_id, instance_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            query_options=self._activity_instance_query_options(),
        )

        if not instance:
            session_id = data.get('session_id')
            activity_definition_id = data.get('activity_definition_id')
            if not session_id or not activity_definition_id:
                return None, "session_id and activity_definition_id required", 400

            session_record = get_owned_session(self.db_session, root_id, session_id)
            if not session_record:
                return None, "Session not found in this fractal", 404
            quick_error = self._quick_session_timer_error(session_record)
            if quick_error:
                return None, *quick_error

            activity_definition = get_owned_activity_definition(self.db_session, root_id, activity_definition_id)
            if not activity_definition:
                return None, "Activity definition not found in this fractal", 404

            instance = self._build_instance(
                root_id=root_id,
                instance_id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                activity_definition=activity_definition,
            )
        else:
            session_record = get_owned_session(self.db_session, root_id, instance.session_id)
            quick_error = self._quick_session_timer_error(session_record)
            if quick_error:
                return None, *quick_error

        start_time = _utc_now_naive()
        instance.time_start = start_time
        instance.time_stop = None
        instance.duration_seconds = None

        target_duration = data.get('target_duration_seconds')
        if target_duration is not None:
            normalized_target, target_error = self._normalize_target_duration(target_duration)
            if target_error:
                return None, target_error, 400
            instance.target_duration_seconds = normalized_target

        if session_record and session_record.is_paused:
            instance.is_paused = True
            instance.last_paused_at = start_time
        else:
            instance.is_paused = False
            instance.last_paused_at = None

        self.db_session.commit()
        activity_name = instance.definition.name if instance.definition else "Unknown"
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_UPDATED,
            self._activity_event_payload(
                instance,
                root_id,
                activity_name,
                updated_fields=['time_start'],
            ),
            source='timer_service.start_activity_timer',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "serialized": serialize_activity_instance(instance),
            "activity_name": activity_name,
        }, None, 200

    def complete_activity_instance(
        self,
        root_id,
        instance_id,
        current_user_id,
        *,
        async_completion=False,
    ) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            query_options=self._activity_instance_query_options(),
        )
        if not instance:
            return None, "Activity instance not found.", 404

        session_record = get_owned_session(self.db_session, root_id, instance.session_id)
        quick_error = self._quick_session_timer_error(session_record)
        if quick_error:
            return None, *quick_error

        now = _utc_now_naive()
        if not instance.time_start:
            instance.time_start = now
            instance.time_stop = now
            instance.duration_seconds = 0
            instance.completed = True
        else:
            instance.time_stop = now
            if instance.is_paused and instance.last_paused_at:
                paused_duration = (now - instance.last_paused_at).total_seconds()
                instance.total_paused_seconds = (instance.total_paused_seconds or 0) + int(paused_duration)
                instance.is_paused = False
                instance.last_paused_at = None

            duration = (instance.time_stop - instance.time_start).total_seconds()
            final_duration = max(0, int(duration) - (instance.total_paused_seconds or 0))
            instance.duration_seconds = final_duration
            instance.completed = True

        self.db_session.commit()
        activity_name = instance.definition.name if instance.definition else "Unknown"
        completion_event = Event(
            Events.ACTIVITY_INSTANCE_COMPLETED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': activity_name,
                'session_id': instance.session_id,
                'root_id': root_id,
                'duration_seconds': instance.duration_seconds,
                'completed_at': instance.time_stop.isoformat() if instance.time_stop else None,
            },
            source='timer_service.complete_activity_instance',
            context={} if async_completion else {'db_session': self.db_session},
        )
        if async_completion:
            event_bus.emit_async(completion_event)
        else:
            event_bus.emit(completion_event)
        return {
            "instance": instance,
            "serialized": serialize_activity_instance(instance),
            "activity_name": activity_name,
            "completed_at": instance.time_stop.isoformat() if instance.time_stop else None,
        }, None, 200

    def update_activity_instance(self, root_id, instance_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            query_options=self._activity_instance_query_options(),
        )

        if not instance:
            session_id = data.get('session_id')
            activity_definition_id = data.get('activity_definition_id')
            if not session_id or not activity_definition_id:
                return None, "Instance not found and missing creation details", 404

            session_record = get_owned_session(self.db_session, root_id, session_id)
            if not session_record:
                return None, "Session not found in this fractal", 404

            activity_definition = get_owned_activity_definition(self.db_session, root_id, activity_definition_id)
            if not activity_definition:
                return None, "Activity definition not found in this fractal", 404

            instance = self._build_instance(
                root_id=root_id,
                instance_id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                activity_definition=activity_definition,
            )

        if 'time_start' in data:
            try:
                instance.time_start = _parse_iso_datetime(data['time_start'])
            except ValueError:
                return None, f"Invalid datetime format: {data['time_start']}", 400

        if 'time_stop' in data:
            try:
                instance.time_stop = _parse_iso_datetime(data['time_stop'])
            except ValueError:
                return None, f"Invalid datetime format: {data['time_stop']}", 400

        if 'completed' in data:
            instance.completed = bool(data['completed'])

        if 'target_duration_seconds' in data:
            normalized_target, target_error = self._normalize_target_duration(data['target_duration_seconds'])
            if target_error:
                return None, target_error, 400
            instance.target_duration_seconds = normalized_target  # accepts None to clear

        if 'notes' in data:
            instance.notes = data['notes']

        current_data = models._safe_load_json(instance.data, {})
        if 'sets' in data:
            current_data['sets'] = data['sets']
            instance.data = json.dumps(current_data)

        if instance.time_start and instance.time_stop:
            duration = (instance.time_stop - instance.time_start).total_seconds()
            instance.duration_seconds = int(duration)
        elif not instance.time_start or not instance.time_stop:
            instance.duration_seconds = None

        self.db_session.commit()
        activity_name = instance.definition.name if instance.definition else "Unknown"
        updated_fields = list(data.keys())
        non_metric_fields = [field for field in updated_fields if field != 'sets']
        if 'sets' in data:
            event_bus.emit(Event(
                Events.ACTIVITY_METRICS_UPDATED,
                self._activity_event_payload(
                    instance,
                    root_id,
                    activity_name,
                    updated_fields=['sets'],
                ),
                source='timer_service.update_activity_instance',
                context={'db_session': self.db_session},
            ))
        if non_metric_fields:
            event_bus.emit(Event(
                Events.ACTIVITY_INSTANCE_UPDATED,
                self._activity_event_payload(
                    instance,
                    root_id,
                    activity_name,
                    updated_fields=non_metric_fields,
                ),
                source='timer_service.update_activity_instance',
                context={'db_session': self.db_session},
            ))
        return {
            "instance": instance,
            "serialized": serialize_activity_instance(instance),
            "activity_name": activity_name,
        }, None, 200

    def pause_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_timer_error(session)
        if quick_error:
            return None, *quick_error
        if session.is_paused:
            return None, "Session is already paused", 400

        now = _utc_now_naive()
        session.is_paused = True
        session.last_paused_at = now

        active_instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.time_start.is_not(None),
            ActivityInstance.time_stop.is_(None),
            ActivityInstance.is_paused.is_(False),
            ActivityInstance.deleted_at.is_(None),
        ).all()
        for instance in active_instances:
            instance.is_paused = True
            instance.last_paused_at = now

        self.db_session.commit()
        refreshed = self._load_session_for_response(root_id, session_id) or session
        event_bus.emit(Event(
            Events.SESSION_UPDATED,
            {
                'session_id': refreshed.id,
                'root_id': root_id,
            },
            source='timer_service.pause_session',
        ))
        return {
            "session": refreshed,
            "serialized": serialize_session(refreshed),
        }, None, 200

    def resume_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_timer_error(session)
        if quick_error:
            return None, *quick_error
        if not session.is_paused:
            return None, "Session is not paused", 400

        now = _utc_now_naive()
        if session.last_paused_at:
            paused_duration = (now - session.last_paused_at).total_seconds()
            session.total_paused_seconds = (session.total_paused_seconds or 0) + int(paused_duration)
        session.is_paused = False
        session.last_paused_at = None

        paused_instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.time_start.is_not(None),
            ActivityInstance.time_stop.is_(None),
            ActivityInstance.is_paused.is_(True),
            ActivityInstance.deleted_at.is_(None),
        ).all()
        for instance in paused_instances:
            if instance.last_paused_at:
                paused_duration = (now - instance.last_paused_at).total_seconds()
                instance.total_paused_seconds = (instance.total_paused_seconds or 0) + int(paused_duration)
            instance.is_paused = False
            instance.last_paused_at = None

        self.db_session.commit()
        refreshed = self._load_session_for_response(root_id, session_id) or session
        event_bus.emit(Event(
            Events.SESSION_UPDATED,
            {
                'session_id': refreshed.id,
                'root_id': root_id,
            },
            source='timer_service.resume_session',
        ))
        return {
            "session": refreshed,
            "serialized": serialize_session(refreshed),
        }, None, 200
