"""Mixin for SessionLifecycleService: creating standard, template, program-day and quick sessions.
"""

import copy
from dataclasses import dataclass, field
from datetime import datetime, timezone
import uuid
from typing import Any
from sqlalchemy import text
from sqlalchemy.orm import joinedload
import models
from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    Session,
    session_goals,
    validate_root_goal,
)
from services.session_creation_events import publish_session_creation_events
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
)
from services.program_scope import resolve_program_scope
from services._session_lifecycle_common import _parse_iso_datetime_strict


@dataclass
class _SessionDraft:
    """Mutable state shared by the create_session phases for one new session."""

    root_id: str
    current_user_id: str
    data: dict
    quota_service: QuotaService
    new_session: Session
    session_data: dict
    template_session_type: str | None
    allow_archived_definitions: bool
    template: Any = None
    template_payload: dict = field(default_factory=dict)
    program_day_id: str | None = None
    program_goal_ids: set | None = None
    created_circuit_runs: list = field(default_factory=list)


class _SessionCreationMixin:
    def create_session(
        self,
        root_id,
        current_user_id,
        data,
        *,
        reserve_active_slot=True,
        initially_completed=False,
        allow_archived_definitions=False,
        commit=True,
        pending_events=None,
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
        draft = _SessionDraft(
            root_id=root_id,
            current_user_id=current_user_id,
            data=data,
            quota_service=quota_service,
            new_session=new_session,
            session_data=session_data_dict,
            template_session_type=get_template_session_type(session_data_dict),
            allow_archived_definitions=allow_archived_definitions,
        )

        error = self._apply_program_context(draft) or self._apply_template(draft)
        if error:
            return (None, *error)

        self.db_session.add(new_session)
        self.db_session.flush()

        is_quick_template = draft.template_session_type == SESSION_TYPE_QUICK
        if is_quick_template:
            error = self._instantiate_quick_activities(draft)
        else:
            error = self._instantiate_section_items(draft)
        if error:
            return (None, *error)

        new_session.attributes = copy.deepcopy(draft.session_data)

        error = self._link_session_goals(draft, is_quick_template=is_quick_template)
        if error:
            return (None, *error)

        if commit:
            self.db_session.commit()

        self._persist_session_times(new_session.id, s_start, s_end, commit=commit)

        self.db_session.refresh(new_session)
        self._recompute_and_attach_stats(new_session, commit=commit)

        publish_session_creation_events(
            new_session,
            root_id,
            draft.created_circuit_runs,
            pending_events,
        )

        return serialize_session(new_session), None, 201

    def _apply_program_context(self, draft):
        """Bind a program day or program from ``program_context`` and resolve its goal scope."""
        new_session = draft.new_session
        session_data_dict = draft.session_data
        root_id = draft.root_id
        if new_session.attributes:
            program_context = session_data_dict.get('program_context')
            goal_scope_enabled = not isinstance(program_context, dict) or program_context.get('goal_scope_enabled') is not False
            if program_context and 'day_id' in program_context:
                requested_day_id = program_context['day_id']
                p_day = self.db_session.query(models.ProgramDay).options(
                    joinedload(models.ProgramDay.block).joinedload(models.ProgramBlock.program)
                ).filter(
                    models.ProgramDay.id == requested_day_id
                ).populate_existing().with_for_update(of=models.ProgramDay).first()
                if p_day and p_day.block and p_day.block.program and p_day.block.program.root_id == root_id:
                    draft.program_day_id = requested_day_id
                    new_session.program_day_id = draft.program_day_id
                    p_day.row_version += 1
                    new_session.program_id = p_day.block.program.id
                    new_session.program_block_id = p_day.block.id
                    program_context['program_id'] = p_day.block.program.id
                    program_context['program_name'] = p_day.block.program.name
                    program_context['program_color'] = p_day.block.program.color
                    program_context['block_id'] = p_day.block.id
                    program_context['block_name'] = p_day.block.name
                    program_context['block_color'] = p_day.block.color or p_day.block.program.color
                    program_context['day_name'] = p_day.name
                    program_context['day_number'] = p_day.day_number
                    if goal_scope_enabled:
                        draft.program_goal_ids = set(resolve_program_scope(
                            self.db_session, root_id, p_day.block.program.id
                        ).goal_ids)
                else:
                    return "Invalid program day context for this fractal", 400
            elif program_context and program_context.get('program_id'):
                requested_program_id = program_context['program_id']
                program = self.db_session.query(models.Program).filter(
                    models.Program.id == requested_program_id,
                    models.Program.root_id == root_id,
                ).first()
                if not program:
                    return "Invalid program context for this fractal", 400
                if goal_scope_enabled:
                    draft.program_goal_ids = set(resolve_program_scope(
                        self.db_session, root_id, program.id
                    ).goal_ids)
                program_context['program_name'] = program.name
                program_context['program_color'] = program.color
                new_session.program_id = program.id
                if program_context.get('block_id'):
                    block = next(
                        (candidate for candidate in (program.blocks or [])
                         if candidate.id == program_context['block_id']),
                        None,
                    )
                    if not block:
                        return "Invalid program block context for this program", 400
                    program_context['block_name'] = block.name
                    program_context['block_color'] = block.color or program.color
                    new_session.program_block_id = block.id
        return None

    def _apply_template(self, draft):
        """Load the session template and seed session data (type, color, sections) from it."""
        new_session = draft.new_session
        session_data_dict = draft.session_data
        if new_session.template_id:
            template = self.db_session.query(models.SessionTemplate).filter(
                models.SessionTemplate.id == new_session.template_id,
                models.SessionTemplate.root_id == draft.root_id,
                models.SessionTemplate.deleted_at == None
            ).first()
            if not template:
                return "Template not found in this fractal", 404
            draft.template = template
            template_payload = models._safe_load_json(template.template_data, {})
            draft.template_payload = template_payload
            draft.template_session_type = get_template_session_type(template_payload)

            session_data_dict.setdefault('template_id', template.id)
            session_data_dict.setdefault('template_name', template.name)
            session_data_dict.setdefault('session_type', draft.template_session_type)
            session_data_dict.setdefault('template_color', get_template_color(template_payload) or DEFAULT_TEMPLATE_COLOR)

            if draft.template_session_type == SESSION_TYPE_QUICK:
                if draft.program_day_id:
                    return "Quick session templates cannot be used from a program day", 400
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
        return None

    def _collect_section_exercises(self, input_sections):
        local_activity_ids = set()
        local_section_exercises = []
        local_circuit_items = []
        for section_index, section in enumerate(input_sections or []):
            if not isinstance(section, dict):
                continue
            raw_exercises = section.get('items') or section.get('exercises') or section.get('activities') or []
            normalized = []
            for item_index, exercise in enumerate(raw_exercises):
                if isinstance(exercise, dict) and exercise.get('type') == 'circuit':
                    circuit_definition_id = exercise.get('circuit_definition_id')
                    if circuit_definition_id:
                        local_circuit_items.append((section_index, item_index, circuit_definition_id))
                    continue
                activity_id = self._extract_activity_definition_id(exercise)
                if not activity_id:
                    continue
                local_activity_ids.add(activity_id)
                normalized.append((exercise, activity_id))
            local_section_exercises.append((section, normalized))
        return local_activity_ids, local_section_exercises, local_circuit_items

    def _instantiate_quick_activities(self, draft):
        """Create the 1-5 flat activity instances a quick-session template lists."""
        template_payload = draft.template_payload
        quick_items = template_payload.get('activities', []) if isinstance(template_payload, dict) else []
        normalized_quick_items = self._normalize_template_activities(quick_items)
        if not (1 <= len(normalized_quick_items) <= 5):
            return "Quick sessions must include between 1 and 5 activities", 400

        unique_activity_def_ids = {activity_id for _, activity_id in normalized_quick_items}
        activities_query = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id.in_(unique_activity_def_ids),
            ActivityDefinition.root_id == draft.root_id,
        )
        if not (draft.allow_archived_definitions or draft.template):
            activities_query = activities_query.filter(ActivityDefinition.deleted_at == None)
        activities = activities_query.all()
        found_activity_ids = {a.id for a in activities}
        missing_activity_ids = unique_activity_def_ids - found_activity_ids
        if missing_activity_ids:
            return f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400

        _, quota_error, quota_status = draft.quota_service.check_available(
            draft.current_user_id,
            "activity_instances",
            len(normalized_quick_items),
        )
        if quota_error:
            return quota_error, quota_status

        created_activity_ids = []
        for raw_item, activity_id in normalized_quick_items:
            raw_dict = raw_item if isinstance(raw_item, dict) else {}
            instance_id = raw_dict.get('instance_id') or str(uuid.uuid4())
            instance = ActivityInstance(
                id=instance_id,
                session_id=draft.new_session.id,
                activity_definition_id=activity_id,
                root_id=draft.root_id,
            )
            self.db_session.add(instance)
            self.db_session.flush()
            created_activity_ids.append(instance_id)

        draft.session_data['activity_ids'] = created_activity_ids
        draft.session_data.pop('sections', None)
        return None

    def _instantiate_section_items(self, draft):
        """Create activity instances and circuit runs for the session's (or template's) sections."""
        session_data_dict = draft.session_data
        template = draft.template
        template_payload = draft.template_payload
        sections = session_data_dict.get('sections', []) if isinstance(session_data_dict, dict) else []
        activity_def_ids, section_exercises, circuit_items = self._collect_section_exercises(sections)

        if not activity_def_ids and not circuit_items and template:
            template_sections = template_payload.get('sections', []) if isinstance(template_payload, dict) else []
            template_activity_ids, template_section_exercises, template_circuit_items = self._collect_section_exercises(template_sections)
            if template_activity_ids or template_circuit_items:
                session_data_dict['sections'] = template_sections
                sections = session_data_dict.get('sections', [])
                activity_def_ids = template_activity_ids
                section_exercises = template_section_exercises
                circuit_items = template_circuit_items

        if activity_def_ids:
            error = self._instantiate_section_activities(draft, activity_def_ids, section_exercises)
            if error:
                return error

        if circuit_items:
            return self._attach_section_circuits(draft, sections, circuit_items)
        return None

    def _instantiate_section_activities(self, draft, activity_def_ids, section_exercises):
        activities_query = self.db_session.query(ActivityDefinition).options(
            joinedload(ActivityDefinition.associated_goals)
        ).filter(
            ActivityDefinition.id.in_(activity_def_ids),
            ActivityDefinition.root_id == draft.root_id,
        )
        if not (draft.allow_archived_definitions or draft.template):
            activities_query = activities_query.filter(ActivityDefinition.deleted_at == None)
        activities = activities_query.all()
        found_activity_ids = {a.id for a in activities}
        missing_activity_ids = activity_def_ids - found_activity_ids
        if missing_activity_ids:
            return f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400
        instance_increment = sum(len(normalized_exercises) for _, normalized_exercises in section_exercises)
        _, quota_error, quota_status = draft.quota_service.check_available(
            draft.current_user_id,
            "activity_instances",
            instance_increment,
        )
        if quota_error:
            return quota_error, quota_status
        activity_map = {a.id: a for a in activities}

        for section, normalized_exercises in section_exercises:
            if section.get('id') and not section.get('template_section_id'):
                section['template_section_id'] = section.get('id')
            section_activity_ids = []
            section_items = []
            for exercise, activity_id in normalized_exercises:
                if activity_id not in activity_map:
                    continue
                instance_id = exercise.get('instance_id') or str(uuid.uuid4())
                instance = ActivityInstance(
                    id=instance_id,
                    session_id=draft.new_session.id,
                    activity_definition_id=activity_id,
                    root_id=draft.root_id
                )
                self.db_session.add(instance)
                self.db_session.flush()
                section_activity_ids.append(instance_id)
                section_items.append({'type': 'activity', 'activity_instance_id': instance_id})

            section['items'] = section_items
            section.pop('activity_ids', None)
            section.pop('exercises', None)
            section.pop('activities', None)
            if 'estimated_duration_minutes' not in section and section.get('duration_minutes') is not None:
                section['estimated_duration_minutes'] = section.get('duration_minutes')
        return None

    def _attach_section_circuits(self, draft, sections, circuit_items):
        from services.circuit_service import CircuitService

        new_session = draft.new_session
        for section in sections:
            if not isinstance(section, dict) or not isinstance(section.get('items'), list):
                continue
            section['items'] = [
                item
                for item in section['items']
                if not (
                    isinstance(item, dict)
                    and item.get('type') == 'circuit'
                    and item.get('circuit_definition_id')
                )
            ]
        # Activity occurrences are normalized above in the local payload.
        # Publish that canonical state before circuit insertion reads and
        # augments the session's typed item list.
        new_session.attributes = copy.deepcopy(draft.session_data)
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(new_session, 'attributes')
        circuit_service = CircuitService(self.db_session)
        for section_index, item_index, circuit_definition_id in circuit_items:
            created_run, circuit_error, circuit_status = circuit_service.create_run(
                draft.root_id, new_session.id, draft.current_user_id,
                {
                    'circuit_definition_id': circuit_definition_id,
                    'section_index': section_index,
                    'item_index': item_index,
                },
                commit=False,
                emit=False,
                allow_archived=bool(draft.template or draft.allow_archived_definitions),
                attach_goals=False,
            )
            if circuit_error:
                self.db_session.rollback()
                return circuit_error, circuit_status
            draft.created_circuit_runs.append(created_run)
            # create_run updates the persisted session JSON. Keep the local
            # canonical payload in sync so the final assignment cannot
            # overwrite the newly inserted typed circuit item.
            draft.session_data = copy.deepcopy(new_session.attributes)
        return None

    def _link_session_goals(self, draft, *, is_quick_template):
        """Link activity-derived, manual, and immediate goals, honouring program goal scope."""
        new_session = draft.new_session
        root_id = draft.root_id
        data = draft.data
        program_goal_ids = draft.program_goal_ids
        session_data_dict = draft.session_data
        inherited_goal_map = {}

        if not is_quick_template:
            created_definition_ids = {
                definition_id
                for (definition_id,) in self.db_session.query(ActivityInstance.activity_definition_id).filter(
                    ActivityInstance.session_id == new_session.id,
                    ActivityInstance.deleted_at.is_(None),
                ).all()
                if definition_id
            }
            inherited_goal_map = {
                goal.id: goal
                for goals in self._get_effective_activity_goals(root_id, created_definition_ids).values()
                for goal in goals
                if (
                    not goal.deleted_at
                    and (program_goal_ids is None or goal.id in program_goal_ids)
                )
            }

        manual_ids = set()
        manual_ids.update(data.get('parent_ids', []) or [])
        manual_ids.update(data.get('goal_ids', []) or [])
        if data.get('parent_id'):
            manual_ids.add(data.get('parent_id'))

        if program_goal_ids is not None and isinstance(session_data_dict.get('program_context'), dict):
            session_data_dict['program_context']['off_program_goal_ids'] = sorted(manual_ids - program_goal_ids)
            new_session.attributes = copy.deepcopy(session_data_dict)

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
                    return f"Goal not found in this fractal: {goal_id}", 400
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
                    return f"Immediate goal not found in this fractal: {ig_id}", 400
                if get_canonical_goal_type(goal) != 'ImmediateGoal':
                    return f"Goal is not an ImmediateGoal: {ig_id}", 400
                if ig_id not in linked_goal_ids:
                    self.db_session.execute(
                        session_goals.insert().values(
                            **self._session_goal_insert_values(
                                new_session.id, ig_id, get_canonical_goal_type(goal), 'manual'
                            )
                        )
                    )
                    linked_goal_ids.add(ig_id)
        return None

    def _persist_session_times(self, session_id, s_start, s_end, *, commit):
        """Write explicit start/end times with SQL so ORM defaults cannot replace them."""
        if s_start or s_end:
            params = {'id': session_id}
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
                if commit:
                    self.db_session.commit()

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
        )
        if complete_error:
            return None, complete_error, complete_status

        return completed_session, None, 201
