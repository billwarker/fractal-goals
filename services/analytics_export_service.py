"""Incremental export of admin analytics tables to BigQuery.

The service owns cursoring and app_settings watermarks; the caller supplies a
BigQuery-compatible client so unit tests can use a fake and production can use
``google.cloud.bigquery.Client``. Each append table commits its watermark only
after the corresponding BigQuery load job succeeds.
"""
from __future__ import annotations

import datetime
import json
from dataclasses import dataclass
from typing import Callable

import sqlalchemy as sa

from models import EmailDeliveryEvent, EmailWebhookEvent, EventLog, ProductEvent, User, format_utc, utc_now
from services.app_settings import ANALYTICS_EXPORT_STATE_KEY, get_app_setting, set_app_setting

try:  # pragma: no cover - exercised by the real export entrypoint.
    from google.cloud import bigquery
except ImportError:  # pragma: no cover - keeps unit tests independent of GCP deps.
    bigquery = None


EXPORT_LAG = datetime.timedelta(minutes=10)
DEFAULT_BATCH_SIZE = 5000
DEFAULT_DATASET = "fractal_analytics"


@dataclass(frozen=True)
class IncrementalTableSpec:
    table: str
    model: object
    cursor_column: object
    serializer: Callable[[object], dict]
    schema: tuple[tuple[str, str], ...]


def _format_dt(value):
    return format_utc(value) if value is not None else None


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return _db_datetime(value)
    try:
        return _db_datetime(datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00")))
    except ValueError:
        return None


def _db_datetime(value):
    """Normalize cursor datetimes for DateTime columns stored without tzinfo."""
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(datetime.timezone.utc).replace(tzinfo=None)


def _json_value(value):
    if value is None:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


PRODUCT_EVENTS_SCHEMA = (
    ("id", "STRING"),
    ("user_id", "STRING"),
    ("event_name", "STRING"),
    ("path", "STRING"),
    ("root_id", "STRING"),
    ("properties_json", "STRING"),
    ("client_ts", "TIMESTAMP"),
    ("created_at", "TIMESTAMP"),
)

EVENT_LOGS_SCHEMA = (
    ("id", "STRING"),
    ("root_id", "STRING"),
    ("event_type", "STRING"),
    ("entity_type", "STRING"),
    ("entity_id", "STRING"),
    ("description", "STRING"),
    ("payload_json", "STRING"),
    ("source", "STRING"),
    ("timestamp", "TIMESTAMP"),
)

EMAIL_DELIVERY_EVENTS_SCHEMA = (
    ("id", "STRING"),
    ("provider", "STRING"),
    ("template_key", "STRING"),
    ("entity_type", "STRING"),
    ("entity_id", "STRING"),
    ("recipient_user_id", "STRING"),
    ("beta_signup_id", "STRING"),
    ("provider_message_id", "STRING"),
    ("idempotency_key", "STRING"),
    ("status", "STRING"),
    ("error_summary", "STRING"),
    ("last_event_type", "STRING"),
    ("last_event_at", "TIMESTAMP"),
    ("created_at", "TIMESTAMP"),
    ("sent_at", "TIMESTAMP"),
    ("delivered_at", "TIMESTAMP"),
)

EMAIL_WEBHOOK_EVENTS_SCHEMA = (
    ("id", "STRING"),
    ("provider", "STRING"),
    ("provider_event_id", "STRING"),
    ("provider_message_id", "STRING"),
    ("event_type", "STRING"),
    ("payload_json", "STRING"),
    ("created_at", "TIMESTAMP"),
)

USERS_SCHEMA = (
    ("id", "STRING"),
    ("username", "STRING"),
    ("email", "STRING"),
    ("role", "STRING"),
    ("is_active", "BOOLEAN"),
    ("membership_tier", "STRING"),
    ("created_at", "TIMESTAMP"),
    ("last_login_at", "TIMESTAMP"),
)


def _load_job_config(write_disposition, schema):
    if bigquery is None:
        return {"write_disposition": write_disposition, "schema": list(schema)}
    return bigquery.LoadJobConfig(
        write_disposition=write_disposition,
        create_disposition=bigquery.CreateDisposition.CREATE_IF_NEEDED,
        schema=[bigquery.SchemaField(name, field_type) for name, field_type in schema],
    )


def _table_ref(dataset: str, table: str) -> str:
    return f"{dataset}.{table}"


def _serialize_product_event(row: ProductEvent) -> dict:
    return {
        "id": row.id,
        "user_id": row.user_id,
        "event_name": row.event_name,
        "path": row.path,
        "root_id": row.root_id,
        "properties_json": _json_value(row.properties),
        "client_ts": _format_dt(row.client_ts),
        "created_at": _format_dt(row.created_at),
    }


def _serialize_event_log(row: EventLog) -> dict:
    return {
        "id": row.id,
        "root_id": row.root_id,
        "event_type": row.event_type,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "description": row.description,
        "payload_json": _json_value(row.payload),
        "source": row.source,
        "timestamp": _format_dt(row.timestamp),
    }


def _serialize_email_delivery_event(row: EmailDeliveryEvent) -> dict:
    return {
        "id": row.id,
        "provider": row.provider,
        "template_key": row.template_key,
        "entity_type": row.entity_type,
        "entity_id": row.entity_id,
        "recipient_user_id": row.recipient_user_id,
        "beta_signup_id": row.beta_signup_id,
        "provider_message_id": row.provider_message_id,
        "idempotency_key": row.idempotency_key,
        "status": row.status,
        "error_summary": row.error_summary,
        "last_event_type": row.last_event_type,
        "last_event_at": _format_dt(row.last_event_at),
        "created_at": _format_dt(row.created_at),
        "sent_at": _format_dt(row.sent_at),
        "delivered_at": _format_dt(row.delivered_at),
    }


def _serialize_email_webhook_event(row: EmailWebhookEvent) -> dict:
    return {
        "id": row.id,
        "provider": row.provider,
        "provider_event_id": row.provider_event_id,
        "provider_message_id": row.provider_message_id,
        "event_type": row.event_type,
        "payload_json": _json_value(row.payload),
        "created_at": _format_dt(row.created_at),
    }


def _serialize_user(row: User) -> dict:
    return {
        "id": row.id,
        "username": row.username,
        "email": row.email,
        "role": row.role,
        "is_active": bool(row.is_active),
        "membership_tier": row.membership_tier,
        "created_at": _format_dt(row.created_at),
        "last_login_at": _format_dt(row.last_login_at),
    }


INCREMENTAL_TABLES = (
    IncrementalTableSpec(
        "product_events",
        ProductEvent,
        ProductEvent.created_at,
        _serialize_product_event,
        PRODUCT_EVENTS_SCHEMA,
    ),
    IncrementalTableSpec(
        "event_logs",
        EventLog,
        EventLog.timestamp,
        _serialize_event_log,
        EVENT_LOGS_SCHEMA,
    ),
    IncrementalTableSpec(
        "email_delivery_events",
        EmailDeliveryEvent,
        EmailDeliveryEvent.created_at,
        _serialize_email_delivery_event,
        EMAIL_DELIVERY_EVENTS_SCHEMA,
    ),
    IncrementalTableSpec(
        "email_webhook_events",
        EmailWebhookEvent,
        EmailWebhookEvent.created_at,
        _serialize_email_webhook_event,
        EMAIL_WEBHOOK_EVENTS_SCHEMA,
    ),
)


class AnalyticsExportService:
    def __init__(
        self,
        db_session,
        bq_client,
        dataset=DEFAULT_DATASET,
        *,
        batch_size=DEFAULT_BATCH_SIZE,
        log=None,
    ):
        self.db_session = db_session
        self.bq_client = bq_client
        self.dataset = dataset
        self.batch_size = batch_size
        self.log = log

    def run_export(self, now=None):
        now = now or utc_now()
        cutoff = now - EXPORT_LAG
        state = self._state()
        run_counts = {}
        self._emit(
            f"Analytics export starting dataset={self.dataset} "
            f"batch_size={self.batch_size} cutoff={_format_dt(cutoff)}"
        )

        try:
            for spec in INCREMENTAL_TABLES:
                self._emit(f"Exporting incremental table {spec.table}")
                run_counts[spec.table] = self._export_incremental_table(spec, state, cutoff)
                self._emit(f"Finished {spec.table}: rows={run_counts[spec.table]}")

            self._emit("Exporting users dimension")
            run_counts["users"] = self._export_users()
            self._emit(f"Finished users: rows={run_counts['users']}")
            state["last_run_at"] = _format_dt(now)
            state["last_run_status"] = "success"
            state["last_run_rows"] = run_counts
            state.pop("failed_table", None)
            set_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, state)
            self.db_session.commit()
            self._emit(f"Analytics export completed rows={run_counts}")
            return {"status": "success", "rows": run_counts, "state": state}
        except Exception as exc:
            state["last_run_at"] = _format_dt(now)
            state["last_run_status"] = "failed"
            state["last_run_rows"] = run_counts
            set_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, state)
            self.db_session.commit()
            self._emit(f"Analytics export failed after rows={run_counts}: {exc}")
            raise

    def _state(self):
        stored = get_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, {}) or {}
        if not isinstance(stored, dict):
            stored = {}
        stored.setdefault("tables", {})
        return stored

    def _export_incremental_table(self, spec: IncrementalTableSpec, state, cutoff):
        table_state = state["tables"].setdefault(spec.table, {})
        total = 0

        while True:
            rows = self._next_batch(spec, table_state, cutoff)
            if not rows:
                break

            self._assert_batch_advances_cursor(spec, table_state, rows)
            payload = [spec.serializer(row) for row in rows]
            self._emit(
                f"Loading {len(payload)} rows to {spec.table} "
                f"first_id={rows[0].id} last_id={rows[-1].id}"
            )
            self._load_rows(spec.table, payload, write_disposition="WRITE_APPEND", schema=spec.schema)

            last = rows[-1]
            table_state["last_ts"] = _format_dt(getattr(last, spec.cursor_column.key))
            table_state["last_id"] = last.id
            total += len(rows)
            table_state["last_run_rows"] = total
            set_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, state)
            self.db_session.commit()

        return total

    def _next_batch(self, spec: IncrementalTableSpec, table_state, cutoff):
        cursor_ts = _parse_dt(table_state.get("last_ts"))
        cursor_id = table_state.get("last_id")

        query = self.db_session.query(spec.model).filter(spec.cursor_column < _db_datetime(cutoff))
        if cursor_ts is not None and cursor_id:
            query = query.filter(sa.or_(
                spec.cursor_column > cursor_ts,
                sa.and_(spec.cursor_column == cursor_ts, spec.model.id > cursor_id),
            ))

        return query.order_by(spec.cursor_column.asc(), spec.model.id.asc()).limit(self.batch_size).all()

    def _assert_batch_advances_cursor(self, spec: IncrementalTableSpec, table_state, rows):
        cursor_ts = _parse_dt(table_state.get("last_ts"))
        cursor_id = table_state.get("last_id")
        if cursor_ts is None or not cursor_id:
            return

        first = rows[0]
        first_tuple = (_db_datetime(getattr(first, spec.cursor_column.key)), first.id)
        cursor_tuple = (cursor_ts, cursor_id)
        if first_tuple <= cursor_tuple:
            raise RuntimeError(
                f"Analytics export cursor failed to advance for {spec.table}: "
                f"cursor={cursor_tuple} first_row={first_tuple}"
            )

    def _export_users(self):
        rows = self.db_session.query(User).order_by(User.id.asc()).all()
        self._emit(f"Loading {len(rows)} rows to users")
        self._load_rows(
            "users",
            [_serialize_user(row) for row in rows],
            write_disposition="WRITE_TRUNCATE",
            schema=USERS_SCHEMA,
        )
        return len(rows)

    def _load_rows(self, table, rows, *, write_disposition, schema):
        self._emit(f"Starting BigQuery load table={table} rows={len(rows)} disposition={write_disposition}")
        job = self.bq_client.load_table_from_json(
            rows,
            _table_ref(self.dataset, table),
            job_config=_load_job_config(write_disposition, schema),
        )
        job.result()
        self._emit(f"BigQuery load complete table={table} rows={len(rows)}")

    def _emit(self, message: str):
        if self.log:
            self.log(message)


def run_export(db_session, bq_client, dataset=DEFAULT_DATASET, now=None, *, batch_size=DEFAULT_BATCH_SIZE, log=None):
    return AnalyticsExportService(db_session, bq_client, dataset, batch_size=batch_size, log=log).run_export(now=now)
