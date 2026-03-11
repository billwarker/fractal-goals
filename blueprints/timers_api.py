from flask import Blueprint, request, jsonify
import logging
import os
import models
from sqlalchemy.exc import SQLAlchemyError
from pydantic import ValidationError
from models import get_session
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, internal_error
from services.completion_handlers import get_recent_achievements
from services.timer_service import TimerService
from validators import (
    validate_request,
    ActivityInstanceCreateSchema,
    ActivityTimerStartSchema,
    TimerActivityInstanceManualUpdateSchema,
)

# Create blueprint
timers_bp = Blueprint('timers', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)


def _validation_error_response(error: ValidationError):
    errors = []
    for item in error.errors():
        field = ".".join(str(loc) for loc in item["loc"])
        errors.append({
            "field": field,
            "message": item["msg"],
            "type": item["type"],
        })
    logger.warning("Validation error: %s", errors)
    return jsonify({"error": "Validation failed", "details": errors}), 400


# ============================================================================
# ACTIVITY INSTANCE TIME TRACKING ENDPOINTS
# ============================================================================

@timers_bp.route('/<root_id>/activity-instances', methods=['GET', 'POST'])
@token_required
def activity_instances(current_user, root_id):
    """Get all activity instances (GET) or create a new one (POST) if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        if request.method == 'POST':
            try:
                validated = ActivityInstanceCreateSchema(**(request.get_json(silent=True) or {}))
            except ValidationError as error:
                return _validation_error_response(error)
            payload, error, status = service.create_activity_instance(
                root_id,
                current_user.id,
                validated.model_dump(exclude_unset=True),
            )
            if error:
                return jsonify({"error": error}), status

            return jsonify(payload["serialized"]), status

        else:  # GET
            limit, offset = parse_optional_pagination(request, max_limit=1000)
            payload, error, status = service.list_activity_instances(
                root_id,
                current_user.id,
                limit,
                offset,
            )
            if error:
                return jsonify({"error": error}), status
            return jsonify(payload), status

    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error listing/creating activity instances")
        return internal_error(logger, "Error listing/creating activity instances")
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>/start', methods=['POST'])
@token_required
def start_activity_timer(current_user, root_id, instance_id):
    """Start the timer for an activity instance if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        try:
            validated = ActivityTimerStartSchema(**(request.get_json(silent=True) or {}))
        except ValidationError as error:
            return _validation_error_response(error)

        payload, error, status = service.start_activity_timer(
            root_id,
            instance_id,
            current_user.id,
            validated.model_dump(exclude_unset=True),
        )
        if error:
            return jsonify({"error": error}), status

        return jsonify(payload["serialized"]), status

    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error starting activity timer")
        return internal_error(logger, "Error starting activity timer")
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>/complete', methods=['POST'])
@token_required
def complete_activity_instance(current_user, root_id, instance_id):
    """Complete an activity instance (sets stop time and marks as completed)."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        async_completion = (
            request.args.get("async_completion") == "1"
            or os.getenv("ASYNC_ACTIVITY_COMPLETION", "false").lower() in ("1", "true", "yes")
        )
        payload, error, status = service.complete_activity_instance(
            root_id,
            instance_id,
            current_user.id,
            async_completion=async_completion,
        )
        if error:
            return jsonify({"error": error}), status

        result = payload["serialized"]
        # Get any targets/goals that were achieved during this completion
        if async_completion:
            result['achieved_targets'] = []
            result['completed_goals'] = []
            result['evaluation_queued'] = True
        else:
            achievements = get_recent_achievements()
            result['achieved_targets'] = achievements.get('achieved_targets', [])
            result['completed_goals'] = achievements.get('completed_goals', [])
        
        return jsonify(result), status

    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error completing activity instance")
        return internal_error(logger, "Error completing activity instance")
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>', methods=['PUT'])
@token_required
@validate_request(TimerActivityInstanceManualUpdateSchema)
def update_activity_instance(current_user, root_id, instance_id, validated_data):
    """Update an activity instance manually if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        payload, error, status = service.update_activity_instance(
            root_id,
            instance_id,
            current_user.id,
            validated_data,
        )
        if error:
            return jsonify({"error": error}), status

        return jsonify(payload["serialized"]), status

    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Unexpected error updating activity instance")
        return internal_error(logger, "Unexpected error updating activity instance")
    finally:
        db_session.close()

@timers_bp.route('/<root_id>/timers/session/<session_id>/pause', methods=['POST'])
@token_required
def pause_session(current_user, root_id, session_id):
    """Pause the session and all currently active activity instances."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        payload, error, status = service.pause_session(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status

        return jsonify(payload["serialized"]), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error pausing session")
        return internal_error(logger, "Error pausing session")
    finally:
        db_session.close()

@timers_bp.route('/<root_id>/timers/session/<session_id>/resume', methods=['POST'])
@token_required
def resume_session(current_user, root_id, session_id):
    """Resume the session and all currently paused activity instances."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = TimerService(db_session)
    try:
        payload, error, status = service.resume_session(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status

        return jsonify(payload["serialized"]), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error resuming session")
        return internal_error(logger, "Error resuming session")
    finally:
        db_session.close()
