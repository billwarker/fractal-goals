from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import uuid
import logging
import models
from models import get_engine, get_session, GoalLevel, User
from blueprints.auth_api import token_required
from blueprints.api_utils import internal_error
from services.serializers import format_utc

logger = logging.getLogger(__name__)

goal_levels_bp = Blueprint('goal_levels', __name__, url_prefix='/api/goal-levels')

def serialize_goal_level(level):
    return {
        "id": level.id,
        "name": level.name,
        "rank": level.rank,
        "color": level.color,
        "icon": level.icon,
        "owner_id": level.owner_id,
        "root_id": level.root_id,
        "allow_manual_completion": level.allow_manual_completion,
        "track_activities": level.track_activities,
        "requires_smart": getattr(level, 'requires_smart', False),
        "created_at": format_utc(level.created_at),
        "updated_at": format_utc(level.updated_at)
    }

@goal_levels_bp.route('', methods=['GET'])
@token_required
def get_goal_levels(current_user):
    """
    Fetch all goal levels applicable to the user.
    Returns System Defaults (owner_id is null) AND user-specific overrides.
    """
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Get system defaults
        system_levels = db_session.query(GoalLevel).filter_by(owner_id=None, deleted_at=None).all()
        # Get user overrides
        user_levels = db_session.query(GoalLevel).filter_by(owner_id=current_user.id, deleted_at=None).all()
        
        # Merge them: user overrides replace system defaults of the same name and rank
        level_map = {}
        for level in system_levels:
            # key by name (e.g. "Long Term Goal") to easily replace with user overrides
            level_map[level.name] = level
            
        for level in user_levels:
            # We assume users only override existing canonical levels for now
            # If they create entirely new ones, they just get added
            level_map[level.name] = level
            
        merged_levels = list(level_map.values())
        # Sort by rank
        merged_levels.sort(key=lambda x: x.rank)
        
        return jsonify([serialize_goal_level(l) for l in merged_levels])
    except Exception as e:
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
        level = db_session.query(GoalLevel).filter_by(id=level_id, deleted_at=None).first()
        if not level:
            return jsonify({"error": "Goal level not found"}), 404
            
        # Is this an attempt to modify another user's level?
        if level.owner_id and level.owner_id != current_user.id:
            return jsonify({"error": "Permission denied"}), 403
            
        data = request.json
        
        # If it's a system default, we must duplicate it instead of editing in place
        if level.owner_id is None:
            # Check if user ALREADY cloned this system level
            existing_user_clone = db_session.query(GoalLevel).filter_by(
                owner_id=current_user.id, 
                name=level.name, 
                deleted_at=None
            ).first()
            
            if existing_user_clone:
                level = existing_user_clone
            else:
                new_level = GoalLevel(
                    name=level.name,
                    rank=level.rank,
                    color=level.color,
                    icon=level.icon,
                    owner_id=current_user.id,
                    allow_manual_completion=level.allow_manual_completion,
                    track_activities=level.track_activities,
                    requires_smart=getattr(level, 'requires_smart', False)
                )
                db_session.add(new_level)
                db_session.flush() # get ID
                
                # IMPORTANT: Since they now have a custom level, we should ideally migrate
                # any existing Goals they have of the system-default level to point to this new one.
                from models.goal import Goal
                user_goals = db_session.query(Goal).filter_by(owner_id=current_user.id, level_id=level.id).all()
                for g in user_goals:
                    g.level_id = new_level.id
                    
                level = new_level
                
        # Now we have a user-owned level we can safely edit
        if 'color' in data:
            level.color = data['color']
        if 'icon' in data:
            level.icon = data['icon']
        if 'allow_manual_completion' in data:
            level.allow_manual_completion = bool(data['allow_manual_completion'])
        if 'track_activities' in data:
            level.track_activities = bool(data['track_activities'])
        if 'requires_smart' in data:
            level.requires_smart = bool(data['requires_smart'])
            
        db_session.commit()
        return jsonify(serialize_goal_level(level))
        
    except Exception as e:
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
        level = db_session.query(GoalLevel).filter_by(id=level_id, owner_id=current_user.id).first()
        if not level:
            return jsonify({"error": "Custom goal level not found or permission denied"}), 404
            
        # Find the system default of the same name and rank
        system_default = db_session.query(GoalLevel).filter_by(
            name=level.name, 
            owner_id=None,
            deleted_at=None
        ).first()
        
        if system_default:
            # Remap goals
            from models.goal import Goal
            user_goals = db_session.query(Goal).filter_by(owner_id=current_user.id, level_id=level.id).all()
            for g in user_goals:
                g.level_id = system_default.id
                
        level.deleted_at = datetime.now(timezone.utc)
        db_session.commit()
        
        return jsonify({"status": "success", "message": "Goal level reset to system default"})
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error resetting goal level")
        return internal_error(logger, "Failed to reset goal level")
    finally:
        db_session.close()
