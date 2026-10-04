"""Program calendar invariants: no overlapping blocks, one program day per date.

Backs the service guard in services/program_calendar_invariants.py. The app runs
migrations at startup, so existing violations are repaired here first rather than
failing the deploy; every repair is logged.

Blocks: a dated block that overlaps a block kept before it is undated (its days and
history stay; it can be re-dated). Blocks with more logged sessions are kept first,
then blocks overlapping fewer siblings, then earlier blocks. Reversed ranges are swapped.

Program days: on a date held by several definitions, the one with the most logged
sessions keeps it. Each other definition loses only what puts it there: the explicit
schedule row, the weekday (for weekly days), or the legacy fixed date.

Self-contained on purpose: it mirrors program_day_scheduled_on as of this revision.

Revision ID: f1b3d5a7c9e2
Revises: e5a7c9b1d3f4
"""
import json
import logging
from collections import defaultdict
from datetime import datetime, timedelta

import sqlalchemy as sa
from alembic import op


revision = "f1b3d5a7c9e2"
down_revision = "e5a7c9b1d3f4"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")
MAX_REPAIR_PASSES = 1000


def _date(value):
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _weekdays(raw):
    if raw is None:
        return []
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = [raw]
    return list(raw) if isinstance(raw, list) else [raw]


def _repair_block_overlaps(bind):
    bind.execute(sa.text(
        "UPDATE program_blocks SET start_date = end_date, end_date = start_date "
        "WHERE start_date IS NOT NULL AND end_date IS NOT NULL AND start_date > end_date"
    ))
    rows = bind.execute(sa.text("""
        SELECT b.id, b.program_id, b.name, b.start_date, b.end_date,
               (SELECT count(*) FROM sessions s JOIN program_days d ON d.id = s.program_day_id
                 WHERE d.block_id = b.id AND s.deleted_at IS NULL) AS session_count
        FROM program_blocks b
        WHERE b.start_date IS NOT NULL AND b.end_date IS NOT NULL
    """)).fetchall()
    by_program = defaultdict(list)
    for row in rows:
        by_program[row.program_id].append(row)

    def overlaps(a, b):
        return a.start_date <= b.end_date and a.end_date >= b.start_date

    for program_id, blocks in by_program.items():
        overlap_counts = {
            block.id: sum(1 for other in blocks if other.id != block.id and overlaps(block, other))
            for block in blocks
        }
        if not any(overlap_counts.values()):
            continue
        ordered = sorted(blocks, key=lambda b: (-b.session_count, overlap_counts[b.id], b.start_date, b.id))
        kept = []
        for block in ordered:
            if any(overlaps(block, other) for other in kept):
                bind.execute(sa.text(
                    "UPDATE program_blocks SET start_date = NULL, end_date = NULL, "
                    "row_version = row_version + 1 WHERE id = :id"
                ), {"id": block.id})
                logger.warning(
                    "Undated overlapping block %r (%s – %s) in program %s",
                    block.name, block.start_date, block.end_date, program_id,
                )
            else:
                kept.append(block)


def _load_calendar(bind, program_id):
    blocks = bind.execute(sa.text(
        "SELECT id, start_date, end_date FROM program_blocks WHERE program_id = :p"
    ), {"p": program_id}).fetchall()
    days = bind.execute(sa.text("""
        SELECT d.id, d.block_id, d.name, d.date, d.day_of_week, d.day_number,
               (SELECT count(*) FROM sessions s WHERE s.program_day_id = d.id AND s.deleted_at IS NULL) AS session_count
        FROM program_days d JOIN program_blocks b ON b.id = d.block_id
        WHERE b.program_id = :p
    """), {"p": program_id}).fetchall()
    schedules = defaultdict(set)
    for day_id, scheduled in bind.execute(sa.text("""
        SELECT s.program_day_id, s.date FROM program_day_occurrence_schedules s
        JOIN program_days d ON d.id = s.program_day_id
        JOIN program_blocks b ON b.id = d.block_id
        WHERE b.program_id = :p
    """), {"p": program_id}).fetchall():
        schedules[day_id].add(_date(scheduled))
    block_by_id = {row.id: row for row in blocks}
    return [
        {
            "id": day.id,
            "name": day.name,
            "date": _date(day.date),
            "weekdays": _weekdays(day.day_of_week),
            "explicit": schedules[day.id],
            "block": block_by_id[day.block_id],
            "priority": (day.session_count, -(day.day_number or 0), day.id),
        }
        for day in days
    ]


def _occurrences(days):
    """date -> [(day, source)] with the same precedence as program_day_scheduled_on."""
    grouped = defaultdict(list)
    for day in days:
        if day["date"]:
            grouped[day["date"]].append((day, "legacy"))
            continue
        start, end = _date(day["block"].start_date), _date(day["block"].end_date)
        if not start or not end:
            continue
        for value in day["explicit"]:
            if start <= value <= end:
                grouped[value].append((day, "explicit"))
        if day["weekdays"]:
            current = start
            while current <= end:
                if current.strftime("%A") in day["weekdays"] and current not in day["explicit"]:
                    grouped[current].append((day, "weekly"))
                current += timedelta(days=1)
    return grouped


def _repair_day_conflicts(bind):
    program_ids = [row[0] for row in bind.execute(sa.text("SELECT id FROM programs")).fetchall()]
    for program_id in program_ids:
        days = _load_calendar(bind, program_id)
        for _ in range(MAX_REPAIR_PASSES):
            grouped = _occurrences(days)
            conflict = next((value for value in sorted(grouped) if len(grouped[value]) > 1), None)
            if conflict is None:
                break
            entries = sorted(grouped[conflict], key=lambda entry: entry[0]["priority"], reverse=True)
            winner = entries[0][0]
            for day, source in entries[1:]:
                if source == "explicit":
                    day["explicit"].discard(conflict)
                    bind.execute(sa.text(
                        "DELETE FROM program_day_occurrence_schedules WHERE program_day_id = :d AND date = :v"
                    ), {"d": day["id"], "v": conflict})
                    # A weekday on the same date would still place the day there.
                    weekday = conflict.strftime("%A")
                    if weekday in day["weekdays"]:
                        day["weekdays"].remove(weekday)
                        bind.execute(sa.text(
                            "UPDATE program_days SET day_of_week = CAST(:w AS jsonb), row_version = row_version + 1 WHERE id = :d"
                        ), {"w": json.dumps(day["weekdays"]), "d": day["id"]})
                elif source == "weekly":
                    day["weekdays"].remove(conflict.strftime("%A"))
                    bind.execute(sa.text(
                        "UPDATE program_days SET day_of_week = CAST(:w AS jsonb), row_version = row_version + 1 WHERE id = :d"
                    ), {"w": json.dumps(day["weekdays"]), "d": day["id"]})
                else:
                    day["date"] = None
                    bind.execute(sa.text(
                        "UPDATE program_days SET date = NULL, row_version = row_version + 1 WHERE id = :d"
                    ), {"d": day["id"]})
                logger.warning(
                    "Program %s: %s keeps %s; removed %s %s from %r",
                    program_id, winner["name"], conflict.isoformat(), source,
                    conflict.strftime("%A") if source == "weekly" else conflict.isoformat(), day["name"],
                )
        else:
            raise RuntimeError(f"Could not resolve program-day conflicts in program {program_id}")


def upgrade():
    bind = op.get_bind()
    _repair_block_overlaps(bind)
    _repair_day_conflicts(bind)

    op.execute("CREATE EXTENSION IF NOT EXISTS btree_gist")
    op.create_check_constraint(
        "ck_program_blocks_date_order",
        "program_blocks",
        "start_date IS NULL OR end_date IS NULL OR start_date <= end_date",
    )
    op.execute(
        "ALTER TABLE program_blocks ADD CONSTRAINT ex_program_blocks_no_overlap "
        "EXCLUDE USING gist (program_id WITH =, daterange(start_date, end_date, '[]') WITH &&) "
        "WHERE (start_date IS NOT NULL AND end_date IS NOT NULL)"
    )


def downgrade():
    # Repaired data is not restored; only the constraints are dropped.
    op.drop_constraint("ex_program_blocks_no_overlap", "program_blocks")
    op.drop_constraint("ck_program_blocks_date_order", "program_blocks", type_="check")
