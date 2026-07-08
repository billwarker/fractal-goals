"""Admin-facing usage analytics.

Aggregates first-party product telemetry (``product_events``), domain event
history (``event_logs`` joined to fractal owners), login recency, and email
delivery health into one payload for the Admin "usage" tab. Kept separate from
AdminService so the admin surface area stays decomposed.
"""
import datetime
import logging

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
from services.events import Events
from services.service_types import JsonDict, ServiceResult
from services.telemetry_service import TelemetryService

logger = logging.getLogger(__name__)

MIN_WINDOW_DAYS = 1
MAX_WINDOW_DAYS = 90
TOP_LIMIT = 20

# Domain activity surfaced per user; extend cautiously — every entry is an
# extra aggregate over event_logs.
PER_USER_DOMAIN_COUNTS = {
    "sessions_created": Events.SESSION_CREATED,
    "goals_created": Events.GOAL_CREATED,
}


class AdminUsageService:
    def __init__(self, db_session):
        self.db_session = db_session

    def usage_summary(self, days: int = 30) -> ServiceResult[JsonDict]:
        try:
            days = int(days)
        except (TypeError, ValueError):
            days = 30
        days = max(MIN_WINDOW_DAYS, min(MAX_WINDOW_DAYS, days))

        now = utc_now()
        window_start = now - datetime.timedelta(days=days)

        return {
            "window_days": days,
            "generated_at": format_utc(now),
            "active_users": self._active_users(window_start, now, days),
            "signups_by_day": self._signups_by_day(window_start),
            "per_user": self._per_user_activity(window_start),
            "top_events": self._top_events(window_start),
            "top_pages": self._top_pages(window_start),
            "email_health": self._email_health(window_start),
        }, None, 200

    def prune_product_events(self, older_than_days: int) -> ServiceResult[JsonDict]:
        return TelemetryService(self.db_session).prune(older_than_days)

    def _active_users(self, window_start, now, days):
        event_day = func.date(ProductEvent.created_at)
        daily_rows = self.db_session.query(
            event_day.label("day"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
        ).group_by(event_day).all()
        counts_by_day = {str(row.day): int(row.users) for row in daily_rows}

        dau = []
        for offset in range(days - 1, -1, -1):
            day = (now - datetime.timedelta(days=offset)).date()
            dau.append({"date": day.isoformat(), "count": counts_by_day.get(day.isoformat(), 0)})

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

        return {
            "dau": dau,
            "wau": distinct_users_since(now - datetime.timedelta(days=7)),
            "mau": distinct_users_since(now - datetime.timedelta(days=30)),
        }

    def _signups_by_day(self, window_start):
        signup_day = func.date(User.created_at)
        rows = self.db_session.query(
            signup_day.label("day"),
            func.count(User.id).label("count"),
        ).filter(
            User.created_at >= window_start,
        ).group_by(signup_day).order_by(signup_day).all()
        return [{"date": str(row.day), "count": int(row.count)} for row in rows]

    def _per_user_activity(self, window_start):
        users = self.db_session.query(User).filter(User.is_active.is_(True)).all()

        page_view_rows = self.db_session.query(
            ProductEvent.user_id,
            func.count(ProductEvent.id).label("page_views"),
            func.max(ProductEvent.created_at).label("last_seen"),
        ).filter(
            ProductEvent.created_at >= window_start,
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
            ).group_by(Goal.owner_id).all()
            domain_counts[field] = {row.owner_id: int(row.count) for row in rows}

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
            }
            for field in PER_USER_DOMAIN_COUNTS:
                entry[field] = domain_counts[field].get(user.id, 0)
            per_user.append(entry)

        per_user.sort(key=lambda entry: (entry["last_seen"] or "", entry["page_views"]), reverse=True)
        return per_user

    def _top_events(self, window_start):
        rows = self.db_session.query(
            ProductEvent.event_name,
            func.count(ProductEvent.id).label("count"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
        ).group_by(ProductEvent.event_name).order_by(
            func.count(ProductEvent.id).desc(),
        ).limit(TOP_LIMIT).all()
        return [
            {"event_name": row.event_name, "count": int(row.count), "users": int(row.users)}
            for row in rows
        ]

    def _top_pages(self, window_start):
        rows = self.db_session.query(
            ProductEvent.path,
            func.count(ProductEvent.id).label("count"),
            func.count(func.distinct(ProductEvent.user_id)).label("users"),
        ).filter(
            ProductEvent.created_at >= window_start,
            ProductEvent.event_name == "page_view",
            ProductEvent.path.isnot(None),
        ).group_by(ProductEvent.path).order_by(
            func.count(ProductEvent.id).desc(),
        ).limit(TOP_LIMIT).all()
        return [
            {"path": row.path, "count": int(row.count), "users": int(row.users)}
            for row in rows
        ]

    def _email_health(self, window_start):
        rows = self.db_session.query(
            EmailDeliveryEvent.template_key,
            EmailDeliveryEvent.status,
            func.count(EmailDeliveryEvent.id).label("count"),
        ).filter(
            EmailDeliveryEvent.created_at >= window_start,
        ).group_by(
            EmailDeliveryEvent.template_key,
            EmailDeliveryEvent.status,
        ).order_by(EmailDeliveryEvent.template_key, EmailDeliveryEvent.status).all()
        return [
            {"template_key": row.template_key, "status": row.status, "count": int(row.count)}
            for row in rows
        ]
