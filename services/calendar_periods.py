"""Fractal-wide calendar periods (time off) and their bounded loaders."""

from datetime import date, datetime, timezone

from models import CalendarPeriod, validate_root_goal
from services import Event, Events, event_bus

MAX_PERIOD_DAYS = 366
MAX_QUERY_WINDOW_DAYS = 400


def load_calendar_periods(db_session, root_id, owner_id, start, end):
    """Non-deleted periods of the owner overlapping the inclusive local-date window."""
    if not root_id or start is None or end is None or end < start:
        return []
    return db_session.query(CalendarPeriod).filter(
        CalendarPeriod.root_id == root_id,
        CalendarPeriod.owner_id == owner_id,
        CalendarPeriod.deleted_at.is_(None),
        CalendarPeriod.start_date <= end,
        CalendarPeriod.end_date >= start,
    ).order_by(CalendarPeriod.start_date.asc(), CalendarPeriod.id.asc()).all()


def serialize_calendar_period(period):
    return {
        "id": period.id,
        "name": period.name,
        "kind": period.kind,
        "start_date": period.start_date.isoformat(),
        "end_date": period.end_date.isoformat(),
        "protects_streaks": bool(period.protects_streaks),
        "notes": period.notes,
    }


class CalendarPeriodService:
    """Validated CRUD for calendar periods; routes stay thin."""

    def __init__(self, db_session):
        self.db_session = db_session

    def _root(self, root_id, owner_id):
        return validate_root_goal(self.db_session, root_id, owner_id=owner_id)

    def _owned(self, root_id, owner_id, period_id):
        return self.db_session.query(CalendarPeriod).filter(
            CalendarPeriod.id == period_id,
            CalendarPeriod.root_id == root_id,
            CalendarPeriod.owner_id == owner_id,
            CalendarPeriod.deleted_at.is_(None),
        ).first()

    def list(self, root_id, owner_id, start, end):
        if not self._root(root_id, owner_id):
            return None, "Fractal not found or access denied", 404
        try:
            start_date, end_date = date.fromisoformat(start), date.fromisoformat(end)
        except (TypeError, ValueError):
            return None, "Invalid date range", 400
        if end_date < start_date or (end_date - start_date).days + 1 > MAX_QUERY_WINDOW_DAYS:
            return None, "Invalid date range", 400
        periods = load_calendar_periods(self.db_session, root_id, owner_id, start_date, end_date)
        return [serialize_calendar_period(period) for period in periods], None, 200

    def create(self, root_id, owner_id, data):
        if not self._root(root_id, owner_id):
            return None, "Fractal not found or access denied", 404
        period = CalendarPeriod(root_id=root_id, owner_id=owner_id, **data)
        self.db_session.add(period)
        self.db_session.commit()
        self._emit(Events.CALENDAR_PERIOD_CREATED, root_id, period)
        return serialize_calendar_period(period), None, 201

    def update(self, root_id, owner_id, period_id, data):
        if not self._root(root_id, owner_id):
            return None, "Fractal not found or access denied", 404
        period = self._owned(root_id, owner_id, period_id)
        if not period:
            return None, "Calendar period not found", 404
        for key, value in data.items():
            setattr(period, key, value)
        if period.end_date < period.start_date:
            self.db_session.rollback()
            return None, "end_date must be on or after start_date", 400
        if (period.end_date - period.start_date).days + 1 > MAX_PERIOD_DAYS:
            self.db_session.rollback()
            return None, f"Calendar periods can span at most {MAX_PERIOD_DAYS} days", 400
        self.db_session.commit()
        self._emit(Events.CALENDAR_PERIOD_UPDATED, root_id, period)
        return serialize_calendar_period(period), None, 200

    def delete(self, root_id, owner_id, period_id):
        if not self._root(root_id, owner_id):
            return None, "Fractal not found or access denied", 404
        period = self._owned(root_id, owner_id, period_id)
        if not period:
            return None, "Calendar period not found", 404
        period.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        self._emit(Events.CALENDAR_PERIOD_DELETED, root_id, period)
        return {"id": period.id, "deleted": True}, None, 200

    @staticmethod
    def _emit(name, root_id, period):
        event_bus.emit(Event(name, {
            "root_id": root_id,
            "calendar_period_id": period.id,
            "calendar_period_name": period.name,
            "kind": period.kind,
            "start_date": period.start_date.isoformat(),
            "end_date": period.end_date.isoformat(),
            "protects_streaks": bool(period.protects_streaks),
        }, source=f"CalendarPeriodService.{name.rsplit('_', 1)[-1]}"))
