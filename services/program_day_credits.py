"""Bounded loaders for program-day session credit evaluation.

Every caller of the canonical occurrence evaluator loads its candidate sessions
and stored credit rows through this module so calendar, metrics, day review and
Create Session day options attribute the same sessions to the same occurrences.
"""

from collections import defaultdict
from datetime import datetime, time, timedelta, timezone

from sqlalchemy import and_, func, or_
from sqlalchemy.orm import selectinload

from models import ActivityInstance, ActivitySet, ProgramDaySessionCredit, Session


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
        for day in program.days or []
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


def program_activity_ids(programs):
    """Activities any program-day definition in ``programs`` asks for."""
    return {
        condition.activity_definition_id
        for program in programs or []
        for day in program.days or []
        for condition in getattr(day, 'activity_conditions', None) or []
    }


def load_program_activity_evidence(db_session, root_id, owner_id, programs, utc_start, utc_end, zone):
    """Completed instances of the activities ``programs`` ask for, in any of the owner's sessions,
    by the session's local date: ``{date: {activity_id: [EvidenceInstance]}}``.

    One query for the window; an instance counts on its session's date, as a session credit does.
    """
    from services.goal_condition_evidence import to_tag_evidence
    from services.program_day_occurrences import effective_session_date

    activity_ids = program_activity_ids(programs)
    evidence = defaultdict(lambda: defaultdict(list))
    if not activity_ids:
        return evidence
    effective = effective_session_timestamp()
    rows = db_session.query(ActivityInstance).join(Session, Session.id == ActivityInstance.session_id).options(
        selectinload(ActivityInstance.tags),
        selectinload(ActivityInstance.sets).selectinload(ActivitySet.tags),
        selectinload(ActivityInstance.session),
    ).filter(
        ActivityInstance.root_id == root_id,
        ActivityInstance.activity_definition_id.in_(activity_ids),
        ActivityInstance.completed.is_(True),
        ActivityInstance.deleted_at.is_(None),
        Session.owner_id == owner_id,
        Session.deleted_at.is_(None),
        effective >= utc_start,
        effective < utc_end,
    ).all()
    for instance in rows:
        day_value = effective_session_date(instance.session, zone)
        if day_value is not None:
            evidence[day_value][instance.activity_definition_id].append(to_tag_evidence(instance))
    return evidence


def activity_condition_met(rule, instances):
    """A day's activity condition: any completed instance that date, narrowed by its tags."""
    from services.goal_condition_evaluator import counted_sets

    if not rule['tag_ids']:
        return bool(instances)
    return any(counted_sets(instance, rule['tag_ids'], rule['tag_match']).sets for instance in instances)


def credited_block_ids_by_session(day_facts):
    """Map each credited session ID to the block IDs of the occurrences it satisfies."""
    grouped = defaultdict(set)
    for fact in day_facts:
        for occurrence in fact["occurrences"]:
            if occurrence["block"] is None:
                continue
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
