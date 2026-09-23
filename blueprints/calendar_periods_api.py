"""Fractal-wide calendar periods (time off such as vacations)."""

from flask import Blueprint, jsonify, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from services.calendar_periods import CalendarPeriodService
from validators import CalendarPeriodCreateSchema, CalendarPeriodUpdateSchema, validate_request

calendar_periods_bp = Blueprint('calendar_periods', __name__, url_prefix='/api')


def _respond(result):
    payload, error, status = result
    if error:
        return jsonify({"error": error}), status
    return jsonify(payload), status


@calendar_periods_bp.route('/<root_id>/calendar-periods', methods=['GET'])
@token_required
def list_calendar_periods(current_user, root_id):
    """List periods overlapping the inclusive ``start``..``end`` window."""
    return _respond(CalendarPeriodService(get_db_session()).list(
        root_id, current_user.id, request.args.get('start'), request.args.get('end'),
    ))


@calendar_periods_bp.route('/<root_id>/calendar-periods', methods=['POST'])
@token_required
@validate_request(CalendarPeriodCreateSchema)
def create_calendar_period(current_user, root_id, validated_data):
    return _respond(CalendarPeriodService(get_db_session()).create(
        root_id, current_user.id, validated_data,
    ))


@calendar_periods_bp.route('/<root_id>/calendar-periods/<period_id>', methods=['PUT'])
@token_required
@validate_request(CalendarPeriodUpdateSchema)
def update_calendar_period(current_user, root_id, period_id, validated_data):
    changes = {key: value for key, value in validated_data.items() if value is not None or key == 'notes'}
    return _respond(CalendarPeriodService(get_db_session()).update(
        root_id, current_user.id, period_id, changes,
    ))


@calendar_periods_bp.route('/<root_id>/calendar-periods/<period_id>', methods=['DELETE'])
@token_required
def delete_calendar_period(current_user, root_id, period_id):
    return _respond(CalendarPeriodService(get_db_session()).delete(
        root_id, current_user.id, period_id,
    ))
