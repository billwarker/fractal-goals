"""Dated program session plans: the Programs page Days tab and Create Session plan choice."""

from flask import Blueprint, jsonify, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from services.program_session_plans import ProgramSessionPlanService
from validators import ProgramSessionPlanPullSchema, ProgramSessionPlanSaveSchema, validate_request

program_session_plans_bp = Blueprint('program_session_plans', __name__, url_prefix='/api')

PLAN_PATH = '/<root_id>/programs/<program_id>/days/<day_id>/plans/<template_id>/<plan_date>'


def _respond(result):
    payload, error, status = result
    if error:
        return jsonify({"error": error}), status
    return jsonify(payload), status


@program_session_plans_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/plan-occurrences', methods=['GET'])
@token_required
def list_plan_occurrences(current_user, root_id, program_id, day_id):
    """The day's occurrence dates with each template's plan state; defaults to its block."""
    return _respond(ProgramSessionPlanService(get_db_session()).list_occurrences(
        root_id, current_user.id, program_id, day_id,
        request.args.get('start'), request.args.get('end'),
    ))


@program_session_plans_bp.route('/<root_id>/programs/<program_id>/days/<day_id>/plans', methods=['GET'])
@token_required
def get_day_plans(current_user, root_id, program_id, day_id):
    """Every template's plan for one occurrence date, stored or seeded."""
    return _respond(ProgramSessionPlanService(get_db_session()).get_day_plans(
        root_id, current_user.id, program_id, day_id, request.args.get('date'),
    ))


@program_session_plans_bp.route(PLAN_PATH, methods=['PUT'])
@token_required
@validate_request(ProgramSessionPlanSaveSchema)
def save_plan(current_user, root_id, program_id, day_id, template_id, plan_date, validated_data):
    return _respond(ProgramSessionPlanService(get_db_session()).save_plan(
        root_id, current_user.id, program_id, day_id, template_id, plan_date, validated_data,
    ))


@program_session_plans_bp.route(PLAN_PATH, methods=['DELETE'])
@token_required
def reset_plan(current_user, root_id, program_id, day_id, template_id, plan_date):
    """Discard a stored plan so the date falls back to its seed."""
    return _respond(ProgramSessionPlanService(get_db_session()).reset_plan(
        root_id, current_user.id, program_id, day_id, template_id, plan_date,
    ))


@program_session_plans_bp.route(f'{PLAN_PATH}/pull-template', methods=['POST'])
@token_required
@validate_request(ProgramSessionPlanPullSchema)
def pull_template_changes(current_user, root_id, program_id, day_id, template_id, plan_date, validated_data):
    return _respond(ProgramSessionPlanService(get_db_session()).pull_template_changes(
        root_id, current_user.id, program_id, day_id, template_id, plan_date, validated_data,
    ))


@program_session_plans_bp.route('/<root_id>/session-plans/candidates', methods=['GET'])
@token_required
def list_plan_candidates(current_user, root_id):
    """Plans a new session of a template can execute on a local date."""
    return _respond(ProgramSessionPlanService(get_db_session()).plan_candidates(
        root_id, current_user.id, request.args.get('template_id'), request.args.get('date'),
    ))
