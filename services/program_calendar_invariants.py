"""Program calendar invariants: blocks never overlap, and a date holds one program day.

Every calendar write (block create/update, day create/update/copy/schedule,
program date changes) calls these guards inside its transaction, after taking
the program row lock, so two concurrent writes cannot both pass. Block overlap
is also backed by a Postgres exclusion constraint; the one-day-per-date rule
depends on weekday expansion and is enforced here only.
"""

from __future__ import annotations

from datetime import date
from types import SimpleNamespace

from models import Program, ProgramBlock, ProgramDay, ProgramDayOccurrenceSchedule
from services.program_day_occurrences import build_occurrences, date_part
from services.program_service_errors import ProgramServiceValidationError

BLOCK_INVALID_DATES = 'program_block_invalid_dates'
BLOCK_OVERLAP = 'program_block_overlap'
DAY_DATE_CONFLICT = 'program_day_date_conflict'
BLOCK_OVERLAP_CONSTRAINT = 'ex_program_blocks_no_overlap'
MAX_REPORTED_CONFLICTS = 20


def lock_program_calendar(session, program_id, root_id=None):
    """Take the program row lock that serializes every calendar write for one program."""
    query = session.query(Program).filter(Program.id == program_id)
    if root_id is not None:
        query = query.filter(Program.root_id == root_id)
    if hasattr(Program, 'deleted_at'):
        query = query.filter(Program.deleted_at.is_(None))
    return query.populate_existing().with_for_update().first()


def _format_day(value):
    return f"{value.strftime('%b')} {value.day}, {value.year}"


def assert_block_dates_valid(program, start_date, end_date):
    start_date, end_date = date_part(start_date), date_part(end_date)
    if (start_date is None) != (end_date is None):
        raise ProgramServiceValidationError({
            'error': 'A block needs both a start date and an end date.',
            'code': BLOCK_INVALID_DATES,
            'field': 'start_date' if start_date is None else 'end_date',
        }, 400)
    if start_date is None:
        return
    if end_date < start_date:
        raise ProgramServiceValidationError({
            'error': "A block's end date must be on or after its start date.",
            'code': BLOCK_INVALID_DATES,
            'field': 'end_date',
        }, 400)
    program_start, program_end = date_part(program.start_date), date_part(program.end_date)
    if program_start and start_date < program_start:
        raise ProgramServiceValidationError({
            'error': f"A block can't start before its program ({_format_day(program_start)}).",
            'code': BLOCK_INVALID_DATES,
            'field': 'start_date',
        }, 400)
    if program_end and end_date > program_end:
        raise ProgramServiceValidationError({
            'error': f"A block can't end after its program ({_format_day(program_end)}).",
            'code': BLOCK_INVALID_DATES,
            'field': 'end_date',
        }, 400)


def block_overlap_error(conflicts):
    first = conflicts[0]
    return ProgramServiceValidationError({
        'error': (
            f"Blocks can't overlap. {first['name']} already covers "
            f"{_format_day(date_part(first['start_date']))} – {_format_day(date_part(first['end_date']))}."
        ),
        'code': BLOCK_OVERLAP,
        'conflicts': [
            {**conflict, 'start_date': date_part(conflict['start_date']).isoformat(),
             'end_date': date_part(conflict['end_date']).isoformat()}
            for conflict in conflicts
        ],
    }, 409)


def assert_no_block_overlap(session, program_id, start_date, end_date, exclude_block_id=None):
    start_date, end_date = date_part(start_date), date_part(end_date)
    if start_date is None or end_date is None:
        return
    query = session.query(ProgramBlock).filter(
        ProgramBlock.program_id == program_id,
        ProgramBlock.start_date.isnot(None),
        ProgramBlock.end_date.isnot(None),
        ProgramBlock.start_date <= end_date,
        ProgramBlock.end_date >= start_date,
    )
    if exclude_block_id:
        query = query.filter(ProgramBlock.id != exclude_block_id)
    overlapping = query.order_by(ProgramBlock.start_date).all()
    if overlapping:
        raise block_overlap_error([
            {'block_id': block.id, 'name': block.name, 'start_date': block.start_date, 'end_date': block.end_date}
            for block in overlapping
        ])


def assert_blocks_within_program(session, program_id, program_start, program_end):
    """Program date changes may not strand a dated block outside the program."""
    program_start, program_end = date_part(program_start), date_part(program_end)
    stranded = session.query(ProgramBlock).filter(
        ProgramBlock.program_id == program_id,
        ProgramBlock.start_date.isnot(None),
        ProgramBlock.end_date.isnot(None),
        (ProgramBlock.start_date < program_start) | (ProgramBlock.end_date > program_end),
    ).order_by(ProgramBlock.start_date).first()
    if stranded:
        raise ProgramServiceValidationError({
            'error': (
                f"{stranded.name} runs {_format_day(date_part(stranded.start_date))} – "
                f"{_format_day(date_part(stranded.end_date))}, outside the new program dates. "
                "Move or shorten the block first."
            ),
            'code': BLOCK_INVALID_DATES,
            'field': 'start_date' if date_part(stranded.start_date) < program_start else 'end_date',
        }, 400)


def _calendar_snapshot(session, program_id):
    """Read the flushed calendar as plain rows, independent of stale ORM collections."""
    program = session.query(Program.start_date, Program.end_date).filter(Program.id == program_id).one()
    block_rows = session.query(
        ProgramBlock.id, ProgramBlock.name, ProgramBlock.start_date, ProgramBlock.end_date,
    ).filter(ProgramBlock.program_id == program_id).all()
    block_ids = [row.id for row in block_rows]
    day_rows = session.query(
        ProgramDay.id, ProgramDay.block_id, ProgramDay.name, ProgramDay.day_number,
        ProgramDay.date, ProgramDay.day_of_week,
    ).filter(ProgramDay.block_id.in_(block_ids)).all() if block_ids else []
    day_ids = [row.id for row in day_rows]
    schedules_by_day = {}
    if day_ids:
        for day_id, scheduled in session.query(
            ProgramDayOccurrenceSchedule.program_day_id, ProgramDayOccurrenceSchedule.date,
        ).filter(ProgramDayOccurrenceSchedule.program_day_id.in_(day_ids)).all():
            schedules_by_day.setdefault(day_id, []).append(SimpleNamespace(date=scheduled))
    days_by_block = {}
    for row in day_rows:
        days_by_block.setdefault(row.block_id, []).append(SimpleNamespace(
            id=row.id, name=row.name, day_number=row.day_number, date=row.date,
            day_of_week=row.day_of_week, occurrence_schedules=schedules_by_day.get(row.id, []),
        ))
    return program, SimpleNamespace(blocks=[
        SimpleNamespace(
            id=row.id, name=row.name, start_date=row.start_date, end_date=row.end_date,
            days=days_by_block.get(row.id, []),
        )
        for row in block_rows
    ])


def find_program_day_date_conflicts(calendar, start, end):
    """Return one conflict row per definition on every date holding more than one."""
    conflicts = []
    grouped = build_occurrences(calendar, start, end)
    for occurrence_date in sorted(grouped):
        entries = grouped[occurrence_date]
        if len(entries) < 2:
            continue
        for entry in entries:
            day = entry['program_day']
            conflicts.append({
                'date': occurrence_date.isoformat(),
                'day_id': day.id,
                'day_name': day.name or f"Day {day.day_number or ''}".strip(),
                'block_id': entry['block'].id,
            })
    return conflicts


def assert_single_program_day_per_date(session, program_id):
    """Run after flushing a write: reject it when any date now holds two program days."""
    session.flush()
    program, calendar = _calendar_snapshot(session, program_id)
    block_dates = [
        value
        for block in calendar.blocks
        for value in (date_part(block.start_date), date_part(block.end_date))
        if value
    ]
    legacy_dates = [
        date_part(day.date) for block in calendar.blocks for day in block.days if day.date
    ]
    bounds = [value for value in (date_part(program.start_date), date_part(program.end_date)) if value]
    candidates = bounds + block_dates + legacy_dates
    if not candidates:
        return
    conflicts = find_program_day_date_conflicts(calendar, min(candidates), max(candidates))
    if not conflicts:
        return
    first_date = conflicts[0]['date']
    names = [row['day_name'] for row in conflicts if row['date'] == first_date]
    conflict_dates = sorted({row['date'] for row in conflicts})
    extra = len(conflict_dates) - 1
    first_label = _format_day(date.fromisoformat(first_date))
    message = (
        f"{first_label} would hold {' and '.join(names)}. A date can hold only one program day."
    )
    if extra > 0:
        message += f" {extra} more date{'s' if extra != 1 else ''} conflict too."
    raise ProgramServiceValidationError({
        'error': message,
        'code': DAY_DATE_CONFLICT,
        'conflict_count': len(conflict_dates),
        'conflicts': conflicts[:MAX_REPORTED_CONFLICTS],
    }, 409)


def flush_block_dates(session, block):
    """Flush a block's dates in a savepoint, mapping the DB overlap backstop to the service error."""
    from sqlalchemy.exc import IntegrityError

    try:
        with session.begin_nested():
            session.flush()
    except IntegrityError as exc:
        if BLOCK_OVERLAP_CONSTRAINT not in str(getattr(exc, 'orig', exc)):
            raise
        raise ProgramServiceValidationError({
            'error': "Blocks can't overlap. Another block already covers these dates.",
            'code': BLOCK_OVERLAP,
            'conflicts': [],
        }, 409) from exc
