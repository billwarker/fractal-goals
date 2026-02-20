"""
Utility functions for determining the canonical goal type and level names,
especially for backward compatibility with goals that lack an explicit level_id.
"""

def get_canonical_goal_type(goal):
    """
    Returns the string type used by the frontend (e.g., 'UltimateGoal', 'ShortTermGoal').
    If a level is attached, its name is normalized to this format.
    If no level is attached (legacy), tree depth is used.
    """
    known = {
        "ultimategoal": "UltimateGoal",
        "longtermgoal": "LongTermGoal",
        "midtermgoal": "MidTermGoal",
        "shorttermgoal": "ShortTermGoal",
        "immediategoal": "ImmediateGoal",
        "microgoal": "MicroGoal",
        "nanogoal": "NanoGoal",
    }
    
    # Check explicitly attached level first
    level = getattr(goal, 'level', None)
    if level and getattr(level, 'name', None):
        normalized = ''.join(ch for ch in level.name.lower() if ch.isalnum())
        if normalized in known:
            return known[normalized]

    # Fallback for goals lacking an explicit level_id (legacy)
    depth = 0
    current = goal
    while getattr(current, 'parent', None) is not None and depth < 10:
        depth += 1
        current = current.parent
        
    type_by_depth = {
        0: "UltimateGoal",
        1: "LongTermGoal",
        2: "MidTermGoal",
        3: "ShortTermGoal",
        4: "ImmediateGoal",
        5: "MicroGoal",
    }
    return type_by_depth.get(depth, "NanoGoal")


def get_canonical_goal_level_name(goal):
    """
    Returns the human-readable string level name (e.g., 'Ultimate Goal').
    """
    # If explicit level is present, use it
    level = getattr(goal, 'level', None)
    if level and getattr(level, 'name', None):
        return level.name
        
    # Translate from canonical type if missing
    canonical_type = get_canonical_goal_type(goal)
    name_map = {
        "UltimateGoal": "Ultimate Goal",
        "LongTermGoal": "Long Term Goal",
        "MidTermGoal": "Mid Term Goal",
        "ShortTermGoal": "Short Term Goal",
        "ImmediateGoal": "Immediate Goal",
        "MicroGoal": "Micro Goal",
        "NanoGoal": "Nano Goal"
    }
    return name_map.get(canonical_type, "Goal")
