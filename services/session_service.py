from datetime import datetime, timezone
import logging
import uuid
from sqlalchemy import text
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
        
        new_session.attributes = models._safe_load_json(session_data, {})
        
        # Program Context
        program_day_id = None
        if new_session.attributes:
            session_data_dict = models._safe_load_json(new_session.attributes, {})
            program_context = session_data_dict.get('program_context')
            if program_context and 'day_id' in program_context:
                program_day_id = program_context['day_id']
                new_session.program_day_id = program_day_id
        
        self.db_session.add(new_session)
        self.db_session.flush()

        # Goal Inheritance Logic
        inherited_goals = set()
        
        # A. From Activities
        activity_def_ids = set()
        if new_session.attributes:
            session_dict = models._safe_load_json(new_session.attributes, {})
            sections = session_dict.get('sections', [])
            for section in sections:
                for exercise in section.get('exercises', []):
                    if exercise.get('activity_id'):
                        activity_def_ids.add(exercise.get('activity_id'))
        
        if activity_def_ids:
            activities = self.db_session.query(ActivityDefinition).options(
                joinedload(ActivityDefinition.associated_goals)
            ).filter(ActivityDefinition.id.in_(activity_def_ids)).all()
            for act in activities:
                for goal in act.associated_goals:
                    if not goal.completed and not goal.deleted_at:
                        inherited_goals.add(goal)

        # B. From Template
        if new_session.template_id:
            template = self.db_session.query(models.SessionTemplate).options(
                joinedload(models.SessionTemplate.goals)
            ).filter_by(id=new_session.template_id).first()
            if template:
                for goal in template.goals:
                    if not goal.completed and not goal.deleted_at:
                        inherited_goals.add(goal)
        
        # C. From Program Day
        program_block_goal_ids = set()
        if program_day_id:
            p_day = self.db_session.query(models.ProgramDay).options(
                joinedload(models.ProgramDay.goals),
                joinedload(models.ProgramDay.block)
            ).filter_by(id=program_day_id).first()
            if p_day:
                for goal in p_day.goals:
                    if not goal.completed and not goal.deleted_at:
                        inherited_goals.add(goal)
                if p_day.block and p_day.block.goal_ids:
                    program_block_goal_ids = set(models._safe_load_json(p_day.block.goal_ids, []))

        # Filtering
        final_goals_to_link = []
        if program_day_id and program_block_goal_ids:
            for goal in inherited_goals:
                if goal.id in program_block_goal_ids:
                    final_goals_to_link.append(goal)
        else:
            final_goals_to_link = list(inherited_goals)

        # Persist Associations
        manual_ids = data.get('parent_ids', []) or data.get('goal_ids', [])
        if data.get('parent_id'): manual_ids.append(data.get('parent_id'))
        
        all_goal_ids_to_link = set(g.id for g in final_goals_to_link)
        all_goal_ids_to_link.update(manual_ids)
        
        for goal_id in all_goal_ids_to_link:
            goal_obj = next((g for g in final_goals_to_link if g.id == goal_id), None)
            if not goal_obj:
                goal_obj = self.db_session.query(Goal).filter_by(id=goal_id).first()
            
            if goal_obj:
                goal_type = 'short_term' if goal_obj.type == 'ShortTermGoal' else 'immediate'
                self.db_session.execute(
                    session_goals.insert().values(
                        session_id=new_session.id,
                        goal_id=goal_id,
                        goal_type=goal_type
                    )
                )

        # Immediate Goals
        immediate_goal_ids = data.get('immediate_goal_ids', [])
        for ig_id in immediate_goal_ids:
            goal = self.db_session.query(Goal).filter_by(id=ig_id).first()
            if goal and goal.type == 'ImmediateGoal':
                existing = self.db_session.query(session_goals).filter_by(session_id=new_session.id, goal_id=ig_id).first()
                if not existing:
                    self.db_session.execute(
                        session_goals.insert().values(
                            session_id=new_session.id,
                            goal_id=ig_id,
                            goal_type='immediate'
                        )
                    )

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
