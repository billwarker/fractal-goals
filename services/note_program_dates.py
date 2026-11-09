"""Notes on a program's calendar dates.

A program-date note targets one program (`context_id`, `program_id`) on one date inside it
(`calendar_date`). It is about the day in the program, not a program day: it stays on its date
whatever is scheduled, moved or unscheduled there.
"""
from datetime import date

from models import Note, Program
from services.program_day_occurrences import program_span
from services.service_types import JsonDict


def parse_calendar_date(value) -> date | None:
    if value is None or isinstance(value, date):
        return value
    try:
        return date.fromisoformat(str(value)[:10])
    except ValueError:
        return None


def validate_program_date_note(db_session, root_id, program_id, calendar_date) -> tuple[JsonDict | None, tuple[str, int] | None]:
    """The program must belong to this fractal and the date fall inside it."""
    target_date = parse_calendar_date(calendar_date)
    if not program_id or target_date is None:
        return None, ("program date notes require a context_id and a calendar_date", 400)
    program = db_session.query(Program).filter(Program.id == program_id, Program.root_id == root_id).first()
    if not program:
        return None, ("Program not found in this fractal", 400)
    start, end = program_span(program)
    if not (start and end and start <= target_date <= end):
        return None, (f"{target_date.isoformat()} is outside {program.name}", 400)
    return {'program': program, 'calendar_date': target_date}, None


def load_date_notes(db_session, program_id, calendar_date: date) -> list[Note]:
    """Live notes on one date of a program, newest first."""
    return db_session.query(Note).filter(
        Note.program_id == program_id,
        Note.context_type == 'program_date',
        Note.calendar_date == calendar_date,
        Note.deleted_at.is_(None),
    ).order_by(Note.created_at.desc()).all()
