from datetime import datetime, timezone


def as_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def goal_suppresses_contribution(goal) -> bool:
    return bool(getattr(goal, 'paused', False))


def goal_was_completed_before(goal, timestamp) -> bool:
    occurred_at = as_utc_datetime(timestamp)
    completed_at = as_utc_datetime(getattr(goal, 'completed_at', None))
    return bool(occurred_at and completed_at and completed_at < occurred_at)


def goal_was_paused_at(goal, timestamp) -> bool:
    """True if the timestamp falls inside any of the goal's pause windows.

    An open interval (resumed_at is None) covers everything from paused_at onward.
    Activity that occurred while a goal was paused must never count as evidence,
    even after the goal is resumed.
    """
    occurred_at = as_utc_datetime(timestamp)
    if not occurred_at or not goal:
        return False

    intervals = getattr(goal, 'pause_intervals', None) or []
    for interval in intervals:
        paused_at = as_utc_datetime(getattr(interval, 'paused_at', None))
        if not paused_at or occurred_at < paused_at:
            continue
        resumed_at = as_utc_datetime(getattr(interval, 'resumed_at', None))
        if resumed_at is None or occurred_at < resumed_at:
            return True
    return False


def resolve_contribution_goal(goal, timestamp, goals_by_id=None):
    """Return the associated goal only if it can receive contribution at timestamp."""
    occurred_at = as_utc_datetime(timestamp)
    if not occurred_at or not goal:
        return None

    if goal_suppresses_contribution(goal):
        return None
    if goal_was_completed_before(goal, occurred_at):
        return None
    if goal_was_paused_at(goal, occurred_at):
        return None
    return goal
