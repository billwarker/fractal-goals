"""Trust rules for the client's action time on replayed timer writes.

Clients that queue writes offline send ``occurred_at`` (when the user actually
tapped). The server accepts it only inside the window it can still apply
without rewriting history: never before the session's latest recorded timing
boundary, never after server time, and never from a queue older than
``MAX_CLIENT_LAG``.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from sqlalchemy import func

from models import SessionWorkInterval

MAX_CLIENT_LAG = timedelta(hours=24)


def utc_now_naive() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None)


def _naive_utc(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is not None:
        return value.astimezone(timezone.utc).replace(tzinfo=None)
    return value


def parse_client_datetime(value) -> datetime | None:
    if not value or not isinstance(value, str):
        return None
    try:
        parsed = datetime.fromisoformat(value.strip().replace('Z', '+00:00'))
    except ValueError:
        return None
    return _naive_utc(parsed)


def session_timing_floor(db_session, session) -> datetime | None:
    """Latest boundary already recorded for the session's timers."""
    latest_interval = db_session.query(
        func.max(func.coalesce(SessionWorkInterval.ended_at, SessionWorkInterval.started_at)),
    ).filter(SessionWorkInterval.session_id == session.id).scalar()
    candidates = [
        _naive_utc(getattr(session, 'session_start', None)),
        _naive_utc(getattr(session, 'last_paused_at', None)),
        _naive_utc(latest_interval),
    ]
    present = [candidate for candidate in candidates if candidate is not None]
    return max(present) if present else None


def resolve_occurred_at(db_session, session, raw_value, *, now=None, extra_floor=None):
    """Return ``(timestamp, error)``; absent input keeps the server-time behaviour."""
    now = now or utc_now_naive()
    if raw_value in (None, ''):
        return now, None

    occurred_at = parse_client_datetime(raw_value)
    if occurred_at is None:
        return None, "occurred_at must be an ISO 8601 timestamp"
    if now - occurred_at > MAX_CLIENT_LAG:
        return None, "occurred_at is too old to apply; refresh the session and re-enter the change"
    if occurred_at > now:
        return now, None

    floors = [session_timing_floor(db_session, session) if session is not None else None, _naive_utc(extra_floor)]
    floor = max((value for value in floors if value is not None), default=None)
    if floor is not None and occurred_at < floor:
        occurred_at = min(floor, now)
    return occurred_at, None
