"""add activity tags and saved progress views

Revision ID: a2c4e6f8b1d3
Revises: f1b2c3d4e5a6
Create Date: 2026-08-16
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql


revision = "a2c4e6f8b1d3"
down_revision = "f1b2c3d4e5a6"
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "activity_tags",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("activity_definition_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("color", sa.String(length=7), nullable=True),
        sa.Column("sort_order", sa.Integer(), server_default="0", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("color IS NULL OR color ~ '^#[0-9A-Fa-f]{6}$'", name="ck_activity_tags_color"),
        sa.ForeignKeyConstraint(["activity_definition_id"], ["activity_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_tags_root_id", "activity_tags", ["root_id"])
    op.create_index("ix_activity_tags_activity_definition_id", "activity_tags", ["activity_definition_id"])
    op.create_index(
        "uq_activity_tags_active_name",
        "activity_tags",
        ["activity_definition_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.create_table(
        "activity_progress_views",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("activity_definition_id", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("config", postgresql.JSONB(astext_type=sa.Text()), server_default=sa.text("'{}'::jsonb"), nullable=False),
        sa.Column("version", sa.Integer(), server_default="1", nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("version > 0", name="ck_activity_progress_views_version_positive"),
        sa.ForeignKeyConstraint(["activity_definition_id"], ["activity_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
    )
    op.create_index("ix_activity_progress_views_root_id", "activity_progress_views", ["root_id"])
    op.create_index("ix_activity_progress_views_activity_definition_id", "activity_progress_views", ["activity_definition_id"])
    op.create_index(
        "uq_activity_progress_views_active_name",
        "activity_progress_views",
        ["activity_definition_id", sa.text("lower(name)")],
        unique=True,
        postgresql_where=sa.text("deleted_at IS NULL"),
    )

    op.add_column("activity_definitions", sa.Column("active_progress_view_id", sa.String(), nullable=True))
    op.create_foreign_key(
        "fk_activity_definitions_active_progress_view_id",
        "activity_definitions",
        "activity_progress_views",
        ["active_progress_view_id"],
        ["id"],
        ondelete="SET NULL",
        use_alter=True,
    )
    op.create_index("ix_activity_definitions_active_progress_view_id", "activity_definitions", ["active_progress_view_id"])

    op.create_table(
        "activity_instance_tags",
        sa.Column("activity_instance_id", sa.String(), nullable=False),
        sa.Column("activity_tag_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["activity_instance_id"], ["activity_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_tag_id"], ["activity_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("activity_instance_id", "activity_tag_id"),
    )
    op.create_index("ix_activity_instance_tags_tag", "activity_instance_tags", ["activity_tag_id", "activity_instance_id"])

    op.create_table(
        "activity_set_tags",
        sa.Column("activity_set_id", sa.String(), nullable=False),
        sa.Column("activity_tag_id", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("now()"), nullable=False),
        sa.ForeignKeyConstraint(["activity_set_id"], ["activity_sets.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_tag_id"], ["activity_tags.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("activity_set_id", "activity_tag_id"),
    )
    op.create_index("ix_activity_set_tags_tag", "activity_set_tags", ["activity_tag_id", "activity_set_id"])

    # Dynamic progress replaces persisted snapshots. This is the contract step;
    # all readers have switched to canonical instances, sets, and metric values.
    op.drop_table("progress_records")


def downgrade():
    op.create_table(
        "progress_records",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("root_id", sa.String(), nullable=False),
        sa.Column("activity_definition_id", sa.String(), nullable=False),
        sa.Column("activity_instance_id", sa.String(), nullable=False),
        sa.Column("session_id", sa.String(), nullable=False),
        sa.Column("previous_instance_id", sa.String(), nullable=True),
        sa.Column("is_first_instance", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("has_change", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("has_improvement", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("has_regression", sa.Boolean(), server_default=sa.text("false"), nullable=False),
        sa.Column("comparison_type", sa.String(), nullable=True),
        sa.Column("metric_comparisons", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("derived_summary", postgresql.JSONB(astext_type=sa.Text()), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["activity_definition_id"], ["activity_definitions.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["activity_instance_id"], ["activity_instances.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["previous_instance_id"], ["activity_instances.id"], ondelete="SET NULL"),
        sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
        sa.ForeignKeyConstraint(["session_id"], ["sessions.id"], ondelete="CASCADE"),
        sa.PrimaryKeyConstraint("id"),
        sa.UniqueConstraint("activity_instance_id"),
    )
    op.create_index("ix_progress_records_root_id", "progress_records", ["root_id"])
    op.create_index("ix_progress_records_root_activity_created", "progress_records", ["root_id", "activity_definition_id", "created_at"])
    op.create_index("ix_progress_records_session", "progress_records", ["session_id"])
    op.drop_index("ix_activity_set_tags_tag", table_name="activity_set_tags")
    op.drop_table("activity_set_tags")
    op.drop_index("ix_activity_instance_tags_tag", table_name="activity_instance_tags")
    op.drop_table("activity_instance_tags")
    op.drop_index("ix_activity_definitions_active_progress_view_id", table_name="activity_definitions")
    op.drop_constraint("fk_activity_definitions_active_progress_view_id", "activity_definitions", type_="foreignkey")
    op.drop_column("activity_definitions", "active_progress_view_id")
    op.drop_index("uq_activity_progress_views_active_name", table_name="activity_progress_views")
    op.drop_index("ix_activity_progress_views_activity_definition_id", table_name="activity_progress_views")
    op.drop_index("ix_activity_progress_views_root_id", table_name="activity_progress_views")
    op.drop_table("activity_progress_views")
    op.drop_index("uq_activity_tags_active_name", table_name="activity_tags")
    op.drop_index("ix_activity_tags_activity_definition_id", table_name="activity_tags")
    op.drop_index("ix_activity_tags_root_id", table_name="activity_tags")
    op.drop_table("activity_tags")
