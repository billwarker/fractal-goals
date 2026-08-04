import importlib
from datetime import datetime

import sqlalchemy as sa


migration = importlib.import_module(
    "migrations.versions.5c7d9e1f3a2b_add_circuits_normalized_sets_and_work_intervals"
)
reconciliation_migration = importlib.import_module(
    "migrations.versions.d7f9a2c4e6b8_reconcile_circuit_rollout_schema"
)


def test_json_object_accepts_mapping_or_encoded_mapping_only():
    assert migration._json_object({"sets": []}) == {"sets": []}
    assert (
        migration._json_object('{"sets": [{"completed": true}]}')["sets"][0][
            "completed"
        ]
        is True
    )
    assert migration._json_object("not-json") == {}
    assert migration._json_object("[]") == {}


def test_set_backfill_normalizes_status_and_nonnegative_duration():
    assert migration._normalized_status({"status": " ACTIVE "}) == "active"
    assert migration._normalized_status({"completed": True}) == "completed"
    assert migration._normalized_status({"status": "unknown"}) == "planned"
    assert migration._nonnegative_int("14") == 14
    assert migration._nonnegative_int(-3) == 0
    assert migration._nonnegative_int("invalid") == 0


def test_legacy_metric_deduplication_keeps_newest_value_per_result_identity():
    engine = sa.create_engine("sqlite://")
    metadata = sa.MetaData()
    metric_values = sa.Table(
        "metric_values",
        metadata,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("activity_instance_id", sa.String(), nullable=False),
        sa.Column("activity_set_id", sa.String(), nullable=True),
        sa.Column("metric_definition_id", sa.String(), nullable=False),
        sa.Column("split_definition_id", sa.String(), nullable=True),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
    )
    metadata.create_all(engine)
    older = datetime(2026, 1, 1, 10)
    newer = datetime(2026, 1, 2, 10)

    with engine.begin() as connection:
        connection.execute(
            metric_values.insert(),
            [
                {
                    "id": "old-null-split",
                    "activity_instance_id": "instance-1",
                    "activity_set_id": None,
                    "metric_definition_id": "metric-1",
                    "split_definition_id": None,
                    "value": 5,
                    "created_at": older,
                    "updated_at": older,
                },
                {
                    "id": "new-null-split",
                    "activity_instance_id": "instance-1",
                    "activity_set_id": None,
                    "metric_definition_id": "metric-1",
                    "split_definition_id": None,
                    "value": 7,
                    "created_at": newer,
                    "updated_at": newer,
                },
                {
                    "id": "different-split",
                    "activity_instance_id": "instance-1",
                    "activity_set_id": None,
                    "metric_definition_id": "metric-1",
                    "split_definition_id": "left",
                    "value": 9,
                    "created_at": older,
                    "updated_at": older,
                },
            ],
        )

        assert migration._deduplicate_legacy_metric_values(connection) == 1
        remaining = (
            connection.execute(
                sa.select(metric_values.c.id).order_by(metric_values.c.id)
            )
            .scalars()
            .all()
        )

    assert remaining == ["different-split", "new-null-split"]


def test_reconciliation_downgrade_does_not_restore_legacy_note_set_index(monkeypatch):
    added_columns = []
    monkeypatch.setattr(
        reconciliation_migration,
        "_set_member_result_foreign_key",
        lambda *_args: None,
    )
    monkeypatch.setattr(reconciliation_migration, "_has_index", lambda *_args: False)
    monkeypatch.setattr(
        reconciliation_migration,
        "_has_unique_constraint",
        lambda *_args: True,
    )
    monkeypatch.setattr(
        reconciliation_migration.op,
        "add_column",
        lambda *args: added_columns.append(args),
    )

    reconciliation_migration.downgrade()

    assert added_columns == []
