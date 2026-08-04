"""Snapshot circuit activity schemas and enforce run lifecycle invariants.

Revision ID: ad4f7b2c9e10
Revises: 9c3e6a1f4d8b
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql


revision = "ad4f7b2c9e10"
down_revision = "9c3e6a1f4d8b"
branch_labels = None
depends_on = None


JSON_TYPE = sa.JSON().with_variant(postgresql.JSONB(), "postgresql")


def _backfill_activity_schemas():
    bind = op.get_bind()
    slots = bind.execute(sa.text("""
        SELECT crs.id,
               crs.activity_definition_id,
               crs.activity_name,
               crs.has_sets,
               crs.has_metrics,
               ad.has_splits
        FROM circuit_run_slots crs
        JOIN activity_definitions ad ON ad.id = crs.activity_definition_id
    """)).mappings().all()
    slot_table = sa.table(
        "circuit_run_slots",
        sa.column("id", sa.String()),
        sa.column("activity_schema", JSON_TYPE),
    )
    for slot in slots:
        metrics = bind.execute(sa.text("""
            SELECT md.id,
                   md.fractal_metric_id,
                   COALESCE(fm.name, md.name) AS name,
                   COALESCE(fm.unit, md.unit) AS unit,
                   md.is_active,
                   md.is_best_set_metric,
                   COALESCE(fm.is_multiplicative, md.is_multiplicative) AS is_multiplicative,
                   md.track_progress,
                   md.progress_aggregation,
                   fm.is_additive,
                   COALESCE(fm.input_type, 'number') AS input_type,
                   fm.default_value,
                   fm.higher_is_better,
                   fm.default_progress_aggregation,
                   fm.predefined_values,
                   fm.min_value,
                   fm.max_value
            FROM metric_definitions md
            LEFT JOIN fractal_metric_definitions fm ON fm.id = md.fractal_metric_id
            WHERE md.activity_id = :activity_id AND md.deleted_at IS NULL
            ORDER BY md.sort_order, md.created_at
        """), {"activity_id": slot["activity_definition_id"]}).mappings().all()
        splits = bind.execute(sa.text("""
            SELECT id, name, "order"
            FROM split_definitions
            WHERE activity_id = :activity_id AND deleted_at IS NULL
            ORDER BY "order", created_at
        """), {"activity_id": slot["activity_definition_id"]}).mappings().all()
        schema = {
            "id": slot["activity_definition_id"],
            "name": slot["activity_name"],
            "has_sets": bool(slot["has_sets"]),
            "has_metrics": bool(slot["has_metrics"]),
            "has_splits": bool(slot["has_splits"]),
            "metric_definitions": [dict(row) for row in metrics],
            "split_definitions": [dict(row) for row in splits],
        }
        bind.execute(
            slot_table.update().where(slot_table.c.id == slot["id"]).values(
                activity_schema=schema,
            )
        )


def _normalize_run_lifecycle():
    op.execute(sa.text("""
        UPDATE circuit_runs
        SET time_start = CASE
                WHEN status = 'planned' THEN NULL
                ELSE COALESCE(time_start, time_stop, completed_at, created_at)
            END,
            time_stop = CASE
                WHEN status = 'completed'
                    THEN GREATEST(
                        COALESCE(time_stop, completed_at, time_start, created_at),
                        COALESCE(time_start, time_stop, completed_at, created_at)
                    )
                ELSE NULL
            END,
            duration_seconds = CASE
                WHEN status = 'completed' THEN GREATEST(COALESCE(duration_seconds, 0), 0)
                ELSE NULL
            END,
            is_paused = CASE WHEN status = 'paused' THEN true ELSE false END,
            last_paused_at = CASE
                WHEN status = 'paused'
                    THEN COALESCE(last_paused_at, time_start, created_at)
                ELSE NULL
            END,
            completed_at = CASE
                WHEN status = 'completed'
                    THEN COALESCE(completed_at, time_stop, time_start, created_at)
                ELSE NULL
            END
    """))


def upgrade():
    op.add_column(
        "circuit_run_slots",
        sa.Column(
            "activity_schema",
            JSON_TYPE,
            nullable=False,
            server_default=sa.text("'{}'"),
        ),
    )
    _backfill_activity_schemas()
    op.alter_column("circuit_run_slots", "activity_schema", server_default=None)

    _normalize_run_lifecycle()
    op.create_check_constraint(
        "ck_circuit_definitions_planned_rounds_max",
        "circuit_definitions",
        "planned_rounds <= 1000",
    )
    op.create_check_constraint(
        "ck_circuit_runs_planned_rounds_max",
        "circuit_runs",
        "planned_rounds <= 1000",
    )
    op.create_check_constraint(
        "ck_circuit_runs_time_order",
        "circuit_runs",
        "time_stop IS NULL OR (time_start IS NOT NULL AND time_stop >= time_start)",
    )
    op.create_check_constraint(
        "ck_circuit_runs_lifecycle_timing",
        "circuit_runs",
        "(status = 'planned' AND time_start IS NULL AND time_stop IS NULL "
        "AND duration_seconds IS NULL AND is_paused = false "
        "AND last_paused_at IS NULL AND completed_at IS NULL) OR "
        "(status = 'active' AND time_start IS NOT NULL AND time_stop IS NULL "
        "AND duration_seconds IS NULL AND is_paused = false "
        "AND last_paused_at IS NULL AND completed_at IS NULL) OR "
        "(status = 'paused' AND time_start IS NOT NULL AND time_stop IS NULL "
        "AND duration_seconds IS NULL AND is_paused = true "
        "AND last_paused_at IS NOT NULL AND completed_at IS NULL) OR "
        "(status = 'completed' AND time_start IS NOT NULL AND time_stop IS NOT NULL "
        "AND duration_seconds IS NOT NULL AND is_paused = false "
        "AND last_paused_at IS NULL AND completed_at IS NOT NULL)",
    )


def downgrade():
    op.drop_constraint(
        "ck_circuit_runs_lifecycle_timing",
        "circuit_runs",
        type_="check",
    )
    op.drop_constraint("ck_circuit_runs_time_order", "circuit_runs", type_="check")
    op.drop_constraint(
        "ck_circuit_runs_planned_rounds_max",
        "circuit_runs",
        type_="check",
    )
    op.drop_constraint(
        "ck_circuit_definitions_planned_rounds_max",
        "circuit_definitions",
        type_="check",
    )
    op.drop_column("circuit_run_slots", "activity_schema")
