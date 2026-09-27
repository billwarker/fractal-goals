"""Add dated program session plans and planned-value snapshots.

- ``session_templates.revision`` counts template edits so plans can detect drift.
- Every typed template section item gets a stable ``item_key`` (backfilled here;
  new writes assign one in validation). ``id`` is not reused because legacy items
  use it as the activity id.
- ``program_session_plans`` holds one dated plan per program day, template and date.
- ``activity_instances.prescription`` snapshots planned values at session creation.
- ``sessions.program_session_plan_id`` links a session to the plan it executed.

The backfill is idempotent: items that already carry an ``item_key`` are untouched.

Revision ID: d3f5a7c9e1b2
Revises: b6d8f0a2c4e7
"""
import json
import uuid

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "d3f5a7c9e1b2"
down_revision = "b6d8f0a2c4e7"
branch_labels = None
depends_on = None


def _json_type():
    if op.get_bind().dialect.name == "postgresql":
        return postgresql.JSONB()
    return sa.JSON()


def _with_item_keys(template_data):
    """Return template data with item keys added, or None when nothing changed."""
    changed = False
    for section in template_data.get("sections") or []:
        if not isinstance(section, dict):
            continue
        for item in section.get("items") or []:
            if isinstance(item, dict) and not item.get("item_key"):
                item["item_key"] = str(uuid.uuid4())
                changed = True
    return template_data if changed else None


def _backfill_item_keys():
    bind = op.get_bind()
    templates = sa.table(
        "session_templates",
        sa.column("id", sa.String()),
        sa.column("template_data", _json_type()),
    )
    rows = bind.execute(sa.select(templates.c.id, templates.c.template_data)).fetchall()
    for template_id, raw in rows:
        # Templates are stored either as a JSON document or a JSON-encoded string;
        # keep whichever form the row already uses.
        was_string = isinstance(raw, str)
        try:
            data = json.loads(raw) if was_string else raw
        except ValueError:
            continue
        if not isinstance(data, dict):
            continue
        updated = _with_item_keys(data)
        if updated is None:
            continue
        bind.execute(
            templates.update()
            .where(templates.c.id == template_id)
            .values(template_data=json.dumps(updated) if was_string else updated)
        )


def upgrade():
    op.add_column(
        "session_templates",
        sa.Column("revision", sa.Integer(), nullable=False, server_default="1"),
    )
    op.add_column("activity_instances", sa.Column("prescription", _json_type(), nullable=True))

    op.create_table(
        "program_session_plans",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("program_id", sa.String(), nullable=False),
        sa.Column("program_day_id", sa.String(), nullable=False),
        sa.Column("session_template_id", sa.String(), nullable=False),
        sa.Column("date", sa.Date(), nullable=False),
        sa.Column("plan_data", _json_type(), nullable=False),
        sa.Column("source_template_revision", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("seeded_from_plan_id", sa.String(), nullable=True),
        sa.Column("created_by_user_id", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False),
        sa.Column("updated_at", sa.DateTime(), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.Column("row_version", sa.Integer(), nullable=False, server_default="1"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["program_id"], ["programs.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["program_day_id"], ["program_days.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_template_id"], ["session_templates.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["seeded_from_plan_id"], ["program_session_plans.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["created_by_user_id"], ["users.id"], ondelete="SET NULL"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index(
        "uq_program_session_plans_day_template_date",
        "program_session_plans",
        ["program_day_id", "session_template_id", "date"],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )
    op.create_index(
        "ix_program_session_plans_root_template_date",
        "program_session_plans",
        ["root_id", "session_template_id", "date"],
    )
    op.create_index("ix_program_session_plans_program_id", "program_session_plans", ["program_id"])
    op.create_index(
        "ix_program_session_plans_session_template_id",
        "program_session_plans",
        ["session_template_id"],
    )

    op.add_column("sessions", sa.Column("program_session_plan_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_sessions_program_session_plan_id",
        "sessions",
        "program_session_plans",
        ["program_session_plan_id"],
        ["id"],
        ondelete="SET NULL",
    )
    op.create_index("ix_sessions_program_session_plan_id", "sessions", ["program_session_plan_id"])

    _backfill_item_keys()


def downgrade():
    # Item keys are inert extra JSON fields and are intentionally left in place.
    op.drop_index("ix_sessions_program_session_plan_id", table_name="sessions")
    op.drop_constraint("fk_sessions_program_session_plan_id", "sessions", type_="foreignkey")
    op.drop_column("sessions", "program_session_plan_id")
    op.drop_index("ix_program_session_plans_session_template_id", table_name="program_session_plans")
    op.drop_index("ix_program_session_plans_program_id", table_name="program_session_plans")
    op.drop_index("ix_program_session_plans_root_template_date", table_name="program_session_plans")
    op.drop_index("uq_program_session_plans_day_template_date", table_name="program_session_plans")
    op.drop_table("program_session_plans")
    op.drop_column("activity_instances", "prescription")
    op.drop_column("session_templates", "revision")
