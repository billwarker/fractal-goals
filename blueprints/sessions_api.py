from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import traceback

logger = logging.getLogger(__name__)
import models
from sqlalchemy import text
from sqlalchemy.orm import joinedload, subqueryload, selectinload
from models import (
    get_session,
    Session, Goal, ActivityInstance, MetricValue, session_goals,
    ActivityDefinition,
    validate_root_goal, get_all_sessions, get_sessions_for_root,
    get_immediate_goals_for_session, get_session_by_id
)
from validators import (
    validate_request,
    SessionCreateSchema, SessionUpdateSchema,
    SessionGoalAssociationSchema,
    ActivityInstanceCreateSchema, ActivityInstanceUpdateSchema,
    ActivityMetricsUpdateSchema, ActivityReorderSchema
)
from services import event_bus, Event, Events

# Create blueprint
sessions_bp = Blueprint('sessions', __name__, url_prefix='/api')


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

# Helper functions removed: sync_session_activities (Dead Code / N+1 Query Issue)


# Helper functions removed: check_and_complete_goals (Dead Code)


# ============================================================================
# ENDPOINTS
# ============================================================================

@sessions_bp.route('/practice-sessions', methods=['GET'])
def get_all_sessions_endpoint():
    """Get all sessions for grid view (Global)."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Use selectinload (not joinedload) to avoid Cartesian product with multiple collections
        sessions = db_session.query(Session).options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances)
        ).filter(Session.deleted_at == None).order_by(Session.created_at.desc()).all()
        # Don't include image data in list view for performance (prevents multi-MB responses)
        result = [s.to_dict(include_image_data=False) for s in sessions]
        return jsonify(result)
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['GET'])
def get_fractal_sessions(root_id):
    """
    Get sessions for a specific fractal with pagination support.
    
    Query parameters:
    - limit: Number of sessions to return (default: 10, max: 50)
    - offset: Number of sessions to skip (default: 0)
    
    Returns:
    - sessions: Array of session objects
    - pagination: {limit, offset, total, has_more}
    """
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Parse pagination parameters
        limit = min(int(request.args.get('limit', 10)), 50)  # Max 50 per request
        offset = int(request.args.get('offset', 0))
        
        # Get total count for pagination info
        base_query = db_session.query(Session).filter(
            Session.root_id == root_id, 
            Session.deleted_at == None
        )
        total_count = base_query.count()
        
        # Use selectinload (not joinedload) to avoid Cartesian product with multiple collections
        sessions = base_query.options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances)
        ).order_by(Session.created_at.desc()).offset(offset).limit(limit).all()
        
        # Don't include image data in list view for performance (prevents multi-MB responses)
        result = [s.to_dict(include_image_data=False) for s in sessions]
        
        return jsonify({
            "sessions": result,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "has_more": offset + len(result) < total_count
            }
        })
        
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['POST'])
def create_fractal_session(root_id):
    """Create a new session within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get request data
        data = request.get_json()
        
        # Parse dates - Strict ISO-8601
        def parse_datetime(dt_str):
            if not dt_str or not isinstance(dt_str, str):
                return None
            
            try:
                # Strict ISO format (handle Z for UTC)
                dt = datetime.fromisoformat(dt_str.replace('Z', '+00:00'))
                # Ensure UTC
                return dt.astimezone(timezone.utc)
            except ValueError:
                print(f"WARNING: Invalid date format received: {dt_str}")
                return None
        
        s_start = parse_datetime(data.get('session_start'))
        s_end = parse_datetime(data.get('session_end'))

        # Parse session_data
        session_data = models._safe_load_json(data.get('session_data'), {})
        
        program_context = session_data.get('program_context', {})

        # Create the session
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
        
        # Handle attributes
        new_session.attributes = models._safe_load_json(session_data, {})
        
        # Extract program_day_id from program_context if present
        program_day_id = None
        if new_session.attributes:
            session_data_dict = models._safe_load_json(new_session.attributes, {})
            program_context = session_data_dict.get('program_context')
            if program_context and 'day_id' in program_context:
                program_day_id = program_context['day_id']
                new_session.program_day_id = program_day_id
        
        db_session.add(new_session)
        db_session.flush()  # Get the ID before committing
        
        # Associate with goals via junction table
        goal_ids = data.get('parent_ids', []) or data.get('goal_ids', [])
        if data.get('parent_id'):
            goal_ids.append(data.get('parent_id'))
        
        for goal_id in goal_ids:
            goal = db_session.query(Goal).filter_by(id=goal_id).first()
            if goal:
                goal_type = 'short_term' if goal.type == 'ShortTermGoal' else 'immediate'
                # Insert into junction table
                db_session.execute(
                    session_goals.insert().values(
                        session_id=new_session.id,
                        goal_id=goal_id,
                        goal_type=goal_type
                    )
                )
        
        # Handle immediate goals
        immediate_goal_ids = data.get('immediate_goal_ids', [])
        for ig_id in immediate_goal_ids:
            goal = db_session.query(Goal).filter_by(id=ig_id).first()
            if goal and goal.type == 'ImmediateGoal':
                db_session.execute(
                    session_goals.insert().values(
                        session_id=new_session.id,
                        goal_id=ig_id,
                        goal_type='immediate'
                    )
                )
        
        # Update program day completion status if linked to a program day
        if program_day_id:
            from models import ProgramDay
            program_day = db_session.query(ProgramDay).filter_by(id=program_day_id).first()
            if program_day:
                program_day.is_completed = program_day.check_completion()
        
        db_session.commit()
        
        # FORCE UPDATE session_start/end because sometimes time is stripped
        if s_start or s_end:
            from sqlalchemy import text
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
                db_session.execute(text(sql), params)
                db_session.commit()
        
        # Refresh to load the goals relationship
        db_session.refresh(new_session)
        
        # Emit session created event
        event_bus.emit(Event(Events.SESSION_CREATED, {
            'session_id': new_session.id,
            'session_name': new_session.name,
            'root_id': root_id,
            'goal_ids': [g.id for g in new_session.goals]
        }, source='sessions_api.create_session'))

        # Return the created session
        result = new_session.to_dict()
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
def update_session(root_id, session_id):
    """Update a session's details."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the session
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get update data from request
        data = request.get_json()
        
        # Update fields if provided
        if 'name' in data:
            session.name = data['name']
        
        if 'description' in data:
            session.description = data['description']
        
        if 'duration_minutes' in data:
            session.duration_minutes = data['duration_minutes']
        
        if 'completed' in data:
            session.completed = data['completed']
            if data['completed']:
                session.completed_at = datetime.now(timezone.utc)
                # Emit session completed event - triggers target evaluation cascade
                # Note: We emit after commit below to ensure DB state is consistent
        
        # Update session analytics fields
        if 'session_start' in data:
            if isinstance(data['session_start'], str):
                dt = datetime.fromisoformat(data['session_start'].replace('Z', '+00:00'))
                session.session_start = dt.astimezone(timezone.utc)
            else:
                session.session_start = data['session_start']
        
        if 'session_end' in data:
            if isinstance(data['session_end'], str):
                dt = datetime.fromisoformat(data['session_end'].replace('Z', '+00:00'))
                session.session_end = dt.astimezone(timezone.utc)
            else:
                session.session_end = data['session_end']
        
        if 'total_duration_seconds' in data:
            session.total_duration_seconds = data['total_duration_seconds']
        
        if 'template_id' in data:
            session.template_id = data['template_id']
        
        if 'session_data' in data:
            val = data['session_data']
            session.attributes = models._safe_load_json(val, val)
        
        db_session.commit()
        
        # Emit session updated event
        try:
            event_bus.emit(Event(
                Events.SESSION_UPDATED,
                {
                    'session_id': session.id,
                    'session_name': session.name,
                    'root_id': root_id,
                    'updated_fields': list(data.keys())
                },
                source='sessions_api.update_session'
            ))
        except Exception as e:
            logger.error(f"Error emitting SESSION_UPDATED event: {e}")

        # Emit session completed event AFTER commit to ensure consistent state
        # This triggers the cascade: target evaluation → goal completion → program updates
        if data.get('completed') and session.completed:
            try:
                event_bus.emit(Event(
                    Events.SESSION_COMPLETED,
                    {
                        'session_id': session.id,
                        'session_name': session.name,
                        'root_id': root_id
                    },
                    source='sessions_api.update_session'
                ))
                logger.info(f"Emitted SESSION_COMPLETED event for session {session.id}")
            except Exception as event_error:
                # Don't fail the request if event handling fails
                logger.error(f"Error emitting SESSION_COMPLETED event: {event_error}")
        
        # Return updated session
        result = session.to_dict()
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['GET'])
def get_session_endpoint(root_id, session_id):
    """Get a session by ID."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Use selectinload for collections to avoid Cartesian product
        session = db_session.query(Session).options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances)
        ).filter(Session.id == session_id, Session.deleted_at == None).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        # Include full image data for single session detail view
        return jsonify(session.to_dict(include_image_data=True))
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['DELETE'])
def delete_session_endpoint(root_id, session_id):
    """Delete a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the session
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Soft Delete
        session_name = session.name
        session.deleted_at = datetime.now(timezone.utc)
        db_session.commit()
        
        # Emit session deleted event
        event_bus.emit(Event(Events.SESSION_DELETED, {
            'session_id': session_id,
            'session_name': session_name,
            'root_id': root_id
        }, source='sessions_api.delete_session'))
        
        return jsonify({"message": "Session deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


# ============================================================================
# SESSION ACTIVITY INSTANCE ENDPOINTS (Database-Only Architecture)
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['GET'])
def get_session_activities(root_id, session_id):
    """Get all activity instances for a session in display order."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get all activity instances for this session, ordered by created_at
        # Use eager loading to prevent N+1 queries
        instances = db_session.query(ActivityInstance).options(
            joinedload(ActivityInstance.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split)
        ).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None
        ).order_by(ActivityInstance.created_at).all()
        
        return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['POST'])
def add_activity_to_session(root_id, session_id):
    """Add a new activity instance to a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        data = request.get_json()
        activity_definition_id = data.get('activity_definition_id')
        instance_id = data.get('instance_id') or str(uuid.uuid4())
        
        if not activity_definition_id:
            return jsonify({"error": "activity_definition_id required"}), 400
        
        # Create the activity instance
        instance = ActivityInstance(
            id=instance_id,
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id  # Add root_id for performance
        )
        db_session.add(instance)
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=activity_definition_id).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        db_session.refresh(instance)
        
        # Emit activity instance created event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_CREATED, {
            'instance_id': instance.id,
            'activity_definition_id': activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id
        }, source='sessions_api.add_activity_to_session'))
        
        return jsonify(instance.to_dict()), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/reorder', methods=['POST'])
def reorder_activities(root_id, session_id):
    """Reorder activities in a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = request.get_json()
        activity_ids = data.get('activity_ids', [])
        
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Update sort_order for each activity
        for idx, instance_id in enumerate(activity_ids):
            instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
            if instance:
                instance.sort_order = idx
        
        db_session.commit()
        return jsonify({"status": "success"}), 200
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['PUT'])
def update_activity_instance_in_session(root_id, session_id, instance_id):
    """Update activity instance in session context."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = request.get_json()
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter_by(id=instance_id).first()
        if not instance:
            return jsonify({"error": "Instance not found"}), 404
        
        if 'notes' in data:
            instance.notes = data['notes']
        if 'completed' in data:
            instance.completed = data.get('completed')
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        # Emit activity instance updated event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='sessions_api.update_activity_instance'))
        
        return jsonify(instance.to_dict())
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['DELETE'])
def remove_activity_from_session(root_id, session_id, instance_id):
    """Remove an activity instance from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(
            id=instance_id,
            session_id=session_id
        ).first()
        
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        activity_definition_id = instance.activity_definition_id
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.delete(instance)
        db_session.commit()
        
        # Emit activity instance deleted event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_DELETED, {
            'instance_id': instance_id,
            'activity_definition_id': activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id
        }, source='sessions_api.remove_activity_from_session'))
        
        return jsonify({"message": "Activity instance deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>/metrics', methods=['PUT'])
def update_activity_metrics(root_id, session_id, instance_id):
    """Update metric values for an activity instance."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter_by(
            id=instance_id,
            session_id=session_id
        ).first()
        
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        data = request.get_json()
        metrics = data.get('metrics', [])
        
        # Update or create metric values
        for metric_data in metrics:
            metric_id = metric_data.get('metric_id')
            split_id = metric_data.get('split_id')
            value = metric_data.get('value')
            
            if not metric_id or value is None or str(value).strip() == '':
                continue
            
            try:
                float_val = float(value)
                
                # Find existing metric value
                query = db_session.query(MetricValue).filter_by(
                    activity_instance_id=instance_id,
                    metric_definition_id=metric_id
                )
                
                if split_id:
                    query = query.filter_by(split_definition_id=split_id)
                else:
                    query = query.filter_by(split_definition_id=None)
                
                metric_val = query.first()
                
                if metric_val:
                    metric_val.value = float_val
                else:
                    new_metric = MetricValue(
                        activity_instance_id=instance_id,
                        metric_definition_id=metric_id,
                        split_definition_id=split_id,
                        root_id=root_id,  # Add root_id for performance
                        value=float_val
                    )
                    db_session.add(new_metric)
            except ValueError:
                continue
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        # Emit activity metrics updated event
        event_bus.emit(Event(Events.ACTIVITY_METRICS_UPDATED, {
            'instance_id': instance_id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id,
            'metrics_count': len(metrics)
        }, source='sessions_api.update_activity_metrics'))
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


# ============================================================================
# SESSION-GOAL ASSOCIATION ENDPOINTS
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/goals', methods=['GET'])
def get_session_goals(root_id, session_id):
    """Get all goals associated with a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get goals via the junction table
        from sqlalchemy import select
        from sqlalchemy.orm import selectinload
        stmt = select(Goal, session_goals.c.goal_type).options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups)
        ).join(
            session_goals, Goal.id == session_goals.c.goal_id
        ).where(session_goals.c.session_id == session_id)
        
        results = db_session.execute(stmt).all()
        
        goals_list = []
        for goal, goal_type in results:
            goal_dict = goal.to_dict(include_children=False)
            goal_dict['association_type'] = goal_type
            goals_list.append(goal_dict)
        
        return jsonify(goals_list)
        
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/goals', methods=['POST'])
def add_goal_to_session(root_id, session_id):
    """Associate a goal with a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        data = request.get_json()
        goal_id = data.get('goal_id')
        goal_type = data.get('goal_type', 'short_term')  # 'short_term' or 'immediate'
        
        if not goal_id:
            return jsonify({"error": "goal_id required"}), 400
        
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Insert into junction table
        db_session.execute(
            session_goals.insert().values(
                session_id=session_id,
                goal_id=goal_id,
                goal_type=goal_type
            )
        )
        
        db_session.commit()
        return jsonify({"message": "Goal associated with session"}), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/goals/<goal_id>', methods=['DELETE'])
def remove_goal_from_session(root_id, session_id, goal_id):
    """Remove a goal association from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        db_session.execute(
            session_goals.delete().where(
                session_goals.c.session_id == session_id,
                session_goals.c.goal_id == goal_id
            )
        )
        db_session.commit()
        return jsonify({"message": "Goal removed from session"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred in remove_goal_from_session")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
