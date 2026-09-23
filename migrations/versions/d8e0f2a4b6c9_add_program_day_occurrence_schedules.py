"""Add explicit program-day occurrence schedules and backfill legacy placeholders.

Revision ID: d8e0f2a4b6c9
Revises: c7d9e1f3a5b8

Scheduling a reusable program-day definition on a date used to create an
incomplete placeholder session instead of an occurrence. This revision adds the
occurrence table and backfills one row per legacy placeholder. Placeholder
sessions are deliberately left in place; deleting them is a separate,
explicitly approved cleanup (see planning/program-calendar-periods-and-scheduling.md).
"""
from datetime import timezone
import json
import uuid

from alembic import op
import sqlalchemy as sa


revision = "d8e0f2a4b6c9"
down_revision = "c7d9e1f3a5b8"
branch_labels = None
depends_on = None


def _weekday_names(raw):
    if raw is None:
        return set()
    if isinstance(raw, str):
        try:
            raw = json.loads(raw)
        except ValueError:
            raw = [raw]
    if isinstance(raw, str):
        raw = [raw]
    return {str(value) for value in raw or []}


def _backfill_legacy_placeholders(bind):
    """Map placeholder sessions to schedule rows.

    A placeholder is a non-deleted, incomplete session with no activity
    instances, linked to a reusable (undated) definition on a date that the
    definition's weekdays do not already cover. Create Session only links to
    covered dates, so such links can only have come from the old schedule path.
    The stored start was local noon, so its UTC date is the scheduled local date.
    """
    rows = bind.execute(sa.text("""
        SELECT s.program_day_id, s.session_start, d.day_of_week, b.start_date, b.end_date
        FROM sessions s
        JOIN program_days d ON d.id = s.program_day_id
        JOIN program_blocks b ON b.id = d.block_id
        WHERE s.deleted_at IS NULL
          AND COALESCE(s.completed, FALSE) = FALSE
          AND s.session_start IS NOT NULL
          AND d.date IS NULL
          AND NOT EXISTS (SELECT 1 FROM activity_instances ai WHERE ai.session_id = s.id)
    """)).fetchall()
    seen = set()
    for program_day_id, session_start, day_of_week, block_start, block_end in rows:
        if session_start.tzinfo is not None:
            session_start = session_start.astimezone(timezone.utc)
        scheduled_date = session_start.date()
        if scheduled_date.strftime("%A") in _weekday_names(day_of_week):
            continue
        if block_start and block_end and not (block_start <= scheduled_date <= block_end):
            continue
        key = (program_day_id, scheduled_date)
        if key in seen:
            continue
        seen.add(key)
        bind.execute(sa.text("""
            INSERT INTO program_day_occurrence_schedules (id, program_day_id, date, created_at)
            VALUES (:id, :program_day_id, :date, CURRENT_TIMESTAMP)
            ON CONFLICT ON CONSTRAINT uq_program_day_occurrence_schedule_day_date DO NOTHING
        """), {"id": str(uuid.uuid4()), "program_day_id": program_day_id, "date": scheduled_date})


def upgrade():
    op.create_table(
        "program_day_occurrence_schedules",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("program_day_id", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.ForeignKeyConstraint(["program_day_id"], ["program_days.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint(
            "program_day_id", "date", name="uq_program_day_occurrence_schedule_day_date",
        ),
    )
    op.create_index(
        "ix_program_day_occurrence_schedules_program_day_id",
        "program_day_occurrence_schedules",
        ["program_day_id"],
    )
    op.create_index(
        "ix_program_day_occurrence_schedules_date",
        "program_day_occurrence_schedules",
        ["date"],
    )
    _backfill_legacy_placeholders(op.get_bind())


def downgrade():
    op.drop_index("ix_program_day_occurrence_schedules_date", table_name="program_day_occurrence_schedules")
    op.drop_index(
        "ix_program_day_occurrence_schedules_program_day_id", table_name="program_day_occurrence_schedules",
    )
    op.drop_table("program_day_occurrence_schedules")
