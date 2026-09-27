"""Root-wide completed-session loading shared by the program calendar read models."""

from collections import defaultdict

from sqlalchemy.orm import selectinload

from models import Session
from services.program_day_credits import effective_session_timestamp, local_date_utc_bounds
from services.program_day_occurrences import effective_session_date


def load_completed_sessions_by_date(db_session, root_id, current_user_id, start, end, zone):
    """Completed sessions of the owner in any program, bucketed by local date."""
    grouped = defaultdict(list)
    if end < start:
        return grouped
    utc_start, utc_end = local_date_utc_bounds(start, end, zone)
    effective = effective_session_timestamp()
    rows = db_session.query(Session).options(selectinload(Session.template)).filter(
        Session.root_id == root_id,
        Session.owner_id == current_user_id,
        Session.deleted_at.is_(None),
        Session.completed.is_(True),
        effective >= utc_start,
        effective < utc_end,
    ).order_by(effective.asc(), Session.id.asc()).all()
    for session in rows:
        grouped[effective_session_date(session, zone)].append(session)
    return grouped
