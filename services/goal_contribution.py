from datetime import datetime, timezone


def as_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


def goal_suppresses_contribution(goal) -> bool:
    return bool(getattr(goal, 'frozen', False))


def goal_was_completed_before(goal, timestamp) -> bool:
    occurred_at = as_utc_datetime(timestamp)
    completed_at = as_utc_datetime(getattr(goal, 'completed_at', None))
    return bool(occurred_at and completed_at and completed_at < occurred_at)


def resolve_contribution_goal(goal, timestamp, goals_by_id=None):
    """Return the associated goal only if it can receive contribution at timestamp."""
    occurred_at = as_utc_datetime(timestamp)
    if not occurred_at or not goal:
        return None

    if goal_suppresses_contribution(goal):
        return None
    if goal_was_completed_before(goal, occurred_at):
        return None
    return goal
