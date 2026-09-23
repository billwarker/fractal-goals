"""Canonical program-day occurrence completion and chain semantics."""

from __future__ import annotations

from collections import defaultdict
from datetime import date, datetime, timedelta

from models.program import get_program_day_template_rules


def date_part(value):
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def iter_dates(start: date, end: date):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def effective_session_date(session, zone):
    value = (
        getattr(session, "session_start", None)
        or getattr(session, "completed_at", None)
        or getattr(session, "created_at", None)
        or getattr(session, "effective_at", None)
    )
    if value is None:
        return None
    if value.tzinfo is None:
        from datetime import timezone
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(zone).date()


def explicit_schedule_dates(day):
    """Dates a reusable definition was explicitly scheduled on."""
    return {
        date_part(row.date)
        for row in getattr(day, "occurrence_schedules", None) or []
        if getattr(row, "date", None)
    }


def _within_block(block, target_date):
    block_start = date_part(block.start_date)
    block_end = date_part(block.end_date)
    return bool(block_start and block_end and block_start <= target_date <= block_end)


def program_day_scheduled_on(day, block, target_date):
    if day.date:
        return date_part(day.date) == target_date
    if not _within_block(block, target_date):
        return False
    if target_date in explicit_schedule_dates(day):
        return True
    names = day.day_of_week if isinstance(day.day_of_week, list) else (
        [day.day_of_week] if day.day_of_week else []
    )
    return bool(names and target_date.strftime("%A") in names)


def program_day_explicitly_scheduled_on(day, block, target_date):
    """True only for an explicit schedule row, not a dated or weekday definition."""
    return (
        not day.date
        and _within_block(block, target_date)
        and target_date in explicit_schedule_dates(day)
    )


def build_occurrences(program, start: date, end: date):
    """Return scheduled occurrences grouped by local date."""
    grouped = defaultdict(list)
    for block in program.blocks or []:
        block_start = max(start, date_part(block.start_date) or start)
        block_end = min(end, date_part(block.end_date) or end)
        if block_start > block_end:
            continue
        for day in block.days or []:
            if day.date:
                candidates = [date_part(day.date)]
            elif day.day_of_week:
                candidates = iter_dates(block_start, block_end)
            else:
                candidates = sorted(explicit_schedule_dates(day))
            for day_value in candidates:
                if not day_value or not (start <= day_value <= end):
                    continue
                if program_day_scheduled_on(day, block, day_value):
                    grouped[day_value].append({"program_day": day, "block": block})
    return grouped


def _session_counts_for_program(session, program_id):
    session_program_id = getattr(session, "program_id", None)
    return session_program_id is None or session_program_id == program_id


def resolve_occurrence_credits(occurrences_by_date, sessions, zone, *, program_id=None, session_credits=None):
    """Attribute sessions to scheduled occurrences with an explicit credit source.

    Precedence for one (date, session): a stored exclusion removes an automatic
    credit; a stored manual credit counts the session as its chosen scheduled
    template; otherwise an exact program-day link wins; otherwise a completed or
    running session whose template is scheduled that date is template-matched,
    unless it is explicitly linked to a different program. Stored rows are
    dormant when the session's effective local date or the schedule no longer
    matches, so evaluation falls back to automatic behavior.

    Returns ``(credits_by_occurrence, session_credits_by_date)`` where the first
    maps ``(program_day_id, date)`` to ``{session, template_id, source}`` entries
    and the second maps ``date`` to ``{session_id: presentation facts}``.
    """
    sessions_by_date = defaultdict(list)
    for session in sessions or []:
        if getattr(session, "deleted_at", None):
            continue
        local_date = effective_session_date(session, zone)
        if local_date in occurrences_by_date:
            sessions_by_date[local_date].append(session)
    stored_by_key = {
        (date_part(getattr(row, "date", None)), getattr(row, "session_id", None)): row
        for row in session_credits or []
    }

    credits_by_occurrence = defaultdict(list)
    session_credits_by_date = defaultdict(dict)
    for day_value, occurrence_rows in occurrences_by_date.items():
        linked_day_ids = {row["program_day"].id for row in occurrence_rows}
        day_ids_by_template = defaultdict(list)
        for row in occurrence_rows:
            for rule in get_program_day_template_rules(row["program_day"]):
                day_ids_by_template[rule["template_id"]].append(row["program_day"].id)
        for session in sessions_by_date.get(day_value, []):
            stored = stored_by_key.get((day_value, session.id))
            disposition = getattr(stored, "disposition", None)
            template_id = getattr(session, "template_id", None)
            source = None
            target_day_ids = []
            if disposition == "credit" and stored.template_id in day_ids_by_template:
                source = "manual"
                template_id = stored.template_id
                target_day_ids = day_ids_by_template[template_id]
            elif getattr(session, "program_day_id", None) in linked_day_ids:
                source = "linked"
                target_day_ids = [session.program_day_id]
            elif template_id in day_ids_by_template and _session_counts_for_program(session, program_id):
                source = "template_match"
                target_day_ids = day_ids_by_template[template_id]
            excluded = disposition == "exclude" and source in {"linked", "template_match"}
            if source and not excluded:
                for program_day_id in dict.fromkeys(target_day_ids):
                    credits_by_occurrence[(program_day_id, day_value)].append({
                        "session": session,
                        "template_id": template_id,
                        "source": source,
                    })
            if source or stored is not None:
                session_credits_by_date[day_value][session.id] = {
                    "source": source,
                    "template_id": template_id if source else None,
                    "program_day_ids": list(dict.fromkeys(target_day_ids)),
                    "excluded": excluded,
                    "stored_disposition": disposition,
                }
    return credits_by_occurrence, session_credits_by_date


def _credited_item(item):
    """Normalize a credit entry or a directly linked session to (session, template_id)."""
    if isinstance(item, dict):
        return item["session"], item["template_id"]
    return item, getattr(item, "template_id", None)


def evaluate_occurrence(day, sessions):
    """Evaluate one occurrence from credit entries (or directly linked sessions)."""
    rules = get_program_day_template_rules(day)
    configured_template_ids = {rule["template_id"] for rule in rules}
    completed_template_ids = {
        template_id
        for session, template_id in map(_credited_item, sessions or [])
        if getattr(session, "completed", False)
        and not getattr(session, "deleted_at", None)
        and template_id
        and template_id in configured_template_ids
    }
    required_template_ids = {
        rule["template_id"] for rule in rules if rule["is_required"]
    }
    minimum = getattr(day, "completion_min_templates", None)
    requirements_met = bool(rules) and required_template_ids.issubset(completed_template_ids)
    if minimum:
        requirements_met = requirements_met and len(completed_template_ids) >= minimum
    elif not required_template_ids:
        requirements_met = requirements_met and bool(completed_template_ids)
    return {
        "required_template_ids": sorted(required_template_ids),
        "completed_template_ids": sorted(completed_template_ids),
        "scheduled_template_count": len(rules),
        "required_template_count": len(required_template_ids),
        "completion_min_templates": minimum,
        "requirements_met": requirements_met,
    }


def evaluate_date(occurrence_rows):
    """Evaluate one calendar date across all overlapping program-day definitions.

    ``completion_min_templates`` is a day-level threshold. Overlapping definitions
    therefore contribute distinct templates to one pool and the strongest configured
    threshold wins; thresholds are never added together.
    """
    evaluations = [row["evaluation"] for row in occurrence_rows]
    scheduled_template_ids = {
        template_id
        for evaluation in evaluations
        for template_id in evaluation["required_template_ids"] + evaluation["completed_template_ids"]
    }
    for row in occurrence_rows:
        scheduled_template_ids.update(
            rule["template_id"]
            for rule in get_program_day_template_rules(row["program_day"])
        )
    completed_template_ids = {
        template_id
        for evaluation in evaluations
        for template_id in evaluation["completed_template_ids"]
    }
    required_template_ids = {
        template_id
        for evaluation in evaluations
        for template_id in evaluation["required_template_ids"]
    }
    minimum = max(
        (evaluation["completion_min_templates"] or 0 for evaluation in evaluations),
        default=0,
    ) or None
    requirements_met = bool(scheduled_template_ids)
    requirements_met = requirements_met and required_template_ids.issubset(completed_template_ids)
    if minimum:
        requirements_met = requirements_met and len(completed_template_ids) >= minimum
    elif not required_template_ids:
        requirements_met = requirements_met and bool(completed_template_ids)
    return {
        "required_template_ids": sorted(required_template_ids),
        "completed_template_ids": sorted(completed_template_ids),
        "scheduled_template_ids": sorted(scheduled_template_ids),
        "scheduled_template_count": len(scheduled_template_ids),
        "required_template_count": len(required_template_ids),
        "completion_min_templates": minimum,
        "requirements_met": requirements_met,
    }


def index_period_coverage(periods, start, end):
    """Map each date in ``start..end`` to covering and streak-protecting period IDs.

    Periods may be ORM rows or dicts. Coverage is bounded to the requested
    range, so work is proportional to the window rather than the period span.
    """
    covering = defaultdict(list)
    protecting = defaultdict(list)

    def read(period, key):
        return period.get(key) if isinstance(period, dict) else getattr(period, key, None)

    for period in periods or []:
        if read(period, "deleted_at"):
            continue
        first = max(start, date_part(read(period, "start_date")))
        last = min(end, date_part(read(period, "end_date")))
        for day_value in iter_dates(first, last) if first <= last else ():
            covering[day_value].append(read(period, "id"))
            if read(period, "protects_streaks"):
                protecting[day_value].append(read(period, "id"))
    return covering, protecting


def build_day_facts(
    program, start, end, sessions, aligned_evidence, zone, local_today,
    status_overrides=None, session_credits=None, periods=None,
):
    """Build canonical date facts and occurrence evaluations for a display range.

    ``sessions`` are credit candidates (see ``program_day_credits``); each
    occurrence row exposes its attributed ``credits`` and the distinct
    ``sessions`` behind them, and each fact exposes per-session credit facts.
    """
    occurrences_by_date = build_occurrences(program, start, end)
    covering_periods, protecting_periods = index_period_coverage(periods, start, end)
    credits_by_occurrence, session_credits_by_date = resolve_occurrence_credits(
        occurrences_by_date, sessions, zone,
        program_id=getattr(program, "id", None), session_credits=session_credits,
    )
    evidence_by_date = defaultdict(list)
    for item in aligned_evidence or []:
        evidence_by_date[item["date"]].append(item)

    overrides_by_date = {
        date_part(getattr(item, "date", None)): getattr(item, "status", None)
        for item in (status_overrides or [])
    }
    facts = []
    for day_value in iter_dates(start, end):
        occurrence_rows = []
        for occurrence in occurrences_by_date.get(day_value, []):
            day = occurrence["program_day"]
            occurrence_credits = credits_by_occurrence.get((day.id, day_value), [])
            evaluation = evaluate_occurrence(day, occurrence_credits)
            occurrence_rows.append({
                **occurrence,
                "credits": occurrence_credits,
                "sessions": list({
                    entry["session"].id: entry["session"] for entry in occurrence_credits
                }.values()),
                "evaluation": evaluation,
            })

        scheduled = bool(occurrence_rows)
        date_evaluation = evaluate_date(occurrence_rows)
        completed_count = len(date_evaluation["completed_template_ids"])
        required_count = date_evaluation["required_template_count"]
        scheduled_template_count = date_evaluation["scheduled_template_count"]
        requirements_met = date_evaluation["requirements_met"]
        closed = day_value < local_today
        observed = day_value <= local_today
        aligned_items = evidence_by_date[day_value]

        if scheduled and requirements_met:
            automatic_state = "scheduled_met"
        elif scheduled and completed_count:
            automatic_state = "scheduled_partial"
        elif scheduled and closed:
            automatic_state = "scheduled_missed"
        elif scheduled:
            automatic_state = "scheduled_pending"
        elif observed and aligned_items:
            automatic_state = "unscheduled_evidence"
        elif observed:
            automatic_state = "rest"
        else:
            automatic_state = "upcoming"

        # Precedence: manual override, then a streak-protecting period (only for
        # dates that would not otherwise be met), then automatic evaluation.
        manual_status = overrides_by_date.get(day_value) if scheduled else None
        protecting_ids = protecting_periods.get(day_value, [])
        period_rest = bool(
            scheduled and not manual_status and protecting_ids and not requirements_met
        )
        if manual_status == "complete":
            state = "scheduled_met"
        elif manual_status == "rest" or period_rest:
            state = "rest"
        else:
            state = automatic_state
        counts_as_success = scheduled and manual_status != "rest" and (
            manual_status == "complete" or requirements_met
        )
        counts_toward_adherence = scheduled and manual_status != "rest" and not period_rest

        facts.append({
            "date": day_value,
            "state": state,
            "automatic_state": automatic_state,
            "status_source": "manual" if manual_status else ("period" if period_rest else "automatic"),
            "manual_status": manual_status,
            "period_id": protecting_ids[0] if period_rest else None,
            "period_ids": covering_periods.get(day_value, []),
            "scheduled": scheduled,
            "observed": observed,
            "closed": closed,
            "counts_toward_adherence": counts_toward_adherence,
            "counts_as_success": counts_as_success,
            "breaks_chain": counts_toward_adherence and closed and not counts_as_success,
            "requirements_met": requirements_met,
            "completed_template_count": completed_count,
            "required_template_count": required_count,
            "scheduled_template_count": scheduled_template_count,
            "completion_min_templates": date_evaluation["completion_min_templates"],
            "date_evaluation": date_evaluation,
            "occurrences": occurrence_rows,
            "aligned_items": aligned_items,
            "session_credits": session_credits_by_date.get(day_value, {}),
        })

    apply_chain_facts(facts)
    return facts


def apply_chain_facts(facts):
    running = 0
    last_success_index = None
    pending_bridges = []
    for index, fact in enumerate(facts):
        fact["chain_role"] = "none"
        fact["broke_active_chain"] = False
        if fact["counts_as_success"]:
            running += 1
            if last_success_index is not None and pending_bridges:
                for bridge_index in pending_bridges:
                    facts[bridge_index]["chain_role"] = "bridge"
            pending_bridges = []
            fact["chain_role"] = "member"
            last_success_index = index
        elif fact["breaks_chain"]:
            if running:
                fact["broke_active_chain"] = True
            running = 0
            last_success_index = None
            pending_bridges = []
        elif running and fact["state"] in {"rest", "unscheduled_evidence"}:
            pending_bridges.append(index)
        fact["run_length_at_date"] = running

    # Resolve endpoints against an immutable connectivity snapshot. Mutating a
    # prior member into ``start`` must not make the following member look
    # disconnected (which previously turned every two-day run into
    # ``start, single``).
    connected = [fact["chain_role"] in {"member", "bridge"} for fact in facts]
    success_indexes = [index for index, fact in enumerate(facts) if fact["counts_as_success"]]
    for index in success_indexes:
        previous_connected = index > 0 and connected[index - 1]
        next_connected = index + 1 < len(facts) and connected[index + 1]
        if not previous_connected and next_connected:
            facts[index]["chain_role"] = "start"
        elif previous_connected and not next_connected:
            facts[index]["chain_role"] = "end"
        elif not previous_connected and not next_connected:
            facts[index]["chain_role"] = "single"

    return None


def summarize_chain_facts(facts):
    """Summarize facts after ``apply_chain_facts`` has established chain state."""
    return {
        "current_streak": facts[-1]["run_length_at_date"] if facts else 0,
        "longest_streak": max(
            (fact["run_length_at_date"] for fact in facts),
            default=0,
        ),
        "chain_breaks": sum(fact["broke_active_chain"] for fact in facts),
    }
