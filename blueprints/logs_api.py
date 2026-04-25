from flask import Blueprint, jsonify, request
import logging

import models
from blueprints.auth_api import token_required
from sqlalchemy.exc import SQLAlchemyError
from models import get_session
from blueprints.api_utils import get_db_session, internal_error
from services.log_service import LogService

logger = logging.getLogger(__name__)

logs_api = Blueprint('logs_api', __name__)


def _parse_boolean_arg(raw_value, default=True):
    if raw_value is None:
        return default

    return str(raw_value).strip().lower() not in {'0', 'false', 'no', 'off'}

@logs_api.route('/api/<root_id>/logs', methods=['GET'])
@token_required
def get_logs(current_user, root_id):
    """
    Get all event logs for a specific fractal if owned by user.
    """
    limit = request.args.get('limit', 50, type=int)
    offset = request.args.get('offset', 0, type=int)
    event_type = request.args.get('event_type')
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    include_event_types = _parse_boolean_arg(request.args.get('include_event_types'), default=True)

    db_session = get_db_session()
    service = LogService(db_session)
    try:
        payload, error, status = service.get_logs(
            root_id,
            current_user.id,
            limit=limit,
            offset=offset,
            event_type=event_type,
            start_date=start_date,
            end_date=end_date,
            include_event_types=include_event_types,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching logs for root %s", root_id)
        return internal_error(logger, "Error fetching logs")
    finally:
        db_session.close()

@logs_api.route('/api/<root_id>/logs/clear', methods=['DELETE'])
@token_required
def clear_logs(current_user, root_id):
    """
    Clear all logs for a specific fractal.
    """
    db_session = get_db_session()
    service = LogService(db_session)
    try:
        payload, error, status = service.clear_logs(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        logger.info("Cleared logs for root %s", root_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error clearing logs for root %s", root_id)
        return internal_error(logger, "Error clearing logs")
    finally:
        db_session.close()
