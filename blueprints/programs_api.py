from flask import Blueprint, request, jsonify
import logging
import models
from sqlalchemy.exc import SQLAlchemyError
from models import get_session
from validators import (
    ProgramCreateSchema,
    ProgramUpdateSchema,
    ProgramDayCreateSchema,
    ProgramDayUpdateSchema,
    ProgramDayCopySchema,
    ProgramDayScheduleSchema,
    ProgramDayOccurrenceUnscheduleSchema,
    ProgramGoalDeadlineSchema,
    ProgramBlockSchema,
    ProgramBlockUpdateSchema,
    ProgramBlockGoalAttachSchema,
    ProgramDayGoalAttachSchema,
    validate_request
)
from services.programs import ProgramService, ProgramServiceValidationError
from blueprints.auth_api import token_required
from blueprints.api_utils import get_db_session, internal_error, parse_optional_pagination, etag_json_response
from services import event_bus, Event, Events

logger = logging.getLogger(__name__)

# Create blueprint
programs_bp = Blueprint('programs', __name__, url_prefix='/api')


def _program_service_error_response(error: ProgramServiceValidationError):
    return jsonify(error.payload if isinstance(error.payload, dict) else {"error": str(error)}), error.status_code

# ============================================================================
# PROGRAM ENDPOINTS
# ============================================================================

@programs_bp.route('/<root_id>/programs', methods=['GET'])
@token_required
def get_programs(current_user, root_id):
    """Get all training programs for a fractal if owned by user."""
    session = get_db_session()
    try:
        programs = ProgramService.get_programs(session, root_id, current_user.id)
        limit, offset = parse_optional_pagination(request, max_limit=200)
        if limit is not None:
            programs = programs[offset: offset + limit]
        return etag_json_response(programs)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting programs")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['GET'])
@token_required
def get_program(current_user, root_id, program_id):
    """Get a specific training program if owned by user."""
    session = get_db_session()
    try:
        program = ProgramService.get_program(session, root_id, program_id, current_user.id)
        if program is None:
            return jsonify({"error": "Program not found"}), 404
        return jsonify(program)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs', methods=['POST'])
@token_required
@validate_request(ProgramCreateSchema)
def create_program(current_user, root_id, validated_data):
    """Create a new training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.create_program(session, root_id, validated_data, current_user.id)
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['PUT'])
@token_required
@validate_request(ProgramUpdateSchema)
def update_program(current_user, root_id, program_id, validated_data):
    """Update a training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.update_program(session, root_id, program_id, validated_data, current_user.id)
        if not result:
            return jsonify({"error": "Program not found"}), 404
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['DELETE'])
@token_required
def delete_program(current_user, root_id, program_id):
    """Delete a training program if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.delete_program(session, root_id, program_id, current_user.id)
        return jsonify({
            "message": "Program deleted successfully",
            "affected_sessions": result["affected_sessions"]
        })
    except ValueError as e:
         return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting program")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/session-count', methods=['GET'])
@token_required
def get_program_session_count(current_user, root_id, program_id):
    """Get the count of sessions associated with a program if owned by user."""
    session = get_db_session()
    try:
        count = ProgramService.get_program_session_count(session, root_id, program_id, current_user.id)
        return jsonify({"session_count": count})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting program session count")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

# =============================================================================
# BLOCK MANAGEMENT
# =============================================================================

@programs_bp.route('/<root_id>/programs/<program_id>/blocks', methods=['POST'])
@token_required
@validate_request(ProgramBlockSchema)
def create_block(current_user, root_id, program_id, validated_data):
    """Create a new program block."""
    session = get_db_session()
    try:
        block_dict = ProgramService.create_block(session, root_id, program_id, validated_data, current_user.id)
        return jsonify(block_dict), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>', methods=['PUT'])
@token_required
@validate_request(ProgramBlockUpdateSchema)
def update_block(current_user, root_id, program_id, block_id, validated_data):
    """Update a specific program block."""
    session = get_db_session()
    try:
        block_dict = ProgramService.update_block(session, root_id, program_id, block_id, validated_data, current_user.id)
        return jsonify(block_dict)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>', methods=['DELETE'])
@token_required
def delete_block(current_user, root_id, program_id, block_id):
    """Delete a program block."""
    session = get_db_session()
    try:
        ProgramService.delete_block(session, root_id, program_id, block_id, current_user.id)
        return jsonify({"message": "Block deleted"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting program block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days', methods=['POST'])
@token_required
@validate_request(ProgramDayCreateSchema)
def add_block_day(current_user, root_id, program_id, block_id, validated_data):
    """Add a configured day to a program block if owned by user."""
    session = get_db_session()
    try:
        result = ProgramService.add_block_day(session, root_id, program_id, block_id, validated_data, current_user.id)
        return jsonify(result), 201
    except ValueError as e:
         return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error adding block day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['PUT'])
@token_required
@validate_request(ProgramDayUpdateSchema)
def update_block_day(current_user, root_id, program_id, block_id, day_id, validated_data):
    """Update a specific program day."""
    session = get_db_session()
    try:
        result = ProgramService.update_block_day(session, root_id, program_id, block_id, day_id, validated_data, current_user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating block day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['DELETE'])
@token_required
def delete_block_day(current_user, root_id, program_id, block_id, day_id):
    """Delete a program day."""
    session = get_db_session()
    try:
        ProgramService.delete_block_day(session, root_id, program_id, block_id, day_id, current_user.id)
        return jsonify({"message": "Day deleted"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting block day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/copy', methods=['POST'])
@token_required
@validate_request(ProgramDayCopySchema)
def copy_block_day(current_user, root_id, program_id, block_id, day_id, validated_data):
    """Copy a day to other blocks."""
    session = get_db_session()
    try:
        result = ProgramService.copy_block_day(session, root_id, program_id, block_id, day_id, validated_data, current_user.id)
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error copying block day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/schedule', methods=['POST'])
@token_required
@validate_request(ProgramDayScheduleSchema)
def schedule_block_day(current_user, root_id, program_id, block_id, day_id, validated_data):
    """Schedule an existing program day by creating a session in program context."""
    session = get_db_session()
    try:
        scheduled_session = ProgramService.schedule_block_day(
            session,
            root_id,
            program_id,
            block_id,
            day_id,
            validated_data,
            current_user.id,
        )
        return jsonify(scheduled_session), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error scheduling block day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/unschedule', methods=['POST'])
@token_required
@validate_request(ProgramDayOccurrenceUnscheduleSchema)
def unschedule_block_day_occurrence(current_user, root_id, program_id, block_id, day_id, validated_data):
    """Unschedule sessions for a specific program-day occurrence on a calendar date."""
    session = get_db_session()
    try:
        result = ProgramService.unschedule_block_day_occurrence(
            session,
            root_id,
            program_id,
            block_id,
            day_id,
            validated_data,
            current_user.id,
        )
        return jsonify(result)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error unscheduling block day occurrence")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/active-days', methods=['GET'])
@token_required
def get_active_program_days(current_user, root_id):
    """Get active program days if owned by user."""
    session = get_db_session()
    try:
        days = ProgramService.get_active_program_days(session, root_id, current_user.id)
        return jsonify(days or [])
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting active program days")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/goals', methods=['POST'])
@token_required
@validate_request(ProgramBlockGoalAttachSchema)
def attach_goal_to_block(current_user, root_id, program_id, block_id, validated_data):
    """Attach a goal to a block and update its deadline."""
    session = get_db_session()
    try:
        block_dict = ProgramService.attach_goal_to_block(session, root_id, program_id, block_id, validated_data, current_user.id)
        return jsonify({"message": "Goal attached and updated", "block": block_dict})
    except ProgramServiceValidationError as e:
         return _program_service_error_response(e)
    except ValueError as e:
         return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error attaching goal to block")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/goals', methods=['POST'])
@token_required
@validate_request(ProgramDayGoalAttachSchema)
def attach_goal_to_day(current_user, root_id, program_id, block_id, day_id, validated_data):
    """Attach a goal directly to a program day."""
    session = get_db_session()
    try:
        day_dict = ProgramService.attach_goal_to_day(session, root_id, program_id, block_id, day_id, validated_data, current_user.id)
        return jsonify({"message": "Goal attached to day", "day": day_dict}), 201
    except ValueError as e:
         return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error attaching goal to day")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/goal-deadlines', methods=['POST'])
@token_required
@validate_request(ProgramGoalDeadlineSchema)
def set_goal_deadline_for_program_date(current_user, root_id, program_id, validated_data):
    """Set a goal deadline through program-calendar semantics."""
    session = get_db_session()
    try:
        goal_dict = ProgramService.set_goal_deadline_for_program_date(
            session,
            root_id,
            program_id,
            validated_data,
            current_user.id,
        )
        return jsonify(goal_dict)
    except ProgramServiceValidationError as e:
        return _program_service_error_response(e)
    except ValueError as e:
        return jsonify({"error": str(e)}), 404 if "not found" in str(e).lower() or "access denied" in str(e).lower() else 400
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting goal deadline for program date")
        return internal_error(logger, "Program API request failed")
    finally:
        session.close()
