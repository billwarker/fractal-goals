from flask import Blueprint, request, jsonify
import logging
import models
from sqlalchemy.exc import SQLAlchemyError
from models import get_engine, get_session
from blueprints.auth_api import token_required
from blueprints.api_utils import internal_error
from services.serializers import format_utc
from services.goal_level_service import GoalLevelService

logger = logging.getLogger(__name__)

goal_levels_bp = Blueprint('goal_levels', __name__, url_prefix='/api/goal-levels')

def serialize_goal_level(level):
    return {
        "id": level.id,
        "name": level.name,
        "rank": level.rank,
        "color": level.color,
        "secondary_color": getattr(level, 'secondary_color', None),
        "icon": level.icon,
        "owner_id": level.owner_id,
        "root_id": level.root_id,
        "allow_manual_completion": level.allow_manual_completion,
        "track_activities": level.track_activities,
        "requires_smart": getattr(level, 'requires_smart', False),
        "deadline_min_value": level.deadline_min_value,
        "deadline_min_unit": level.deadline_min_unit,
        "deadline_max_value": level.deadline_max_value,
        "deadline_max_unit": level.deadline_max_unit,
        "max_children": level.max_children,
        "auto_complete_when_children_done": level.auto_complete_when_children_done,
        "can_have_targets": level.can_have_targets,

        "description_required": level.description_required,
        "default_deadline_offset_value": level.default_deadline_offset_value,
        "default_deadline_offset_unit": level.default_deadline_offset_unit,
        "sort_children_by": level.sort_children_by,
        "created_at": format_utc(level.created_at),
        "updated_at": format_utc(level.updated_at)
    }

@goal_levels_bp.route('', methods=['GET'])
@token_required
def get_goal_levels(current_user):
    """
    Fetch all goal levels applicable to the user, optionally scoped to a fractal.
    3-layer merge: System Defaults → User Global Overrides → Fractal-Scoped Overrides.
    """
    root_id = request.args.get('root_id')
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalLevelService(db_session)
        merged_levels, error, status = service.list_goal_levels(current_user.id, root_id=root_id)
        if error:
            return jsonify({"error": error}), status
        return jsonify([serialize_goal_level(l) for l in merged_levels])
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal levels")
        return internal_error(logger, "Failed to fetch goal levels")
    finally:
        db_session.close()

@goal_levels_bp.route('/<level_id>', methods=['PUT'])
@token_required
def update_goal_level(current_user, level_id):
    """
    Update a GoalLevel. 
    If the level is a system default (owner_id = None), this creates a clone owned by the user
    and returns the NEW ID, preventing users from editing global system defaults.
    """
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalLevelService(db_session)
        level, error, status = service.update_goal_level(level_id, current_user.id, request.json or {})
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal_level(level)), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating goal level")
        return internal_error(logger, "Failed to update goal level")
    finally:
        db_session.close()

@goal_levels_bp.route('/<level_id>', methods=['DELETE'])
@token_required
def reset_goal_level(current_user, level_id):
    """
    Deletes a user-specific override, effectively 'resetting' them to the system default.
    Also remaps their goals back to the system default level_id.
    """
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalLevelService(db_session)
        payload, error, status = service.reset_goal_level(level_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error resetting goal level")
        return internal_error(logger, "Failed to reset goal level")
    finally:
        db_session.close()
