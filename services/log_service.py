from datetime import datetime

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
    ) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        stmt = select(EventLog).where(EventLog.root_id == root_id)

        if event_type and event_type != "all":
            stmt = stmt.where(EventLog.event_type == event_type)

        parsed_start = _parse_log_datetime(start_date)
        if parsed_start is not None:
            stmt = stmt.where(EventLog.timestamp >= parsed_start)

        parsed_end = _parse_log_datetime(end_date, end_of_day=True)
        if parsed_end is not None:
            stmt = stmt.where(EventLog.timestamp <= parsed_end)

        count_stmt = select(func.count()).select_from(stmt.subquery())
        total_count = self.db_session.execute(count_stmt).scalar() or 0

        results = self.db_session.execute(
            stmt.order_by(desc(EventLog.timestamp)).limit(limit).offset(offset)
        ).scalars().all()

        types_stmt = select(EventLog.event_type).where(EventLog.root_id == root_id).distinct()
        event_types = sorted(t for t in self.db_session.execute(types_stmt).scalars().all())

        return {
            "logs": [serialize_event_log(log) for log in results],
            "event_types": event_types,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "count": len(results),
                "has_more": (offset + limit) < total_count,
            },
        }, None, 200

    def clear_logs(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
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
