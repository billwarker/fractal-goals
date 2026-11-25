"""Mixin for SessionLifecycleService: creating standard, template, program-day and quick sessions.
"""

import copy
from dataclasses import dataclass, field
from datetime import datetime, timezone
import uuid
from typing import Any, Callable
from sqlalchemy import text
from sqlalchemy.orm import Session as OrmSession, joinedload
import models
from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    Goal,
    Session,
    session_goals,
    validate_root_goal,
)
from services.events import event_bus
from services.occurred_at import MAX_CLIENT_LAG, parse_client_datetime, utc_now_naive
from services.session_creation_events import publish_session_creation_events
from services.goal_type_utils import get_canonical_goal_type
from services.payload_normalizers import normalize_session_payload
from services.quota_service import QuotaService
from services.serializers import serialize_session
from services.service_types import ErrorPayload, JsonDict, ServiceResult
from services.session_activity_service import SessionActivityService
from services.session_runtime import (
    DEFAULT_TEMPLATE_COLOR,
    SESSION_TYPE_QUICK,
    get_data_session_type,
    get_session_runtime_data,
    get_template_color,
)
from services.program_scope import resolve_program_scope
from services.program_focus import resolve_day_focus_scope
from services.program_day_occurrences import block_for_date
from services.prescriptions import (
    item_activity_id,
    iter_activity_items,
    iter_circuit_items,
    load_planned_tags,
    snapshot_prescription,
)
from services._session_lifecycle_common import _parse_iso_datetime_strict
from services.circuit_ids import planned_set_id
from services.client_ids import is_uuid, keep_device_ids, new_id


# A create_session phase returns None to continue, or (message, status) to stop.
PhaseError = tuple[ErrorPayload, int] | None

# Mirrored by the client's MAX_QUICK_SESSION_ACTIVITIES (utils/createSessionQuickDraft.js).
MAX_QUICK_SESSION_ACTIVITIES = 20


@dataclass
class _SessionDraft:
    """Mutable state shared by the create_session phases for one new session."""

    root_id: str
    current_user_id: str
    data: dict
    quota_service: QuotaService
    new_session: Session
    session_data: Any  # decoded session JSON; phases guard its shape as the original flow did
    # Activity definition ids, in order, for a quick session; None for every other session.
    quick_activity_ids: list | None
    allow_archived_definitions: bool
    template: Any = None
    template_payload: dict = field(default_factory=dict)
    program_day_id: str | None = None
    program_goal_ids: set | None = None
    created_circuit_runs: list = field(default_factory=list)
    # item_key -> (activity id, prescription) from the authoritative template or plan.
    # Client-sent sections only carry item keys; planned values never come from the client.
    prescriptions_by_item_key: dict = field(default_factory=dict)


def _index_prescriptions(sections):
    """item_key -> (activity or circuit definition id, prescription) for planned items."""
    planned = {
        item['item_key']: (item_activity_id(item), item['prescription'])
        for item in iter_activity_items(sections)
        if item.get('item_key') and item.get('prescription')
    }
    planned.update({
        item['item_key']: (item.get('circuit_definition_id'), item['prescription'])
        for item in iter_circuit_items(sections)
        if item.get('item_key') and item.get('prescription')
    })
    return planned


class _SessionCreationMixin:
    # Host attributes supplied by SessionService; declared so the mixin type-checks on its own.
    db_session: OrmSession
    update_session: Callable[..., ServiceResult[JsonDict]]

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
        quick_activity_ids=None,
    ) -> ServiceResult[JsonDict]:
        """Create a session. Quick sessions come only from ``create_completed_quick_session``,
        which passes ``quick_activity_ids``; templates have no type."""
        data = normalize_session_payload(data)
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        requested_type = get_data_session_type(models._safe_load_json(data.get('session_data'), {}))
        if requested_type == SESSION_TYPE_QUICK and quick_activity_ids is None:
            return None, {
                "error": "Quick sessions are created already complete — use quick-complete",
                "code": "quick_session_use_complete",
            }, 400

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
            id=data.get('id') or new_id(Session),
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

        is_quick = quick_activity_ids is not None
        # A quick session has no template, program or plan: just the activities logged.
        session_data_dict = models._safe_load_json(
            {'session_type': SESSION_TYPE_QUICK} if is_quick else data.get('session_data'), {},
        )
        new_session.attributes = copy.deepcopy(session_data_dict)
        draft = _SessionDraft(
            root_id=root_id,
            current_user_id=current_user_id,
            data=data,
            quota_service=quota_service,
            new_session=new_session,
            session_data=session_data_dict,
            quick_activity_ids=quick_activity_ids,
            allow_archived_definitions=allow_archived_definitions,
        )

        if not is_quick:
            error = self._apply_program_context(draft) or self._apply_template(draft)
            if error:
                message, status = error
                return None, message, status

        self.db_session.add(new_session)
        self.db_session.flush()

        if is_quick:
            error = self._instantiate_quick_activities(draft)
        else:
            error = self._instantiate_section_items(draft)
        if error:
            message, status = error
            return None, message, status

        new_session.attributes = copy.deepcopy(draft.session_data)

        error = self._link_session_goals(draft, is_quick=is_quick)
        if error:
            message, status = error
            return None, message, status

        if commit:
            self.db_session.commit()
        else:
            # The refresh below reloads the row; unflushed attribute changes would be lost.
            self.db_session.flush()

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

    def _apply_program_context(self, draft) -> PhaseError:
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
                    joinedload(models.ProgramDay.program).selectinload(models.Program.blocks)
                ).filter(
                    models.ProgramDay.id == requested_day_id
                ).populate_existing().with_for_update(of=models.ProgramDay).first()
                if p_day and p_day.program and p_day.program.root_id == root_id:
                    program = p_day.program
                    draft.program_day_id = requested_day_id
                    new_session.program_day_id = draft.program_day_id
                    p_day.row_version += 1  # pyright: ignore[reportAttributeAccessIssue] - legacy Column typing
                    new_session.program_id = program.id
                    # A program day spans blocks; the session belongs to the block
                    # the client named, else the one covering its start date.
                    block = next(
                        (candidate for candidate in (program.blocks or [])
                         if candidate.id == program_context.get('block_id')),
                        None,
                    ) or block_for_date(
                        program, (new_session.session_start or datetime.now(timezone.utc)).date(),
                    )
                    new_session.program_block_id = block.id if block else None
                    program_context['program_id'] = program.id
                    program_context['program_name'] = program.name
                    program_context['program_color'] = program.color
                    program_context['block_id'] = block.id if block else None
                    program_context['block_name'] = block.name if block else None
                    program_context['block_color'] = (block.color or program.color) if block else None
                    program_context['day_name'] = p_day.name
                    program_context['day_number'] = p_day.day_number
                    if goal_scope_enabled:
                        # The day's goals, falling back to the program's.
                        draft.program_goal_ids = set(resolve_day_focus_scope(self.db_session, root_id, p_day))
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
                        self.db_session, root_id, program.id,  # pyright: ignore[reportArgumentType] - legacy Column typing
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

    def _apply_template(self, draft) -> PhaseError:
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

            session_data_dict.setdefault('template_id', template.id)
            session_data_dict.setdefault('template_name', template.name)
            session_data_dict.setdefault('template_color', get_template_color(template_payload) or DEFAULT_TEMPLATE_COLOR)

            if isinstance(session_data_dict, dict) and not session_data_dict.get('sections'):
                if isinstance(template_payload, dict) and template_payload.get('sections'):
                    session_data_dict['sections'] = template_payload.get('sections', [])
                    if (
                        not session_data_dict.get('total_duration_minutes')
                        and template_payload.get('total_duration_minutes') is not None
                    ):
                        session_data_dict['total_duration_minutes'] = template_payload.get('total_duration_minutes')

            if isinstance(template_payload, dict):
                draft.prescriptions_by_item_key = _index_prescriptions(template_payload.get('sections'))
            error = self._apply_session_plan(draft)
            if error:
                return error
            new_session.attributes = copy.deepcopy(session_data_dict)
        return None

    def _apply_session_plan(self, draft) -> PhaseError:
        """Execute a dated program session plan: its sections and planned values replace the template's."""
        from services.program_session_plans import ProgramSessionPlanService, plan_sections_for_session

        plan_id = draft.data.get('program_session_plan_id')
        plan_ref = draft.data.get('plan_ref')
        if not plan_id and not plan_ref:
            return None
        try:
            plan = ProgramSessionPlanService(self.db_session).resolve_for_session(
                draft.root_id,
                draft.template,
                {'program_session_plan_id': plan_id} if plan_id else plan_ref,
                draft.current_user_id,
            )
        except ValueError as exc:
            return str(exc), 400
        if draft.program_day_id and plan.program_day_id != draft.program_day_id:
            return "That plan belongs to a different program day", 400
        sections = keep_device_ids(plan_sections_for_session(plan), draft.session_data.get('sections'))
        draft.session_data['sections'] = sections
        draft.session_data['program_session_plan'] = {
            'id': plan.id,
            'date': plan.date.isoformat(),
            'program_day_id': plan.program_day_id,
        }
        draft.prescriptions_by_item_key = _index_prescriptions(sections)
        draft.new_session.program_session_plan_id = plan.id
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
                        local_circuit_items.append(
                            (section_index, item_index, circuit_definition_id, exercise.get('item_key'),
                             exercise.get('circuit_run_id')),
                        )
                    continue
                activity_id = self._extract_activity_definition_id(exercise)
                if not activity_id:
                    continue
                local_activity_ids.add(activity_id)
                normalized.append((exercise, activity_id))
            local_section_exercises.append((section, normalized))
        return local_activity_ids, local_section_exercises, local_circuit_items

    def _instantiate_quick_activities(self, draft) -> PhaseError:
        """Create one flat activity instance per logged activity, in the order logged.

        The same activity may appear more than once; each entry gets its own instance.
        """
        activity_ids = list(draft.quick_activity_ids or [])
        if not (1 <= len(activity_ids) <= MAX_QUICK_SESSION_ACTIVITIES):
            return f"Quick sessions must include between 1 and {MAX_QUICK_SESSION_ACTIVITIES} activities", 400

        unique_activity_def_ids = set(activity_ids)
        found_activity_ids = {
            activity_id
            for (activity_id,) in self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.id.in_(unique_activity_def_ids),
                ActivityDefinition.root_id == draft.root_id,
                ActivityDefinition.deleted_at == None,
            ).all()
        }
        missing_activity_ids = unique_activity_def_ids - found_activity_ids
        if missing_activity_ids:
            return f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400

        _, quota_error, quota_status = draft.quota_service.check_available(
            draft.current_user_id,
            "activity_instances",
            len(activity_ids),
        )
        if quota_error:
            return quota_error, quota_status

        created_instance_ids = []
        for activity_id in activity_ids:
            instance_id = str(uuid.uuid4())
            self.db_session.add(ActivityInstance(
                id=instance_id,
                session_id=draft.new_session.id,
                activity_definition_id=activity_id,
                root_id=draft.root_id,
            ))
            created_instance_ids.append(instance_id)
        self.db_session.flush()

        draft.session_data['activity_ids'] = created_instance_ids
        return None

    def _instantiate_section_items(self, draft) -> PhaseError:
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

    def _instantiate_section_activities(self, draft, activity_def_ids, section_exercises) -> PhaseError:
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
                self._apply_item_prescription(draft, instance, exercise, activity_map[activity_id])
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

    def _apply_item_prescription(self, draft, instance, exercise, definition):
        """Snapshot the source item's planned values onto the new instance.

        Planned set activities get one empty set row per planned set so each planned
        value lines up with a row; values stay blank because plans are reference-only.
        """
        source = draft.prescriptions_by_item_key.get(exercise.get('item_key'))
        if not source or source[0] != instance.activity_definition_id:
            return
        prescription = snapshot_prescription(source[1])
        if prescription is None:
            return
        instance.prescription = prescription
        # Planned tags are applied up front, like tags the user would add during the session.
        instance.tags = load_planned_tags(self.db_session, draft.root_id, prescription.get('tags'))
        if definition.has_sets:
            instance.sets = [
                ActivitySet(
                    id=planned_set_id(instance.id, index) if is_uuid(instance.id) else str(uuid.uuid4()),
                    sort_order=index,
                    status='planned',
                    tags=load_planned_tags(self.db_session, draft.root_id, planned_set.get('tags')),
                )
                for index, planned_set in enumerate(prescription.get('sets') or [])
            ]

    def _attach_section_circuits(self, draft, sections, circuit_items) -> PhaseError:
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
        for section_index, item_index, circuit_definition_id, item_key, run_id in circuit_items:
            # Planned rounds and values come from the authoritative template or plan only.
            source = draft.prescriptions_by_item_key.get(item_key)
            prescription = snapshot_prescription(source[1]) if source and source[0] == circuit_definition_id else None
            created_run, circuit_error, circuit_status = circuit_service.create_run(
                draft.root_id, new_session.id, draft.current_user_id,
                {
                    'circuit_definition_id': circuit_definition_id,
                    'section_index': section_index,
                    'item_index': item_index,
                    'prescription': prescription,
                    # Started offline: the device already shows this run, and its ids derive from it.
                    **({'id': run_id} if is_uuid(run_id) else {}),
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

    def _link_session_goals(self, draft, *, is_quick) -> PhaseError:
        """Link activity-derived, manual, and immediate goals, honouring the program goal scope."""
        new_session = draft.new_session
        root_id = draft.root_id
        data = draft.data
        program_goal_ids = draft.program_goal_ids
        session_data_dict = draft.session_data
        inherited_goal_map = {}

        if not is_quick:
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
            session_data_dict['program_context']['off_focus_goal_ids'] = sorted(manual_ids - program_goal_ids)
            new_session.attributes = copy.deepcopy(session_data_dict)

        linked_goal_ids = set()

        if not is_quick:
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
        """Create a quick session already complete, with its logged values, in one transaction.

        A quick session has no template: its instances are the payload's ``activity_instances``,
        matched to the payload by position. A ``template_id`` sent by an older client's queued
        completion is ignored, so those replays still sync.
        """
        draft_instances = list(data.get('activity_instances') or [])
        pending_events = []
        create_payload = {
            key: data[key]
            for key in ('id', 'name', 'description')
            if data.get(key) is not None
        }
        create_payload.setdefault('name', 'Quick Session')
        # The draft's start, within the window a queued write is still trusted; else now.
        now = utc_now_naive()
        started_at = parse_client_datetime(data.get('session_start')) or now
        started_at = min(max(started_at, now - MAX_CLIENT_LAG), now)
        create_payload['session_start'] = started_at.replace(tzinfo=timezone.utc).isoformat()
        created_session, error, status = self.create_session(
            root_id,
            current_user_id,
            create_payload,
            reserve_active_slot=False,
            initially_completed=True,
            commit=False,
            pending_events=pending_events,
            quick_activity_ids=[item.get('activity_definition_id') for item in draft_instances],
        )
        if error or created_session is None:
            self.db_session.rollback()
            return None, error, status

        session_id = created_session['id']
        instance_ids = get_session_runtime_data(self.db_session.get(Session, session_id)).get('activity_ids') or []
        if len(instance_ids) != len(draft_instances):
            self.db_session.rollback()
            return None, "Quick session instances did not match the activities logged", 500

        from services.timer_service import TimerService
        timer_service = TimerService(self.db_session)
        activity_service = SessionActivityService(self.db_session)

        for instance_id, draft_instance in zip(instance_ids, draft_instances):
            instance_payload = {'completed': True}
            if draft_instance.get('notes') is not None:
                instance_payload['notes'] = draft_instance['notes']
            if draft_instance.get('has_sets'):
                instance_payload['sets'] = draft_instance.get('sets', [])
            elif draft_instance.get('metrics'):
                _, metrics_error, metrics_status = activity_service.update_activity_metrics(
                    root_id, session_id, instance_id, current_user_id, draft_instance['metrics'],
                    commit=False, pending_events=pending_events,
                )
                if metrics_error:
                    self.db_session.rollback()
                    return None, metrics_error, metrics_status

            _, instance_error, instance_status = timer_service.update_activity_instance(
                root_id, instance_id, current_user_id, instance_payload,
                commit=False, pending_events=pending_events,
            )
            if instance_error:
                self.db_session.rollback()
                return None, instance_error, instance_status

        _, complete_error, complete_status = self.update_session(
            root_id,
            session_id,
            current_user_id,
            {'completed': True},
            commit=False,
            pending_events=pending_events,
        )
        if complete_error:
            self.db_session.rollback()
            return None, complete_error, complete_status

        self.db_session.commit()
        for event in pending_events:
            event_bus.emit(event)

        completed_session = self.db_session.get(Session, session_id)
        self.db_session.refresh(completed_session)
        return serialize_session(completed_session), None, 201
