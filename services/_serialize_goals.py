"""Goal serializer, including SMART status and the completion condition.
"""

from sqlalchemy import inspect as sa_inspect

from .goal_type_utils import get_canonical_goal_type
from services._serialize_common import calculate_smart_status, format_utc
from services.media_service import serialize_attachment


def _number(value):
    if value is None:
        return None
    number = float(value)
    return int(number) if number.is_integer() else number


def serialize_goal_condition(condition):
    """Serialize a live GoalCompletionCondition (or None)."""
    if condition is None or getattr(condition, 'deleted_at', None) is not None:
        return None
    activity = getattr(condition, 'activity', None)
    metric = getattr(condition, 'metric', None)
    return {
        "id": condition.id,
        "activity_definition_id": condition.activity_definition_id,
        "activity_name": getattr(activity, 'name', None),
        "name": condition.name,
        "kind": condition.kind,
        "measure": condition.measure,
        "min_sets": condition.min_sets,
        "required_count": condition.required_count,
        "metric_definition_id": condition.metric_definition_id,
        "metric_name": getattr(metric, 'name', None),
        "metric_unit": getattr(metric, 'unit', None),
        "operator": condition.operator,
        "target_value": _number(condition.target_value),
        "rules": [
            {
                "id": rule.id,
                "metric_definition_id": rule.metric_definition_id,
                "metric_name": getattr(rule.metric, 'name', None),
                "unit": getattr(rule.metric, 'unit', None),
                "operator": rule.operator,
                "value": _number(rule.value),
            }
            for rule in (condition.rules or [])
        ],
    }


def _pause_reason(goal):
    if not getattr(goal, 'paused', False):
        return None
    open_interval = next((interval for interval in (getattr(goal, 'pause_intervals', None) or []) if interval.resumed_at is None), None)
    return getattr(open_interval, 'reason', None) or 'manual'


def _review(goal):
    """The review schedule for levels that review goals (status computed in UTC; the client
    re-checks next_review_on against the user's today)."""
    from services.goal_review_rules import goal_review_state
    return goal_review_state(goal)


def _sequence_begun_by(goal):
    if not getattr(goal, 'sequence_track_id', None):
        return None
    from services.goal_sequence_service import sequence_begun_by_id
    return sequence_begun_by_id(goal)


def serialize_goal(goal, include_children=True):
    """Serialize a Goal object."""
    smart_status = calculate_smart_status(goal)

    goal_type = get_canonical_goal_type(goal)
    goal_level_name = getattr(goal.level, 'name', None) if getattr(goal, 'level', None) else None
    completion_state = {
        "completed": bool(goal.completed),
        "completed_at": format_utc(goal.completed_at),
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "source": getattr(goal, 'completion_source', None),
        "reason": getattr(goal, 'completion_reason', None),
        "manually_uncompleted_at": format_utc(getattr(goal, 'manually_uncompleted_at', None)),
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
        "completion_condition": goal.completion_condition,
        "condition": serialize_goal_condition(getattr(goal, 'condition', None)),
        "is_smart": all(smart_status.values()),
        "smart_status": smart_status,
        "paused": bool(getattr(goal, 'paused', False)),
        "paused_at": format_utc(getattr(goal, 'paused_at', None)),
        # 'sequence' while a sequence holds the goal until its predecessor completes, else 'manual'.
        "pause_reason": _pause_reason(goal),
        "description": goal.description,
        "deadline": format_utc(goal.deadline),
        "started_at": format_utc(getattr(goal, 'started_at', None)),
        "sequence_track_id": getattr(goal, 'sequence_track_id', None),
        "sequence_position": getattr(goal, 'sequence_position', None),
        # A goal has at most one live activity group (services/goal_activity_group_links.py).
        "activity_group_id": goal.associated_activity_groups[0].id if goal.associated_activity_groups else None,
        # Fields that exist nowhere else on the payload. Top-level fields are
        # canonical and are no longer duplicated here.
        "attributes": {
            "parent_id": goal.parent_id,
            "root_id": goal.root_id,
            "owner_id": getattr(goal, 'owner_id', None),
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "inherit_parent_activities": goal.inherit_parent_activities,
            "track_activities": goal.track_activities,
            "associated_activity_ids": [a.id for a in goal.associated_activities] if goal.associated_activities else [],
            "associated_activity_group_ids": [g.id for g in goal.associated_activity_groups] if goal.associated_activity_groups else [],
            "progress_settings": getattr(goal, 'progress_settings', None),
        },
        "children": []
    }

    if 'attachments' not in sa_inspect(goal).unloaded:
        # Description media, only when already loaded (e.g. the update response); never lazy-loaded here.
        result["attachments"] = [serialize_attachment(item) for item in goal.attachments]

    if getattr(goal, 'sequence_track_id', None):
        # The predecessor whose completion began this step, while it runs (Undo can re-pause it).
        result["sequence_begun_by"] = _sequence_begun_by(goal)
    review = _review(goal)
    if review is not None:
        # Only levels that review goals carry the schedule and its settings.
        result.update({
            "review": review,
            "review_cadence_value": goal.review_cadence_value,
            "review_cadence_unit": goal.review_cadence_unit,
            "review_disabled": bool(goal.review_disabled),
            "review_deferred_until": format_utc(goal.review_deferred_until),
        })
    if include_children:
        result["children"] = [serialize_goal(child) for child in goal.children if child.deleted_at is None]

    return result
