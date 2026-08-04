"""Reconcile durable schema with current SQLAlchemy metadata.

Revision ID: c6e8f1a3b5d7
Revises: ad4f7b2c9e10
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "c6e8f1a3b5d7"
down_revision = "ad4f7b2c9e10"
branch_labels = None
depends_on = None


JSONB_TYPE = postgresql.JSONB(astext_type=sa.Text())
JSON_TYPE = postgresql.JSON(astext_type=sa.Text())


def _table_exists(table_name):
    return table_name in sa.inspect(op.get_bind()).get_table_names()


def _index_exists(table_name, index_name):
    if not _table_exists(table_name):
        return False
    return any(
        row.get("name") == index_name
        for row in sa.inspect(op.get_bind()).get_indexes(table_name)
    )


def upgrade():
    if _table_exists("visualization_annotations"):
        op.drop_table("visualization_annotations")

    op.alter_column(
        "analytics_dashboards",
        "layout",
        existing_type=JSON_TYPE,
        type_=JSONB_TYPE,
        postgresql_using="layout::jsonb",
        existing_nullable=False,
    )
    op.alter_column(
        "analytics_query_profiles",
        "query_spec",
        existing_type=JSON_TYPE,
        type_=JSONB_TYPE,
        postgresql_using="query_spec::jsonb",
        existing_nullable=False,
    )
    op.alter_column(
        "analytics_query_profiles",
        "visualization_spec",
        existing_type=JSON_TYPE,
        type_=JSONB_TYPE,
        postgresql_using="visualization_spec::jsonb",
        existing_nullable=True,
    )
    op.alter_column(
        "goals",
        "progress_settings",
        existing_type=JSON_TYPE,
        type_=JSONB_TYPE,
        postgresql_using="progress_settings::jsonb",
        existing_nullable=True,
    )

    if not _index_exists("metric_definitions", "ix_metric_definitions_fractal_metric_id"):
        op.create_index(
            "ix_metric_definitions_fractal_metric_id",
            "metric_definitions",
            ["fractal_metric_id"],
        )


def downgrade():
    if _index_exists("metric_definitions", "ix_metric_definitions_fractal_metric_id"):
        op.drop_index(
            "ix_metric_definitions_fractal_metric_id",
            table_name="metric_definitions",
        )

    op.alter_column(
        "goals",
        "progress_settings",
        existing_type=JSONB_TYPE,
        type_=JSON_TYPE,
        postgresql_using="progress_settings::json",
        existing_nullable=True,
    )
    op.alter_column(
        "analytics_query_profiles",
        "visualization_spec",
        existing_type=JSONB_TYPE,
        type_=JSON_TYPE,
        postgresql_using="visualization_spec::json",
        existing_nullable=True,
    )
    op.alter_column(
        "analytics_query_profiles",
        "query_spec",
        existing_type=JSONB_TYPE,
        type_=JSON_TYPE,
        postgresql_using="query_spec::json",
        existing_nullable=False,
    )
    op.alter_column(
        "analytics_dashboards",
        "layout",
        existing_type=JSONB_TYPE,
        type_=JSON_TYPE,
        postgresql_using="layout::json",
        existing_nullable=False,
    )

    if not _table_exists("visualization_annotations"):
        op.create_table(
            "visualization_annotations",
            sa.Column("id", sa.String(), nullable=False),
            sa.Column("root_id", sa.String(), nullable=False),
            sa.Column("visualization_type", sa.String(), nullable=False),
            sa.Column("visualization_context", JSONB_TYPE, nullable=True),
            sa.Column("selected_points", JSONB_TYPE, nullable=True),
            sa.Column("selection_bounds", JSONB_TYPE, nullable=True),
            sa.Column("deleted_at", sa.DateTime(), nullable=True),
            sa.ForeignKeyConstraint(["root_id"], ["goals.id"], ondelete="CASCADE"),
            sa.PrimaryKeyConstraint("id"),
        )
        op.create_index(
            "ix_viz_annotations_root_type_context",
            "visualization_annotations",
            ["root_id", "visualization_type", "deleted_at"],
        )
