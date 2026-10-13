"""Pure goal-evidence allocation for program metrics."""

from collections import defaultdict


def allocate_equal_split(items, goal_ids_of):
    """Allocate evidence to goals, splitting each item's duration equally.

    ``goal_ids_of(item)`` returns the goal IDs the item contributes to. Items
    with no goals are ignored by callers that pass an empty collection; callers
    that want an "unassociated" bucket return ``{None}``.
    """
    groups = defaultdict(lambda: {"instances": 0, "duration": 0.0, "last": None})
    for item in items:
        goal_ids = goal_ids_of(item)
        if not goal_ids:
            continue
        allocation = item["duration"] / len(goal_ids)
        for goal_id in goal_ids:
            row = groups[goal_id]
            row["instances"] += 1
            row["duration"] += allocation
            timestamp = item.get("timestamp")
            if timestamp is not None:
                row["last"] = max(filter(None, [row["last"], timestamp]))
    return groups
