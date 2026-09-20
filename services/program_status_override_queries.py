"""Bounded query helpers for occurrence-level program day statuses."""

from collections import defaultdict

from models import ProgramDayStatusOverride


def load_program_status_overrides(db_session, program_ids, start, end):
    """Load override rows for the requested programs and inclusive date window."""
    grouped = defaultdict(list)
    if not program_ids or start is None or end is None:
        return grouped
    rows = db_session.query(ProgramDayStatusOverride).filter(
        ProgramDayStatusOverride.program_id.in_(program_ids),
        ProgramDayStatusOverride.date >= start,
        ProgramDayStatusOverride.date <= end,
    ).all()
    for row in rows:
        grouped[row.program_id].append(row)
    return grouped
