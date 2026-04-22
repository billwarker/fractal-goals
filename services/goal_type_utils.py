"""
Utility functions for determining the canonical goal type and level names,
especially for backward compatibility with goals that lack an explicit level_id.
"""

def get_canonical_goal_type(goal):
    """
    Returns the string type used by the frontend (e.g., 'UltimateGoal', 'ShortTermGoal').
    Derived from the goal's attached level. Returns None if no level is attached —
    the depth-based fallback was removed in migration 94008ce509bb which backfills
    level_id for all existing goals.
    """
    import logging
    known = {
        "ultimategoal": "UltimateGoal",
        "longtermgoal": "LongTermGoal",
        "midtermgoal": "MidTermGoal",
        "shorttermgoal": "ShortTermGoal",
        "immediategoal": "ImmediateGoal",
        "microgoal": "MicroGoal",
        "nanogoal": "NanoGoal",
    }

    level = getattr(goal, 'level', None)
    if level and getattr(level, 'name', None):
        normalized = ''.join(ch for ch in level.name.lower() if ch.isalnum())
        if normalized in known:
            return known[normalized]

    goal_id = getattr(goal, 'id', '<unknown>')
    depth = 0
    current = goal
    while current:
        parent_id = getattr(current, 'parent_id', None)
        parent = getattr(current, 'parent', None)
        if not parent_id and parent is None:
            break
        depth += 1
        current = parent
        if current is None:
            break

    fallback_by_depth = {
        0: "UltimateGoal",
        1: "LongTermGoal",
        2: "MidTermGoal",
        3: "ShortTermGoal",
        4: "ImmediateGoal",
        5: "MicroGoal",
        6: "NanoGoal",
    }
    fallback = fallback_by_depth.get(depth)
    if fallback:
        logging.getLogger(__name__).warning(
            "get_canonical_goal_type: goal %s has no attached level; falling back to %s by depth. "
            "Run migration 94008ce509bb to backfill level_id.",
            goal_id,
            fallback,
        )
        return fallback

    logging.getLogger(__name__).warning(
        "get_canonical_goal_type: goal %s has no attached level and no fallback depth match; returning None. "
        "Run migration 94008ce509bb to backfill level_id.",
        goal_id,
    )
    return None


def get_canonical_goal_level_name(goal):
    """
    Returns the human-readable string level name (e.g., 'Ultimate Goal').
    Returns None if no level is attached.
    """
    level = getattr(goal, 'level', None)
    if level and getattr(level, 'name', None):
        return level.name

    canonical_type = get_canonical_goal_type(goal)
    if canonical_type is None:
        return None
    name_map = {
        "UltimateGoal": "Ultimate Goal",
        "LongTermGoal": "Long Term Goal",
        "MidTermGoal": "Mid Term Goal",
        "ShortTermGoal": "Short Term Goal",
        "ImmediateGoal": "Immediate Goal",
        "MicroGoal": "Micro Goal",
        "NanoGoal": "Nano Goal",
    }
    return name_map.get(canonical_type)
