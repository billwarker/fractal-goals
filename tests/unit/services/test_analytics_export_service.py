import datetime
import uuid
from types import SimpleNamespace

import pytest

import services.analytics_export_service as analytics_export_module
from models import AnalyticsErasure, EmailDeliveryEvent, EmailWebhookEvent, EventLog, Goal, ProductEvent, User, WebEvent
from services.analytics_export_service import AnalyticsExportService
from services.app_settings import ANALYTICS_EXPORT_STATE_KEY, TELEMETRY_RETENTION_KEY, get_app_setting, set_app_setting


class FakeLoadJob:
    def __init__(self, *, should_fail=False):
        self.should_fail = should_fail

    def result(self):
        if self.should_fail:
            raise RuntimeError("BigQuery load failed")


class FakeBigQueryClient:
    """Covers every client call the export makes, so tests behave the same whether or
    not google-cloud-bigquery is installed (it enables the retention/prune path)."""

    def __init__(self, fail_tables=None):
        self.loads = []
        self.fail_tables = set(fail_tables or [])
        self.tables = {}
        self.table_updates = []
        self.queries = []
        self.query_configs = []

    def get_table(self, table_ref):
        return self.tables.setdefault(table_ref, SimpleNamespace(
            table_ref=table_ref, time_partitioning=SimpleNamespace(expiration_ms=None), schema=[],
        ))

    def with_columns(self, table_ref, *columns):
        self.get_table(table_ref).schema = [SimpleNamespace(name=column) for column in columns]
        return self

    def update_table(self, table, fields):
        self.table_updates.append((table.table_ref, list(fields)))
        return table

    def query(self, sql, job_config=None):
        self.queries.append(sql)
        self.query_configs.append(job_config)
        return FakeLoadJob()

    def load_table_from_json(self, rows, table_ref, job_config=None):
        table = table_ref.rsplit(".", 1)[-1]
        self.loads.append({
            "table_ref": table_ref,
            "table": table,
            "rows": list(rows),
            "write_disposition": _write_disposition(job_config),
            "schema": _schema_fields(job_config),
        })
        return FakeLoadJob(should_fail=table in self.fail_tables)


def _write_disposition(job_config):
    if isinstance(job_config, dict):
        return job_config.get("write_disposition")
    return getattr(job_config, "write_disposition", None)


def _schema_fields(job_config):
    schema = job_config.get("schema") if isinstance(job_config, dict) else getattr(job_config, "schema", None)
    if not schema:
        return []
    fields = []
    for field in schema:
        if isinstance(field, tuple):
            fields.append(field)
        else:
            fields.append((field.name, field.field_type))
    return fields


def _dt(minutes):
    return datetime.datetime(2026, 7, 8, 12, 0, tzinfo=datetime.timezone.utc) + datetime.timedelta(minutes=minutes)


def _user(db_session, username="user", email="user@example.com", role="user"):
    user = User(
        id=str(uuid.uuid4()),
        username=username,
        email=email,
        role=role,
        membership_tier="free",
        created_at=_dt(-10_000),
        last_login_at=_dt(-60),
    )
    user.set_password("Password123")
    db_session.add(user)
    db_session.commit()
    return user


def _root(db_session, owner):
    goal = Goal(
        id=str(uuid.uuid4()),
        name="Root",
        owner_id=owner.id,
        root_id=None,
        created_at=_dt(-1_000),
    )
    goal.root_id = goal.id
    db_session.add(goal)
    db_session.commit()
    return goal


def _seed_export_rows(db_session, *, now):
    user = _user(db_session)
    root = _root(db_session, user)
    db_session.add_all([
        ProductEvent(
            id="product-old",
            user_id=user.id,
            event_name="page_view",
            path="/:rootId/goals",
            root_id=root.id,
            properties={"source": "test"},
            created_at=now - datetime.timedelta(hours=2),
        ),
        EventLog(
            id="event-old",
            root_id=root.id,
            event_type="session.created",
            payload={"count": 1},
            timestamp=now - datetime.timedelta(hours=2),
        ),
        EmailDeliveryEvent(
            id="email-old",
            provider="test",
            template_key="beta_invite",
            status="delivered",
            recipient_user_id=user.id,
            created_at=now - datetime.timedelta(hours=2),
        ),
        EmailWebhookEvent(
            id="webhook-old",
            provider="resend",
            provider_event_id="evt_123",
            provider_message_id="msg_123",
            event_type="email.delivered",
            payload={"delivered": True},
            created_at=now - datetime.timedelta(hours=2),
        ),
    ])
    db_session.commit()
    return user, root


@pytest.mark.unit
class TestAnalyticsExportService:
    def test_warehouse_prune_covers_legacy_unpartitioned_tables(self, db_session, monkeypatch):
        class QueryClient:
            project = 'project'

            def __init__(self):
                self.queries = []

            def query(self, statement):
                self.queries.append(statement)
                return FakeLoadJob()

        monkeypatch.setattr(analytics_export_module, 'bigquery', object())
        client = QueryClient()
        service = AnalyticsExportService(db_session, client, 'dataset')

        service._prune_warehouse_table('event_logs', 'timestamp')

        assert client.queries == [
            'DELETE FROM `dataset.event_logs` '
            'WHERE `timestamp` < TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 730 DAY)'
        ]

    def test_fresh_run_exports_all_tables_and_sets_watermarks(self, db_session):
        now = _dt(0)
        _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient()

        result = AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        assert result["status"] == "success"
        assert result["rows"] == {
            "product_events": 1,
            "event_logs": 1,
            "web_events": 0,
            "email_delivery_events": 1,
            "email_webhook_events": 1,
            "erasures": 0,
            "users": 1,
        }
        assert [(load["table"], load["write_disposition"]) for load in bq.loads] == [
            ("product_events", "WRITE_APPEND"),
            ("event_logs", "WRITE_APPEND"),
            ("email_delivery_events", "WRITE_APPEND"),
            ("email_webhook_events", "WRITE_APPEND"),
            ("users", "WRITE_TRUNCATE"),
        ]
        state = get_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY)
        assert state["last_run_status"] == "success"
        assert state["tables"]["product_events"]["last_id"] == "product-old"
        assert state["tables"]["event_logs"]["last_id"] == "event-old"
        assert state["tables"]["email_delivery_events"]["last_id"] == "email-old"
        assert state["tables"]["email_webhook_events"]["last_id"] == "webhook-old"

    def test_incremental_second_run_exports_only_new_rows(self, db_session):
        now = _dt(0)
        user, _ = _seed_export_rows(db_session, now=now)
        first = FakeBigQueryClient()
        AnalyticsExportService(db_session, first, "dataset").run_export(now=now)

        db_session.add(ProductEvent(
            id="product-new",
            user_id=user.id,
            event_name="settings_opened",
            created_at=now + datetime.timedelta(minutes=1),
        ))
        db_session.commit()

        second = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, second, "dataset").run_export(
            now=now + datetime.timedelta(minutes=30),
        )

        assert result["rows"]["product_events"] == 1
        product_load = next(load for load in second.loads if load["table"] == "product_events")
        assert [row["id"] for row in product_load["rows"]] == ["product-new"]
        assert result["rows"]["event_logs"] == 0
        assert result["rows"]["email_delivery_events"] == 0
        assert result["rows"]["email_webhook_events"] == 0

    def test_same_timestamp_rows_advance_across_batches_once(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        timestamp = now - datetime.timedelta(hours=2)
        db_session.add_all([
            ProductEvent(
                id=f"product-{index:03d}",
                user_id=user.id,
                event_name="page_view",
                created_at=timestamp,
            )
            for index in range(7)
        ])
        db_session.commit()
        bq = FakeBigQueryClient()

        result = AnalyticsExportService(db_session, bq, "dataset", batch_size=3).run_export(now=now)

        product_loads = [load for load in bq.loads if load["table"] == "product_events"]
        assert result["rows"]["product_events"] == 7
        assert [len(load["rows"]) for load in product_loads] == [3, 3, 1]
        assert [
            row["id"]
            for load in product_loads
            for row in load["rows"]
        ] == [f"product-{index:03d}" for index in range(7)]

        second = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, second, "dataset", batch_size=3).run_export(
            now=now + datetime.timedelta(minutes=30),
        )
        assert result["rows"]["product_events"] == 0

    def test_subsecond_timestamp_cursor_does_not_reexport_tail_row(self, db_session):
        # Regression: event_logs timestamps carry microseconds. If the watermark
        # is truncated to whole seconds, `cursor_column > cursor` keeps matching
        # the tail row every batch, re-exporting it forever until the job times
        # out. The cursor must round-trip at full precision.
        now = _dt(0)
        user = _user(db_session)
        root = _root(db_session, user)
        base = now - datetime.timedelta(hours=2)
        db_session.add_all([
            EventLog(
                id=f"event-{index:03d}",
                root_id=root.id,
                event_type="session.created",
                payload={"count": index},
                # Same whole second, distinct microseconds.
                timestamp=base.replace(microsecond=100_000 + index * 100_000),
            )
            for index in range(3)
        ])
        db_session.commit()

        first = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, first, "dataset").run_export(now=now)
        assert result["rows"]["event_logs"] == 3

        # Second run with no new rows must export nothing (cursor advanced past
        # the sub-second tail instead of re-selecting it).
        second = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, second, "dataset").run_export(
            now=now + datetime.timedelta(minutes=30),
        )
        assert result["rows"]["event_logs"] == 0
        assert not any(load["table"] == "event_logs" for load in second.loads)

    def test_lag_window_defers_recent_rows_then_picks_them_up(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        db_session.add(ProductEvent(
            id="too-recent",
            user_id=user.id,
            event_name="page_view",
            created_at=now - datetime.timedelta(minutes=5),
        ))
        db_session.commit()

        first = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, first, "dataset").run_export(now=now)
        assert result["rows"]["product_events"] == 0

        second = FakeBigQueryClient()
        result = AnalyticsExportService(db_session, second, "dataset").run_export(
            now=now + datetime.timedelta(minutes=20),
        )
        assert result["rows"]["product_events"] == 1
        product_load = next(load for load in second.loads if load["table"] == "product_events")
        assert product_load["rows"][0]["id"] == "too-recent"

    def test_load_failure_does_not_advance_failed_table_watermark(self, db_session):
        now = _dt(0)
        _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient(fail_tables={"event_logs"})

        with pytest.raises(RuntimeError):
            AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        state = get_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY)
        assert state["last_run_status"] == "failed"
        assert state["tables"]["product_events"]["last_id"] == "product-old"
        assert "last_id" not in state["tables"].get("event_logs", {})

    def test_users_dimension_truncates_and_excludes_sensitive_fields(self, db_session):
        now = _dt(0)
        _user(db_session, username="admin", email="admin@example.com", role="admin")
        bq = FakeBigQueryClient()

        AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        users_load = next(load for load in bq.loads if load["table"] == "users")
        assert users_load["write_disposition"] == "WRITE_TRUNCATE"
        assert users_load["rows"][0]["email"] == "admin@example.com"
        assert "password_hash" not in users_load["rows"][0]
        assert "preferences" not in users_load["rows"][0]

    def test_loads_use_explicit_bigquery_schemas(self, db_session):
        now = _dt(0)
        _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient()

        AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        schemas = {load["table"]: load["schema"] for load in bq.loads}
        assert ("event_type", "STRING") in schemas["event_logs"]
        assert ("timestamp", "TIMESTAMP") in schemas["event_logs"]
        assert ("payload_json", "STRING") in schemas["email_webhook_events"]
        assert ("created_at", "TIMESTAMP") in schemas["product_events"]
        assert ("email", "STRING") in schemas["users"]

    def test_json_columns_are_serialized(self, db_session):
        now = _dt(0)
        _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient()

        AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        product_load = next(load for load in bq.loads if load["table"] == "product_events")
        event_load = next(load for load in bq.loads if load["table"] == "event_logs")
        webhook_load = next(load for load in bq.loads if load["table"] == "email_webhook_events")
        assert product_load["rows"][0]["properties_json"] == '{"source":"test"}'
        assert event_load["rows"][0]["description"] is None
        assert event_load["rows"][0]["payload_json"] is None
        assert webhook_load["rows"][0]["payload_json"] == '{"delivered":true}'


@pytest.mark.unit
class TestAnalyticsExportAttributionAndErasure:
    def test_event_logs_carry_the_root_owner_without_payloads(self, db_session):
        now = _dt(0)
        user, root = _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient()

        AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        event_load = next(load for load in bq.loads if load["table"] == "event_logs")
        assert event_load["rows"][0]["owner_user_id"] == user.id
        assert event_load["rows"][0]["payload_json"] is None
        assert ("owner_user_id", "STRING") in event_load["schema"]

    def test_product_events_carry_context_and_web_events_export(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        db_session.add_all([
            ProductEvent(
                id="product-ctx", user_id=user.id, event_name="page_view", schema_version=1,
                visit_id="0f8fad5b-d9cb-469f-a165-70867728950e", surface="app", app_version="abc123",
                created_at=now - datetime.timedelta(hours=1),
            ),
            WebEvent(
                id="web-1", event_name="landing_view", schema_version=1, path="/",
                visitor_day_hash="a" * 64, referrer_host="news.example.com", utm_source="newsletter",
                created_at=now - datetime.timedelta(hours=1),
            ),
        ])
        db_session.commit()
        bq = FakeBigQueryClient()

        result = AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        product_row = next(load for load in bq.loads if load["table"] == "product_events")["rows"][0]
        assert (product_row["visit_id"], product_row["surface"], product_row["app_version"]) == (
            "0f8fad5b-d9cb-469f-a165-70867728950e", "app", "abc123",
        )
        web_row = next(load for load in bq.loads if load["table"] == "web_events")["rows"][0]
        assert result["rows"]["web_events"] == 1
        assert web_row["utm_source"] == "newsletter"
        assert "ip" not in web_row and "user_agent" not in web_row

    def test_erasures_delete_warehouse_rows_then_clear_the_queue(self, db_session, monkeypatch):
        pytest.importorskip("google.cloud.bigquery")
        db_session.add(AnalyticsErasure(user_id="gone-user"))
        db_session.commit()
        bq = FakeBigQueryClient()
        for table, column in analytics_export_module.ERASURE_COLUMNS:
            bq.with_columns(f"dataset.{table}", column)

        result = AnalyticsExportService(db_session, bq, "dataset").run_export(now=_dt(0))

        deletes = [sql for sql in bq.queries if "IN UNNEST(@user_ids)" in sql]
        assert deletes == [
            "DELETE FROM `dataset.product_events` WHERE `user_id` IN UNNEST(@user_ids)",
            "DELETE FROM `dataset.event_logs` WHERE `owner_user_id` IN UNNEST(@user_ids)",
            "DELETE FROM `dataset.email_delivery_events` WHERE `recipient_user_id` IN UNNEST(@user_ids)",
        ]
        params = [config for config in bq.query_configs if config is not None]
        assert all(config.query_parameters[0].values == ["gone-user"] for config in params)
        assert result["rows"]["erasures"] == 1
        assert db_session.query(AnalyticsErasure).count() == 0

    def test_erasure_skips_tables_that_predate_the_id_column(self, db_session):
        pytest.importorskip("google.cloud.bigquery")
        db_session.add(AnalyticsErasure(user_id="gone-user"))
        db_session.commit()
        bq = FakeBigQueryClient().with_columns("dataset.product_events", "user_id")

        AnalyticsExportService(db_session, bq, "dataset").run_export(now=_dt(0))

        deletes = [sql for sql in bq.queries if "IN UNNEST(@user_ids)" in sql]
        assert deletes == ["DELETE FROM `dataset.product_events` WHERE `user_id` IN UNNEST(@user_ids)"]
        assert db_session.query(AnalyticsErasure).count() == 0

    def test_failed_erasure_delete_keeps_the_queue(self, db_session):
        pytest.importorskip("google.cloud.bigquery")
        db_session.add(AnalyticsErasure(user_id="gone-user"))
        db_session.commit()

        class FailingDeletes(FakeBigQueryClient):
            def query(self, sql, job_config=None):
                if "IN UNNEST" in sql:
                    return FakeLoadJob(should_fail=True)
                return super().query(sql, job_config)

        bq = FailingDeletes().with_columns("dataset.product_events", "user_id")
        with pytest.raises(RuntimeError):
            AnalyticsExportService(db_session, bq, "dataset").run_export(now=_dt(0))

        assert db_session.query(AnalyticsErasure).count() == 1


def _product_event(db_session, user, event_id, created_at):
    db_session.add(ProductEvent(id=event_id, user_id=user.id, event_name="page_view", created_at=created_at))


def _export_state(db_session, table, last_ts, last_id):
    set_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY, {
        "tables": {table: {"last_ts": analytics_export_module._format_cursor(last_ts), "last_id": last_id}},
    })
    db_session.commit()


@pytest.mark.unit
class TestFlushAfterExport:
    def test_run_flushes_exported_events_past_the_live_window_and_nothing_else(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        root = _root(db_session, user)
        old = now - datetime.timedelta(days=40)
        _product_event(db_session, user, "product-old", old)
        _product_event(db_session, user, "product-live", now - datetime.timedelta(days=10))
        db_session.add_all([
            WebEvent(id="web-old", event_name="landing_view", schema_version=1, visitor_day_hash="a" * 64, created_at=old),
            EventLog(id="event-old", root_id=root.id, event_type="session.completed", timestamp=old),
            EmailDeliveryEvent(id="email-old", provider="test", template_key="beta_invite", status="sent", created_at=old),
        ])
        db_session.commit()

        result = AnalyticsExportService(db_session, FakeBigQueryClient(), "dataset").run_export(now=now)

        assert result["flushed"] == {"product_events": 1, "web_events": 1}
        assert get_app_setting(db_session, ANALYTICS_EXPORT_STATE_KEY)["last_run_flushed"] == result["flushed"]
        assert [row.id for row in db_session.query(ProductEvent).all()] == ["product-live"]
        assert db_session.query(WebEvent).count() == 0
        # Activity history and email records are not analytics: they stay.
        assert db_session.query(EventLog).count() == 1
        assert db_session.query(EmailDeliveryEvent).count() == 1

    def test_rows_past_the_watermark_stay_however_old(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        _product_event(db_session, user, "exported", now - datetime.timedelta(days=60))
        _product_event(db_session, user, "not-exported", now - datetime.timedelta(days=45))
        db_session.commit()
        _export_state(db_session, "product_events", now - datetime.timedelta(days=50), "exported")

        assert analytics_export_module.flush_exported(db_session, now=now) == {"product_events": 1, "web_events": 0}
        assert [row.id for row in db_session.query(ProductEvent).all()] == ["not-exported"]

    def test_a_shared_timestamp_flushes_only_up_to_the_watermark_id(self, db_session):
        now = _dt(0)
        same = now - datetime.timedelta(days=60)
        user = _user(db_session)
        _product_event(db_session, user, "a", same)
        _product_event(db_session, user, "b", same)
        db_session.commit()
        _export_state(db_session, "product_events", same, "a")

        analytics_export_module.flush_exported(db_session, now=now)

        assert [row.id for row in db_session.query(ProductEvent).all()] == ["b"]

    def test_a_table_that_never_exported_keeps_everything(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        _product_event(db_session, user, "ancient", now - datetime.timedelta(days=170))
        db_session.commit()

        assert analytics_export_module.flush_exported(db_session, now=now) == {"product_events": 0, "web_events": 0}
        assert db_session.query(ProductEvent).count() == 1

    def test_a_failed_load_flushes_nothing_from_that_table(self, db_session):
        now = _dt(0)
        user = _user(db_session)
        _product_event(db_session, user, "old", now - datetime.timedelta(days=40))
        db_session.commit()

        with pytest.raises(RuntimeError):
            AnalyticsExportService(
                db_session, FakeBigQueryClient(fail_tables={"product_events"}), "dataset",
            ).run_export(now=now)

        assert db_session.query(ProductEvent).count() == 1

    def test_the_live_window_reads_the_admin_setting_and_its_old_name(self, db_session):
        assert analytics_export_module.analytics_live_days(db_session) == 35
        set_app_setting(db_session, TELEMETRY_RETENTION_KEY, {"product_events_days": 90})
        assert analytics_export_module.analytics_live_days(db_session) == 90
        set_app_setting(db_session, TELEMETRY_RETENTION_KEY, {"live_days": 5})
        assert analytics_export_module.analytics_live_days(db_session) == 30
