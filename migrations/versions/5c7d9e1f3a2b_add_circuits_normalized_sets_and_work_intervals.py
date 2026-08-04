"""Add circuits, normalized activity sets, and exclusive work intervals.

Revision ID: 5c7d9e1f3a2b
Revises: 4b8d2f6a9c1e
Create Date: 2026-07-17
"""

from __future__ import annotations

import json
import logging
import uuid
from datetime import datetime, timezone

from alembic import op
import sqlalchemy as sa


logger = logging.getLogger("alembic.runtime.migration")


revision = "5c7d9e1f3a2b"
down_revision = "4b8d2f6a9c1e"
branch_labels = None
depends_on = None


def _json_object(value):
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except (TypeError, ValueError):
            return {}
        return dict(parsed) if isinstance(parsed, dict) else {}
    return {}


def _normalized_status(raw_set):
    explicit = str(raw_set.get("status") or "").strip().lower()
    if explicit in {"planned", "active", "completed", "skipped", "unfinished"}:
        return explicit
    return "completed" if raw_set.get("completed") else "planned"


def _nonnegative_int(value):
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _deduplicate_legacy_metric_values(bind):
    """Keep the newest value for legacy result/metric/split collisions.

    Older releases allowed more than one top-level metric row for the same
    activity result. Circuit storage makes that identity explicit, so repair
    historical collisions before installing the unique index. The ordering is
    deterministic even when legacy timestamps are missing or tied.
    """
    result = bind.execute(
        sa.text(
            """
            DELETE FROM metric_values
            WHERE id IN (
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
                            ORDER BY
                                updated_at DESC NULLS LAST,
                                created_at DESC NULLS LAST,
                                id DESC
                        ) AS duplicate_rank
                    FROM metric_values
                ) AS ranked_metric_values
                WHERE duplicate_rank > 1
            )
            """
        )
    )
    removed_count = max(0, result.rowcount or 0)
    if removed_count:
        logger.warning(
            "Reconciled %d duplicate legacy metric value row(s) before "
            "creating uq_metric_values_result_metric_split",
            removed_count,
        )
    return removed_count


def _create_activity_sets():
    op.create_table(
        "activity_sets",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "activity_instance_id",
            sa.String(),
            sa.ForeignKey("activity_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("notes", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("sort_order >= 0", name="ck_activity_sets_sort_order_nonnegative"),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'completed', 'skipped', 'unfinished')",
            name="ck_activity_sets_status",
        ),
        sa.CheckConstraint("duration_seconds >= 0", name="ck_activity_sets_duration_nonnegative"),
        sa.UniqueConstraint("activity_instance_id", "sort_order", name="uq_activity_sets_instance_order"),
    )
    op.create_index("ix_activity_sets_activity_instance_id", "activity_sets", ["activity_instance_id"])
    op.add_column(
        "metric_values",
        sa.Column(
            "activity_set_id",
            sa.String(),
            sa.ForeignKey("activity_sets.id", ondelete="CASCADE"),
            nullable=True,
        ),
    )
    op.create_index("ix_metric_values_activity_set_id", "metric_values", ["activity_set_id"])
    _deduplicate_legacy_metric_values(op.get_bind())
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
    op.add_column(
        "notes",
        sa.Column(
            "activity_set_id",
            sa.String(),
            sa.ForeignKey("activity_sets.id", ondelete="SET NULL"),
            nullable=True,
        ),
    )
    op.create_index("ix_notes_activity_set_id", "notes", ["activity_set_id"])


def _backfill_activity_sets():
    bind = op.get_bind()
    instance_rows = bind.execute(sa.text("SELECT id, data FROM activity_instances")).mappings()
    valid_metric_ids = set(bind.execute(sa.text("SELECT id FROM metric_definitions")).scalars())
    valid_split_ids = set(bind.execute(sa.text("SELECT id FROM split_definitions")).scalars())
    used_set_ids = set()

    for instance_row in instance_rows:
        instance_id = instance_row["id"]
        data = _json_object(instance_row["data"])
        raw_sets = data.get("sets")
        if not isinstance(raw_sets, list):
            continue

        for set_index, raw_set in enumerate(raw_sets):
            if not isinstance(raw_set, dict):
                raw_set = {}
            requested_set_id = str(raw_set.get("id") or "")
            activity_set_id = requested_set_id if requested_set_id and requested_set_id not in used_set_ids else str(uuid.uuid4())
            used_set_ids.add(activity_set_id)
            bind.execute(
                sa.text(
                    """
                    INSERT INTO activity_sets
                        (id, activity_instance_id, sort_order, status, duration_seconds, notes, created_at, updated_at)
                    VALUES
                        (:id, :instance_id, :sort_order, :status, :duration_seconds, :notes, NOW(), NOW())
                    """
                ),
                {
                    "id": activity_set_id,
                    "instance_id": instance_id,
                    "sort_order": set_index,
                    "status": _normalized_status(raw_set),
                    "duration_seconds": _nonnegative_int(raw_set.get("duration_seconds")),
                    "notes": raw_set.get("notes") if isinstance(raw_set.get("notes"), str) else None,
                },
            )

            seen_metric_keys = set()
            for raw_metric in raw_set.get("metrics") or []:
                if not isinstance(raw_metric, dict):
                    continue
                metric_id = raw_metric.get("metric_id") or raw_metric.get("metric_definition_id")
                split_id = raw_metric.get("split_id") or raw_metric.get("split_definition_id")
                if metric_id not in valid_metric_ids or (split_id and split_id not in valid_split_ids):
                    continue
                metric_key = (metric_id, split_id)
                if metric_key in seen_metric_keys:
                    continue
                seen_metric_keys.add(metric_key)
                try:
                    metric_value = float(raw_metric.get("value"))
                except (TypeError, ValueError):
                    continue
                bind.execute(
                    sa.text(
                        """
                        INSERT INTO metric_values
                            (id, activity_instance_id, activity_set_id, metric_definition_id,
                             split_definition_id, value, created_at, updated_at)
                        VALUES
                            (:id, :instance_id, :set_id, :metric_id, :split_id, :value, NOW(), NOW())
                        """
                    ),
                    {
                        "id": str(uuid.uuid4()),
                        "instance_id": instance_id,
                        "set_id": activity_set_id,
                        "metric_id": metric_id,
                        "split_id": split_id,
                        "value": metric_value,
                    },
                )

            bind.execute(
                sa.text(
                    """
                    UPDATE notes
                    SET activity_set_id = :set_id
                    WHERE activity_instance_id = :instance_id
                      AND set_index = :set_index
                      AND activity_set_id IS NULL
                    """
                ),
                {"set_id": activity_set_id, "instance_id": instance_id, "set_index": set_index},
            )

        data.pop("sets", None)
        bind.execute(
            sa.text("UPDATE activity_instances SET data = :data WHERE id = :instance_id"),
            {"data": json.dumps(data), "instance_id": instance_id},
        )


def _create_circuit_tables():
    op.create_table(
        "circuit_definitions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("planned_rounds", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("version", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("deleted_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("planned_rounds > 0", name="ck_circuit_definitions_planned_rounds_positive"),
        sa.CheckConstraint("version > 0", name="ck_circuit_definitions_version_positive"),
    )
    op.create_index("ix_circuit_definitions_root_id", "circuit_definitions", ["root_id"])
    op.create_index("ix_circuit_definitions_root_deleted", "circuit_definitions", ["root_id", "deleted_at"])

    op.create_table(
        "circuit_slots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "circuit_definition_id",
            sa.String(),
            sa.ForeignKey("circuit_definitions.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activity_definition_id",
            sa.String(),
            sa.ForeignKey("activity_definitions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("display_label", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("sort_order >= 0", name="ck_circuit_slots_sort_order_nonnegative"),
        sa.UniqueConstraint("circuit_definition_id", "sort_order", name="uq_circuit_slots_definition_order"),
    )
    op.create_index("ix_circuit_slots_circuit_definition_id", "circuit_slots", ["circuit_definition_id"])
    op.create_index("ix_circuit_slots_activity_definition_id", "circuit_slots", ["activity_definition_id"])

    op.create_table(
        "circuit_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "circuit_definition_id",
            sa.String(),
            sa.ForeignKey("circuit_definitions.id", ondelete="SET NULL"),
            nullable=True,
        ),
        sa.Column("source_version", sa.Integer(), nullable=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=False, server_default=""),
        sa.Column("planned_rounds", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
        sa.Column("time_start", sa.DateTime(), nullable=True),
        sa.Column("time_stop", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("is_paused", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_paused_at", sa.DateTime(), nullable=True),
        sa.Column("total_paused_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.CheckConstraint("planned_rounds > 0", name="ck_circuit_runs_planned_rounds_positive"),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'paused', 'completed')",
            name="ck_circuit_runs_status",
        ),
        sa.CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="ck_circuit_runs_duration"),
        sa.CheckConstraint("total_paused_seconds >= 0", name="ck_circuit_runs_paused_duration"),
    )
    op.create_index("ix_circuit_runs_root_id", "circuit_runs", ["root_id"])
    op.create_index("ix_circuit_runs_session_id", "circuit_runs", ["session_id"])
    op.create_index("ix_circuit_runs_circuit_definition_id", "circuit_runs", ["circuit_definition_id"])
    op.create_index("ix_circuit_runs_session_status", "circuit_runs", ["session_id", "status"])

    op.create_table(
        "circuit_run_slots",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("circuit_run_id", sa.String(), sa.ForeignKey("circuit_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("source_slot_id", sa.String(), sa.ForeignKey("circuit_slots.id", ondelete="SET NULL"), nullable=True),
        sa.Column(
            "activity_definition_id",
            sa.String(),
            sa.ForeignKey("activity_definitions.id", ondelete="RESTRICT"),
            nullable=False,
        ),
        sa.Column(
            "activity_instance_id",
            sa.String(),
            sa.ForeignKey("activity_instances.id", ondelete="SET NULL"),
            nullable=True,
            unique=True,
        ),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("display_label", sa.String(), nullable=True),
        sa.Column("activity_name", sa.String(), nullable=False),
        sa.Column("has_sets", sa.Boolean(), nullable=False),
        sa.Column("has_metrics", sa.Boolean(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("sort_order >= 0", name="ck_circuit_run_slots_sort_order_nonnegative"),
        sa.UniqueConstraint("circuit_run_id", "sort_order", name="uq_circuit_run_slots_run_order"),
    )
    op.create_index("ix_circuit_run_slots_circuit_run_id", "circuit_run_slots", ["circuit_run_id"])
    op.create_index("ix_circuit_run_slots_activity_definition_id", "circuit_run_slots", ["activity_definition_id"])

    op.create_table(
        "circuit_rounds",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("circuit_run_id", sa.String(), sa.ForeignKey("circuit_runs.id", ondelete="CASCADE"), nullable=False),
        sa.Column("round_number", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
        sa.Column("time_start", sa.DateTime(), nullable=True),
        sa.Column("time_stop", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("is_paused", sa.Boolean(), nullable=False, server_default=sa.text("false")),
        sa.Column("last_paused_at", sa.DateTime(), nullable=True),
        sa.Column("total_paused_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("round_number > 0", name="ck_circuit_rounds_number_positive"),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'paused', 'completed', 'unfinished')",
            name="ck_circuit_rounds_status",
        ),
        sa.CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="ck_circuit_rounds_duration"),
        sa.CheckConstraint("total_paused_seconds >= 0", name="ck_circuit_rounds_paused_duration"),
        sa.UniqueConstraint("circuit_run_id", "round_number", name="uq_circuit_rounds_run_number"),
    )
    op.create_index("ix_circuit_rounds_circuit_run_id", "circuit_rounds", ["circuit_run_id"])

    op.create_table(
        "circuit_round_members",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("circuit_round_id", sa.String(), sa.ForeignKey("circuit_rounds.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "circuit_run_slot_id",
            sa.String(),
            sa.ForeignKey("circuit_run_slots.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "activity_instance_id",
            sa.String(),
            sa.ForeignKey("activity_instances.id", ondelete="CASCADE"),
            nullable=True,
            unique=True,
        ),
        sa.Column("activity_set_id", sa.String(), sa.ForeignKey("activity_sets.id", ondelete="CASCADE"), nullable=True, unique=True),
        sa.Column("sort_order", sa.Integer(), nullable=False),
        sa.Column("status", sa.String(length=16), nullable=False, server_default="planned"),
        sa.Column("duration_seconds", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("sort_order >= 0", name="ck_circuit_round_members_sort_order_nonnegative"),
        sa.CheckConstraint("duration_seconds >= 0", name="ck_circuit_round_members_duration"),
        sa.CheckConstraint(
            "status IN ('planned', 'active', 'completed', 'skipped', 'unfinished')",
            name="ck_circuit_round_members_status",
        ),
        sa.CheckConstraint(
            "(activity_instance_id IS NULL) <> (activity_set_id IS NULL)",
            name="ck_circuit_round_members_single_result",
        ),
        sa.UniqueConstraint("circuit_round_id", "sort_order", name="uq_circuit_round_members_round_order"),
        sa.UniqueConstraint("circuit_round_id", "circuit_run_slot_id", name="uq_circuit_round_members_round_slot"),
    )
    op.create_index("ix_circuit_round_members_circuit_round_id", "circuit_round_members", ["circuit_round_id"])
    op.create_index("ix_circuit_round_members_circuit_run_slot_id", "circuit_round_members", ["circuit_run_slot_id"])

    op.create_table(
        "session_work_intervals",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("root_id", sa.String(), sa.ForeignKey("goals.id", ondelete="CASCADE"), nullable=False),
        sa.Column("session_id", sa.String(), sa.ForeignKey("sessions.id", ondelete="CASCADE"), nullable=False),
        sa.Column(
            "activity_instance_id",
            sa.String(),
            sa.ForeignKey("activity_instances.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("activity_set_id", sa.String(), sa.ForeignKey("activity_sets.id", ondelete="CASCADE"), nullable=True),
        sa.Column(
            "circuit_round_member_id",
            sa.String(),
            sa.ForeignKey("circuit_round_members.id", ondelete="CASCADE"),
            nullable=True,
        ),
        sa.Column("started_at", sa.DateTime(), nullable=False),
        sa.Column("ended_at", sa.DateTime(), nullable=True),
        sa.Column("duration_seconds", sa.Integer(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.CheckConstraint("ended_at IS NULL OR ended_at >= started_at", name="ck_work_intervals_time_order"),
        sa.CheckConstraint("duration_seconds IS NULL OR duration_seconds >= 0", name="ck_work_intervals_duration"),
    )
    op.create_index("ix_session_work_intervals_root_id", "session_work_intervals", ["root_id"])
    op.create_index("ix_session_work_intervals_session_id", "session_work_intervals", ["session_id"])
    op.create_index("ix_session_work_intervals_activity_instance_id", "session_work_intervals", ["activity_instance_id"])
    op.create_index("ix_session_work_intervals_activity_set_id", "session_work_intervals", ["activity_set_id"])
    op.create_index("ix_session_work_intervals_circuit_round_member_id", "session_work_intervals", ["circuit_round_member_id"])
    op.create_index("ix_session_work_intervals_session_started", "session_work_intervals", ["session_id", "started_at"])
    op.create_index(
        "uq_session_work_intervals_one_open",
        "session_work_intervals",
        ["session_id"],
        unique=True,
        postgresql_where=sa.text("ended_at IS NULL"),
        sqlite_where=sa.text("ended_at IS NULL"),
    )


def _backfill_work_intervals():
    bind = op.get_bind()
    rows = bind.execute(
        sa.text(
            """
            SELECT ai.id, ai.root_id, ai.session_id, ai.time_start, ai.time_stop,
                   ai.duration_seconds, ai.total_paused_seconds,
                   s.is_paused AS session_is_paused, s.last_paused_at AS session_last_paused_at
            FROM activity_instances AS ai
            JOIN sessions AS s ON s.id = ai.session_id
            WHERE ai.deleted_at IS NULL
              AND ai.time_start IS NOT NULL
            ORDER BY ai.session_id, ai.time_start DESC, ai.id
            """
        )
    ).mappings().all()
    newest_active_by_session = {}
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    for row in rows:
        ended_at = row["time_stop"]
        if ended_at is None:
            if row["session_is_paused"]:
                ended_at = row["session_last_paused_at"] or now
            elif row["session_id"] not in newest_active_by_session:
                newest_active_by_session[row["session_id"]] = row["id"]
            else:
                ended_at = now
        if ended_at is None:
            duration = None
        elif row["duration_seconds"] is not None:
            duration = max(0, int(row["duration_seconds"]))
        else:
            duration = max(
                0,
                int((ended_at - row["time_start"]).total_seconds())
                - int(row["total_paused_seconds"] or 0),
            )
        bind.execute(
            sa.text(
                """
                INSERT INTO session_work_intervals
                    (id, root_id, session_id, activity_instance_id, started_at, ended_at,
                     duration_seconds, created_at, updated_at)
                VALUES
                    (:id, :root_id, :session_id, :instance_id, :started_at, :ended_at,
                     :duration_seconds, NOW(), NOW())
                """
            ),
            {
                "id": str(uuid.uuid4()),
                "root_id": row["root_id"],
                "session_id": row["session_id"],
                "instance_id": row["id"],
                "started_at": row["time_start"],
                "ended_at": ended_at,
                "duration_seconds": duration,
            },
        )


def upgrade():
    _create_activity_sets()
    _backfill_activity_sets()
    op.drop_column("notes", "set_index")
    _create_circuit_tables()
    _backfill_work_intervals()


def downgrade():
    bind = op.get_bind()
    op.add_column("notes", sa.Column("set_index", sa.Integer(), nullable=True))
    bind.execute(sa.text(
        """
        UPDATE notes AS n
        SET set_index = s.sort_order
        FROM activity_sets AS s
        WHERE n.activity_set_id = s.id
        """
    ))
    set_rows = bind.execute(
        sa.text(
            """
            SELECT s.id, s.activity_instance_id, s.sort_order, s.status, s.duration_seconds, s.notes
            FROM activity_sets AS s
            ORDER BY s.activity_instance_id, s.sort_order
            """
        )
    ).mappings().all()
    metrics = bind.execute(
        sa.text(
            """
            SELECT activity_set_id, metric_definition_id, split_definition_id, value
            FROM metric_values
            WHERE activity_set_id IS NOT NULL
            ORDER BY created_at, id
            """
        )
    ).mappings().all()
    metrics_by_set = {}
    for metric in metrics:
        payload = {"metric_id": metric["metric_definition_id"], "value": metric["value"]}
        if metric["split_definition_id"]:
            payload["split_id"] = metric["split_definition_id"]
        metrics_by_set.setdefault(metric["activity_set_id"], []).append(payload)

    sets_by_instance = {}
    for row in set_rows:
        payload = {
            "id": row["id"],
            "completed": row["status"] == "completed",
            "status": row["status"],
            "duration_seconds": row["duration_seconds"],
            "metrics": metrics_by_set.get(row["id"], []),
        }
        if row["notes"]:
            payload["notes"] = row["notes"]
        sets_by_instance.setdefault(row["activity_instance_id"], []).append(payload)

    for instance_id, instance_sets in sets_by_instance.items():
        current = bind.execute(
            sa.text("SELECT data FROM activity_instances WHERE id = :id"),
            {"id": instance_id},
        ).scalar()
        data = _json_object(current)
        data["sets"] = instance_sets
        bind.execute(
            sa.text("UPDATE activity_instances SET data = :data WHERE id = :id"),
            {"data": json.dumps(data), "id": instance_id},
        )

    op.drop_table("session_work_intervals")
    op.drop_table("circuit_round_members")
    op.drop_table("circuit_rounds")
    op.drop_table("circuit_run_slots")
    op.drop_table("circuit_runs")
    op.drop_table("circuit_slots")
    op.drop_table("circuit_definitions")
    op.drop_index("ix_notes_activity_set_id", table_name="notes")
    op.drop_column("notes", "activity_set_id")
    # Early development installs created this as a UNIQUE constraint. Accept
    # either shape so local/test databases can still reverse the revision.
    metric_unique_constraints = {
        item.get("name") for item in sa.inspect(bind).get_unique_constraints("metric_values")
    }
    if "uq_metric_values_result_metric_split" in metric_unique_constraints:
        op.drop_constraint("uq_metric_values_result_metric_split", "metric_values", type_="unique")
    else:
        op.drop_index("uq_metric_values_result_metric_split", table_name="metric_values")
    op.drop_index("ix_metric_values_activity_set_id", table_name="metric_values")
    op.drop_column("metric_values", "activity_set_id")
    op.drop_table("activity_sets")
