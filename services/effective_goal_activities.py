"""Canonical effective goal/activity association resolution.

This module owns direct, linked-group, descendant, and enabled-parent
inheritance semantics so session and goal surfaces cannot drift.
"""


def _upsert_activity(
    activity,
    activities_map,
    *,
    is_inherited,
    source_name=None,
    source_goal_id=None,
    from_linked_group=False,
    direction=None,
):
    entry = activities_map.get(activity.id)
    if entry is None:
        activities_map[activity.id] = {
            "id": activity.id,
            "name": activity.name,
            "description": activity.description,
            "group_id": activity.group_id,
            "from_linked_group": from_linked_group,
            "has_direct_association": not is_inherited,
            "inherited_from_children": direction == "child",
            "inherited_from_parent": direction == "parent",
            "inherited_source_goal_names": [source_name] if direction == "child" and source_name else [],
            "inherited_source_goal_ids": [source_goal_id] if direction == "child" and source_goal_id else [],
            "is_inherited": is_inherited,
            "source_goal_name": source_name if is_inherited else None,
            "source_goal_id": source_goal_id if is_inherited else None,
        }
        return

    if is_inherited:
        if direction == "parent":
            entry["inherited_from_parent"] = True
        else:
            entry["inherited_from_children"] = True
            if source_name and source_name not in entry["inherited_source_goal_names"]:
                entry["inherited_source_goal_names"].append(source_name)
            if source_goal_id and source_goal_id not in entry["inherited_source_goal_ids"]:
                entry["inherited_source_goal_ids"].append(source_goal_id)
        if entry["source_goal_name"] is None and source_name:
            entry["source_goal_name"] = source_name
        if entry["source_goal_id"] is None and source_goal_id:
            entry["source_goal_id"] = source_goal_id
        return

    entry["has_direct_association"] = True
    entry["is_inherited"] = False
    entry["from_linked_group"] = from_linked_group
    if not entry["inherited_from_children"]:
        entry["source_goal_name"] = None
        entry["source_goal_id"] = None


def _process_goal(goal, activities_map, *, is_inherited=False, source_name=None, direction=None):
    source_goal_id = goal.id if is_inherited else None
    for activity in goal.associated_activities or []:
        if not activity.deleted_at:
            _upsert_activity(
                activity,
                activities_map,
                is_inherited=is_inherited,
                source_name=source_name,
                source_goal_id=source_goal_id,
                direction=direction,
            )

    group_queue = list(goal.associated_activity_groups or [])
    seen_group_ids = set()
    while group_queue:
        group = group_queue.pop(0)
        if group.id in seen_group_ids or group.deleted_at:
            continue
        seen_group_ids.add(group.id)
        group_queue.extend(group.children or [])
        for activity in group.activities or []:
            if activity.deleted_at:
                continue
            _upsert_activity(
                activity,
                activities_map,
                is_inherited=is_inherited,
                source_name=source_name,
                source_goal_id=source_goal_id,
                from_linked_group=True,
                direction=direction,
            )


def resolve_effective_activity_entries(goal, goals_by_id):
    activities = {}
    _process_goal(goal, activities)

    stack = [goal]
    while stack:
        current = stack.pop(0)
        for child in current.children or []:
            if child.deleted_at:
                continue
            _process_goal(
                child,
                activities,
                is_inherited=True,
                source_name=child.name,
                direction="child",
            )
            stack.append(child)

    if goal.inherit_parent_activities and goal.parent_id:
        parent = goals_by_id.get(goal.parent_id)
        if parent and not parent.deleted_at:
            _process_goal(
                parent,
                activities,
                is_inherited=True,
                source_name=parent.name,
                direction="parent",
            )

    return list(activities.values())


def resolve_effective_goals_by_activity(goals_by_id, activity_ids):
    requested_ids = {str(activity_id) for activity_id in activity_ids if activity_id}
    result = {activity_id: [] for activity_id in requested_ids}
    if not requested_ids:
        return result

    for goal in goals_by_id.values():
        if goal.deleted_at:
            continue
        for entry in resolve_effective_activity_entries(goal, goals_by_id):
            activity_id = str(entry["id"])
            if activity_id in requested_ids:
                result[activity_id].append(goal)
    return result
