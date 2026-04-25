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
    ActivityMetricsUpdateSchema, ActivityReorderSchema,
    QuickSessionCompleteSchema,
)
from blueprints.auth_api import token_required
from blueprints.api_utils import get_db_session, parse_optional_pagination, etag_json_response, internal_error, require_owned_root
from services.serializers import serialize_activity_instance
from services.session_service import SessionService
from services.progress_service import ProgressService
from services.completion_handlers import get_live_progress
from services.owned_entity_queries import get_owned_session

# Create blueprint
sessions_bp = Blueprint('sessions', __name__, url_prefix='/api')


# ============================================================================
# ENDPOINTS
# ============================================================================

def _parse_multi_value_arg(name):
    values = request.args.getlist(name)
    if not values:
        raw_value = request.args.get(name)
        values = [raw_value] if raw_value else []

    parsed = []
    for value in values:
        for part in str(value).split(','):
            normalized = part.strip()
            if normalized:
                parsed.append(normalized)
    return parsed


def _get_session_query_filters():
    return {
        'completed': request.args.get('completed'),
        'sort_by': request.args.get('sort_by'),
        'sort_order': request.args.get('sort_order'),
        'range_start': request.args.get('range_start'),
        'range_end': request.args.get('range_end'),
        'duration_operator': request.args.get('duration_operator'),
        'duration_minutes': request.args.get('duration_minutes'),
        'heatmap_metric': request.args.get('heatmap_metric'),
        'timezone': request.args.get('timezone'),
        'activity_ids': _parse_multi_value_arg('activity_ids'),
        'goal_ids': _parse_multi_value_arg('goal_ids'),
    }


def _parse_window_days(default=7):
    raw_days = request.args.get('days', default)
    try:
        return int(raw_days)
    except (TypeError, ValueError):
        return default

@sessions_bp.route('/practice-sessions', methods=['GET'])
@token_required
def get_all_sessions_endpoint(current_user):
    """Get all sessions for grid view (Global), filtered by user."""
    db_session = get_db_session()
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
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        try:
            limit = min(int(request.args.get('limit', 10)), 50)
            offset = int(request.args.get('offset', 0))
        except ValueError:
            return jsonify({"error": "Invalid pagination parameters"}), 400

        result, error, status = service.get_fractal_sessions(
            root_id,
            current_user.id,
            limit,
            offset,
            filters=_get_session_query_filters(),
        )
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_fractal_sessions")
        return internal_error(logger, "Error in get_fractal_sessions")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/heatmap', methods=['GET'])
@token_required
def get_session_heatmap(current_user, root_id):
    """Get daily session counts for the active sessions query scope."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.get_session_heatmap(
            root_id,
            current_user.id,
            filters=_get_session_query_filters(),
        )
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_session_heatmap")
        return internal_error(logger, "Error in get_session_heatmap")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/analytics-summary', methods=['GET'])
@token_required
def get_session_analytics_summary(current_user, root_id):
    """Get lightweight session analytics payload for dashboard views."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        try:
            limit = min(int(request.args.get('limit', 50)), 200)
        except ValueError:
            return jsonify({"error": "Invalid limit"}), 400

        result, error, status = service.get_session_analytics_summary(root_id, current_user.id, limit=limit)
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_session_analytics_summary")
        return internal_error(logger, "Error in get_session_analytics_summary")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/activity-instantiation-summary', methods=['GET'])
@token_required
def get_activity_instantiation_summary(current_user, root_id):
    """Get the latest session timestamp for each activity definition."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.get_activity_instantiation_summary(root_id, current_user.id)
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_activity_instantiation_summary")
        return internal_error(logger, "Error in get_activity_instantiation_summary")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/evidence-goals', methods=['GET'])
@token_required
def get_recent_evidence_goal_ids(current_user, root_id):
    """Get goal ids with recent activity evidence."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.get_recent_evidence_goal_ids(
            root_id,
            current_user.id,
            days=_parse_window_days(),
        )
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_recent_evidence_goal_ids")
        return internal_error(logger, "Error in get_recent_evidence_goal_ids")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/flowtree-metrics', methods=['GET'])
@token_required
def get_flowtree_session_metrics(current_user, root_id):
    """Get scoped FlowTree session metrics for a visible goal set."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.get_flowtree_session_metrics(
            root_id,
            current_user.id,
            goal_ids=_parse_multi_value_arg('goal_ids'),
            days=_parse_window_days(),
        )
        if error:
            return jsonify(error if isinstance(error, dict) else {"error": error}), status
        return etag_json_response(result)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in get_flowtree_session_metrics")
        return internal_error(logger, "Error in get_flowtree_session_metrics")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['POST'])
@token_required
@validate_request(SessionCreateSchema)
def create_fractal_session(current_user, root_id, validated_data):
    """Create a new session within a fractal."""
    db_session = get_db_session()
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


@sessions_bp.route('/<root_id>/sessions/quick-complete', methods=['POST'])
@token_required
@validate_request(QuickSessionCompleteSchema)
def complete_quick_session(current_user, root_id, validated_data):
    """Create and complete a quick session in one request."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.create_completed_quick_session(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error completing quick session")
        return internal_error(logger, "Error completing quick session")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
@token_required
@validate_request(SessionUpdateSchema)
def update_session(current_user, root_id, session_id, validated_data):
    """Update a session's details."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.update_session(
            root_id,
            session_id,
            current_user.id,
            validated_data,
            complete_unstarted_instances=False,
        )
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
    db_session = get_db_session()
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
    db_session = get_db_session()
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


@sessions_bp.route('/<root_id>/sessions/<session_id>/duplicate', methods=['POST'])
@token_required
def duplicate_session_endpoint(current_user, root_id, session_id):
    """Duplicate a session into a new active session."""
    db_session = get_db_session()
    service = SessionService(db_session)
    try:
        result, error, status = service.duplicate_session(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error duplicating session")
        return internal_error(logger, "Error duplicating session")
    finally:
        db_session.close()


# ============================================================================
# SESSION ACTIVITY INSTANCE ENDPOINTS (Database-Only Architecture)
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['GET'])
@token_required
def get_session_activities(current_user, root_id, session_id):
    """Get all activity instances for a session in display order."""
    db_session = get_db_session()
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
    db_session = get_db_session()
    try:
        service = SessionService(db_session)
        payload, error, status = service.add_activity_to_session(root_id, session_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_instance(payload["instance"])), 201
        
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
    db_session = get_db_session()
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
    db_session = get_db_session()
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
        return jsonify(serialize_activity_instance(payload["instance"]))
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
    db_session = get_db_session()
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
    db_session = get_db_session()
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
        response_data = dict(payload["serialized"])
        response_data['progress_comparison'] = get_live_progress(instance_id)
        return jsonify(response_data)

    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating activity metrics")
        return internal_error(logger, "Error updating activity metrics")
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/progress-summary', methods=['GET'])
@token_required
def get_session_progress_summary(current_user, root_id, session_id):
    """Get progress records for all activity instances in a session."""
    db_session = get_db_session()
    try:
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        session = get_owned_session(db_session, root_id, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404

        service = ProgressService(db_session)
        records = service.get_progress_summary_for_session(session.id)
        return jsonify(records)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting session progress summary")
        return internal_error(logger, "Error getting session progress summary")
    finally:
        db_session.close()
