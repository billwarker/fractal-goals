"""Program days belong to programs; blocks can track weeks.

1. ``program_blocks`` gains ``track_weeks`` and ``week_start_day`` (0 = Monday).
2. ``program_days.program_id`` replaces ``block_id``. A day's weekdays now repeat
   across the whole program and its explicit dates may fall anywhere in it.
3. Identical copies of a day (same program, name, templates, weekdays and
   completion minimum, typically made by "Copy to Other Blocks") merge into the
   copy in the earliest block. Sessions, plans, schedules and goals move to it.
4. Every calendar is preserved exactly. A day keeps its weekdays only when those
   weekdays, repeated over the program, still land on dates it used to occupy;
   any other date it occupied (a block-limited weekday, an explicit date, or the
   legacy ``program_days.date``) becomes an explicit schedule row. Dormant rows
   (outside their old block) are dropped. The new calendar is recomputed and the
   migration fails, naming the program and date, if it differs from the old one.
5. ``program_days.block_id`` and the legacy ``program_days.date`` are dropped and
   ``day_number`` is renumbered per program (sidebar order).

Self-contained on purpose: it mirrors the occurrence evaluator as of this revision.

Downgrade is lossy: merged copies stay merged, and each day returns to the block
containing its first occurrence (else the program's first block).

Revision ID: b8d4f2a6c1e3
Revises: a7c3e9f1b5d2
"""
import json
import logging
from collections import defaultdict
from datetime import date, datetime, timedelta

import sqlalchemy as sa
from alembic import op


revision = "b8d4f2a6c1e3"
down_revision = "a7c3e9f1b5d2"
branch_labels = None
depends_on = None

logger = logging.getLogger("alembic.runtime.migration")


def _day(value):
    if value is None:
        return None
    return value.date() if isinstance(value, datetime) else value


def _dates(start, end):
    current = start
    while current <= end:
        yield current
        current += timedelta(days=1)


def _weekdays(raw):
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = [raw]
    if isinstance(raw, list):
        return sorted({name for name in raw if name})
    return [raw] if raw else []


class _Calendar:
    """Plain rows for one program, read before any change."""

    def __init__(self, program, blocks, days, schedules, rules):
        self.program_id = program.id
        self.start = _day(program.start_date)
        self.end = _day(program.end_date)
        self.blocks = {block.id: block for block in blocks}
        self.days = days
        self.schedules = schedules  # day_id -> set(date)
        self.rules = rules  # day_id -> tuple((template_id, is_required, order))

    def span(self):
        if not self.start or not self.end or self.end < self.start:
            return []
        return list(_dates(self.start, self.end))

    def old_dates(self, day):
        """Dates the pre-migration evaluator scheduled ``day`` on, inside the program."""
        span = set(self.span())
        if day.date is not None:
            return {_day(day.date)} & span
        block = self.blocks.get(day.block_id)
        block_start, block_end = _day(block.start_date), _day(block.end_date)
        if not block_start or not block_end:
            return set()
        names = set(_weekdays(day.day_of_week))
        result = set()
        for value in _dates(block_start, block_end):
            if value not in span:
                continue
            if value in self.schedules.get(day.id, set()) or value.strftime("%A") in names:
                result.add(value)
        return result


def _load_calendars(bind):
    programs = bind.execute(sa.text("SELECT id, start_date, end_date FROM programs")).fetchall()
    blocks = defaultdict(list)
    for row in bind.execute(sa.text(
        "SELECT id, program_id, start_date, end_date FROM program_blocks"
    )).fetchall():
        blocks[row.program_id].append(row)
    days = defaultdict(list)
    for row in bind.execute(sa.text(
        "SELECT d.id, d.block_id, b.program_id, d.name, d.notes, d.date, d.day_of_week,"
        "       d.completion_min_templates, d.day_number"
        "  FROM program_days d JOIN program_blocks b ON b.id = d.block_id"
    )).fetchall():
        days[row.program_id].append(row)
    schedules = defaultdict(set)
    for row in bind.execute(sa.text(
        "SELECT program_day_id, date FROM program_day_occurrence_schedules"
    )).fetchall():
        schedules[row.program_day_id].add(_day(row.date))
    rules = defaultdict(list)
    for row in bind.execute(sa.text(
        'SELECT program_day_id, session_template_id, is_required, "order"'
        "  FROM program_day_templates"
    )).fetchall():
        rules[row.program_day_id].append((row.session_template_id, bool(row.is_required), row.order or 0))
    return [
        _Calendar(
            program, blocks[program.id], days[program.id], schedules,
            {day_id: tuple(sorted(items, key=lambda item: (item[2], item[0]))) for day_id, items in rules.items()},
        )
        for program in programs
    ]


def _merge_key(calendar, day):
    return (
        (day.name or "").strip().casefold(),
        calendar.rules.get(day.id, ()),
        tuple(_weekdays(day.day_of_week)),
        day.completion_min_templates,
    )


def plan_program(calendar):
    """Pure plan for one program: merges, each survivor's schedule, and the expected calendar.

    Returns ``(merges, survivors, expected)``: ``merges`` maps each removed copy to
    its canonical day; ``survivors`` maps each kept day to ``(weekdays, explicit
    dates, notes)``; ``expected`` maps each date to the day that must occupy it.
    """
    def block_order(day):
        block = calendar.blocks.get(day.block_id)
        start = _day(block.start_date) if block else None
        return (start is None, start or date.min, day.day_number or 0, day.id)

    groups = defaultdict(list)
    for day in calendar.days:
        groups[_merge_key(calendar, day)].append(day)

    merges, survivors, expected = {}, {}, {}
    span = calendar.span()
    for members in groups.values():
        members.sort(key=block_order)
        canonical = members[0]
        old = set()
        for member in members:
            old |= calendar.old_dates(member)
            if member is not canonical:
                merges[member.id] = canonical.id
        weekdays = _weekdays(canonical.day_of_week)
        weekday_dates = {value for value in span if value.strftime("%A") in weekdays}
        if weekdays and weekday_dates <= old:
            explicit = old - weekday_dates
        else:
            weekdays, explicit = [], old
        notes = next((member.notes for member in members if member.notes), None)
        survivors[canonical.id] = (weekdays, explicit, notes, min(old) if old else None)
        for value in old:
            if value in expected and expected[value] != canonical.id:
                raise RuntimeError(
                    f"Program {calendar.program_id} already holds two program days on {value.isoformat()}"
                )
            expected[value] = canonical.id
    return merges, survivors, expected


def _merge_into(bind, removed_id, canonical_id):
    params = {"removed": removed_id, "canonical": canonical_id}
    bind.execute(sa.text(
        "UPDATE sessions SET program_day_id = :canonical WHERE program_day_id = :removed"
    ), params)
    bind.execute(sa.text(
        "UPDATE program_day_sessions SET program_day_id = :canonical WHERE program_day_id = :removed"
    ), params)
    # A live plan the canonical day already has for the same template and date wins;
    # the copy's is soft-deleted (kept, never destroyed) before it moves.
    bind.execute(sa.text(
        "UPDATE program_session_plans AS p SET deleted_at = now()"
        " WHERE p.program_day_id = :removed AND p.deleted_at IS NULL AND EXISTS ("
        "   SELECT 1 FROM program_session_plans c"
        "    WHERE c.program_day_id = :canonical AND c.deleted_at IS NULL"
        "      AND c.session_template_id = p.session_template_id AND c.date = p.date)"
    ), params)
    bind.execute(sa.text(
        "UPDATE program_session_plans SET program_day_id = :canonical WHERE program_day_id = :removed"
    ), params)
    bind.execute(sa.text(
        "UPDATE program_day_goals AS c SET deleted_at = NULL"
        "  FROM program_day_goals r"
        " WHERE c.program_day_id = :canonical AND r.program_day_id = :removed"
        "   AND c.goal_id = r.goal_id AND c.deleted_at IS NOT NULL AND r.deleted_at IS NULL"
    ), params)
    bind.execute(sa.text(
        "INSERT INTO program_day_goals (program_day_id, goal_id, created_at, deleted_at)"
        " SELECT :canonical, r.goal_id, r.created_at, r.deleted_at FROM program_day_goals r"
        "  WHERE r.program_day_id = :removed AND NOT EXISTS ("
        "    SELECT 1 FROM program_day_goals c WHERE c.program_day_id = :canonical AND c.goal_id = r.goal_id)"
    ), params)
    # Schedules are rewritten from the plan afterwards; templates, goals and the
    # copy's remaining rows cascade with it.
    bind.execute(sa.text("DELETE FROM program_days WHERE id = :removed"), params)


def _write_schedule(bind, day_id, weekdays, explicit, notes):
    bind.execute(sa.text(
        "UPDATE program_days SET day_of_week = CAST(:weekdays AS json), notes = :notes WHERE id = :id"
    ), {"weekdays": json.dumps(weekdays), "notes": notes, "id": day_id})
    existing = {
        _day(row.date) for row in bind.execute(sa.text(
            "SELECT date FROM program_day_occurrence_schedules WHERE program_day_id = :id"
        ), {"id": day_id}).fetchall()
    }
    for value in sorted(existing - explicit):
        bind.execute(sa.text(
            "DELETE FROM program_day_occurrence_schedules WHERE program_day_id = :id AND date = :date"
        ), {"id": day_id, "date": value})
    for value in sorted(explicit - existing):
        bind.execute(sa.text(
            "INSERT INTO program_day_occurrence_schedules (id, program_day_id, date, created_at)"
            " VALUES (gen_random_uuid()::text, :id, :date, now())"
        ), {"id": day_id, "date": value})


def _new_calendar(bind, calendar):
    """Recompute ``{date: [day_id]}`` under the new rules from the migrated rows."""
    span = calendar.span()
    rows = bind.execute(sa.text(
        "SELECT id, day_of_week FROM program_days WHERE program_id = :program"
    ), {"program": calendar.program_id}).fetchall()
    explicit = defaultdict(set)
    for row in bind.execute(sa.text(
        "SELECT s.program_day_id, s.date FROM program_day_occurrence_schedules s"
        "  JOIN program_days d ON d.id = s.program_day_id WHERE d.program_id = :program"
    ), {"program": calendar.program_id}).fetchall():
        explicit[row.program_day_id].add(_day(row.date))
    occupied = defaultdict(list)
    for row in rows:
        names = set(_weekdays(row.day_of_week))
        for value in span:
            if value in explicit[row.id] or value.strftime("%A") in names:
                occupied[value].append(row.id)
    return occupied


def restructure_program_days(bind):
    """Steps 3-4: merge identical copies and pin every calendar to its old dates."""
    merged_total = 0
    for calendar in _load_calendars(bind):
        merges, survivors, expected = plan_program(calendar)
        for removed_id, canonical_id in merges.items():
            _merge_into(bind, removed_id, canonical_id)
        for day_id, (weekdays, explicit, notes, _first) in survivors.items():
            _write_schedule(bind, day_id, weekdays, explicit, notes)
        actual = _new_calendar(bind, calendar)
        for value in sorted(set(actual) | set(expected)):
            if actual.get(value, []) != ([expected[value]] if value in expected else []):
                raise RuntimeError(
                    f"Program {calendar.program_id}: {value.isoformat()} would change from "
                    f"{expected.get(value)} to {actual.get(value)}; aborting"
                )
        order = sorted(survivors, key=lambda day_id: (
            survivors[day_id][3] is None, survivors[day_id][3] or date.min, day_id,
        ))
        for number, day_id in enumerate(order, start=1):
            bind.execute(sa.text("UPDATE program_days SET day_number = :n WHERE id = :id"), {"n": number, "id": day_id})
        if merges:
            merged_total += len(merges)
            logger.info("program %s: merged %s program-day copies", calendar.program_id, len(merges))
    logger.info("program-level days: merged %s copies in total", merged_total)


def upgrade():
    bind = op.get_bind()

    op.add_column("program_blocks", sa.Column(
        "track_weeks", sa.Boolean(), nullable=False, server_default=sa.false(),
    ))
    op.add_column("program_blocks", sa.Column("week_start_day", sa.Integer(), nullable=True))
    op.create_check_constraint(
        "ck_program_blocks_week_start_day", "program_blocks",
        "week_start_day IS NULL OR (week_start_day >= 0 AND week_start_day <= 6)",
    )
    op.create_check_constraint(
        "ck_program_blocks_track_weeks_start_day", "program_blocks",
        "NOT track_weeks OR week_start_day IS NOT NULL",
    )

    op.add_column("program_days", sa.Column("program_id", sa.String(), nullable=True))
    bind.execute(sa.text(
        "UPDATE program_days d SET program_id = b.program_id FROM program_blocks b WHERE b.id = d.block_id"
    ))

    restructure_program_days(bind)

    op.alter_column("program_days", "program_id", nullable=False)
    op.create_foreign_key(
        "fk_program_days_program_id", "program_days", "programs",
        ["program_id"], ["id"], ondelete="CASCADE",
    )
    op.create_index("ix_program_days_program_id", "program_days", ["program_id"])
    op.drop_column("program_days", "block_id")
    op.drop_column("program_days", "date")


def downgrade():
    bind = op.get_bind()
    op.add_column("program_days", sa.Column("date", sa.Date(), nullable=True))
    op.add_column("program_days", sa.Column("block_id", sa.String(), nullable=True))
    bind.execute(sa.text("""
        UPDATE program_days d SET block_id = COALESCE(
            (SELECT b.id FROM program_blocks b
               JOIN program_day_occurrence_schedules s ON s.program_day_id = d.id
              WHERE b.program_id = d.program_id AND s.date BETWEEN b.start_date AND b.end_date
              ORDER BY s.date LIMIT 1),
            (SELECT b.id FROM program_blocks b WHERE b.program_id = d.program_id
              ORDER BY b.start_date NULLS LAST, b.id LIMIT 1)
        )
    """))
    # A day in a program without blocks has nowhere to go.
    bind.execute(sa.text("DELETE FROM program_days WHERE block_id IS NULL"))
    op.alter_column("program_days", "block_id", nullable=False)
    op.create_foreign_key(
        "program_days_block_id_fkey", "program_days", "program_blocks", ["block_id"], ["id"],
    )
    op.create_index("ix_program_days_block_id", "program_days", ["block_id"])
    op.drop_index("ix_program_days_program_id", table_name="program_days")
    op.drop_constraint("fk_program_days_program_id", "program_days", type_="foreignkey")
    op.drop_column("program_days", "program_id")

    op.drop_constraint("ck_program_blocks_track_weeks_start_day", "program_blocks", type_="check")
    op.drop_constraint("ck_program_blocks_week_start_day", "program_blocks", type_="check")
    op.drop_column("program_blocks", "week_start_day")
    op.drop_column("program_blocks", "track_weeks")
