"""Block, week, and program-day rows for program metrics (calculation v9).

Each block row reports its scheduled program days by status symbol, consistency,
longest streak, and the program goals due inside it, from the shared rollups in
``services/program_rollups.py``.
"""

from __future__ import annotations

from collections import defaultdict
from datetime import datetime

from services.program_rollups import (
    block_weeks,
    consistency_rollup,
    longest_streak,
    status_counts,
    tracked_week_start_day,
)
from services.session_filters import session_duration_seconds_from_row


def _date(value):
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def goals_due(block, goals_by_id, program_goal_ids) -> dict:
    """Program goals (and descendants) with a deadline inside the block, and how many are done."""
    if not block.start_date or not block.end_date:
        return {"due": 0, "completed": 0}
    due = [
        goals_by_id[goal_id] for goal_id in program_goal_ids
        if goal_id in goals_by_id
        and (deadline := _date(goals_by_id[goal_id].deadline)) is not None
        and block.start_date <= deadline <= block.end_date
    ]
    return {"due": len(due), "completed": sum(bool(goal.completed) for goal in due)}


def _program_day_rows(block_id, day_facts, records):
    stats = defaultdict(lambda: {"name": "Program day", "day_number": None, "scheduled_occurrences": 0, "completed_occurrences": 0})
    for fact in day_facts:
        for occurrence in fact["occurrences"]:
            if occurrence["block"] is None or str(occurrence["block"].id) != block_id:
                continue
            day = occurrence["program_day"]
            row = stats[str(day.id)]
            row["name"] = day.name or "Program day"
            row["day_number"] = day.day_number
            row["scheduled_occurrences"] += 1
            row["completed_occurrences"] += int(occurrence["evaluation"]["requirements_met"])
    return [{
        "program_day_id": day_id,
        **row,
        "consistency": consistency_rollup([record for record in records if day_id in record.program_day_ids]),
    } for day_id, row in sorted(stats.items(), key=lambda item: (
        item[1]["day_number"] is None, item[1]["day_number"] or 0, item[1]["name"], item[0],
    ))]


def build_block_rows(
    *, blocks, window, day_facts, records, program_sessions, credited_blocks_by_session,
    goals_by_id, program_goal_ids, selected_dates,
):
    rows = []
    for block in blocks:
        block_id = str(block.id)
        block_start = max(window["display_start"], block.start_date or window["display_start"])
        block_end = min(window["display_end"], block.end_date or window["display_end"])
        if selected_dates is not None and not any(block_start <= value <= block_end for value in selected_dates):
            continue
        block_records = [record for record in records if record.block_id == block_id]
        block_sessions = [
            item for item in program_sessions
            if item.program_block_id == block.id or block.id in credited_blocks_by_session.get(item.id, ())
        ]
        rows.append({
            "block_id": block_id,
            "name": block.name,
            "color": block.color,
            "start_date": block.start_date.isoformat() if block.start_date else None,
            "end_date": block.end_date.isoformat() if block.end_date else None,
            "consistency": consistency_rollup(block_records),
            "status_counts": status_counts(block_records),
            "longest_streak": longest_streak(block_records),
            "goals": goals_due(block, goals_by_id, program_goal_ids),
            "weeks": [{
                "index": week.index,
                "start": week.start.isoformat(),
                "end": week.end.isoformat(),
                "partial": week.partial,
                "consistency": consistency_rollup([record for record in block_records if week.contains(record.date)]),
            } for week in block_weeks(block.start_date, block.end_date, tracked_week_start_day(block))],
            "program_days": _program_day_rows(block_id, day_facts, block_records),
            "linked_sessions": len(block_sessions),
            "linked_duration_seconds": sum(
                session_duration_seconds_from_row(item.total_duration_seconds, item.duration_minutes, item.session_start, item.session_end)
                for item in block_sessions
            ),
        })
    return rows


def current_block_summary(blocks, block_rows, local_today):
    """The block running today and its current week, for the calendar side pane."""
    block = next((
        item for item in blocks
        if item.start_date and item.end_date and item.start_date <= local_today <= item.end_date
    ), None)
    if block is None:
        return None
    weeks = block_weeks(block.start_date, block.end_date, tracked_week_start_day(block))
    week = next((item for item in weeks if item.contains(local_today)), None)
    row = next((item for item in block_rows if item["block_id"] == str(block.id)), None)
    week_row = next((item for item in (row or {}).get("weeks", []) if week and item["index"] == week.index), None)
    return {
        "block_id": str(block.id),
        "name": block.name,
        "color": block.color,
        "track_weeks": bool(getattr(block, "track_weeks", False)),
        "week_index": week.index if week else None,
        "week_count": len(weeks),
        "week": {
            "start": week.start.isoformat(),
            "end": week.end.isoformat(),
            "consistency": week_row["consistency"] if week_row else None,
        } if week else None,
    }


def schedule_outlook(day_facts, local_today):
    """Whether today is scheduled and not yet met, and the next scheduled date after today."""
    today = next((fact for fact in day_facts if fact["date"] == local_today), None)
    upcoming = next((
        fact["date"] for fact in day_facts
        if fact["date"] > local_today and fact["counts_toward_adherence"]
    ), None)
    return {
        "at_risk_today": bool(today and today["counts_toward_adherence"] and not today["counts_as_success"]),
        "next_scheduled_date": upcoming.isoformat() if upcoming else None,
    }
