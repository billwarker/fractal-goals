"""Bounded loaders for program-day session credit evaluation.

Every caller of the canonical occurrence evaluator loads its candidate sessions
and stored credit rows through this module so calendar, metrics, day review and
Create Session day options attribute the same sessions to the same occurrences.
"""

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import and_, func, or_

from models import ProgramDaySessionCredit, Session


def effective_session_timestamp():
    return func.coalesce(Session.session_start, Session.completed_at, Session.created_at)


def local_date_utc_bounds(start, end, zone):
    """Return the UTC half-open bounds covering local dates ``start..end``."""
    return (
        datetime.combine(start, time.min, tzinfo=zone).astimezone(timezone.utc),
        datetime.combine(end + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc),
    )


def program_template_ids(program):
    """Template IDs any program-day definition in ``program`` can schedule."""
    return {
        link.session_template_id
        for block in program.blocks or []
        for day in block.days or []
        for link in day.template_links or []
        if link.session_template_id
    }


def load_program_session_credits(db_session, program_ids, start, end):
    """Load stored credit rows for the programs and inclusive local-date window."""
    grouped = defaultdict(list)
    program_ids = list(program_ids or [])
    if not program_ids or start is None or end is None:
        return grouped
    rows = db_session.query(ProgramDaySessionCredit).filter(
        ProgramDaySessionCredit.program_id.in_(program_ids),
        ProgramDaySessionCredit.date >= start,
        ProgramDaySessionCredit.date <= end,
    ).all()
    for row in rows:
        grouped[row.program_id].append(row)
    return grouped


def load_program_credit_candidates(
    db_session, root_id, owner_id, programs, utc_start, utc_end, credits_by_program,
    *, options=(),
):
    """Load, in one query, every session that may be credited to ``programs``.

    Candidates are sessions linked to a program, unlinked sessions using a
    template the program schedules, and sessions named by stored credit rows.
    The evaluator decides which candidates actually receive credit.
    """
    programs = list(programs or [])
    grouped = {program.id: [] for program in programs}
    if not programs:
        return grouped
    template_ids_by_program = {program.id: program_template_ids(program) for program in programs}
    credit_session_ids_by_program = {
        program.id: {row.session_id for row in credits_by_program.get(program.id, [])}
        for program in programs
    }
    all_template_ids = set().union(*template_ids_by_program.values())
    all_credit_session_ids = set().union(*credit_session_ids_by_program.values())
    clauses = [Session.program_id.in_(list(grouped))]
    if all_template_ids:
        clauses.append(and_(Session.program_id.is_(None), Session.template_id.in_(all_template_ids)))
    if all_credit_session_ids:
        clauses.append(Session.id.in_(all_credit_session_ids))
    effective = effective_session_timestamp()
    rows = db_session.query(Session).options(*options).filter(
        Session.root_id == root_id,
        Session.owner_id == owner_id,
        Session.deleted_at.is_(None),
        effective >= utc_start,
        effective < utc_end,
        or_(*clauses),
    ).order_by(effective.asc(), Session.id.asc()).all()
    for session in rows:
        for program in programs:
            if (
                session.program_id == program.id
                or (session.program_id is None and session.template_id in template_ids_by_program[program.id])
                or session.id in credit_session_ids_by_program[program.id]
            ):
                grouped[program.id].append(session)
    return grouped


def credited_block_ids_by_session(day_facts):
    """Map each credited session ID to the block IDs of the occurrences it satisfies."""
    grouped = defaultdict(set)
    for fact in day_facts:
        for occurrence in fact["occurrences"]:
            for entry in occurrence["credits"]:
                grouped[entry["session"].id].add(occurrence["block"].id)
    return grouped


def completed_credits_by_occurrence_template(day_facts):
    """Map ``(program_day_id, date, template_id)`` to completed credited sessions."""
    grouped = defaultdict(list)
    for fact in day_facts:
        for occurrence in fact["occurrences"]:
            for entry in occurrence["credits"]:
                if entry["session"].completed:
                    grouped[(occurrence["program_day"].id, fact["date"], entry["template_id"])].append(
                        entry["session"]
                    )
    return grouped
