from services.goal_type_utils import get_canonical_goal_level_name, get_canonical_goal_type


def get_goal_level_name(goal) -> str | None:
    level = getattr(goal, "level", None)
    if level and getattr(level, "name", None):
        return level.name
    return get_canonical_goal_level_name(goal)


def is_goal_type(goal, canonical_type: str) -> bool:
    return get_canonical_goal_type(goal) == canonical_type


def should_inherit_parent_activities(goal, parent_goal, explicit_value=None) -> bool:
    if explicit_value is not None:
        return bool(explicit_value)
    return False


def goal_completes_via_children(goal) -> bool:
    return getattr(goal, "completion_condition", None) == "children"


def goal_requires_smart_validation(goal) -> bool:
    level = getattr(goal, "level", None)
    return bool(level and getattr(level, "requires_smart", False))
