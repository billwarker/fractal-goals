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

from models import EmailDeliveryEvent, EventLog, ProductEvent, User, format_utc, utc_now
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


def _format_dt(value):
    return format_utc(value) if value is not None else None


def _parse_dt(value):
    if not value:
        return None
    if isinstance(value, datetime.datetime):
        return value
    try:
        return datetime.datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return None


def _json_value(value):
    if value is None:
        return None
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _load_job_config(write_disposition):
    if bigquery is None:
        return {"write_disposition": write_disposition}
    return bigquery.LoadJobConfig(write_disposition=write_disposition)


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
    IncrementalTableSpec("product_events", ProductEvent, ProductEvent.created_at, _serialize_product_event),
    IncrementalTableSpec("event_logs", EventLog, EventLog.timestamp, _serialize_event_log),
    IncrementalTableSpec(
        "email_delivery_events",
        EmailDeliveryEvent,
        EmailDeliveryEvent.created_at,
        _serialize_email_delivery_event,
    ),
)


class AnalyticsExportService:
    def __init__(self, db_session, bq_client, dataset=DEFAULT_DATASET, *, batch_size=DEFAULT_BATCH_SIZE):
        self.db_session = db_session
        self.bq_client = bq_client
        self.dataset = dataset
        self.batch_size = batch_size

    def run_export(self, now=None):
        now = now or utc_now()
        cutoff = now - EXPORT_LAG
        state = self._state()
        run_counts = {}

        try:
            for spec in INCREMENTAL_TABLES:
                run_counts[spec.table] = self._export_incremental_table(spec, state, cutoff)

            run_counts["users"] = self._export_users()
            state["last_run_at"] = _format_dt(now)
            state["last_run_status"] = "success"
            state["last_run_rows"] = run_counts
            state.pop("failed_table", None)
            set_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, state)
            self.db_session.commit()
            return {"status": "success", "rows": run_counts, "state": state}
        except Exception:
            state["last_run_at"] = _format_dt(now)
            state["last_run_status"] = "failed"
            state["last_run_rows"] = run_counts
            set_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, state)
            self.db_session.commit()
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

            payload = [spec.serializer(row) for row in rows]
            self._load_rows(spec.table, payload, write_disposition="WRITE_APPEND")

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

        query = self.db_session.query(spec.model).filter(spec.cursor_column < cutoff)
        if cursor_ts is not None and cursor_id:
            query = query.filter(sa.or_(
                spec.cursor_column > cursor_ts,
                sa.and_(spec.cursor_column == cursor_ts, spec.model.id > cursor_id),
            ))

        return query.order_by(spec.cursor_column.asc(), spec.model.id.asc()).limit(self.batch_size).all()

    def _export_users(self):
        rows = self.db_session.query(User).order_by(User.id.asc()).all()
        self._load_rows("users", [_serialize_user(row) for row in rows], write_disposition="WRITE_TRUNCATE")
        return len(rows)

    def _load_rows(self, table, rows, *, write_disposition):
        job = self.bq_client.load_table_from_json(
            rows,
            _table_ref(self.dataset, table),
            job_config=_load_job_config(write_disposition),
        )
        job.result()


def run_export(db_session, bq_client, dataset=DEFAULT_DATASET, now=None):
    return AnalyticsExportService(db_session, bq_client, dataset).run_export(now=now)
