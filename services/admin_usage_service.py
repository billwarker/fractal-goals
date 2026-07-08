"""Admin-facing usage analytics.

Aggregates first-party product telemetry (``product_events``), domain event
history (``event_logs`` joined to fractal owners), login recency, and email
delivery health into one payload for the Admin overview tab. Kept separate
from AdminService so the admin surface area stays decomposed.

Window semantics: callers pass ISO ``start``/``end`` dates (or a legacy
``days`` count). Spans are clamped to ``MAX_WINDOW_DAYS`` — admin analytics
deliberately never runs unbounded scans over the event tables; deep history
belongs in the BigQuery export.
"""
import datetime
import logging

import sqlalchemy as sa
from sqlalchemy import func

from models import (
    EmailDeliveryEvent,
    EventLog,
    Goal,
    ProductEvent,
    User,
    format_utc,
    utc_now,
)
from services.app_settings import (
    ANALYTICS_EXPORT_STATE_KEY,
    TELEMETRY_RETENTION_KEY,
    get_app_setting,
    set_app_setting,
)
from services.events import Events
from services.service_types import JsonDict, ServiceResult
from services.telemetry_service import DEFAULT_RETENTION_DAYS, TelemetryService

logger = logging.getLogger(__name__)

MAX_WINDOW_DAYS = 365
DEFAULT_WINDOW_DAYS = 30
TOP_LIMIT = 20
MIN_RETENTION_DAYS = 30
MAX_RETENTION_DAYS = 730

# Domain activity surfaced as dedicated per-user columns; the full event-type
# spectrum lives in events_breakdown.
PER_USER_DOMAIN_COUNTS = {
    "sessions_created": Events.SESSION_CREATED,
    "goals_created": Events.GOAL_CREATED,
}

# Fixed allowlist for storage introspection — table names are never taken
# from request input.
STORAGE_STAT_TABLES = (
    ("product_events", ProductEvent, ProductEvent.created_at),
    ("event_logs", EventLog, EventLog.timestamp),
    ("email_delivery_events", EmailDeliveryEvent, EmailDeliveryEvent.created_at),
)


def _parse_iso_date(value):
    if not value:
        return None
    try:
        return datetime.date.fromisoformat(str(value)[:10])
    except (TypeError, ValueError):
        return None


class AdminUsageService:
    def __init__(self, db_session):
        self.db_session = db_session

    def usage_summary(self, start=None, end=None, days=None) -> ServiceResult[JsonDict]:
        start_date, end_date = self._resolve_window(start, end, days)
        window_days = (end_date - start_date).days + 1

        window_start = datetime.datetime.combine(
            start_date, datetime.time.min, tzinfo=datetime.timezone.utc,
        )
        window_end = datetime.datetime.combine(
            end_date + datetime.timedelta(days=1), datetime.time.min, tzinfo=datetime.timezone.utc,
        )
        now = utc_now()

        return {
            "window": {
                "start": start_date.isoformat(),
                "end": end_date.isoformat(),
                "days": window_days,
            },
            "window_days": window_days,
            "generated_at": format_utc(now),
            "active_users": self._active_users(window_start, window_end, start_date, end_date, now),
            "signups_by_day": self._signups_by_day(window_start, window_end),
            "per_user": self._per_user_activity(window_start, window_end),
            "events_breakdown": self._events_breakdown(window_start, window_end),
            "top_events": self._top_events(window_start, window_end),
            "top_pages": self._top_pages(window_start, window_end),
            "email_health": self._email_health(window_start, window_end),
            "storage": self._storage_stats(),
            "retention": self._retention_settings(),
            "export": self._export_state(),
        }, None, 200

    def _resolve_window(self, start, end, days):
        start_date = _parse_iso_date(start)
        end_date = _parse_iso_date(end)
        today = utc_now().date()

        if start_date is None and end_date is None:
            try:
                span = int(days)
            except (TypeError, ValueError):
                span = DEFAULT_WINDOW_DAYS
            span = max(1, min(MAX_WINDOW_DAYS, span))
            return today - datetime.timedelta(days=span - 1), today

        if end_date is None:
            end_date = today
        if start_date is None:
            start_date = end_date - datetime.timedelta(days=DEFAULT_WINDOW_DAYS - 1)
        if start_date > end_date:
            start_date, end_date = end_date, start_date
        if (end_date - start_date).days + 1 > MAX_WINDOW_DAYS:
            start_date = end_date - datetime.timedelta(days=MAX_WINDOW_DAYS - 1)
        return start_date, end_date

    def prune_product_events(self, older_than_days=None) -> ServiceResult[JsonDict]:
        if older_than_days is None:
            older_than_days = self._retention_settings()["product_events_days"]
        return TelemetryService(self.db_session).prune(older_than_days)

    def update_retention(self, payload) -> ServiceResult[JsonDict]:
        try:
            days = int(payload.get("product_events_days"))
        except (TypeError, ValueError):
            return None, "product_events_days must be an integer", 400
        days = max(MIN_RETENTION_DAYS, min(MAX_RETENTION_DAYS, days))
        set_app_setting(self.db_session, TELEMETRY_RETENTION_KEY, {"product_events_days": days})
        self.db_session.commit()
        return {"product_events_days": days}, None, 200

    def _retention_settings(self):
        stored = get_app_setting(self.db_session, TELEMETRY_RETENTION_KEY, {}) or {}
        days = stored.get("product_events_days", DEFAULT_RETENTION_DAYS)
        return {"product_events_days": int(days)}

    def _export_state(self):
        stored = get_app_setting(self.db_session, ANALYTICS_EXPORT_STATE_KEY, None)
        if not isinstance(stored, dict):
            return {"last_run_at": None, "last_run_status": None, "tables": {}}
        return {
            "last_run_at": stored.get("last_run_at"),
            "last_run_status": stored.get("last_run_status"),
            "tables": stored.get("tables", {}),
        }

    def _active_users(self, window_start, window_end, start_date, end_date, now):
        event_day = func.date(ProductEvent.created_at)
        daily_rows = self.db_session.query(
            event_day.label("day"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
            ProductEvent.created_at < window_end,
        ).group_by(event_day).all()
        counts_by_day = {str(row.day): int(row.users) for row in daily_rows}

        dau = []
        cursor = start_date
        while cursor <= end_date:
            key = cursor.isoformat()
            dau.append({"date": key, "count": counts_by_day.get(key, 0)})
            cursor += datetime.timedelta(days=1)

        def distinct_users_since(since):
            telemetry_users = {
                row[0] for row in self.db_session.query(ProductEvent.user_id).filter(
                    ProductEvent.created_at >= since,
                ).distinct().all()
            }
            # Fallback for days before telemetry existed (or clients with DNT):
            # a login inside the window still counts as activity.
            login_users = {
                row[0] for row in self.db_session.query(User.id).filter(
                    User.last_login_at.isnot(None),
                    User.last_login_at >= since,
                ).all()
            }
            return len(telemetry_users | login_users)

        # WAU/MAU are rolling metrics anchored to now, independent of the
        # selected window — they answer "how alive is the beta today".
        return {
            "dau": dau,
            "wau": distinct_users_since(now - datetime.timedelta(days=7)),
            "mau": distinct_users_since(now - datetime.timedelta(days=30)),
        }

    def _signups_by_day(self, window_start, window_end):
        signup_day = func.date(User.created_at)
        rows = self.db_session.query(
            signup_day.label("day"),
            func.count(User.id).label("count"),
        ).filter(
            User.created_at >= window_start,
            User.created_at < window_end,
        ).group_by(signup_day).order_by(signup_day).all()
        return [{"date": str(row.day), "count": int(row.count)} for row in rows]

    def _per_user_activity(self, window_start, window_end):
        users = self.db_session.query(User).filter(User.is_active.is_(True)).all()

        page_view_rows = self.db_session.query(
            ProductEvent.user_id,
            func.count(ProductEvent.id).label("page_views"),
            func.max(ProductEvent.created_at).label("last_seen"),
        ).filter(
            ProductEvent.created_at >= window_start,
            ProductEvent.created_at < window_end,
            ProductEvent.event_name == "page_view",
        ).group_by(ProductEvent.user_id).all()
        telemetry_by_user = {row.user_id: row for row in page_view_rows}

        domain_counts = {}
        for field, event_type in PER_USER_DOMAIN_COUNTS.items():
            rows = self.db_session.query(
                Goal.owner_id,
                func.count(EventLog.id).label("count"),
            ).join(
                Goal, EventLog.root_id == Goal.id,
            ).filter(
                EventLog.event_type == event_type,
                EventLog.timestamp >= window_start,
                EventLog.timestamp < window_end,
            ).group_by(Goal.owner_id).all()
            domain_counts[field] = {row.owner_id: int(row.count) for row in rows}

        total_rows = self.db_session.query(
            Goal.owner_id,
            func.count(EventLog.id).label("count"),
        ).join(
            Goal, EventLog.root_id == Goal.id,
        ).filter(
            EventLog.timestamp >= window_start,
            EventLog.timestamp < window_end,
        ).group_by(Goal.owner_id).all()
        totals_by_user = {row.owner_id: int(row.count) for row in total_rows}

        per_user = []
        for user in users:
            telemetry = telemetry_by_user.get(user.id)
            entry = {
                "user_id": user.id,
                "username": user.username,
                "email": user.email,
                "last_login_at": format_utc(user.last_login_at),
                "last_seen": format_utc(telemetry.last_seen) if telemetry else format_utc(user.last_login_at),
                "page_views": int(telemetry.page_views) if telemetry else 0,
                "total_events": totals_by_user.get(user.id, 0),
            }
            for field in PER_USER_DOMAIN_COUNTS:
                entry[field] = domain_counts[field].get(user.id, 0)
            per_user.append(entry)

        per_user.sort(key=lambda entry: (entry["last_seen"] or "", entry["page_views"]), reverse=True)
        return per_user

    def _events_breakdown(self, window_start, window_end):
        """Every domain event type in the window, with distinct acting owners."""
        rows = self.db_session.query(
            EventLog.event_type,
            func.count(EventLog.id).label("count"),
            func.count(func.distinct(Goal.owner_id)).label("users"),
        ).join(
            Goal, EventLog.root_id == Goal.id,
        ).filter(
            EventLog.timestamp >= window_start,
            EventLog.timestamp < window_end,
        ).group_by(EventLog.event_type).order_by(
            func.count(EventLog.id).desc(),
        ).all()
        return [
            {
                "event_type": row.event_type,
                "domain": (row.event_type or "").split(".", 1)[0],
                "count": int(row.count),
                "users": int(row.users),
            }
            for row in rows
        ]

    def _top_events(self, window_start, window_end):
        rows = self.db_session.query(
            ProductEvent.event_name,
            func.count(ProductEvent.id).label("count"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
            ProductEvent.created_at < window_end,
        ).group_by(ProductEvent.event_name).order_by(
            func.count(ProductEvent.id).desc(),
        ).limit(TOP_LIMIT).all()
        return [
            {"event_name": row.event_name, "count": int(row.count), "users": int(row.users)}
            for row in rows
        ]

    def _top_pages(self, window_start, window_end):
        rows = self.db_session.query(
            ProductEvent.path,
            func.count(ProductEvent.id).label("count"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
            ProductEvent.created_at < window_end,
            ProductEvent.event_name == "page_view",
            ProductEvent.path.isnot(None),
        ).group_by(ProductEvent.path).order_by(
            func.count(ProductEvent.id).desc(),
        ).limit(TOP_LIMIT).all()
        return [
            {"path": row.path, "count": int(row.count), "users": int(row.users)}
            for row in rows
        ]

    def _email_health(self, window_start, window_end):
        rows = self.db_session.query(
            EmailDeliveryEvent.template_key,
            EmailDeliveryEvent.status,
            func.count(EmailDeliveryEvent.id).label("count"),
        ).filter(
            EmailDeliveryEvent.created_at >= window_start,
            EmailDeliveryEvent.created_at < window_end,
        ).group_by(
            EmailDeliveryEvent.template_key,
            EmailDeliveryEvent.status,
        ).order_by(EmailDeliveryEvent.template_key, EmailDeliveryEvent.status).all()
        return [
            {"template_key": row.template_key, "status": row.status, "count": int(row.count)}
            for row in rows
        ]

    def _storage_stats(self):
        from models import EmailWebhookEvent

        specs = list(STORAGE_STAT_TABLES) + [
            ("email_webhook_events", EmailWebhookEvent, EmailWebhookEvent.created_at),
        ]
        tables = []
        for table_name, model, time_column in specs:
            row = self.db_session.query(
                func.count(model.id),
                func.min(time_column),
                func.max(time_column),
            ).one()
            tables.append({
                "table": table_name,
                "rows": int(row[0] or 0),
                "oldest": format_utc(row[1]),
                "newest": format_utc(row[2]),
                "bytes": self._table_bytes(table_name),
            })
        return {"tables": tables}

    def _table_bytes(self, table_name: str):
        """Total on-disk relation size; None when unavailable (non-Postgres)."""
        try:
            if self.db_session.get_bind().dialect.name != "postgresql":
                return None
            result = self.db_session.execute(
                sa.text("SELECT pg_total_relation_size(CAST(:table_name AS regclass))"),
                {"table_name": table_name},
            ).scalar()
            return int(result) if result is not None else None
        except Exception:
            logger.warning("Failed to read relation size for %s", table_name, exc_info=True)
            return None
