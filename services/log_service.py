from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import delete, desc, func, select

from models import EventLog, validate_root_goal
from services.serializers import serialize_event_log
from services.service_types import JsonDict, ServiceResult


def _parse_log_datetime(raw_value, *, end_of_day=False):
    if not raw_value:
        return None

    normalized = raw_value
    if end_of_day and len(normalized) <= 10:
        normalized = f"{normalized}T23:59:59"

    try:
        return datetime.fromisoformat(normalized.replace("Z", "+00:00"))
    except ValueError:
        return None


# Activity chart domains, in display order. Event types are grouped by their prefix
# (the part before the first dot); anything unrecognised falls into "other".
ACTIVITY_DOMAINS = (
    ("goals", "Goals"),
    ("sessions", "Sessions"),
    ("activities", "Activities"),
    ("programs", "Programs"),
    ("notes", "Notes"),
    ("other", "Other"),
)
MAX_ACTIVITY_DAYS = {"day": 366, "hour": 14}
DEFAULT_ACTIVITY_DAYS = 30


def event_domain(prefix):
    """The activity-chart domain for an event type prefix such as ``activity_instance``."""
    if prefix == "goal":
        return "goals"
    if prefix == "note":
        return "notes"
    if prefix.startswith("program"):
        return "programs"
    if prefix.startswith(("session", "activity_instance", "activity_set")):
        return "sessions"
    if prefix.startswith(("activity", "fractal_metric")):
        return "activities"
    return "other"


def _parse_local_date(raw_value):
    try:
        return date.fromisoformat(raw_value) if raw_value else None
    except ValueError:
        return None


def _local_midnight_utc(day, zone):
    """The start of ``day`` in ``zone``, as the naive UTC datetime timestamps are stored in."""
    return datetime.combine(day, time(), zone).astimezone(timezone.utc).replace(tzinfo=None)


def _bucket_starts(start_day, end_day, bucket, zone):
    """Every local bucket start from ``start_day`` through ``end_day`` (inclusive), in order."""
    if bucket == "day":
        return [
            datetime.combine(start_day + timedelta(days=offset), time())
            for offset in range((end_day - start_day).days + 1)
        ]
    # Walk real hours, so a DST change yields 23 or 25 of them; a repeated local hour
    # (clocks going back) is one bucket, matching date_trunc on local time.
    first = datetime.combine(start_day, time(), zone).astimezone(timezone.utc)
    last = datetime.combine(end_day + timedelta(days=1), time(), zone).astimezone(timezone.utc)
    starts = []
    instant = first
    while instant < last:
        local = instant.astimezone(zone).replace(tzinfo=None, minute=0, second=0, microsecond=0)
        if not starts or starts[-1] != local:
            starts.append(local)
        instant += timedelta(hours=1)
    return starts


class LogService:
    """Service boundary for event log reads and retention operations."""

    def __init__(self, db_session):
        self.db_session = db_session

    def get_logs(
        self,
        root_id,
        current_user_id,
        *,
        limit=50,
        offset=0,
        event_type=None,
        start_date=None,
        end_date=None,
        tz=None,
        include_event_types=True,
    ) -> ServiceResult[JsonDict]:
        zone = None
        if tz:
            try:
                zone = ZoneInfo(tz)
            except (ZoneInfoNotFoundError, ValueError):
                return None, "Unknown timezone", 400

        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        stmt = select(EventLog).where(EventLog.root_id == root_id)

        if event_type and event_type != "all":
            stmt = stmt.where(EventLog.event_type == event_type)

        # With a timezone, YYYY-MM-DD bounds are whole local days (as the activity chart buckets
        # them); without one they are read as UTC, as before.
        start_day, end_day = _parse_local_date(start_date), _parse_local_date(end_date)
        if zone and start_day:
            stmt = stmt.where(EventLog.timestamp >= _local_midnight_utc(start_day, zone))
        else:
            parsed_start = _parse_log_datetime(start_date)
            if parsed_start is not None:
                stmt = stmt.where(EventLog.timestamp >= parsed_start)

        if zone and end_day:
            stmt = stmt.where(EventLog.timestamp < _local_midnight_utc(end_day + timedelta(days=1), zone))
        else:
            parsed_end = _parse_log_datetime(end_date, end_of_day=True)
            if parsed_end is not None:
                stmt = stmt.where(EventLog.timestamp <= parsed_end)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_count = self.db_session.execute(count_stmt).scalar() or 0

        results = self.db_session.execute(
            stmt.order_by(desc(EventLog.timestamp)).limit(limit).offset(offset)
        ).scalars().all()

        payload = {
            "logs": [
                {**serialize_event_log(log), "domain": event_domain((log.event_type or "").split(".", 1)[0])}
                for log in results
            ],
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "count": len(results),
                "has_more": (offset + limit) < total_count,
            },
        }

        if include_event_types:
            types_stmt = select(EventLog.event_type).where(EventLog.root_id == root_id).distinct()
            payload["event_types"] = sorted(
                t for t in self.db_session.execute(types_stmt).scalars().all()
            )

        return payload, None, 200

    def get_activity_series(
        self,
        root_id,
        current_user_id,
        *,
        start_date=None,
        end_date=None,
        tz="UTC",
        bucket="day",
        event_type=None,
    ) -> ServiceResult[JsonDict]:
        """Event counts per local day or hour, split by domain, for the Logs activity chart."""
        if bucket not in MAX_ACTIVITY_DAYS:
            return None, "bucket must be 'day' or 'hour'", 400
        try:
            zone = ZoneInfo(tz or "UTC")
        except (ZoneInfoNotFoundError, ValueError):
            return None, "Unknown timezone", 400

        end_day = _parse_local_date(end_date)
        start_day = _parse_local_date(start_date)
        if (end_date and end_day is None) or (start_date and start_day is None):
            return None, "Dates must be YYYY-MM-DD", 400
        end_day = end_day or datetime.now(zone).date()
        start_day = start_day or end_day - timedelta(days=DEFAULT_ACTIVITY_DAYS - 1)
        if start_day > end_day:
            return None, "start_date must not be after end_date", 400
        if (end_day - start_day).days + 1 > MAX_ACTIVITY_DAYS[bucket]:
            return None, f"Ranges are limited to {MAX_ACTIVITY_DAYS[bucket]} days for {bucket} buckets", 400

        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        start_utc = _local_midnight_utc(start_day, zone)
        end_utc = _local_midnight_utc(end_day + timedelta(days=1), zone)
        local_time = func.timezone(zone.key, func.timezone("UTC", EventLog.timestamp))
        bucket_start = func.date_trunc(bucket, local_time).label("bucket_start")
        prefix = func.split_part(EventLog.event_type, ".", 1).label("prefix")

        stmt = (
            select(bucket_start, prefix, func.count().label("count"))
            .where(
                EventLog.root_id == root_id,
                EventLog.timestamp >= start_utc,
                EventLog.timestamp < end_utc,
            )
            .group_by(bucket_start, prefix)
        )
        if event_type and event_type != "all":
            stmt = stmt.where(EventLog.event_type == event_type)

        counts = {}
        for row in self.db_session.execute(stmt):
            per_domain = counts.setdefault(row.bucket_start, {})
            domain = event_domain(row.prefix or "")
            per_domain[domain] = per_domain.get(domain, 0) + row.count

        buckets = []
        for start in _bucket_starts(start_day, end_day, bucket, zone):
            per_domain = counts.get(start, {})
            buckets.append({
                "start": start.isoformat(),
                "total": sum(per_domain.values()),
                "counts": {key: per_domain.get(key, 0) for key, _label in ACTIVITY_DOMAINS},
            })

        return {
            "bucket": bucket,
            "timezone": zone.key,
            "start_date": start_day.isoformat(),
            "end_date": end_day.isoformat(),
            "domains": [{"key": key, "label": label} for key, label in ACTIVITY_DOMAINS],
            "buckets": buckets,
            "total": sum(item["total"] for item in buckets),
        }, None, 200

    def clear_logs(self, root_id, current_user_id=None, *, require_owner=True) -> ServiceResult[JsonDict]:
        root = validate_root_goal(
            self.db_session,
            root_id,
            owner_id=current_user_id if require_owner else None,
        )
        if not root:
            return None, "Fractal not found or access denied", 404

        # Event logs are append-only operational records and do not have a deleted_at column,
        # so clearing them is intentionally a hard-delete retention operation.
        result = self.db_session.execute(
            delete(EventLog).where(EventLog.root_id == root_id)
        )
        self.db_session.commit()

        return {
            "message": "Logs cleared successfully",
            "deleted_count": result.rowcount or 0,
            "retention_policy": "hard_delete",
        }, None, 200
