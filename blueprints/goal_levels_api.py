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
        # Layer 1: System defaults (owner_id is null)
        system_levels = db_session.query(GoalLevel).filter_by(owner_id=None, deleted_at=None).all()
        
        # Layer 2: User-global overrides (owner_id=user, root_id=null)
        user_global_levels = db_session.query(GoalLevel).filter(
            GoalLevel.owner_id == current_user.id,
            GoalLevel.root_id == None,
            GoalLevel.deleted_at == None
        ).all()
        
        # Layer 3: Fractal-scoped overrides (owner_id=user, root_id=X)
        root_levels = []
        if root_id:
            root_levels = db_session.query(GoalLevel).filter(
                GoalLevel.owner_id == current_user.id,
                GoalLevel.root_id == root_id,
                GoalLevel.deleted_at == None
            ).all()
        
        # Merge: each layer overrides the previous by name
        level_map = {}
        for level in system_levels:
            level_map[level.name] = level
        for level in user_global_levels:
            level_map[level.name] = level
        for level in root_levels:
            level_map[level.name] = level
            
        merged_levels = list(level_map.values())
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
        req_root_id = data.get('root_id')  # Fractal scope from request
        
        # If it's a system default OR a user-global level and we want a root-scoped override,
        # we must duplicate it instead of editing in place
        needs_clone = False
        if level.owner_id is None:
            # System default → always clone
            needs_clone = True
        elif level.owner_id == current_user.id and req_root_id and level.root_id != req_root_id:
            # User-global level but we want a root-scoped version → clone
            needs_clone = True
            
        if needs_clone:
            # Check if user ALREADY has a clone for this root_id + name
            clone_filters = {
                'owner_id': current_user.id,
                'name': level.name,
                'deleted_at': None
            }
            if req_root_id:
                clone_filters['root_id'] = req_root_id
            else:
                # User-global clone (no root_id)
                pass
                
            existing_user_clone = db_session.query(GoalLevel).filter_by(**clone_filters)
            if req_root_id:
                existing_user_clone = existing_user_clone.first()
            else:
                existing_user_clone = existing_user_clone.filter(GoalLevel.root_id == None).first()
            
            if existing_user_clone:
                level = existing_user_clone
            else:
                new_level = GoalLevel(
                    name=level.name,
                    rank=level.rank,
                    color=level.color,
                    secondary_color=getattr(level, 'secondary_color', None),
                    icon=level.icon,
                    owner_id=current_user.id,
                    root_id=req_root_id,
                    allow_manual_completion=level.allow_manual_completion,
                    track_activities=level.track_activities,
                    requires_smart=getattr(level, 'requires_smart', False),
                    deadline_min_value=level.deadline_min_value,
                    deadline_min_unit=level.deadline_min_unit,
                    deadline_max_value=level.deadline_max_value,
                    deadline_max_unit=level.deadline_max_unit,
                    max_children=level.max_children,
                    auto_complete_when_children_done=level.auto_complete_when_children_done,
                    can_have_targets=level.can_have_targets,

                    description_required=level.description_required,
                    default_deadline_offset_value=level.default_deadline_offset_value,
                    default_deadline_offset_unit=level.default_deadline_offset_unit,
                    sort_children_by=level.sort_children_by
                )
                db_session.add(new_level)
                db_session.flush()
                level = new_level
                
        # Now we have a user-owned level we can safely edit
        if 'color' in data:
            level.color = data['color']
        if 'secondary_color' in data:
            level.secondary_color = data['secondary_color']
        if 'icon' in data:
            level.icon = data['icon']
        if 'allow_manual_completion' in data:
            level.allow_manual_completion = bool(data['allow_manual_completion'])
        if 'track_activities' in data:
            level.track_activities = bool(data['track_activities'])
        if 'requires_smart' in data:
            level.requires_smart = bool(data['requires_smart'])
        if 'deadline_min_value' in data:
            level.deadline_min_value = int(data['deadline_min_value']) if data['deadline_min_value'] is not None else None
        if 'deadline_min_unit' in data:
            level.deadline_min_unit = data['deadline_min_unit']
        if 'deadline_max_value' in data:
            level.deadline_max_value = int(data['deadline_max_value']) if data['deadline_max_value'] is not None else None
        if 'deadline_max_unit' in data:
            level.deadline_max_unit = data['deadline_max_unit']
        if 'max_children' in data:
            level.max_children = int(data['max_children']) if data['max_children'] is not None else None
        if 'auto_complete_when_children_done' in data:
            level.auto_complete_when_children_done = bool(data['auto_complete_when_children_done'])
        if 'can_have_targets' in data:
            level.can_have_targets = bool(data['can_have_targets'])

        if 'description_required' in data:
            level.description_required = bool(data['description_required'])
        if 'default_deadline_offset_value' in data:
            level.default_deadline_offset_value = int(data['default_deadline_offset_value']) if data['default_deadline_offset_value'] is not None else None
        if 'default_deadline_offset_unit' in data:
            level.default_deadline_offset_unit = data['default_deadline_offset_unit']
        if 'sort_children_by' in data:
            level.sort_children_by = data['sort_children_by']
            
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
