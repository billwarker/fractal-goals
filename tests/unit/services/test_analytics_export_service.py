import datetime
import uuid

import pytest

from models import EmailDeliveryEvent, EmailWebhookEvent, EventLog, Goal, ProductEvent, User
from services.analytics_export_service import AnalyticsExportService
from services.app_settings import ANALYTICS_EXPORT_STATE_KEY, get_app_setting


class FakeLoadJob:
    def __init__(self, *, should_fail=False):
        self.should_fail = should_fail

    def result(self):
        if self.should_fail:
            raise RuntimeError("BigQuery load failed")


class FakeBigQueryClient:
    def __init__(self, fail_tables=None):
        self.loads = []
        self.fail_tables = set(fail_tables or [])

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
    def test_fresh_run_exports_all_tables_and_sets_watermarks(self, db_session):
        now = _dt(0)
        _seed_export_rows(db_session, now=now)
        bq = FakeBigQueryClient()

        result = AnalyticsExportService(db_session, bq, "dataset").run_export(now=now)

        assert result["status"] == "success"
        assert result["rows"] == {
            "product_events": 1,
            "event_logs": 1,
            "email_delivery_events": 1,
            "email_webhook_events": 1,
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
        assert event_load["rows"][0]["payload_json"] == '{"count":1}'
        assert webhook_load["rows"][0]["payload_json"] == '{"delivered":true}'
