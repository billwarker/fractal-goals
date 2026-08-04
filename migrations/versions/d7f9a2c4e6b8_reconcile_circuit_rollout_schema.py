"""reconcile circuit rollout schema

Revision ID: d7f9a2c4e6b8
Revises: c6e8f1a3b5d7
Create Date: 2026-08-04

Older installations may have applied an early circuit migration shape before
the migration file was finalized. This revision makes both those databases and
fresh zero-to-head databases converge on the same canonical schema.
"""

from alembic import op
import sqlalchemy as sa


revision = "d7f9a2c4e6b8"
down_revision = "c6e8f1a3b5d7"
branch_labels = None
depends_on = None


def _inspector():
    return sa.inspect(op.get_bind())


def _foreign_key_for(column_name):
    for foreign_key in _inspector().get_foreign_keys("circuit_round_members"):
        if foreign_key.get("constrained_columns") == [column_name]:
            return foreign_key
    return None


def _set_member_result_foreign_key(column_name, target_table, ondelete):
    existing = _foreign_key_for(column_name)
    current_action = (existing or {}).get("options", {}).get("ondelete")
    if current_action and current_action.upper() == ondelete:
        return
    if existing:
        op.drop_constraint(existing["name"], "circuit_round_members", type_="foreignkey")
    op.create_foreign_key(
        f"circuit_round_members_{column_name}_fkey",
        "circuit_round_members",
        target_table,
        [column_name],
        ["id"],
        ondelete=ondelete,
    )


def _has_index(table_name, index_name):
    return any(index.get("name") == index_name for index in _inspector().get_indexes(table_name))


def _has_unique_constraint(table_name, constraint_name):
    return any(
        constraint.get("name") == constraint_name
        for constraint in _inspector().get_unique_constraints(table_name)
    )


def _has_column(table_name, column_name):
    return any(column.get("name") == column_name for column in _inspector().get_columns(table_name))


def upgrade():
    _set_member_result_foreign_key("activity_instance_id", "activity_instances", "CASCADE")
    _set_member_result_foreign_key("activity_set_id", "activity_sets", "CASCADE")

    if _has_unique_constraint("metric_values", "uq_metric_values_result_metric_split"):
        op.drop_constraint(
            "uq_metric_values_result_metric_split",
            "metric_values",
            type_="unique",
        )
    if not _has_index("metric_values", "uq_metric_values_result_metric_split"):
        # The legacy four-column constraint treated NULLs as distinct, so older
        # databases can contain duplicate instance-level or unsplit results.
        # Retain the most recently updated value before enforcing canonical
        # NULL-equal uniqueness.
        op.execute(sa.text("""
            DELETE FROM metric_values AS metric_value
            USING (
                SELECT id
                FROM (
                    SELECT
                        id,
                        ROW_NUMBER() OVER (
                            PARTITION BY
                                activity_instance_id,
                                COALESCE(activity_set_id, ''),
                                metric_definition_id,
                                COALESCE(split_definition_id, '')
                            ORDER BY updated_at DESC NULLS LAST, created_at DESC NULLS LAST, id DESC
                        ) AS duplicate_rank
                    FROM metric_values
                ) AS ranked
                WHERE duplicate_rank > 1
            ) AS duplicate
            WHERE metric_value.id = duplicate.id
        """))
        op.create_index(
            "uq_metric_values_result_metric_split",
            "metric_values",
            [
                sa.text("activity_instance_id"),
                sa.text("COALESCE(activity_set_id, '')"),
                sa.text("metric_definition_id"),
                sa.text("COALESCE(split_definition_id, '')"),
            ],
            unique=True,
        )

    if _has_column("notes", "set_index"):
        op.drop_column("notes", "set_index")


def downgrade():
    _set_member_result_foreign_key("activity_instance_id", "activity_instances", "SET NULL")
    _set_member_result_foreign_key("activity_set_id", "activity_sets", "SET NULL")

    if _has_index("metric_values", "uq_metric_values_result_metric_split"):
        op.drop_index("uq_metric_values_result_metric_split", table_name="metric_values")
    if not _has_unique_constraint("metric_values", "uq_metric_values_result_metric_split"):
        op.create_unique_constraint(
            "uq_metric_values_result_metric_split",
            "metric_values",
            [
                "activity_instance_id",
                "activity_set_id",
                "metric_definition_id",
                "split_definition_id",
            ],
        )

    if not _has_column("notes", "set_index"):
        op.add_column("notes", sa.Column("set_index", sa.Integer(), nullable=True))
