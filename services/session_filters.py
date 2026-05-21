from datetime import date, datetime, time, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from models import ActivityDefinition, ActivityInstance, Session
from services.service_types import JsonDict


VALID_SESSION_COMPLETION_FILTERS = {"all", "completed", "incomplete"}
VALID_SESSION_SORT_FIELDS = {"session_start", "updated_at"}
VALID_SESSION_SORT_ORDERS = {"asc", "desc"}
VALID_SESSION_DURATION_OPERATORS = {"gt", "lt"}
VALID_SESSION_HEATMAP_METRICS = {"count", "duration"}


def normalize_id_list(values) -> list[str]:
    if values is None:
        return []

    raw_values = values if isinstance(values, (list, tuple, set)) else [values]
    normalized = []
    seen = set()

    for raw_value in raw_values:
        if raw_value is None:
            continue
        for part in str(raw_value).split(","):
            value = part.strip()
            if not value or value in seen:
                continue
            seen.add(value)
            normalized.append(value)

    return normalized


def resolve_timezone(timezone_name: str | None):
    if not timezone_name:
        return timezone.utc
    try:
        return ZoneInfo(timezone_name)
    except ZoneInfoNotFoundError:
        return None


def session_duration_seconds_from_row(
    total_duration_seconds,
    duration_minutes,
    session_start,
    session_end,
) -> int:
    if session_start is not None and session_end is not None:
        return max(0, int((session_end - session_start).total_seconds()))
    if total_duration_seconds is not None:
        return max(0, int(total_duration_seconds))
    if duration_minutes is not None:
        return max(0, int(duration_minutes * 60))
    return 0


class SessionFilterService:
    def __init__(self, db_session, *, effective_timestamp_factory, effective_activity_goals_resolver):
        self.db_session = db_session
        self.effective_timestamp_factory = effective_timestamp_factory
        self.effective_activity_goals_resolver = effective_activity_goals_resolver

    def normalize_filters(self, filters: JsonDict | None) -> tuple[JsonDict | None, str | JsonDict | None, int]:
        raw_filters = filters or {}

        completed = raw_filters.get("completed") or "all"
        if completed not in VALID_SESSION_COMPLETION_FILTERS:
            return None, "Invalid completed filter", 400

        sort_by = raw_filters.get("sort_by") or "session_start"
        if sort_by not in VALID_SESSION_SORT_FIELDS:
            return None, "Invalid sort field", 400

        sort_order = raw_filters.get("sort_order") or "desc"
        if sort_order not in VALID_SESSION_SORT_ORDERS:
            return None, "Invalid sort order", 400

        timezone_name = raw_filters.get("timezone") or "UTC"
        timezone_info = resolve_timezone(timezone_name)
        if timezone_info is None:
            return None, "Invalid timezone", 400

        range_start = raw_filters.get("range_start") or None
        range_end = raw_filters.get("range_end") or None
        duration_operator = raw_filters.get("duration_operator") or None
        raw_duration_minutes = raw_filters.get("duration_minutes")
        heatmap_metric = raw_filters.get("heatmap_metric") or "count"

        try:
            start_date = date.fromisoformat(range_start) if range_start else None
            end_date = date.fromisoformat(range_end) if range_end else None
        except ValueError:
            return None, "Invalid date range", 400

        if duration_operator is not None and duration_operator not in VALID_SESSION_DURATION_OPERATORS:
            return None, "Invalid duration operator", 400

        if raw_duration_minutes in (None, ""):
            duration_minutes = None
            duration_operator = None
        else:
            try:
                duration_minutes = int(raw_duration_minutes)
            except (TypeError, ValueError):
                return None, "Invalid duration filter", 400
            if duration_minutes < 0:
                return None, "Invalid duration filter", 400

        if heatmap_metric not in VALID_SESSION_HEATMAP_METRICS:
            return None, "Invalid heatmap metric", 400

        if start_date and end_date and start_date > end_date:
            return None, "range_start cannot be after range_end", 400

        utc_range_start = None
        utc_range_end = None
        if start_date:
            utc_range_start = datetime.combine(start_date, time.min, tzinfo=timezone_info).astimezone(timezone.utc)
        if end_date:
            utc_range_end = datetime.combine(end_date, time.max, tzinfo=timezone_info).astimezone(timezone.utc)

        return {
            "completed": completed,
            "sort_by": sort_by,
            "sort_order": sort_order,
            "timezone": timezone_name,
            "timezone_info": timezone_info,
            "range_start": range_start,
            "range_end": range_end,
            "utc_range_start": utc_range_start,
            "utc_range_end": utc_range_end,
            "activity_ids": normalize_id_list(raw_filters.get("activity_ids")),
            "goal_ids": normalize_id_list(raw_filters.get("goal_ids")),
            "duration_operator": duration_operator,
            "duration_minutes": duration_minutes,
            "heatmap_metric": heatmap_metric,
        }, None, 200

    def get_activity_definition_ids_for_goal_filter(self, root_id: str, goal_ids: list[str]) -> set[str]:
        if not goal_ids:
            return set()

        activity_ids = [
            activity_id
            for (activity_id,) in self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None,
            ).all()
        ]
        effective_goals_by_activity = self.effective_activity_goals_resolver(root_id, activity_ids)
        target_goal_ids = {str(goal_id) for goal_id in goal_ids}

        matching_activity_ids = set()
        for activity_id, goals in effective_goals_by_activity.items():
            if any(str(goal.id) in target_goal_ids for goal in goals):
                matching_activity_ids.add(activity_id)

        return matching_activity_ids

    def apply_duration_filter(self, query, filters: JsonDict):
        duration_operator = filters.get("duration_operator")
        duration_minutes = filters.get("duration_minutes")
        if duration_operator is None or duration_minutes is None:
            return query

        target_seconds = duration_minutes * 60
        candidate_rows = query.with_entities(
            Session.id,
            Session.total_duration_seconds,
            Session.duration_minutes,
            Session.session_start,
            Session.session_end,
        ).all()

        matching_session_ids = []
        for session_id, total_duration_seconds, stored_duration_minutes, session_start, session_end in candidate_rows:
            session_seconds = session_duration_seconds_from_row(
                total_duration_seconds,
                stored_duration_minutes,
                session_start,
                session_end,
            )
            if duration_operator == "gt" and session_seconds > target_seconds:
                matching_session_ids.append(session_id)
            elif duration_operator == "lt" and session_seconds < target_seconds:
                matching_session_ids.append(session_id)

        if not matching_session_ids:
            return query.filter(Session.id == None)
        return query.filter(Session.id.in_(matching_session_ids))

    def apply_filters(self, query, root_id: str, filters: JsonDict):
        effective_timestamp = self.effective_timestamp_factory()

        if filters["completed"] == "completed":
            query = query.filter(Session.completed.is_(True))
        elif filters["completed"] == "incomplete":
            query = query.filter(Session.completed.is_(False))

        if filters["utc_range_start"] is not None:
            query = query.filter(effective_timestamp >= filters["utc_range_start"])
        if filters["utc_range_end"] is not None:
            query = query.filter(effective_timestamp <= filters["utc_range_end"])

        if filters["activity_ids"]:
            activity_session_ids = self.db_session.query(ActivityInstance.session_id).filter(
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at == None,
                ActivityInstance.activity_definition_id.in_(filters["activity_ids"]),
            )
            query = query.filter(Session.id.in_(activity_session_ids))

        if filters["goal_ids"]:
            matching_activity_ids = self.get_activity_definition_ids_for_goal_filter(root_id, filters["goal_ids"])
            if not matching_activity_ids:
                return query.filter(Session.id == None)

            goal_session_ids = self.db_session.query(ActivityInstance.session_id).filter(
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at == None,
                ActivityInstance.activity_definition_id.in_(matching_activity_ids),
            )
            query = query.filter(Session.id.in_(goal_session_ids))

        return self.apply_duration_filter(query, filters)

    def build_ordering(self, filters: JsonDict):
        sort_desc = filters["sort_order"] == "desc"
        if filters["sort_by"] == "updated_at":
            primary = Session.updated_at.desc() if sort_desc else Session.updated_at.asc()
        else:
            effective_timestamp = self.effective_timestamp_factory()
            primary = effective_timestamp.desc() if sort_desc else effective_timestamp.asc()

        secondary = Session.created_at.desc() if sort_desc else Session.created_at.asc()
        tertiary = Session.id.desc() if sort_desc else Session.id.asc()
        return primary, secondary, tertiary
