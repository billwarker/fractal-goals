"""Pure goal-alignment projections shared by program metrics and day review."""

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


def alignment_facts(evidence):
    """Summarize how much completed activity evidence served program goals.

    Duration is the basis when any evidence is timed; otherwise the ratio falls
    back to activity counts so untimed practice still reports alignment.
    """
    aligned = [item for item in evidence if item["in_scope_ids"]]
    total_seconds = sum(item["duration"] for item in evidence)
    aligned_seconds = sum(item["duration"] for item in aligned)
    basis = "duration" if total_seconds > 0 else "count"
    if basis == "duration":
        ratio = aligned_seconds / total_seconds
    else:
        ratio = len(aligned) / len(evidence) if evidence else None
    return {
        "aligned_seconds": aligned_seconds,
        "total_seconds": total_seconds,
        "aligned_activity_count": len(aligned),
        "activity_count": len(evidence),
        "aligned_ratio": round(ratio, 4) if ratio is not None else None,
        "basis": basis,
    }


def session_alignment(evidence):
    facts = alignment_facts(evidence)
    return {
        **facts,
        "goal_ids": sorted({goal_id for item in evidence for goal_id in item["in_scope_ids"]}),
    }
