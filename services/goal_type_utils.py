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
    logging.getLogger(__name__).warning(
        "get_canonical_goal_type: goal %s has no attached level; returning None. "
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
        "NanoGoal": "Nano Goal"
    }
    return name_map.get(canonical_type)
