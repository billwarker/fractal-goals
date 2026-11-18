"""Acquisition and engagement metrics for the Admin overview.

Three questions: how much traffic the public site gets (``web_events``), how visitors
convert into accounts that practise (waitlist → invite → sign-up → first fractal →
first completed session), and how the app is used, measured by the KPI **Weekly Active
Practitioners**: distinct accounts completing at least one session in an ISO week (UTC).

Demo and admin accounts are excluded throughout, so the numbers describe real users.
Visitors are counted per day (``visitor_day_hash`` rotates daily), so a window's visitor
total is visitor-days: someone visiting on two days counts twice.
"""
import datetime

import sqlalchemy as sa
from sqlalchemy import func

from models import BetaSignupRequest, Goal, ProductEvent, Session, User, WebEvent
from services.demo_account_service import DEMO_ACCOUNT_ROLE

EXCLUDED_ROLES = (DEMO_ACCOUNT_ROLE, "admin")
WAP_WEEKS = 8
TOP_LIMIT = 5
ACTIVATION_DAYS = 7
ADOPTION_DAYS = 7

# The first path segment after `/:rootId/` and the feature it belongs to.
FEATURE_SURFACES = {
    "goals": "Goals",
    "sessions": "Sessions",
    "session": "Sessions",
    "create-session": "Log a session",
    "programs": "Programs",
    "analytics": "Analytics",
    "notes": "Notes",
    "manage-activities": "Activities",
    "manage-session-templates": "Templates",
}


def _iso_week_start(day: datetime.date) -> datetime.date:
    return day - datetime.timedelta(days=day.weekday())


def _utc_midnight(day: datetime.date) -> datetime.datetime:
    return datetime.datetime.combine(day, datetime.time.min, tzinfo=datetime.timezone.utc)


class GrowthMetricsService:
    def __init__(self, db_session):
        self.db_session = db_session

    def summary(self, window_start, window_end, start_date, end_date, now) -> dict:
        return {
            "traffic": self._traffic(window_start, window_end, start_date, end_date),
            "funnel": self._funnel(window_start, window_end),
            "wap": self._weekly_active_practitioners(now),
            "feature_adoption": self._feature_adoption(now),
        }

    @staticmethod
    def _real_users():
        return sa.select(User.id).where(User.role.notin_(EXCLUDED_ROLES))

    def _visitor_days(self, window_start, window_end, *event_names):
        visitor_day = sa.tuple_(func.date(WebEvent.created_at), WebEvent.visitor_day_hash)
        query = self.db_session.query(func.count(func.distinct(visitor_day))).filter(
            WebEvent.created_at >= window_start,
            WebEvent.created_at < window_end,
        )
        if event_names:
            query = query.filter(WebEvent.event_name.in_(event_names))
        return int(query.scalar() or 0)

    def _traffic(self, window_start, window_end, start_date, end_date):
        in_window = (WebEvent.created_at >= window_start, WebEvent.created_at < window_end)
        event_day = func.date(WebEvent.created_at)
        daily = dict(self.db_session.query(
            event_day, func.count(func.distinct(WebEvent.visitor_day_hash)),
        ).filter(*in_window).group_by(event_day).all())
        visitors_by_day = []
        cursor = start_date
        while cursor <= end_date:
            visitors_by_day.append({"date": cursor.isoformat(), "count": int(daily.get(cursor, 0))})
            cursor += datetime.timedelta(days=1)

        def top(column):
            visitors = func.count(func.distinct(sa.tuple_(event_day, WebEvent.visitor_day_hash)))
            rows = self.db_session.query(column, visitors.label("visitors")).filter(
                *in_window, column.isnot(None),
            ).group_by(column).order_by(visitors.desc(), column).limit(TOP_LIMIT).all()
            return [{"name": name, "visitors": int(count)} for name, count in rows]

        return {
            "visitors_by_day": visitors_by_day,
            "visitor_days": self._visitor_days(window_start, window_end),
            "landing_views": int(self.db_session.query(func.count(WebEvent.id)).filter(
                *in_window, WebEvent.event_name == "landing_view",
            ).scalar() or 0),
            "demo_starts": int(self.db_session.query(func.count(WebEvent.id)).filter(
                *in_window, WebEvent.event_name == "demo_started",
            ).scalar() or 0),
            "top_referrers": top(WebEvent.referrer_host),
            "top_campaigns": top(WebEvent.utm_source),
        }

    def _funnel(self, window_start, window_end):
        signups = self.db_session.query(User.id, User.created_at).filter(
            User.role.notin_(EXCLUDED_ROLES),
            User.created_at >= window_start,
            User.created_at < window_end,
        ).subquery()
        first_fractal = self.db_session.query(func.count(func.distinct(signups.c.id))).join(
            Goal, sa.and_(Goal.owner_id == signups.c.id, Goal.root_id == Goal.id),
        ).scalar()
        # Activation: a completed session within the first week of the account.
        activated = self.db_session.query(func.count(func.distinct(signups.c.id))).join(
            Session, Session.owner_id == signups.c.id,
        ).filter(
            Session.completed.is_(True),
            Session.deleted_at.is_(None),
            Session.completed_at < signups.c.created_at + datetime.timedelta(days=ACTIVATION_DAYS),
        ).scalar()

        def count(query):
            return int(query.scalar() or 0)

        return [
            {"key": "visitors", "label": "Visitors", "count": self._visitor_days(window_start, window_end)},
            {"key": "demo", "label": "Opened the demo",
             "count": self._visitor_days(window_start, window_end, "demo_started")},
            {"key": "waitlist", "label": "Joined the waitlist", "count": count(
                self.db_session.query(func.count(BetaSignupRequest.id)).filter(
                    BetaSignupRequest.created_at >= window_start, BetaSignupRequest.created_at < window_end,
                ),
            )},
            {"key": "invited", "label": "Invited", "count": count(
                self.db_session.query(func.count(BetaSignupRequest.id)).filter(
                    BetaSignupRequest.invited_at >= window_start, BetaSignupRequest.invited_at < window_end,
                ),
            )},
            {"key": "signed_up", "label": "Signed up", "count": count(
                self.db_session.query(func.count()).select_from(signups),
            )},
            {"key": "first_fractal", "label": "Created a fractal", "count": int(first_fractal or 0)},
            {"key": "activated", "label": f"Completed a session within {ACTIVATION_DAYS} days",
             "count": int(activated or 0)},
        ]

    def _weekly_active_practitioners(self, now):
        this_week = _iso_week_start(now.date())
        first_week = this_week - datetime.timedelta(weeks=WAP_WEEKS - 1)
        week_start = func.date_trunc("week", Session.completed_at)
        rows = dict(self.db_session.query(
            week_start, func.count(func.distinct(Session.owner_id)),
        ).filter(
            Session.completed.is_(True),
            Session.deleted_at.is_(None),
            Session.completed_at >= _utc_midnight(first_week),
            Session.owner_id.in_(self._real_users()),
        ).group_by(week_start).all())
        by_week = {
            (key.date() if isinstance(key, datetime.datetime) else key): int(value)
            for key, value in rows.items()
        }

        weeks = []
        for offset in range(WAP_WEEKS):
            start = first_week + datetime.timedelta(weeks=offset)
            accounts = int(self.db_session.query(func.count(User.id)).filter(
                User.role.notin_(EXCLUDED_ROLES),
                User.is_active.is_(True),
                User.created_at < _utc_midnight(start + datetime.timedelta(weeks=1)),
            ).scalar() or 0)
            weeks.append({"week_start": start.isoformat(), "count": by_week.get(start, 0), "accounts": accounts})

        return {"current": weeks[-1], "previous": weeks[-2], "weeks": weeks}

    def _feature_adoption(self, now):
        since = now - datetime.timedelta(days=ADOPTION_DAYS)
        practitioners = self.db_session.query(Session.owner_id).filter(
            Session.completed.is_(True),
            Session.deleted_at.is_(None),
            Session.completed_at >= since,
            Session.owner_id.in_(self._real_users()),
        ).distinct().subquery()
        total = int(self.db_session.query(func.count()).select_from(practitioners).scalar() or 0)
        if not total:
            return {"practitioners": 0, "days": ADOPTION_DAYS, "features": []}

        segment = func.split_part(ProductEvent.path, "/", 3)
        rows = self.db_session.query(segment, ProductEvent.user_id).filter(
            ProductEvent.event_name == "page_view",
            ProductEvent.created_at >= since,
            ProductEvent.path.like("/:rootId/%"),
            ProductEvent.user_id.in_(sa.select(practitioners.c.owner_id)),
        ).distinct().all()
        users_by_feature: dict[str, set] = {}
        for path_segment, user_id in rows:
            feature = FEATURE_SURFACES.get(path_segment)
            if feature:
                users_by_feature.setdefault(feature, set()).add(user_id)
        features = sorted(
            ({"feature": name, "users": len(users), "share": round(len(users) / total, 4)}
             for name, users in users_by_feature.items()),
            key=lambda item: (-item["users"], item["feature"]),
        )
        return {"practitioners": total, "days": ADOPTION_DAYS, "features": features}
