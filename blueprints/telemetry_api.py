import logging

from flask import Blueprint, jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from extensions import limiter
from services.telemetry_service import TelemetryService
from validators import TelemetryEventsSchema, validate_request

logger = logging.getLogger(__name__)

telemetry_bp = Blueprint('telemetry', __name__, url_prefix='/api/telemetry')


@telemetry_bp.route('/events', methods=['POST'])
@limiter.limit("60 per minute")
@token_required
@validate_request(TelemetryEventsSchema)
def record_telemetry_events(current_user, validated_data):
    """Accept a batch of first-party product events for the current user."""
    db_session = get_db_session()
    try:
        payload, error, status = TelemetryService(db_session).record_events(
            current_user.id,
            validated_data['events'],
        )
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        return internal_error(logger, "Error recording telemetry events")
    finally:
        db_session.close()
