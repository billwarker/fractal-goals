from flask import Blueprint, request, jsonify
import logging
import models
from models import get_session, validate_root_goal
from validators import (
    validate_request,
    ProgramCreateSchema, ProgramUpdateSchema
)
from services.programs import ProgramService
from services import event_bus, Event, Events

logger = logging.getLogger(__name__)

# Create blueprint
programs_bp = Blueprint('programs', __name__, url_prefix='/api')

# ============================================================================
# PROGRAM ENDPOINTS
# ============================================================================

@programs_bp.route('/<root_id>/programs', methods=['GET'])
def get_programs(root_id):
    """Get all training programs for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        programs = ProgramService.get_programs(session, root_id)
        if programs is None:
             return jsonify({"error": "Fractal not found"}), 404
        return jsonify(programs)
    except Exception as e:
        logger.exception("Error getting programs")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['GET'])
def get_program(root_id, program_id):
    """Get a specific training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        program = ProgramService.get_program(session, root_id, program_id)
        if program is None:
            return jsonify({"error": "Program or Fractal not found"}), 404
        return jsonify(program)
    except Exception as e:
        logger.exception("Error getting program")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs', methods=['POST'])
@validate_request(ProgramCreateSchema)
def create_program(root_id, validated_data):
    """Create a new training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        result = ProgramService.create_program(session, root_id, validated_data)
        session.commit()
        return jsonify(result), 201
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    except Exception as e:
        session.rollback()
        logger.exception("Error creating program")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['PUT'])
@validate_request(ProgramUpdateSchema)
def update_program(root_id, program_id, validated_data):
    """Update a training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        result = ProgramService.update_program(session, root_id, program_id, validated_data)
        if not result:
            return jsonify({"error": "Program not found"}), 404
        session.commit()
        return jsonify(result)
    except Exception as e:
        session.rollback()
        logger.exception("Error updating program")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@programs_bp.route('/<root_id>/programs/<program_id>', methods=['DELETE'])
def delete_program(root_id, program_id):
    """Delete a training program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        result = ProgramService.delete_program(session, root_id, program_id)
        session.commit()
        return jsonify({
            "message": "Program deleted successfully",
            "affected_sessions": result["affected_sessions"]
        })
    except ValueError as e:
         return jsonify({"error": str(e)}), 404
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/session-count', methods=['GET'])
def get_program_session_count(root_id, program_id):
    """Get the count of sessions associated with a program."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        count = ProgramService.get_program_session_count(session, root_id, program_id)
        return jsonify({"session_count": count})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days', methods=['POST'])
def add_block_day(root_id, program_id, block_id):
    """Add a configured day to a program block (and optionally cascade)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data = request.get_json()
        count = ProgramService.add_block_day(session, root_id, program_id, block_id, data)
        session.commit()
        return jsonify({"message": f"Added {count} days/sessions"}), 201
    except ValueError as e:
         return jsonify({"error": str(e)}), 404 if "not found" in str(e) else 400
    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['PUT'])
def update_block_day(root_id, program_id, block_id, day_id):
    """Update a specific program day."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data = request.get_json()
        ProgramService.update_block_day(session, root_id, program_id, block_id, day_id, data)
        session.commit()
        return jsonify({"message": "Day updated successfully"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>', methods=['DELETE'])
def delete_block_day(root_id, program_id, block_id, day_id):
    """Delete a program day."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        ProgramService.delete_block_day(session, root_id, program_id, block_id, day_id)
        session.commit()
        return jsonify({"message": "Day deleted"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/days/<day_id>/copy', methods=['POST'])
def copy_block_day(root_id, program_id, block_id, day_id):
    """Copy a day to other blocks."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data = request.get_json()
        count = ProgramService.copy_block_day(session, root_id, program_id, block_id, day_id, data)
        session.commit()
        return jsonify({"message": f"Copied to {count} blocks"})
    except ValueError as e:
        return jsonify({"error": str(e)}), 404
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/active-days', methods=['GET'])
def get_active_program_days(root_id):
    """
    Get program days from active programs where current date falls within the block's date range.
    Returns days that have at least one scheduled session with a template.
    """
    engine = models.get_engine()
    session = get_session(engine)
    try:
        days = ProgramService.get_active_program_days(session, root_id)
        if days is None:
             # Should practically not happen with get_active_program_days logic unless error
             return jsonify([]), 200
        return jsonify(days)
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@programs_bp.route('/<root_id>/programs/<program_id>/blocks/<block_id>/goals', methods=['POST'])
def attach_goal_to_block(root_id, program_id, block_id):
    """Attach a goal to a block and update its deadline."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data = request.get_json()
        block_dict = ProgramService.attach_goal_to_block(session, root_id, program_id, block_id, data)
        session.commit()
        return jsonify({"message": "Goal attached and updated", "block": block_dict})
    except ValueError as e:
         return jsonify({"error": str(e)}), 400
    except Exception as e:
        session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()
