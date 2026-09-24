"""Timestamp formatting and SMART status shared by every serializer module.
"""

from datetime import datetime, timezone, date
from .goal_domain_rules import goal_uses_child_completion


def format_utc(dt):
    """Format a datetime or date object to ISO string with UTC indicator."""
    if not dt: return None
    # If it's just a date object, return YYYY-MM-DD
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.isoformat()
    # If it's a naive datetime, assume UTC and append Z
    if dt.tzinfo is None:
        return dt.isoformat(timespec='seconds') + 'Z'
    # If aware, ensure UTC and use Z suffix
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def format_utc_precise(dt):
    """Preserve sub-second ledger boundaries used by historical corrections."""
    if not dt:
        return None
    normalized = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return normalized.isoformat(timespec='microseconds').replace('+00:00', 'Z')


def calculate_smart_status(goal):
    """Calculate SMART criteria status for a goal."""
    # Source of truth: relational targets.
    targets = [t for t in (goal.targets_rel or []) if t.deleted_at is None]
    
    # Achievable: has associated activities OR has associated activity groups OR completed via children
    if goal.track_activities:
        has_activities = len(goal.associated_activities) > 0 if goal.associated_activities else False
        has_groups = len(goal.associated_activity_groups) > 0 if goal.associated_activity_groups else False
        uses_child_completion = goal_uses_child_completion(goal)
        is_achievable = has_activities or has_groups or uses_child_completion
        is_measurable = len(targets) > 0 or uses_child_completion
    else:
        is_achievable = True
        is_measurable = True
    
    return {
        "specific": bool(goal.description and goal.description.strip()),
        "measurable": is_measurable,
        "achievable": is_achievable,
        "relevant": bool(goal.relevance_statement and goal.relevance_statement.strip()),
        "time_bound": goal.deadline is not None
    }
