"""Goal serializer, including SMART status and nested targets.
"""

from .goal_type_utils import get_canonical_goal_type
from services._serialize_common import calculate_smart_status, format_utc
from services._serialize_activities import serialize_target


def serialize_goal(goal, include_children=True):
    """Serialize a Goal object."""
    smart_status = calculate_smart_status(goal)
    
    goal_type = get_canonical_goal_type(goal)
    goal_level_name = getattr(goal.level, 'name', None) if getattr(goal, 'level', None) else None
    active_targets = [t for t in (goal.targets_rel or []) if t.deleted_at is None]
    completed_target_count = sum(1 for target in active_targets if target.completed)
    all_targets_satisfied = bool(active_targets) and completed_target_count == len(active_targets)
    completion_state = {
        "completed": bool(goal.completed),
        "completed_at": format_utc(goal.completed_at),
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "source": getattr(goal, 'completion_source', None),
        "reason": getattr(goal, 'completion_reason', None),
        "manually_uncompleted_at": format_utc(getattr(goal, 'manually_uncompleted_at', None)),
        "all_targets_satisfied": all_targets_satisfied,
        "completed_targets": completed_target_count,
        "total_targets": len(active_targets),
    }
    
    result = {
        "name": goal.name,
        "id": goal.id,
        "type": goal_type,  # Hoist type to top level for frontend convenience
        "level_id": goal.level_id,
        "level_name": goal_level_name,
        "completed": goal.completed,
        "completed_at": format_utc(goal.completed_at),
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "completion_state": completion_state,
        "is_smart": all(smart_status.values()),
        "smart_status": smart_status,
        "paused": bool(getattr(goal, 'paused', False)),
        "paused_at": format_utc(getattr(goal, 'paused_at', None)),
        "description": goal.description,
        "deadline": format_utc(goal.deadline),
        "attributes": {
            "id": goal.id,
            "type": goal_type,
            "level_id": goal.level_id,
            "parent_id": goal.parent_id,
            "root_id": goal.root_id,
            "owner_id": getattr(goal, 'owner_id', None),
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "completed": goal.completed,
            "completed_at": format_utc(goal.completed_at),
            "completed_session_id": getattr(goal, 'completed_session_id', None),
            "completion_state": completion_state,
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "targets": [serialize_target(t) for t in (goal.targets_rel or []) if t.deleted_at is None],
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": goal.completed_via_children,
            "inherit_parent_activities": goal.inherit_parent_activities,
            "allow_manual_completion": goal.allow_manual_completion,
            "track_activities": goal.track_activities,
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": bool(getattr(goal, 'paused', False)),
            "paused_at": format_utc(getattr(goal, 'paused_at', None)),
            "associated_activity_ids": [a.id for a in goal.associated_activities] if goal.associated_activities else [],
            "associated_activity_group_ids": [g.id for g in goal.associated_activity_groups] if goal.associated_activity_groups else [],
            "progress_settings": getattr(goal, 'progress_settings', None),
        },
        "children": []
    }
    
    # Attach level characteristics if level is loaded
    level = getattr(goal, 'level', None)
    if level:
        result["level_characteristics"] = {
            "can_have_targets": getattr(level, 'can_have_targets', True),
            "deadline_min_value": level.deadline_min_value,
            "deadline_min_unit": level.deadline_min_unit,
            "deadline_max_value": level.deadline_max_value,
            "deadline_max_unit": level.deadline_max_unit,
            "max_children": level.max_children,
            "auto_complete_when_children_done": getattr(level, 'auto_complete_when_children_done', False),
            "description_required": getattr(level, 'description_required', False),
            "default_deadline_offset_value": level.default_deadline_offset_value,
            "default_deadline_offset_unit": level.default_deadline_offset_unit,
            "sort_children_by": level.sort_children_by,
            "allow_manual_completion": level.allow_manual_completion,
            "requires_smart": getattr(level, 'requires_smart', False),
        }
    
    if include_children:
        result["children"] = [serialize_goal(child) for child in goal.children if child.deleted_at is None]
        
    return result
