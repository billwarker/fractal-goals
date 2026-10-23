"""progress comparison scope (same template / program day) and remembered defaults

Revision ID: c8e0a2b4d6f8
Revises: a6c8e0f2b4d6
Create Date: 2026-10-21

Kind: additive. See planning/progress-pane-scope-and-chart.md.

- `activity_instances.progress_compare_same_template` / `progress_compare_same_program_day`
  narrow a comparison to past sessions from the same session template and/or program day.
- `activity_progress_defaults` (+ `activity_progress_default_tags`) remember the comparison chosen
  for an activity in a template/program day; an insert trigger pre-applies it to the activity's
  next instances there. Existing instances are untouched.
"""

import sqlalchemy as sa
from alembic import op


revision = "c8e0a2b4d6f8"
down_revision = "a6c8e0f2b4d6"
branch_labels = None
depends_on = None

PROGRESS_DEFAULT_TRIGGER_SQL = """
CREATE OR REPLACE FUNCTION apply_activity_progress_default() RETURNS trigger AS $$
DECLARE remembered record;
BEGIN
    IF NEW.session_id IS NULL THEN
        RETURN NULL;
    END IF;
    SELECT progress_default.* INTO remembered
    FROM activity_progress_defaults progress_default
    JOIN sessions session_row ON session_row.id = NEW.session_id
    WHERE progress_default.activity_definition_id = NEW.activity_definition_id
      AND progress_default.session_template_id IS NOT DISTINCT FROM session_row.template_id
      AND progress_default.program_day_id IS NOT DISTINCT FROM session_row.program_day_id;
    IF NOT FOUND THEN
        RETURN NULL;
    END IF;
    UPDATE activity_instances SET
        progress_compare_mode = remembered.compare_mode,
        progress_compare_same_template = remembered.same_template,
        progress_compare_same_program_day = remembered.same_program_day
    WHERE id = NEW.id;
    INSERT INTO activity_instance_compare_tags (activity_instance_id, tag_definition_id)
    SELECT NEW.id, default_tag.tag_definition_id
    FROM activity_progress_default_tags default_tag
    JOIN activity_tag_definitions tag ON tag.id = default_tag.tag_definition_id
    WHERE default_tag.default_id = remembered.id AND tag.root_id = NEW.root_id
    ON CONFLICT DO NOTHING;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_activity_instances_progress_default ON activity_instances;
CREATE TRIGGER trg_activity_instances_progress_default AFTER INSERT ON activity_instances
FOR EACH ROW EXECUTE FUNCTION apply_activity_progress_default();
"""


def upgrade():
    for column in ("progress_compare_same_template", "progress_compare_same_program_day"):
        op.add_column("activity_instances", sa.Column(column, sa.Boolean(), nullable=False, server_default=sa.text("false")))

    op.create_table(
        "activity_progress_defaults",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("activity_definition_id", sa.String(), sa.ForeignKey("activity_definitions.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_template_id", sa.String(), sa.ForeignKey("session_templates.id", ondelete="CASCADE"), nullable=True),
        sa.Column("program_day_id", sa.String(), sa.ForeignKey("program_days.id", ondelete="CASCADE"), nullable=True),
        sa.Column("compare_mode", sa.String(length=8), nullable=True),
        sa.Column("same_template", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("same_program_day", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("compare_mode IS NULL OR compare_mode IN ('all', 'tags')", name="ck_activity_progress_defaults_compare_mode"),
        sa.CheckConstraint("session_template_id IS NOT NULL OR program_day_id IS NOT NULL", name="ck_activity_progress_defaults_has_context"),
        sa.CheckConstraint("version > 0", name="ck_activity_progress_defaults_version_positive"),
    )
    for column in ("root_id", "activity_definition_id", "session_template_id", "program_day_id"):
        op.create_index(f"ix_activity_progress_defaults_{column}", "activity_progress_defaults", [column])
    op.execute(
        "CREATE UNIQUE INDEX uq_activity_progress_defaults_context ON activity_progress_defaults "
        "(activity_definition_id, coalesce(session_template_id, ''), coalesce(program_day_id, ''))"
    )
    op.create_table(
        "activity_progress_default_tags",
        sa.Column("default_id", sa.String(), sa.ForeignKey("activity_progress_defaults.id", ondelete="CASCADE"), primary_key=True),
        sa.Column("tag_definition_id", sa.String(), sa.ForeignKey("activity_tag_definitions.id", ondelete="CASCADE"), primary_key=True),
    )
    op.create_index("ix_activity_progress_default_tags_tag", "activity_progress_default_tags", ["tag_definition_id"])
    op.execute(PROGRESS_DEFAULT_TRIGGER_SQL)


def downgrade():
    op.execute("DROP TRIGGER IF EXISTS trg_activity_instances_progress_default ON activity_instances")
    op.execute("DROP FUNCTION IF EXISTS apply_activity_progress_default()")
    op.drop_table("activity_progress_default_tags")
    op.drop_table("activity_progress_defaults")
    op.drop_column("activity_instances", "progress_compare_same_program_day")
    op.drop_column("activity_instances", "progress_compare_same_template")
