from datetime import datetime, timezone
import logging
import uuid
from sqlalchemy import text, inspect
from sqlalchemy.orm import selectinload, joinedload
from models import (
    Session, Goal, ActivityInstance, MetricValue, session_goals,
    ActivityDefinition, ProgramDay, ProgramBlock,
    validate_root_goal, get_session_by_id
)
import models
from services import event_bus, Event, Events
from services.serializers import serialize_session

logger = logging.getLogger(__name__)


def _parse_iso_datetime_strict(value):
    """Parse strict ISO-8601 datetime into UTC-aware datetime."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


class SessionService:
    def __init__(self, db_session):
        self.db_session = db_session
        self._session_goals_has_source = None

    @staticmethod
    def _extract_activity_definition_id(raw_item):
        """Extract activity definition id from legacy/current template exercise shapes."""
        if isinstance(raw_item, str):
            return raw_item
        if not isinstance(raw_item, dict):
            return None

        direct_keys = (
            'activity_id',
            'activity_definition_id',
            'activityId',
            'activityDefinitionId',
            'definition_id',
            'id',
        )
        for key in direct_keys:
            value = raw_item.get(key)
            if isinstance(value, str) and value.strip():
                return value

        nested = raw_item.get('activity')
        if isinstance(nested, dict):
            for key in ('id', 'activity_id', 'activity_definition_id'):
                value = nested.get(key)
                if isinstance(value, str) and value.strip():
                    return value
        return None

    def _session_goals_supports_source(self):
        if self._session_goals_has_source is None:
            cols = inspect(self.db_session.bind).get_columns('session_goals')
            self._session_goals_has_source = any(c.get('name') == 'association_source' for c in cols)
        return self._session_goals_has_source

    def _session_goal_insert_values(self, session_id, goal_id, goal_type, association_source):
        values = {
            'session_id': session_id,
            'goal_id': goal_id,
            'goal_type': goal_type,
        }
        if self._session_goals_supports_source():
            values['association_source'] = association_source
        return values

    def _derive_session_goals_from_activities(self, session_obj):
        """Derive display goals from session activities when persisted links are missing."""
        activity_def_ids = set()

        # Prefer persisted instances
        for inst in (session_obj.activity_instances or []):
            if inst.activity_definition_id:
                activity_def_ids.add(inst.activity_definition_id)

        # Fallback to session attributes
        attrs = models._safe_load_json(getattr(session_obj, 'attributes', None), {})
        for section in attrs.get('sections', []):
            for exercise in section.get('exercises', []):
                if exercise.get('activity_id'):
                    activity_def_ids.add(exercise.get('activity_id'))

        if not activity_def_ids:
            return []

        activities = self.db_session.query(ActivityDefinition).options(
            joinedload(ActivityDefinition.associated_goals)
        ).filter(
            ActivityDefinition.id.in_(activity_def_ids),
            ActivityDefinition.root_id == session_obj.root_id,
            ActivityDefinition.deleted_at == None
        ).all()

        # Program scoping applies only when program has selected goals.
        program_goal_ids = set()
        if getattr(session_obj, 'program_day', None) and session_obj.program_day.block and session_obj.program_day.block.program:
            program_goal_ids = set(models._safe_load_json(session_obj.program_day.block.program.goal_ids, []))

        derived = {}
        for act in activities:
            for goal in act.associated_goals:
                if goal.deleted_at or goal.completed:
                    continue
                if goal.root_id != session_obj.root_id:
                    continue
                if program_goal_ids and goal.id not in program_goal_ids:
                    continue
                derived[goal.id] = goal

        return list(derived.values())

    def get_fractal_sessions(self, root_id, current_user_id, limit=10, offset=0):
        """Get sessions for a specific fractal."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        base_query = self.db_session.query(Session).filter(
            Session.root_id == root_id, 
            Session.deleted_at == None
        )
        total_count = base_query.count()
        
        sessions = base_query.options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(Session.program_day).selectinload(ProgramDay.block).selectinload(ProgramBlock.program)
        ).order_by(Session.created_at.desc()).offset(offset).limit(limit).all()
        
        result = [serialize_session(s, include_image_data=False) for s in sessions]
        
        return {
            "sessions": result,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "has_more": offset + len(result) < total_count
            }
        }, None, 200

    def get_session_details(self, root_id, session_id, current_user_id):
        """Get a single session with full details."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(Session.program_day).selectinload(ProgramDay.block).selectinload(ProgramBlock.program)
        ).filter(Session.id == session_id, Session.root_id == root_id, Session.deleted_at == None).first()
        
        if not session:
            return None, "Session not found", 404

        # Backward-compatible fallback for sessions created without persisted links.
        if not session.goals:
            derived_goals = self._derive_session_goals_from_activities(session)
            if derived_goals:
                session._derived_goals = derived_goals

        return serialize_session(session, include_image_data=True), None, 200

    def create_session(self, root_id, current_user_id, data):
        """Create a new session with automatic goal inheritance."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        # Parse dates (strict ISO-8601)
        try:
            s_start = _parse_iso_datetime_strict(data.get('session_start')) if 'session_start' in data else None
            s_end = _parse_iso_datetime_strict(data.get('session_end')) if 'session_end' in data else None
        except ValueError:
            return None, "Invalid datetime format. Use ISO-8601 (e.g. 2026-02-18T15:30:00Z)", 400

        session_data = models._safe_load_json(data.get('session_data'), {})

        new_session = Session(
            name=data.get('name', 'Untitled Session'),
            description=data.get('description', ''),
            root_id=root_id,
            duration_minutes=int(data['duration_minutes']) if data.get('duration_minutes') is not None else None,
            session_start=s_start,
            session_end=s_end,
            total_duration_seconds=int(data['total_duration_seconds']) if data.get('total_duration_seconds') is not None else None,
            template_id=data.get('template_id')
        )
        
        session_data_dict = models._safe_load_json(session_data, {})
        new_session.attributes = session_data_dict
        
        # Program Context
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
                    program_goal_ids = set(models._safe_load_json(p_day.block.program.goal_ids, []))
                else:
                    return None, "Invalid program day context for this fractal", 400

        template = None
        # Validate template ownership when provided
        if new_session.template_id:
            template = self.db_session.query(models.SessionTemplate).filter(
                models.SessionTemplate.id == new_session.template_id,
                models.SessionTemplate.root_id == root_id,
                models.SessionTemplate.deleted_at == None
            ).first()
            if not template:
                return None, "Template not found in this fractal", 404
            # Fallback: if client payload omitted sections, hydrate from stored template.
            if isinstance(session_data_dict, dict) and not session_data_dict.get('sections'):
                template_payload = models._safe_load_json(template.template_data, {})
                if isinstance(template_payload, dict) and template_payload.get('sections'):
                    session_data_dict['sections'] = template_payload.get('sections', [])
                    if not session_data_dict.get('template_name'):
                        session_data_dict['template_name'] = template.name
                    if (
                        not session_data_dict.get('total_duration_minutes')
                        and template_payload.get('total_duration_minutes') is not None
                    ):
                        session_data_dict['total_duration_minutes'] = template_payload.get('total_duration_minutes')
                    new_session.attributes = session_data_dict
        
        self.db_session.add(new_session)
        self.db_session.flush()

        # Goal Inheritance Logic (activities only)
        inherited_goal_map = {}
        
        # A. Collect activities from session sections (supports legacy + current shapes)
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

        sections = session_data_dict.get('sections', []) if isinstance(session_data_dict, dict) else []
        activity_def_ids, section_exercises = collect_section_exercises(sections)

        # If the incoming session payload had sections but no parseable activity ids,
        # fall back to canonical template sections from DB.
        if not activity_def_ids and template:
            template_payload = models._safe_load_json(template.template_data, {})
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
            activity_map = {a.id: a for a in activities}

            # Persist activity instances and canonical activity ordering for section rendering.
            for section, normalized_exercises in section_exercises:
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

        # Reassign JSON attributes after in-place section normalization so SQLAlchemy
        # reliably persists updates for non-mutable JSON columns.
        new_session.attributes = models._safe_load_json(session_data_dict, {})

        # Filter inherited goals by program-selected goals when in program context
        if program_day_id and program_goal_ids:
            inherited_goal_map = {gid: g for gid, g in inherited_goal_map.items() if gid in program_goal_ids}

        # Persist Associations
        manual_ids = set()
        manual_ids.update(data.get('parent_ids', []) or [])
        manual_ids.update(data.get('goal_ids', []) or [])
        if data.get('parent_id'):
            manual_ids.add(data.get('parent_id'))

        # Provenance-aware linking
        linked_goal_ids = set()

        for goal_id, goal_obj in inherited_goal_map.items():
            self.db_session.execute(
                session_goals.insert().values(
                    **self._session_goal_insert_values(
                        new_session.id, goal_id, goal_obj.type, 'activity'
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
                        new_session.id, goal_id, goal_obj.type, 'manual'
                    )
                )
            )
            linked_goal_ids.add(goal_id)

        # Immediate Goals
        immediate_goal_ids = data.get('immediate_goal_ids', [])
        for ig_id in immediate_goal_ids:
            goal = self.db_session.query(Goal).filter(
                Goal.id == ig_id,
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).first()
            if not goal:
                return None, f"Immediate goal not found in this fractal: {ig_id}", 400
            if goal.type != 'ImmediateGoal':
                return None, f"Goal is not an ImmediateGoal: {ig_id}", 400
            if ig_id not in linked_goal_ids:
                self.db_session.execute(
                    session_goals.insert().values(
                        **self._session_goal_insert_values(
                            new_session.id, ig_id, goal.type, 'manual'
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

        # Force Update Start/End timestamps if needed
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
        
        event_bus.emit(Event(Events.SESSION_CREATED, {
            'session_id': new_session.id,
            'session_name': new_session.name,
            'root_id': root_id,
            'goal_ids': [g.id for g in new_session.goals]
        }, source='session_service.create_session'))

        return serialize_session(new_session), None, 201

    def update_session(self, root_id, session_id, current_user_id, data):
        """Update session details."""
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

        if 'name' in data: session.name = data['name']
        if 'description' in data: session.description = data['description']
        if 'duration_minutes' in data: session.duration_minutes = data['duration_minutes']
        
        if 'completed' in data:
            session.completed = data['completed']
            if data['completed']:
                session.completed_at = datetime.now(timezone.utc)
        
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
        
        self.db_session.commit()
        
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
                source='session_service.update_session'
            ))
            
        return serialize_session(session), None, 200

    def delete_session(self, root_id, session_id, current_user_id):
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
        session.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()

        event_bus.emit(Event(Events.SESSION_DELETED, {
            'session_id': session_id,
            'session_name': session_name,
            'root_id': root_id
        }, source='session_service.delete_session'))

        return {"message": "Session deleted successfully"}, None, 200
