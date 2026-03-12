from services.goal_type_utils import get_canonical_goal_level_name, get_canonical_goal_type


def get_goal_level_name(goal) -> str | None:
    level = getattr(goal, "level", None)
    if level and getattr(level, "name", None):
        return level.name
    try:
        return get_canonical_goal_level_name(goal)
    except Exception:
        return None


def is_goal_type(goal, canonical_type: str) -> bool:
    try:
        return get_canonical_goal_type(goal) == canonical_type
    except Exception:
        return False


def is_nano_goal(goal) -> bool:
    return get_goal_level_name(goal) == "Nano Goal" or is_goal_type(goal, "NanoGoal")


def is_micro_goal(goal) -> bool:
    return get_goal_level_name(goal) == "Micro Goal" or is_goal_type(goal, "MicroGoal")


def goal_uses_child_completion(goal) -> bool:
    if getattr(goal, "completed_via_children", False):
        return True
    level = getattr(goal, "level", None)
    return bool(level and getattr(level, "auto_complete_when_children_done", False))


def resolve_completed_via_children(data, level_obj) -> bool:
    if data.get("completed_via_children"):
        return True
    return bool(level_obj and getattr(level_obj, "auto_complete_when_children_done", False))


def should_inherit_parent_activities(goal, parent_goal, explicit_value=None) -> bool:
    if explicit_value is not None:
        return bool(explicit_value)
    return bool(
        parent_goal
        and getattr(goal, "parent_id", None)
        and is_nano_goal(goal)
    )


def active_targets(goal) -> list:
    return [target for target in (getattr(goal, "targets_rel", None) or []) if getattr(target, "deleted_at", None) is None]


def all_active_targets_completed(goal) -> bool:
    targets = active_targets(goal)
    return bool(targets) and all(getattr(target, "completed", False) for target in targets)


def goal_allows_manual_completion(goal) -> bool:
    if getattr(goal, "allow_manual_completion", True) is False:
        return False
    level = getattr(goal, "level", None)
    if level and getattr(level, "allow_manual_completion", True) is False:
        return False
    return True


def goal_requires_smart_validation(goal) -> bool:
    level = getattr(goal, "level", None)
    return bool(level and getattr(level, "requires_smart", False))
