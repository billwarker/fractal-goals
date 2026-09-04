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


def program_day_scheduled_on(day, block, target_date):
    if day.date:
        return date_part(day.date) == target_date
    block_start = date_part(block.start_date)
    block_end = date_part(block.end_date)
    if not block_start or not block_end or not (block_start <= target_date <= block_end):
        return False
    names = day.day_of_week if isinstance(day.day_of_week, list) else (
        [day.day_of_week] if day.day_of_week else []
    )
    return bool(names and target_date.strftime("%A") in names)


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
            else:
                candidates = iter_dates(block_start, block_end)
            for day_value in candidates:
                if not day_value or not (start <= day_value <= end):
                    continue
                if program_day_scheduled_on(day, block, day_value):
                    grouped[day_value].append({"program_day": day, "block": block})
    return grouped


def bucket_sessions(sessions, zone):
    grouped = defaultdict(list)
    for session in sessions or []:
        program_day_id = getattr(session, "program_day_id", None)
        local_date = effective_session_date(session, zone)
        if program_day_id and local_date:
            grouped[(program_day_id, local_date)].append(session)
    return grouped


def evaluate_occurrence(day, sessions):
    rules = get_program_day_template_rules(day)
    configured_template_ids = {rule["template_id"] for rule in rules}
    completed_template_ids = {
        session.template_id
        for session in sessions or []
        if getattr(session, "completed", False)
        and not getattr(session, "deleted_at", None)
        and getattr(session, "template_id", None)
        and session.template_id in configured_template_ids
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


def build_day_facts(program, start, end, sessions, aligned_evidence, zone, local_today):
    """Build canonical date facts and occurrence evaluations for a display range."""
    occurrences_by_date = build_occurrences(program, start, end)
    sessions_by_occurrence = bucket_sessions(sessions, zone)
    evidence_by_date = defaultdict(list)
    for item in aligned_evidence or []:
        evidence_by_date[item["date"]].append(item)

    facts = []
    for day_value in iter_dates(start, end):
        occurrence_rows = []
        for occurrence in occurrences_by_date.get(day_value, []):
            day = occurrence["program_day"]
            occurrence_sessions = sessions_by_occurrence[(day.id, day_value)]
            evaluation = evaluate_occurrence(day, occurrence_sessions)
            occurrence_rows.append({
                **occurrence,
                "sessions": occurrence_sessions,
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
            state = "scheduled_met"
        elif scheduled and completed_count:
            state = "scheduled_partial"
        elif scheduled and closed:
            state = "scheduled_missed"
        elif scheduled:
            state = "scheduled_pending"
        elif observed and aligned_items:
            state = "unscheduled_evidence"
        elif observed:
            state = "rest"
        else:
            state = "upcoming"

        facts.append({
            "date": day_value,
            "state": state,
            "scheduled": scheduled,
            "observed": observed,
            "closed": closed,
            "counts_as_success": state == "scheduled_met",
            "breaks_chain": closed and state in {"scheduled_partial", "scheduled_missed"},
            "requirements_met": requirements_met,
            "completed_template_count": completed_count,
            "required_template_count": required_count,
            "scheduled_template_count": scheduled_template_count,
            "completion_min_templates": date_evaluation["completion_min_templates"],
            "date_evaluation": date_evaluation,
            "occurrences": occurrence_rows,
            "aligned_items": aligned_items,
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
