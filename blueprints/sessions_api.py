from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import uuid
import logging

logger = logging.getLogger(__name__)
import models
from sqlalchemy.orm import joinedload, selectinload
from sqlalchemy import select
from models import (
    get_session,
    Session, Goal, ActivityInstance, MetricValue, session_goals,
    ActivityDefinition, ProgramDay, ProgramBlock, SessionTemplate, Program,
    validate_root_goal, get_session_by_id
)
from validators import (
    validate_request,
    SessionCreateSchema, SessionUpdateSchema,
    SessionGoalAssociationSchema,
    ActivityInstanceCreateSchema, ActivityInstanceUpdateSchema,
    ActivityMetricsUpdateSchema, ActivityReorderSchema
)
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, etag_json_response, internal_error
from services import event_bus, Event, Events
from services.serializers import serialize_session, serialize_activity_instance, serialize_goal
from services.session_service import SessionService

# Create blueprint
sessions_bp = Blueprint('sessions', __name__, url_prefix='/api')


# ============================================================================
# ENDPOINTS
# ============================================================================

@sessions_bp.route('/practice-sessions', methods=['GET'])
@token_required
def get_all_sessions_endpoint(current_user):
    """Get all sessions for grid view (Global), filtered by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Join with Goal to check ownership of the root_id
        sessions_q = db_session.query(Session).join(Goal, Goal.id == Session.root_id).options(
            selectinload(Session.goals),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances)
        ).filter(
            Session.deleted_at == None,
            Goal.parent_id == None,
            Goal.owner_id == current_user.id
        ).order_by(Session.created_at.desc())
        limit, offset = parse_optional_pagination(request, max_limit=300)
        if limit is not None:
            sessions_q = sessions_q.offset(offset).limit(limit)
        sessions = sessions_q.all()
        # Don't include image data in list view
        result = [serialize_session(s, include_image_data=False) for s in sessions]
        return etag_json_response(result)
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['GET'])
@token_required
def get_fractal_sessions(current_user, root_id):
    """Get sessions for a specific fractal if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = SessionService(db_session)
    try:
        limit = min(int(request.args.get('limit', 10)), 50)
        offset = int(request.args.get('offset', 0))
        
        result, error, status = service.get_fractal_sessions(root_id, current_user.id, limit, offset)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(result)
    except Exception as e:
        return internal_error(logger, "Error in get_fractal_sessions")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['POST'])
@token_required
@validate_request(SessionCreateSchema)
def create_fractal_session(current_user, root_id, validated_data):
    """Create a new session within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = SessionService(db_session)
    try:
        result, error, status = service.create_session(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
    except Exception as e:
        return internal_error(logger, "Error creating session")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
@token_required
@validate_request(SessionUpdateSchema)
def update_session(current_user, root_id, session_id, validated_data):
    """Update a session's details."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = SessionService(db_session)
    try:
        result, error, status = service.update_session(root_id, session_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
    except Exception as e:
        return internal_error(logger, "Error updating session")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['GET'])
@token_required
def get_session_endpoint(current_user, root_id, session_id):
    """Get a session by ID if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = SessionService(db_session)
    try:
        result, error, status = service.get_session_details(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result)
    except Exception as e:
        return internal_error(logger, "Error getting session")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['DELETE'])
@token_required
def delete_session_endpoint(current_user, root_id, session_id):
    """Delete a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = SessionService(db_session)
    try:
        result, error, status = service.delete_session(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
    except Exception as e:
        return internal_error(logger, "Error deleting session")
    finally:
        db_session.close()


# ============================================================================
# SESSION ACTIVITY INSTANCE ENDPOINTS (Database-Only Architecture)
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['GET'])
@token_required
def get_session_activities(current_user, root_id, session_id):
    """Get all activity instances for a session in display order."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
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
            joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split)
        ).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None
        ).order_by(ActivityInstance.created_at).all()
        
        return jsonify([serialize_activity_instance(inst) for inst in instances])
        
    except Exception as e:
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['POST'])
@token_required
@validate_request(ActivityInstanceCreateSchema)
def add_activity_to_session(current_user, root_id, session_id, validated_data):
    """Add a new activity instance to a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Validate session exists
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        data = validated_data
        activity_definition_id = data.get('activity_definition_id')
        instance_id = data.get('instance_id') or str(uuid.uuid4())
        
        if not activity_definition_id:
            return jsonify({"error": "activity_definition_id required"}), 400

        activity_def = db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at == None
        ).first()
        if not activity_def:
            return jsonify({"error": "Activity definition not found in this fractal"}), 404
        
        # Create the activity instance
        instance = ActivityInstance(
            id=instance_id,
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id  # Add root_id for performance
        )
        db_session.add(instance)

        # Get activity name directly from validated definition
        activity_name = activity_def.name if activity_def else 'Unknown'

        # Inherit session-goal links from newly added activity.
        associated_goals = [g for g in (activity_def.associated_goals or []) if not g.deleted_at]
        program_goal_ids = set()
        if session.program_day_id:
            raw_program_goal_ids = db_session.execute(
                select(Program.goal_ids)
                .select_from(ProgramDay)
                .join(ProgramBlock, ProgramBlock.id == ProgramDay.block_id)
                .join(Program, Program.id == ProgramBlock.program_id)
                .where(ProgramDay.id == session.program_day_id, Program.root_id == root_id)
            ).scalar()
            program_goal_ids = set(models._safe_load_json(raw_program_goal_ids, []))

        for goal in associated_goals:
            if goal.root_id != root_id:
                continue
            if program_goal_ids and goal.id not in program_goal_ids:
                continue
            existing = db_session.query(session_goals).filter_by(
                session_id=session_id,
                goal_id=goal.id
            ).first()
            if existing:
                continue
            db_session.execute(
                session_goals.insert().values(
                    session_id=session_id,
                    goal_id=goal.id,
                    goal_type=goal.type,
                    association_source='activity'
                )
            )

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
        
        return jsonify(serialize_activity_instance(instance)), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/reorder', methods=['POST'])
@token_required
@validate_request(ActivityReorderSchema)
def reorder_activities(current_user, root_id, session_id, validated_data):
    """Reorder activities in a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        data = validated_data
        activity_ids = data.get('activity_ids', [])
        
        session = get_session_by_id(db_session, session_id)
        if not session or session.root_id != root_id:
            return jsonify({"error": "Session not found"}), 404
        
        # Update sort_order for each activity
        for idx, instance_id in enumerate(activity_ids):
            instance = db_session.query(ActivityInstance).filter_by(
                id=instance_id,
                session_id=session_id
            ).first()
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
@token_required
@validate_request(ActivityInstanceUpdateSchema)
def update_activity_instance_in_session(current_user, root_id, session_id, instance_id, validated_data):
    """Update activity instance in session context."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        if not session:
            return jsonify({"error": "Session not found"}), 404
        data = validated_data
        instance = db_session.query(ActivityInstance).options(
            joinedload(ActivityInstance.definition)
        ).filter_by(
            id=instance_id,
            session_id=session_id
        ).first()
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
        
        return jsonify(serialize_activity_instance(instance))
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['DELETE'])
@token_required
def remove_activity_from_session(current_user, root_id, session_id, instance_id):
    """Remove an activity instance from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        session = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
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
        
        return jsonify({"message": "Activity instance removed"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception("An error occurred")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
