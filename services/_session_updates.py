"""Mixin for SessionLifecycleService: updating, completing, duplicating and deleting sessions.
"""

from datetime import datetime, timezone
from sqlalchemy.orm.attributes import flag_modified
import models
from models import ActivityInstance, CircuitRun, Session, validate_root_goal
from services import Event, Events, event_bus
from services.circuit_completion import circuit_completion_event_data, finalize_circuit_run
from services.payload_normalizers import normalize_session_payload
from services.serializers import serialize_session
from services.service_types import JsonDict, ServiceResult
from services.session_runtime import is_quick_session
from services.session_structure import build_duplicate_session_data
from services.session_template_stats_service import SessionTemplateStatsService
from services.circuit_session_items import circuit_owned_instance_ids
from services.work_interval_service import WorkIntervalService
from services._session_lifecycle_common import _as_utc_datetime, _parse_iso_datetime_strict


class _SessionUpdatesMixin:
    @staticmethod
    def _finalize_paused_session_duration(session_obj, completion_time: datetime):
        if is_quick_session(session_obj):
            return

        completion_at = _as_utc_datetime(completion_time) or datetime.now(timezone.utc)
        if session_obj.is_paused and session_obj.last_paused_at:
            paused_at = _as_utc_datetime(session_obj.last_paused_at)
            if paused_at and completion_at > paused_at:
                paused_duration = int((completion_at - paused_at).total_seconds())
                session_obj.total_paused_seconds = (session_obj.total_paused_seconds or 0) + paused_duration
        session_obj.is_paused = False
        session_obj.last_paused_at = None

        if not session_obj.session_end:
            session_obj.session_end = completion_at

        start_at = _as_utc_datetime(session_obj.session_start)
        end_at = _as_utc_datetime(session_obj.session_end)
        if start_at and end_at and end_at > start_at:
            wall_duration = int((end_at - start_at).total_seconds())
            session_obj.total_duration_seconds = max(
                0,
                wall_duration - (session_obj.total_paused_seconds or 0),
            )

    def duplicate_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).options(
            *self._session_read_options(),
        ).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None,
        ).first()
        if not session:
            return None, "Session not found", 404

        template_id = None
        if getattr(session, 'template', None) and getattr(session.template, 'deleted_at', None) is None:
            template_id = session.template_id

        goal_ids = [goal.id for goal in (session.goals or []) if not goal.deleted_at]
        if not goal_ids:
            goal_ids = [goal.id for goal in self._derive_session_goals_from_activities(session)]

        duplicate_payload = {
            'name': session.name,
            'description': session.description or '',
            'template_id': template_id,
            'goal_ids': goal_ids,
            'session_start': models.utc_now().isoformat(),
            'session_data': build_duplicate_session_data(session),
        }

        return self.create_session(
            root_id,
            current_user_id,
            duplicate_payload,
            allow_archived_definitions=True,
        )

    def update_session(
        self,
        root_id,
        session_id,
        current_user_id,
        data,
        *,
        commit=True,
        pending_events=None,
    ) -> ServiceResult[JsonDict]:
        data = normalize_session_payload(data, partial=True)
        completed_circuit_runs = []
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()

        if not session:
            return None, "Session not found", 404
        session.row_version = (session.row_version or 1) + 1
        if 'name' in data:
            session.name = data['name']
        if 'description' in data:
            session.description = data['description']
        if 'duration_minutes' in data:
            session.duration_minutes = data['duration_minutes']

        if 'completed' in data:
            if not data['completed'] and session.completed:
                conflict = self._active_session_conflict(
                    root_id,
                    current_user_id,
                    exclude_session_id=session.id,
                )
                if conflict:
                    return None, conflict, 409
            session.completed = data['completed']
            if data['completed']:
                completion_time = datetime.now(timezone.utc)
                session.completed_at = completion_time
                circuit_completion_time = completion_time.replace(tzinfo=None)
                incomplete_circuits = self.db_session.query(CircuitRun).filter(
                    CircuitRun.session_id == session.id,
                    CircuitRun.status.in_(('active', 'paused')),
                ).with_for_update().all()
                for circuit_run in incomplete_circuits:
                    if finalize_circuit_run(self.db_session, circuit_run, circuit_completion_time):
                        completed_circuit_runs.append(circuit_run)
                if is_quick_session(session):
                    if not session.session_start:
                        session.session_start = session.created_at or completion_time
                    session.session_end = None
                    session.total_duration_seconds = None
                    if isinstance(session.attributes, dict) and 'session_data' in session.attributes:
                        session.attributes['session_data']['session_end'] = None
                        session.attributes['session_data']['total_duration_seconds'] = None
                        flag_modified(session, "attributes")

                # Session completion is a terminal boundary for ordinary activity
                # work. Close the canonical interval before finalizing the instance
                # fields so reads cannot resurrect a timer from an open interval.
                WorkIntervalService(self.db_session).close_open(
                    session.id,
                    ended_at=completion_time.replace(tzinfo=None),
                )

                instances = self.db_session.query(ActivityInstance).filter(
                    ActivityInstance.session_id == session.id,
                    ActivityInstance.deleted_at == None
                ).all()
                circuit_instance_ids = circuit_owned_instance_ids(self.db_session, session.id)
                for instance in instances:
                    if instance.id in circuit_instance_ids:
                        continue
                    if instance.completed:
                        continue
                    if not instance.time_start:
                        continue
                    elif not instance.time_stop:
                        instance.time_stop = completion_time

                        if instance.is_paused and instance.last_paused_at:
                            paused_at = _as_utc_datetime(instance.last_paused_at)
                            if paused_at:
                                paused_duration = (completion_time - paused_at).total_seconds()
                                instance.total_paused_seconds = (
                                    (instance.total_paused_seconds or 0)
                                    + int(max(0, paused_duration))
                                )
                            instance.is_paused = False
                            instance.last_paused_at = None

                        stop_at = _as_utc_datetime(instance.time_stop)
                        start_at = _as_utc_datetime(instance.time_start)
                        duration = (stop_at - start_at).total_seconds() if stop_at and start_at else 0
                        active_duration = max(0, duration - (instance.total_paused_seconds or 0))
                        instance.duration_seconds = int(active_duration)
                    instance.completed = True
            else:
                session.completed_at = None
                session.session_end = None
                session.total_duration_seconds = None
                session.is_paused = False
                session.last_paused_at = None

                if isinstance(session.attributes, dict) and 'session_data' in session.attributes:
                    session.attributes['session_data']['session_end'] = None
                    session.attributes['session_data']['total_duration_seconds'] = None
                    flag_modified(session, "attributes")

        if 'session_start' in data:
            try:
                session.session_start = _parse_iso_datetime_strict(data['session_start'])
            except ValueError:
                return None, "Invalid session_start format. Use ISO-8601.", 400

        if 'session_end' in data:
            try:
                session.session_end = _parse_iso_datetime_strict(data['session_end'])
            except ValueError:
                return None, "Invalid session_end format. Use ISO-8601.", 400

        if 'total_duration_seconds' in data:
            session.total_duration_seconds = data['total_duration_seconds']
        if 'template_id' in data:
            session.template_id = data['template_id']
        if 'session_data' in data:
            val = data['session_data']
            session.attributes = models._safe_load_json(val, val)

        if 'goal_ids' in data:
            goal_scope_error = self._replace_manual_goal_scope(session, root_id, data.get('goal_ids'))
            if goal_scope_error:
                self.db_session.rollback()
                return None, goal_scope_error, 400

        should_recompute_completed_duration = (
            session.completed
            and not is_quick_session(session)
            and ('total_duration_seconds' not in data)
            and (
                data.get('completed')
                or 'session_start' in data
                or 'session_end' in data
            )
        )

        if should_recompute_completed_duration:
            self._finalize_paused_session_duration(session, session.session_end or session.completed_at)

        if commit:
            self.db_session.commit()
        self._recompute_and_attach_stats(session, commit=commit)
        queue_event = lambda event: (pending_events.append if pending_events is not None else event_bus.emit)(event)

        for circuit_run in completed_circuit_runs:
            event = Event(
                Events.CIRCUIT_RUN_COMPLETED,
                circuit_completion_event_data(circuit_run, root_id),
                source='session_service.update_session',
            )
            queue_event(event)

        event = Event(
            Events.SESSION_UPDATED,
            {
                'session_id': session.id,
                'session_name': session.name,
                'root_id': root_id,
                'updated_fields': list(data.keys())
            },
            source='session_service.update_session'
        )
        queue_event(event)

        if data.get('completed') and session.completed:
            event = Event(
                Events.SESSION_COMPLETED,
                {
                    'session_id': session.id,
                    'session_name': session.name,
                    'root_id': root_id
                },
                source='session_service.update_session',
                context={'db_session': self.db_session},
            )
            queue_event(event)

        return serialize_session(session), None, 200

    def delete_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()

        if not session:
             return None, "Session not found", 404

        session_name = session.name
        template_id = session.template_id
        activity_definition_ids = [
            instance.activity_definition_id
            for instance in (session.activity_instances or [])
            if instance.activity_definition_id
        ]
        session.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        stats_service = SessionTemplateStatsService(self.db_session)
        if template_id:
            stats_service.recompute_template_stats(root_id, template_id)
        if activity_definition_ids:
            stats_service.recompute_activity_stats(root_id, activity_definition_ids)
        self.db_session.commit()

        event_bus.emit(Event(Events.SESSION_DELETED, {
            'session_id': session_id,
            'session_name': session_name,
            'root_id': root_id
        }, source='session_service.delete_session'))

        return {"message": "Session deleted successfully"}, None, 200
