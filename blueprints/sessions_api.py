from flask import Blueprint, request, jsonify
import logging

logger = logging.getLogger(__name__)
import models
from sqlalchemy.exc import SQLAlchemyError
from models import (
    get_session,
)
from validators import (
    validate_request,
    SessionCreateSchema, SessionUpdateSchema,
    ActivityInstanceCreateSchema, ActivityInstanceUpdateSchema,
    ActivityMetricsUpdateSchema, ActivityReorderSchema
)
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, etag_json_response, internal_error
from services import event_bus, Event, Events
from services.serializers import serialize_activity_instance
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
    service = SessionService(db_session)
    try:
        limit, offset = parse_optional_pagination(request, max_limit=300)
        result, error, status = service.get_all_sessions(current_user.id, limit, offset or 0)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting all sessions")
        return internal_error(logger, "Error getting all sessions")
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
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_fractal_sessions")
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
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating session")
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
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating session")
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
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting session")
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
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting session")
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
    service = SessionService(db_session)
    try:
        payload, error, status = service.get_session_activities(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting session activities")
        return internal_error(logger, "Error getting session activities")
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
        service = SessionService(db_session)
        payload, error, status = service.add_activity_to_session(root_id, session_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        instance = payload["instance"]
        activity_name = payload["activity_name"]
        
        # Emit activity instance created event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_CREATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id
        }, source='sessions_api.add_activity_to_session'))
        
        return jsonify(serialize_activity_instance(instance)), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error adding activity to session")
        return internal_error(logger, "Error adding activity to session")
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
        service = SessionService(db_session)
        payload, error, status = service.reorder_activities(
            root_id,
            session_id,
            current_user.id,
            validated_data.get('activity_ids', []),
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error reordering activities")
        return internal_error(logger, "Error reordering activities")
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
        service = SessionService(db_session)
        payload, error, status = service.update_activity_instance(
            root_id,
            session_id,
            instance_id,
            current_user.id,
            validated_data,
        )
        if error:
            return jsonify({"error": error}), status
        instance = payload["instance"]
        activity_name = payload["activity_name"]
        
        # Emit the generic lifecycle/update event for session-scoped instance edits.
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='sessions_api.update_activity_instance'))
        
        return jsonify(serialize_activity_instance(instance))
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating activity instance")
        return internal_error(logger, "Error updating activity instance")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['DELETE'])
@token_required
def remove_activity_from_session(current_user, root_id, session_id, instance_id):
    """Remove an activity instance from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = SessionService(db_session)
        payload, error, status = service.remove_activity_from_session(
            root_id,
            session_id,
            instance_id,
            current_user.id,
        )
        if error:
            return jsonify({"error": error}), status
        instance = payload["instance"]
        activity_definition_id = instance.activity_definition_id
        activity_name = payload["activity_name"]
        
        # Emit activity instance deleted event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_DELETED, {
            'instance_id': instance_id,
            'activity_definition_id': activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id
        }, source='sessions_api.remove_activity_from_session'))
        
        return jsonify({"message": "Activity instance removed"})
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error removing activity from session")
        return internal_error(logger, "Error removing activity from session")
    finally:
        db_session.close()

@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>/metrics', methods=['PUT'])
@token_required
@validate_request(ActivityMetricsUpdateSchema)
def update_activity_metrics(current_user, root_id, session_id, instance_id, validated_data):
    """Replace the activity instance's metric set with the payload's metric rows."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = SessionService(db_session)
        payload, error, status = service.update_activity_metrics(
            root_id,
            session_id,
            instance_id,
            current_user.id,
            validated_data.get('metrics', []),
        )
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        instance = payload["instance"]
        activity_name = payload["activity_name"]
        
        # Emit the metrics-specific event so downstream handlers can re-evaluate
        # threshold-driven targets without treating this like a lifecycle edit.
        event_bus.emit(Event(Events.ACTIVITY_METRICS_UPDATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': session_id,
            'root_id': root_id,
            'updated_fields': ['metrics']
        }, source='sessions_api.update_activity_metrics'))
        
        # Return updated serialized instance
        return jsonify(payload["serialized"])
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating activity metrics")
        return internal_error(logger, "Error updating activity metrics")
    finally:
        db_session.close()
