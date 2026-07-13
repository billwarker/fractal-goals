import copy
from datetime import datetime, timezone
import uuid

from sqlalchemy import inspect, text
from sqlalchemy.orm import joinedload
from sqlalchemy.orm.attributes import flag_modified

import models
from models import ActivityDefinition, ActivityInstance, Goal, Session, session_goals, validate_root_goal
from services import Event, Events, event_bus
from services.goal_type_utils import get_canonical_goal_type
from services.payload_normalizers import normalize_session_payload
from services.quota_service import QuotaService
from services.serializers import serialize_session
from services.service_types import JsonDict, ServiceResult
from services.session_activity_service import SessionActivityService
from services.session_runtime import (
    DEFAULT_TEMPLATE_COLOR,
    SESSION_TYPE_QUICK,
    get_template_color,
    get_template_session_type,
    is_quick_session,
)
from services.session_structure import build_duplicate_session_data, extract_activity_definition_id
from services.session_template_stats_service import SessionTemplateStatsService


def _program_goal_ids(db_session, program_id) -> set[str]:
    if not program_id:
        return set()
    return set(
        db_session.execute(
            text("SELECT goal_id FROM program_goals WHERE program_id = :program_id"),
            {'program_id': program_id}
        ).scalars().all()
    )


def _parse_iso_datetime_strict(value) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


class SessionLifecycleService:
    def __init__(self, db_session, *, session_read_options_factory, derived_goals_resolver):
        self.db_session = db_session
        self._session_read_options = session_read_options_factory
        self._derive_session_goals_from_activities = derived_goals_resolver
        self._session_goals_has_source = None

    def _recompute_and_attach_stats(self, session):
        if not session:
            return
        stats_service = SessionTemplateStatsService(self.db_session)
        computed = stats_service.recompute_for_session(session)
        session._template_stats = computed.get("template") or {}
        session._activity_duration_stats = computed.get("activity_durations") or {}
        self.db_session.commit()

    def get_active_session(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        session = self.db_session.query(Session).filter(
            Session.owner_id == current_user_id,
            Session.root_id == root_id,
            Session.completed.is_not(True),
            Session.deleted_at.is_(None),
        ).order_by(Session.created_at.asc()).first()
        return (serialize_session(session) if session else None), None, 200

    def _active_session_conflict(self, root_id, current_user_id, *, exclude_session_id=None):
        query = self.db_session.query(Session).filter(
            Session.owner_id == current_user_id,
            Session.root_id == root_id,
            Session.completed.is_not(True),
            Session.deleted_at.is_(None),
        )
        if exclude_session_id:
            query = query.filter(Session.id != exclude_session_id)
        active = query.order_by(Session.created_at.asc()).first()
        if not active:
            return None
        return {
            'error': 'A session is already in progress',
            'code': 'active_session_exists',
            'active_session': serialize_session(active),
        }

    @staticmethod
    def _extract_activity_definition_id(raw_item) -> str | None:
        return extract_activity_definition_id(raw_item)

    @classmethod
    def _normalize_template_activities(cls, raw_items) -> list[tuple[dict | str, str]]:
        normalized = []
        for raw_item in raw_items or []:
            activity_id = cls._extract_activity_definition_id(raw_item)
            if not activity_id:
                continue
            normalized.append((raw_item, activity_id))
        return normalized

    def _session_goals_supports_source(self) -> bool:
        if self._session_goals_has_source is None:
            cols = inspect(self.db_session.bind).get_columns('session_goals')
            self._session_goals_has_source = any(c.get('name') == 'association_source' for c in cols)
        return self._session_goals_has_source

    def _session_goal_insert_values(self, session_id, goal_id, goal_type, association_source) -> JsonDict:
        values = {
            'session_id': session_id,
            'goal_id': goal_id,
            'goal_type': goal_type,
        }
        if self._session_goals_supports_source():
            values['association_source'] = association_source
        return values

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

        return self.create_session(root_id, current_user_id, duplicate_payload)

    def create_session(
        self,
        root_id,
        current_user_id,
        data,
        *,
        reserve_active_slot=True,
        initially_completed=False,
    ) -> ServiceResult[JsonDict]:
        data = normalize_session_payload(data)
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        if reserve_active_slot:
            conflict = self._active_session_conflict(root_id, current_user_id)
            if conflict:
                return None, conflict, 409

        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "sessions")
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(
                data.get('name'), data.get('description'), data.get('session_data'),
            ),
        )
        if storage_error:
            return None, storage_error, storage_status

        try:
            s_start = _parse_iso_datetime_strict(data.get('session_start')) if 'session_start' in data else None
            s_end = _parse_iso_datetime_strict(data.get('session_end')) if 'session_end' in data else None
        except ValueError:
            return None, "Invalid datetime format. Use ISO-8601 (e.g. 2026-02-18T15:30:00Z)", 400

        new_session = Session(
            name=data.get('name', 'Untitled Session'),
            description=data.get('description', ''),
            owner_id=current_user_id,
            root_id=root_id,
            completed=initially_completed,
            completed_at=datetime.now(timezone.utc) if initially_completed else None,
            duration_minutes=int(data['duration_minutes']) if data.get('duration_minutes') is not None else None,
            session_start=s_start,
            session_end=s_end,
            total_duration_seconds=int(data['total_duration_seconds']) if data.get('total_duration_seconds') is not None else None,
            template_id=data.get('template_id')
        )

        session_data_dict = models._safe_load_json(data.get('session_data'), {})
        new_session.attributes = copy.deepcopy(session_data_dict)
        template = None
        template_payload = {}
        template_session_type = get_template_session_type(session_data_dict)

        program_day_id = None
        program_goal_ids = set()
        if new_session.attributes:
            program_context = session_data_dict.get('program_context')
            if program_context and 'day_id' in program_context:
                requested_day_id = program_context['day_id']
                p_day = self.db_session.query(models.ProgramDay).options(
                    joinedload(models.ProgramDay.block).joinedload(models.ProgramBlock.program)
                ).filter(
                    models.ProgramDay.id == requested_day_id
                ).first()
                if p_day and p_day.block and p_day.block.program and p_day.block.program.root_id == root_id:
                    program_day_id = requested_day_id
                    new_session.program_day_id = program_day_id
                    program_goal_ids = _program_goal_ids(self.db_session, p_day.block.program.id)
                else:
                    return None, "Invalid program day context for this fractal", 400

        if new_session.template_id:
            template = self.db_session.query(models.SessionTemplate).filter(
                models.SessionTemplate.id == new_session.template_id,
                models.SessionTemplate.root_id == root_id,
                models.SessionTemplate.deleted_at == None
            ).first()
            if not template:
                return None, "Template not found in this fractal", 404
            template_payload = models._safe_load_json(template.template_data, {})
            template_session_type = get_template_session_type(template_payload)

            session_data_dict.setdefault('template_id', template.id)
            session_data_dict.setdefault('template_name', template.name)
            session_data_dict.setdefault('session_type', template_session_type)
            session_data_dict.setdefault('template_color', get_template_color(template_payload) or DEFAULT_TEMPLATE_COLOR)

            if template_session_type == SESSION_TYPE_QUICK:
                if program_day_id:
                    return None, "Quick session templates cannot be used from a program day", 400
                if not new_session.session_start:
                    new_session.session_start = datetime.now(timezone.utc)
            elif isinstance(session_data_dict, dict) and not session_data_dict.get('sections'):
                if isinstance(template_payload, dict) and template_payload.get('sections'):
                    session_data_dict['sections'] = template_payload.get('sections', [])
                    if (
                        not session_data_dict.get('total_duration_minutes')
                        and template_payload.get('total_duration_minutes') is not None
                    ):
                        session_data_dict['total_duration_minutes'] = template_payload.get('total_duration_minutes')

            new_session.attributes = copy.deepcopy(session_data_dict)

        self.db_session.add(new_session)
        self.db_session.flush()

        inherited_goal_map = {}

        def collect_section_exercises(input_sections):
            local_activity_ids = set()
            local_section_exercises = []
            for section in input_sections or []:
                if not isinstance(section, dict):
                    continue
                raw_exercises = section.get('exercises') or section.get('activities') or []
                normalized = []
                for exercise in raw_exercises:
                    activity_id = self._extract_activity_definition_id(exercise)
                    if not activity_id:
                        continue
                    local_activity_ids.add(activity_id)
                    normalized.append((exercise, activity_id))
                local_section_exercises.append((section, normalized))
            return local_activity_ids, local_section_exercises

        is_quick_template = template_session_type == SESSION_TYPE_QUICK

        if is_quick_template:
            quick_items = template_payload.get('activities', []) if isinstance(template_payload, dict) else []
            normalized_quick_items = self._normalize_template_activities(quick_items)
            if not (1 <= len(normalized_quick_items) <= 5):
                return None, "Quick sessions must include between 1 and 5 activities", 400

            unique_activity_def_ids = {activity_id for _, activity_id in normalized_quick_items}
            activities = self.db_session.query(ActivityDefinition).filter(
                ActivityDefinition.id.in_(unique_activity_def_ids),
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None
            ).all()
            found_activity_ids = {a.id for a in activities}
            missing_activity_ids = unique_activity_def_ids - found_activity_ids
            if missing_activity_ids:
                return None, f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400

            _, quota_error, quota_status = quota_service.check_available(
                current_user_id,
                "activity_instances",
                len(normalized_quick_items),
            )
            if quota_error:
                return None, quota_error, quota_status

            created_activity_ids = []
            for raw_item, activity_id in normalized_quick_items:
                raw_dict = raw_item if isinstance(raw_item, dict) else {}
                instance_id = raw_dict.get('instance_id') or str(uuid.uuid4())
                instance = ActivityInstance(
                    id=instance_id,
                    session_id=new_session.id,
                    activity_definition_id=activity_id,
                    root_id=root_id,
                )
                self.db_session.add(instance)
                self.db_session.flush()
                created_activity_ids.append(instance_id)

            session_data_dict['activity_ids'] = created_activity_ids
            session_data_dict.pop('sections', None)
        else:
            sections = session_data_dict.get('sections', []) if isinstance(session_data_dict, dict) else []
            activity_def_ids, section_exercises = collect_section_exercises(sections)

            if not activity_def_ids and template:
                template_sections = template_payload.get('sections', []) if isinstance(template_payload, dict) else []
                template_activity_ids, template_section_exercises = collect_section_exercises(template_sections)
                if template_activity_ids:
                    session_data_dict['sections'] = template_sections
                    sections = session_data_dict.get('sections', [])
                    activity_def_ids = template_activity_ids
                    section_exercises = template_section_exercises

            if activity_def_ids:
                activities = self.db_session.query(ActivityDefinition).options(
                    joinedload(ActivityDefinition.associated_goals)
                ).filter(
                    ActivityDefinition.id.in_(activity_def_ids),
                    ActivityDefinition.root_id == root_id,
                    ActivityDefinition.deleted_at == None
                ).all()
                found_activity_ids = {a.id for a in activities}
                missing_activity_ids = activity_def_ids - found_activity_ids
                if missing_activity_ids:
                    return None, f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400
                instance_increment = sum(len(normalized_exercises) for _, normalized_exercises in section_exercises)
                _, quota_error, quota_status = quota_service.check_available(
                    current_user_id,
                    "activity_instances",
                    instance_increment,
                )
                if quota_error:
                    return None, quota_error, quota_status
                activity_map = {a.id: a for a in activities}

                for section, normalized_exercises in section_exercises:
                    if section.get('id') and not section.get('template_section_id'):
                        section['template_section_id'] = section.get('id')
                    section_activity_ids = []
                    for exercise, activity_id in normalized_exercises:
                        if activity_id not in activity_map:
                            continue
                        instance_id = exercise.get('instance_id') or str(uuid.uuid4())
                        instance = ActivityInstance(
                            id=instance_id,
                            session_id=new_session.id,
                            activity_definition_id=activity_id,
                            root_id=root_id
                        )
                        self.db_session.add(instance)
                        self.db_session.flush()
                        section_activity_ids.append(instance_id)

                    section['activity_ids'] = section_activity_ids
                    section.pop('exercises', None)
                    section.pop('activities', None)
                    if 'estimated_duration_minutes' not in section and section.get('duration_minutes') is not None:
                        section['estimated_duration_minutes'] = section.get('duration_minutes')

                for act in activities:
                    for goal in act.associated_goals:
                        if (
                            goal.root_id == root_id and
                            not goal.completed and
                            not goal.deleted_at
                        ):
                            inherited_goal_map[goal.id] = goal

        new_session.attributes = copy.deepcopy(session_data_dict)

        if not is_quick_template and program_day_id and program_goal_ids:
            inherited_goal_map = {gid: g for gid, g in inherited_goal_map.items() if gid in program_goal_ids}

        manual_ids = set()
        manual_ids.update(data.get('parent_ids', []) or [])
        manual_ids.update(data.get('goal_ids', []) or [])
        if data.get('parent_id'):
            manual_ids.add(data.get('parent_id'))

        linked_goal_ids = set()

        if not is_quick_template:
            for goal_id, goal_obj in inherited_goal_map.items():
                self.db_session.execute(
                    session_goals.insert().values(
                        **self._session_goal_insert_values(
                            new_session.id, goal_id, get_canonical_goal_type(goal_obj), 'activity'
                        )
                    )
                )
                linked_goal_ids.add(goal_id)

            for goal_id in manual_ids:
                goal_obj = self.db_session.query(Goal).filter(
                    Goal.id == goal_id,
                    Goal.root_id == root_id,
                    Goal.deleted_at == None
                ).first()
                if not goal_obj:
                    return None, f"Goal not found in this fractal: {goal_id}", 400
                if goal_id in linked_goal_ids:
                    continue
                self.db_session.execute(
                    session_goals.insert().values(
                        **self._session_goal_insert_values(
                            new_session.id, goal_id, get_canonical_goal_type(goal_obj), 'manual'
                        )
                    )
                )
                linked_goal_ids.add(goal_id)

            immediate_goal_ids = data.get('immediate_goal_ids', [])
            for ig_id in immediate_goal_ids:
                goal = self.db_session.query(Goal).filter(
                    Goal.id == ig_id,
                    Goal.root_id == root_id,
                    Goal.deleted_at == None
                ).first()
                if not goal:
                    return None, f"Immediate goal not found in this fractal: {ig_id}", 400
                if get_canonical_goal_type(goal) != 'ImmediateGoal':
                    return None, f"Goal is not an ImmediateGoal: {ig_id}", 400
                if ig_id not in linked_goal_ids:
                    self.db_session.execute(
                        session_goals.insert().values(
                            **self._session_goal_insert_values(
                                new_session.id, ig_id, get_canonical_goal_type(goal), 'manual'
                            )
                        )
                    )
                    linked_goal_ids.add(ig_id)

        if program_day_id:
            from models import ProgramDay
            program_day = self.db_session.query(ProgramDay).filter_by(id=program_day_id).first()
            if program_day:
                program_day.is_completed = program_day.check_completion()

        self.db_session.commit()

        if s_start or s_end:
            params = {'id': new_session.id}
            update_clauses = []
            if s_start:
                update_clauses.append("session_start = :start")
                params['start'] = s_start
            if s_end:
                update_clauses.append("session_end = :end")
                params['end'] = s_end
            if update_clauses:
                sql = f"UPDATE sessions SET {', '.join(update_clauses)} WHERE id = :id"
                self.db_session.execute(text(sql), params)
                self.db_session.commit()

        self.db_session.refresh(new_session)
        self._recompute_and_attach_stats(new_session)

        event_bus.emit(Event(Events.SESSION_CREATED, {
            'session_id': new_session.id,
            'session_name': new_session.name,
            'root_id': root_id,
            'goal_ids': [g.id for g in new_session.goals]
        }, source='session_service.create_session'))

        return serialize_session(new_session), None, 201

    def create_completed_quick_session(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        create_payload = {key: value for key, value in data.items() if key != 'activity_instances'}
        created_session, error, status = self.create_session(
            root_id,
            current_user_id,
            create_payload,
            reserve_active_slot=False,
            initially_completed=True,
        )
        if error:
            return None, error, status

        session_id = created_session.get('id')
        if not session_id:
            return None, "Quick session creation returned no session id", 500

        persisted_instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None,
        ).order_by(ActivityInstance.created_at.asc()).all()

        instances_by_definition_id = {}
        for instance in persisted_instances:
            instances_by_definition_id.setdefault(instance.activity_definition_id, []).append(instance)

        from services.timer_service import TimerService
        timer_service = TimerService(self.db_session)

        for draft_instance in data.get('activity_instances', []):
            activity_definition_id = draft_instance.get('activity_definition_id')
            persisted_candidates = instances_by_definition_id.get(activity_definition_id) or []
            if not persisted_candidates:
                continue

            persisted_instance = persisted_candidates.pop(0)
            notes = draft_instance.get('notes')

            if draft_instance.get('has_sets'):
                update_payload = {
                    'completed': bool(draft_instance.get('completed')),
                    'sets': draft_instance.get('sets', []),
                }
                if notes is not None:
                    update_payload['notes'] = notes

                _, instance_error, instance_status = timer_service.update_activity_instance(
                    root_id,
                    persisted_instance.id,
                    current_user_id,
                    update_payload,
                )
                if instance_error:
                    return None, instance_error, instance_status
                continue

            metric_payload = draft_instance.get('metrics', [])
            if metric_payload:
                _, metrics_error, metrics_status = SessionActivityService(self.db_session).update_activity_metrics(
                    root_id,
                    session_id,
                    persisted_instance.id,
                    current_user_id,
                    metric_payload,
                )
                if metrics_error:
                    return None, metrics_error, metrics_status

            instance_payload = {
                'completed': bool(draft_instance.get('completed')),
            }
            if notes is not None:
                instance_payload['notes'] = notes

            _, instance_error, instance_status = timer_service.update_activity_instance(
                root_id,
                persisted_instance.id,
                current_user_id,
                instance_payload,
            )
            if instance_error:
                return None, instance_error, instance_status

        completed_session, complete_error, complete_status = self.update_session(
            root_id,
            session_id,
            current_user_id,
            {'completed': True},
            complete_unstarted_instances=False,
        )
        if complete_error:
            return None, complete_error, complete_status

        return completed_session, None, 201

    def update_session(
        self,
        root_id,
        session_id,
        current_user_id,
        data,
        *,
        complete_unstarted_instances=True,
    ) -> ServiceResult[JsonDict]:
        data = normalize_session_payload(data, partial=True)
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
                if is_quick_session(session):
                    if not session.session_start:
                        session.session_start = session.created_at or completion_time
                    session.session_end = None
                    session.total_duration_seconds = None
                    if isinstance(session.attributes, dict) and 'session_data' in session.attributes:
                        session.attributes['session_data']['session_end'] = None
                        session.attributes['session_data']['total_duration_seconds'] = None
                        flag_modified(session, "attributes")

                instances = self.db_session.query(ActivityInstance).filter(
                    ActivityInstance.session_id == session.id,
                    ActivityInstance.deleted_at == None
                ).all()
                for instance in instances:
                    if instance.completed:
                        continue
                    if not instance.time_start:
                        if not complete_unstarted_instances:
                            continue
                        instance.time_start = completion_time
                        instance.time_stop = completion_time
                        instance.duration_seconds = 0
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

        self.db_session.commit()
        self._recompute_and_attach_stats(session)

        event_bus.emit(Event(
            Events.SESSION_UPDATED,
            {
                'session_id': session.id,
                'session_name': session.name,
                'root_id': root_id,
                'updated_fields': list(data.keys())
            },
            source='session_service.update_session'
        ))

        if data.get('completed') and session.completed:
            event_bus.emit(Event(
                Events.SESSION_COMPLETED,
                {
                    'session_id': session.id,
                    'session_name': session.name,
                    'root_id': root_id
                },
                source='session_service.update_session',
                context={'db_session': self.db_session},
            ))

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
