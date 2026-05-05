import copy
from datetime import date, datetime, time, timedelta, timezone
import logging
import uuid
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func, inspect, text
from sqlalchemy.orm import selectinload, joinedload, with_loader_criteria, load_only
from models import (
    ActivityDefinition, ActivityGroup, ActivityInstance,
    Goal, MetricDefinition,
    MetricValue, ProgramBlock, ProgramDay, Session, session_goals,
    validate_root_goal
)
import models
from services import event_bus, Event, Events
from services.payload_normalizers import normalize_session_payload
from services.owned_entity_queries import (
    get_owned_activity_definition,
    get_owned_activity_instance,
    get_owned_session,
)
from services.service_types import JsonDict, ServiceResult
from services.serializers import (
    format_utc,
    serialize_activity_instance,
    serialize_activity_instance_for_analytics,
    serialize_session,
    serialize_session_for_analytics,
)
from services.goal_type_utils import get_canonical_goal_type
from services.session_runtime import (
    DEFAULT_TEMPLATE_COLOR,
    SESSION_TYPE_QUICK,
    get_template_color,
    get_template_session_type,
    is_quick_session,
)
from services.session_template_stats_service import SessionTemplateStatsService
from services.session_structure import (
    build_duplicate_session_data,
    extract_activity_definition_id,
)
logger = logging.getLogger(__name__)

VALID_SESSION_COMPLETION_FILTERS = {"all", "completed", "incomplete"}
VALID_SESSION_SORT_FIELDS = {"session_start", "updated_at"}
VALID_SESSION_SORT_ORDERS = {"asc", "desc"}
VALID_SESSION_DURATION_OPERATORS = {"gt", "lt"}
VALID_SESSION_HEATMAP_METRICS = {"count", "duration"}
MAX_FLOWTREE_WINDOW_DAYS = 90

def _program_goal_ids(db_session, program_id) -> set[str]:
    if not program_id:
        return set()
    return set(
        db_session.execute(
            text("SELECT goal_id FROM program_goals WHERE program_id = :program_id"),
            {'program_id': program_id}
        ).scalars().all()
    )


def _parse_iso_datetime_strict(value) -> datetime | None:
    """Parse strict ISO-8601 datetime into UTC-aware datetime."""
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)


class SessionService:
    def __init__(self, db_session):
        self.db_session = db_session
        self._session_goals_has_source = None

    @staticmethod
    def _session_read_options():
        return (
            selectinload(Session.goals),
            selectinload(Session.template),
            selectinload(Session.notes_list),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(Session.activity_instances).selectinload(ActivityInstance.progress_record),
            selectinload(Session.program_day).selectinload(ProgramDay.block).selectinload(ProgramBlock.program),
            with_loader_criteria(ActivityInstance, ActivityInstance.deleted_at == None, include_aliases=True),
        )

    @staticmethod
    def _session_activity_read_options():
        return (
            joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split),
        )

    def _recompute_and_attach_stats(self, session):
        if not session:
            return
        stats_service = SessionTemplateStatsService(self.db_session)
        computed = stats_service.recompute_for_session(session)
        session._template_stats = computed.get("template") or {}
        session._activity_duration_stats = computed.get("activity_durations") or {}
        self.db_session.commit()

    @staticmethod
    def _analytics_session_read_options():
        return (
            load_only(
                Session.id,
                Session.name,
                Session.session_start,
                Session.created_at,
                Session.completed,
                Session.total_duration_seconds,
                Session.attributes,
            ),
        )

    @staticmethod
    def _extract_activity_definition_id(raw_item) -> str | None:
        """Extract activity definition id from legacy/current template exercise shapes."""
        return extract_activity_definition_id(raw_item)

    @classmethod
    def _normalize_template_activities(cls, raw_items) -> list[tuple[dict | str, str]]:
        normalized = []
        for raw_item in raw_items or []:
            activity_id = cls._extract_activity_definition_id(raw_item)
            if not activity_id:
                continue
            normalized.append((raw_item, activity_id))
        return normalized

    @staticmethod
    def _quick_session_structure_error(session):
        if is_quick_session(session):
            return "Quick session structure is fixed by the template", 400
        return None

    def _session_goals_supports_source(self) -> bool:
        if self._session_goals_has_source is None:
            cols = inspect(self.db_session.bind).get_columns('session_goals')
            self._session_goals_has_source = any(c.get('name') == 'association_source' for c in cols)
        return self._session_goals_has_source

    def _session_goal_insert_values(self, session_id, goal_id, goal_type, association_source) -> JsonDict:
        values = {
            'session_id': session_id,
            'goal_id': goal_id,
            'goal_type': goal_type,
        }
        if self._session_goals_supports_source():
            values['association_source'] = association_source
        return values

    def _get_effective_activity_goals(self, root_id, activity_def_ids) -> dict[str, list[Goal]]:
        """Resolve direct and group-inherited goals for each activity definition."""
        if not activity_def_ids:
            return {}

        activities = self.db_session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.associated_goals)
        ).filter(
            ActivityDefinition.id.in_(activity_def_ids),
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at == None
        ).all()

        groups_by_id = {
            group.id: group
            for group in self.db_session.query(ActivityGroup).options(
                selectinload(ActivityGroup.associated_goals)
            ).filter(
                ActivityGroup.root_id == root_id,
                ActivityGroup.deleted_at == None
            ).all()
        }

        effective_goals_by_activity = {}
        for activity in activities:
            seen_goal_ids = set()
            effective_goals = []

            def append_goal(goal):
                if not goal or goal.deleted_at or goal.root_id != root_id:
                    return
                if goal.id in seen_goal_ids:
                    return
                seen_goal_ids.add(goal.id)
                effective_goals.append(goal)

            for goal in activity.associated_goals or []:
                append_goal(goal)

            seen_group_ids = set()
            current_group_id = activity.group_id
            while current_group_id and current_group_id not in seen_group_ids:
                seen_group_ids.add(current_group_id)
                group = groups_by_id.get(current_group_id)
                if not group:
                    break

                for goal in group.associated_goals or []:
                    append_goal(goal)

                current_group_id = group.parent_id

            effective_goals_by_activity[activity.id] = effective_goals

        return effective_goals_by_activity

    def _derive_session_goals_from_activities(self, session_obj) -> list[Goal]:
        """Derive display goals from session activities when persisted links are missing."""
        activity_def_ids = set()

        # Prefer persisted instances
        for inst in (session_obj.activity_instances or []):
            if inst.activity_definition_id:
                activity_def_ids.add(inst.activity_definition_id)

        # Fallback to session attributes
        attrs = models._safe_load_json(getattr(session_obj, 'attributes', None), {})
        for section in attrs.get('sections', []):
            for exercise in section.get('exercises', []):
                if exercise.get('activity_id'):
                    activity_def_ids.add(exercise.get('activity_id'))

        if not activity_def_ids:
            return []
        activity_goals = self._get_effective_activity_goals(session_obj.root_id, activity_def_ids)

        # Program scoping applies only when program has selected goals.
        program_goal_ids = set()
        if getattr(session_obj, 'program_day', None) and session_obj.program_day.block and session_obj.program_day.block.program:
            program_goal_ids = _program_goal_ids(self.db_session, session_obj.program_day.block.program.id)

        derived = {}
        for goals in activity_goals.values():
            for goal in goals:
                if goal.deleted_at or goal.completed:
                    continue
                if goal.root_id != session_obj.root_id:
                    continue
                if program_goal_ids and goal.id not in program_goal_ids:
                    continue
                derived[goal.id] = goal

        return list(derived.values())

    @staticmethod
    def _effective_session_timestamp():
        return func.coalesce(Session.session_start, Session.created_at)

    @staticmethod
    def _effective_activity_completion_timestamp():
        return func.coalesce(ActivityInstance.time_stop, ActivityInstance.updated_at, ActivityInstance.created_at)

    @staticmethod
    def _timestamp_contributes_to_goal(timestamp, goal) -> bool:
        occurred_at = _as_utc_datetime(timestamp)
        if not occurred_at or not goal:
            return False

        created_at = _as_utc_datetime(goal.created_at)
        if created_at and occurred_at < created_at:
            return False

        completed_at = _as_utc_datetime(goal.completed_at)
        if completed_at and occurred_at >= completed_at:
            return False

        return True

    @staticmethod
    def _normalize_window_days(raw_days, default=7, max_days=MAX_FLOWTREE_WINDOW_DAYS) -> int:
        try:
            days = int(raw_days or default)
        except (TypeError, ValueError):
            return default
        return max(1, min(days, max_days))

    @staticmethod
    def _empty_flowtree_session_metrics(window_days: int) -> JsonDict:
        return {
            "window_days": window_days,
            "completed_sessions_count": 0,
            "completed_instances_count": 0,
            "total_session_duration_seconds": 0,
            "total_instance_duration_seconds": 0,
            "recent_sessions_count": 0,
            "recent_instances_count": 0,
            "recent_session_duration_seconds": 0,
            "program_sessions_count": 0,
            "recent_program_sessions_count": 0,
        }

    @staticmethod
    def _finalize_paused_session_duration(session_obj, completion_time: datetime):
        """Fold an active pause into totals and persist active session duration."""
        if is_quick_session(session_obj):
            return

        completion_at = _as_utc_datetime(completion_time) or datetime.now(timezone.utc)
        if session_obj.is_paused and session_obj.last_paused_at:
            paused_at = _as_utc_datetime(session_obj.last_paused_at)
            if paused_at and completion_at > paused_at:
                paused_duration = int((completion_at - paused_at).total_seconds())
                session_obj.total_paused_seconds = (session_obj.total_paused_seconds or 0) + paused_duration
        session_obj.is_paused = False
        session_obj.last_paused_at = None

        if not session_obj.session_end:
            session_obj.session_end = completion_at

        start_at = _as_utc_datetime(session_obj.session_start)
        end_at = _as_utc_datetime(session_obj.session_end)
        if start_at and end_at and end_at > start_at:
            wall_duration = int((end_at - start_at).total_seconds())
            session_obj.total_duration_seconds = max(
                0,
                wall_duration - (session_obj.total_paused_seconds or 0),
            )

    @staticmethod
    def _build_analytics_legacy_instance(session_obj, exercise: JsonDict, fallback_id: str) -> JsonDict:
        metric_values = exercise.get("metrics") if isinstance(exercise.get("metrics"), list) else []
        return {
            "id": exercise.get("instance_id") or fallback_id,
            "session_id": session_obj.id,
            "activity_definition_id": exercise.get("activity_id"),
            "session_name": session_obj.name,
            "session_date": format_utc(session_obj.session_start or session_obj.created_at),
            "created_at": format_utc(session_obj.created_at),
            "time_start": None,
            "time_stop": None,
            "duration_seconds": None,
            "completed": bool(session_obj.completed),
            "has_sets": bool(exercise.get("sets")),
            "sets": copy.deepcopy(exercise.get("sets") or []),
            "metric_values": copy.deepcopy(metric_values),
            "metrics": copy.deepcopy(metric_values),
        }

    @staticmethod
    def _normalize_id_list(values) -> list[str]:
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

    @staticmethod
    def _resolve_timezone(timezone_name: str | None):
        if not timezone_name:
            return timezone.utc
        try:
            return ZoneInfo(timezone_name)
        except ZoneInfoNotFoundError:
            return None

    def _normalize_session_filters(self, filters: JsonDict | None) -> tuple[JsonDict | None, str | JsonDict | None, int]:
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
        timezone_info = self._resolve_timezone(timezone_name)
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
            "activity_ids": self._normalize_id_list(raw_filters.get("activity_ids")),
            "goal_ids": self._normalize_id_list(raw_filters.get("goal_ids")),
            "duration_operator": duration_operator,
            "duration_minutes": duration_minutes,
            "heatmap_metric": heatmap_metric,
        }, None, 200

    def _get_activity_definition_ids_for_goal_filter(self, root_id: str, goal_ids: list[str]) -> set[str]:
        if not goal_ids:
            return set()

        activity_ids = [
            activity_id
            for (activity_id,) in self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None,
            ).all()
        ]
        effective_goals_by_activity = self._get_effective_activity_goals(root_id, activity_ids)
        target_goal_ids = {str(goal_id) for goal_id in goal_ids}

        matching_activity_ids = set()
        for activity_id, goals in effective_goals_by_activity.items():
            if any(str(goal.id) in target_goal_ids for goal in goals):
                matching_activity_ids.add(activity_id)

        return matching_activity_ids

    @staticmethod
    def _session_duration_seconds_from_row(total_duration_seconds, duration_minutes, session_start, session_end) -> int:
        if session_start is not None and session_end is not None:
            return max(0, int((session_end - session_start).total_seconds()))
        if total_duration_seconds is not None:
            return max(0, int(total_duration_seconds))
        if duration_minutes is not None:
            return max(0, int(duration_minutes * 60))
        return 0

    def _apply_duration_filter(self, query, filters: JsonDict):
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
            session_seconds = self._session_duration_seconds_from_row(
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

    def _apply_session_filters(self, query, root_id: str, filters: JsonDict):
        effective_timestamp = self._effective_session_timestamp()

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
            matching_activity_ids = self._get_activity_definition_ids_for_goal_filter(root_id, filters["goal_ids"])
            if not matching_activity_ids:
                return query.filter(Session.id == None)

            goal_session_ids = self.db_session.query(ActivityInstance.session_id).filter(
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at == None,
                ActivityInstance.activity_definition_id.in_(matching_activity_ids),
            )
            query = query.filter(Session.id.in_(goal_session_ids))

        return self._apply_duration_filter(query, filters)

    def _build_session_ordering(self, filters: JsonDict):
        sort_desc = filters["sort_order"] == "desc"
        if filters["sort_by"] == "updated_at":
            primary = Session.updated_at.desc() if sort_desc else Session.updated_at.asc()
        else:
            effective_timestamp = self._effective_session_timestamp()
            primary = effective_timestamp.desc() if sort_desc else effective_timestamp.asc()

        secondary = Session.created_at.desc() if sort_desc else Session.created_at.asc()
        tertiary = Session.id.desc() if sort_desc else Session.id.asc()
        return primary, secondary, tertiary

    def get_fractal_sessions(self, root_id, current_user_id, limit=10, offset=0, filters=None) -> ServiceResult[JsonDict]:
        """Get sessions for a specific fractal."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        normalized_filters, error, status = self._normalize_session_filters(filters)
        if error:
            return None, error, status

        base_query = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
        )
        filtered_query = self._apply_session_filters(base_query, root_id, normalized_filters)
        total_count = filtered_query.count()

        sessions = filtered_query.options(
            *self._session_read_options(),
        ).order_by(*self._build_session_ordering(normalized_filters)).offset(offset).limit(limit).all()

        result = [serialize_session(s, include_image_data=False) for s in sessions]

        return {
            "sessions": result,
            "pagination": {
                "limit": limit,
                "offset": offset,
                "total": total_count,
                "has_more": offset + len(result) < total_count
            }
        }, None, 200

    def get_session_analytics_summary(self, root_id, current_user_id, limit=50) -> ServiceResult[JsonDict]:
        """Return lightweight session and activity-instance data for analytics views."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        clamped_limit = max(1, min(int(limit or 50), 200))
        ordering = self._build_session_ordering({
            "sort_by": "session_start",
            "sort_order": "desc",
        })

        sessions = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
        ).options(
            *self._analytics_session_read_options(),
        ).order_by(*ordering).limit(clamped_limit).all()

        serialized_sessions = [serialize_session_for_analytics(session) for session in sessions]
        session_lookup = {
            session.id: {
                "name": session.name,
                "date": session.session_start or session.created_at,
            }
            for session in sessions
        }
        session_ids = list(session_lookup.keys())
        instances_by_activity: dict[str, list[JsonDict]] = {}

        if session_ids:
            activity_instances = self.db_session.query(ActivityInstance).filter(
                ActivityInstance.session_id.in_(session_ids),
                ActivityInstance.deleted_at == None,
            ).options(
                *self._session_activity_read_options(),
            ).all()

            persisted_session_ids = set()
            for instance in activity_instances:
                if not instance.activity_definition_id:
                    continue

                persisted_session_ids.add(instance.session_id)
                session_meta = session_lookup.get(instance.session_id) or {}
                serialized_instance = serialize_activity_instance_for_analytics(
                    instance,
                    session_name=session_meta.get("name"),
                    session_date=session_meta.get("date"),
                )
                instances_by_activity.setdefault(instance.activity_definition_id, []).append(serialized_instance)

            for session in sessions:
                if session.id in persisted_session_ids:
                    continue

                attrs = models._safe_load_json(getattr(session, "attributes", None), {})
                session_data = attrs.get("session_data") if isinstance(attrs.get("session_data"), dict) else attrs
                sections = session_data.get("sections") if isinstance(session_data, dict) else None
                if not isinstance(sections, list):
                    continue

                legacy_counter = 0
                for section in sections:
                    exercises = section.get("exercises") if isinstance(section, dict) else None
                    if not isinstance(exercises, list):
                        continue

                    for exercise in exercises:
                        if not isinstance(exercise, dict):
                            continue
                        if exercise.get("type") != "activity" or not exercise.get("activity_id"):
                            continue

                        legacy_counter += 1
                        activity_id = exercise["activity_id"]
                        fallback_id = f"{session.id}-legacy-{legacy_counter}"
                        instances_by_activity.setdefault(activity_id, []).append(
                            self._build_analytics_legacy_instance(session, exercise, fallback_id)
                        )

        return {
            "sessions": serialized_sessions,
            "activity_instances": instances_by_activity,
            "limit": clamped_limit,
        }, None, 200

    def get_session_heatmap(self, root_id, current_user_id, filters=None) -> ServiceResult[JsonDict]:
        """Return daily session counts for the active sessions query scope."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        normalized_filters, error, status = self._normalize_session_filters(filters)
        if error:
            return None, error, status

        base_query = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
        )
        filtered_query = self._apply_session_filters(base_query, root_id, normalized_filters)

        timestamp_rows = filtered_query.with_entities(
            self._effective_session_timestamp().label("effective_timestamp"),
            Session.total_duration_seconds,
            Session.duration_minutes,
            Session.session_start,
            Session.session_end,
        ).all()

        timezone_info = normalized_filters["timezone_info"]
        counts_by_day = {}
        values_by_day = {}
        for timestamp_value, total_duration_seconds, duration_minutes, session_start, session_end in timestamp_rows:
            if timestamp_value is None:
                continue
            if timestamp_value.tzinfo is None:
                timestamp_value = timestamp_value.replace(tzinfo=timezone.utc)
            local_day = timestamp_value.astimezone(timezone_info).date().isoformat()
            counts_by_day[local_day] = counts_by_day.get(local_day, 0) + 1
            if normalized_filters["heatmap_metric"] == "duration":
                values_by_day[local_day] = values_by_day.get(local_day, 0) + (
                    self._session_duration_seconds_from_row(
                        total_duration_seconds,
                        duration_minutes,
                        session_start,
                        session_end,
                    ) / 60
                )
            else:
                values_by_day[local_day] = counts_by_day[local_day]

        if normalized_filters["range_start"]:
            start_date = date.fromisoformat(normalized_filters["range_start"])
        elif counts_by_day:
            start_date = min(date.fromisoformat(day) for day in counts_by_day)
        else:
            start_date = datetime.now(timezone_info).date()

        if normalized_filters["range_end"]:
            end_date = date.fromisoformat(normalized_filters["range_end"])
        elif counts_by_day:
            end_date = max(date.fromisoformat(day) for day in counts_by_day)
        else:
            end_date = datetime.now(timezone_info).date()

        if start_date > end_date:
            start_date = end_date

        days = []
        current_date = end_date
        while current_date >= start_date:
            date_key = current_date.isoformat()
            days.append({
                "date": date_key,
                "count": counts_by_day.get(date_key, 0),
                "value": values_by_day.get(date_key, 0),
            })
            current_date -= timedelta(days=1)

        max_count = max((day["count"] for day in days), default=0)
        max_value = max((day["value"] for day in days), default=0)
        total_sessions = sum(day["count"] for day in days)
        total_value = sum(day["value"] for day in days)

        return {
            "range_start": start_date.isoformat(),
            "range_end": end_date.isoformat(),
            "metric": normalized_filters["heatmap_metric"],
            "total_sessions": total_sessions,
            "total_value": total_value,
            "max_count": max_count,
            "max_value": max_value,
            "days": days,
        }, None, 200

    def get_activity_instantiation_summary(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        """Return instance count, latest usage, and average duration by activity."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        rows = self.db_session.query(
            ActivityInstance.activity_definition_id,
            func.max(self._effective_activity_completion_timestamp()).label("latest_timestamp"),
            func.count(ActivityInstance.id).label("instance_count"),
        ).join(
            Session,
            Session.id == ActivityInstance.session_id,
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None,
            ActivityInstance.completed.is_(True),
        ).group_by(
            ActivityInstance.activity_definition_id,
        ).all()

        latest_by_activity = {}
        summary_by_activity = {}
        activity_ids = [str(activity_definition_id) for activity_definition_id, _, _ in rows if activity_definition_id]
        stats_service = SessionTemplateStatsService(self.db_session)
        duration_stats = stats_service.persisted_activity_duration_stats(root_id, activity_ids)
        missing_stats = [activity_id for activity_id in activity_ids if activity_id not in duration_stats]
        if missing_stats:
            duration_stats.update(stats_service.recompute_activity_stats(root_id, missing_stats))
            self.db_session.commit()

        for activity_definition_id, latest_timestamp, instance_count in rows:
            if activity_definition_id and latest_timestamp:
                activity_id = str(activity_definition_id)
                latest_by_activity[activity_id] = format_utc(latest_timestamp)
                stats = duration_stats.get(activity_id) or {}
                summary_by_activity[activity_id] = {
                    "instance_count": int(instance_count or 0),
                    "last_used_at": format_utc(latest_timestamp),
                    "average_duration_seconds": stats.get("average_duration_seconds"),
                    "duration_sample_count": stats.get("sample_count", 0),
                }

        return {
            "latest_by_activity": latest_by_activity,
            "summary_by_activity": summary_by_activity,
        }, None, 200

    def get_recent_evidence_goal_ids(self, root_id, current_user_id, days=7) -> ServiceResult[JsonDict]:
        """Return goal ids with recent completed activity evidence."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        window_days = self._normalize_window_days(days)
        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)

        recent_instance_rows = self.db_session.query(
                ActivityInstance.activity_definition_id,
                ActivityInstance.time_stop,
                ActivityInstance.updated_at,
                ActivityInstance.created_at,
            ).join(
                Session,
                Session.id == ActivityInstance.session_id,
            ).filter(
                Session.root_id == root_id,
                Session.deleted_at == None,
                ActivityInstance.root_id == root_id,
                ActivityInstance.deleted_at == None,
                ActivityInstance.completed.is_(True),
                self._effective_activity_completion_timestamp() >= cutoff,
            ).all()
        recent_activity_ids = sorted({
            activity_definition_id
            for activity_definition_id, *_ in recent_instance_rows
            if activity_definition_id
        })

        effective_goals_by_activity = self._get_effective_activity_goals(root_id, recent_activity_ids)
        goal_ids = set()
        for activity_id, time_stop, updated_at, created_at in recent_instance_rows:
            completed_timestamp = time_stop or updated_at or created_at
            for goal in effective_goals_by_activity.get(activity_id, []):
                if self._timestamp_contributes_to_goal(completed_timestamp, goal):
                    goal_ids.add(str(goal.id))

        return {
            "goal_ids": sorted(goal_ids),
            "window_days": window_days,
            "cutoff": format_utc(cutoff),
        }, None, 200

    def get_flowtree_session_metrics(self, root_id, current_user_id, goal_ids=None, days=7) -> ServiceResult[JsonDict]:
        """Return session and instance metrics for the requested goal scope."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        window_days = self._normalize_window_days(days)
        visible_goal_ids = set(self._normalize_id_list(goal_ids))
        if not visible_goal_ids:
            return self._empty_flowtree_session_metrics(window_days), None, 200

        matching_activity_ids = self._get_activity_definition_ids_for_goal_filter(root_id, list(visible_goal_ids))
        effective_goals_by_activity = self._get_effective_activity_goals(root_id, list(matching_activity_ids))
        target_goal_ids = {str(goal_id) for goal_id in visible_goal_ids}

        def activity_instance_contributes(activity_id, timestamp):
            for goal in effective_goals_by_activity.get(activity_id, []):
                if str(goal.id) not in target_goal_ids:
                    continue
                if self._timestamp_contributes_to_goal(timestamp, goal):
                    return True
            return False

        relevant_session_ids = set()

        if matching_activity_ids:
            activity_session_rows = self.db_session.query(
                    ActivityInstance.session_id,
                    ActivityInstance.activity_definition_id,
                    ActivityInstance.time_stop,
                    ActivityInstance.updated_at,
                    ActivityInstance.created_at,
                ).join(
                    Session,
                    Session.id == ActivityInstance.session_id,
                ).filter(
                    Session.root_id == root_id,
                    Session.deleted_at == None,
                    ActivityInstance.root_id == root_id,
                    ActivityInstance.deleted_at == None,
                    ActivityInstance.activity_definition_id.in_(matching_activity_ids),
                ).all()
            for session_id, activity_id, time_stop, updated_at, created_at in activity_session_rows:
                if not session_id:
                    continue
                if activity_instance_contributes(activity_id, time_stop or updated_at or created_at):
                    relevant_session_ids.add(session_id)

        session_goal_rows = self.db_session.query(
                session_goals.c.session_id,
                session_goals.c.goal_id,
                Session.session_start,
                Session.session_end,
                Session.completed_at,
                Session.created_at,
            ).join(
                Session,
                Session.id == session_goals.c.session_id,
            ).filter(
                Session.root_id == root_id,
                Session.deleted_at == None,
                session_goals.c.goal_id.in_(visible_goal_ids),
            ).all()
        goals_by_id = {
            goal.id: goal
            for goal in self.db_session.query(Goal).filter(
                Goal.root_id == root_id,
                Goal.id.in_(visible_goal_ids),
                Goal.deleted_at == None,
            ).all()
        }
        for session_id, goal_id, session_start, session_end, completed_at, created_at in session_goal_rows:
            goal = goals_by_id.get(goal_id)
            session_timestamp = session_end or completed_at or session_start or created_at
            if session_id and self._timestamp_contributes_to_goal(session_timestamp, goal):
                relevant_session_ids.add(session_id)

        summary = self._empty_flowtree_session_metrics(window_days)
        if not relevant_session_ids:
            return summary, None, 200

        cutoff = datetime.now(timezone.utc) - timedelta(days=window_days)
        sessions = self.db_session.query(
            Session.id,
            Session.total_duration_seconds,
            Session.duration_minutes,
            Session.session_start,
            Session.session_end,
            Session.completed_at,
            Session.created_at,
            Session.program_day_id,
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
            Session.completed.is_(True),
            Session.id.in_(relevant_session_ids),
        ).all()

        for (
            _session_id,
            total_duration_seconds,
            duration_minutes,
            session_start,
            session_end,
            completed_at,
            created_at,
            program_day_id,
        ) in sessions:
            session_seconds = self._session_duration_seconds_from_row(
                total_duration_seconds,
                duration_minutes,
                session_start,
                session_end,
            )
            summary["completed_sessions_count"] += 1
            summary["total_session_duration_seconds"] += session_seconds

            recent_timestamp = _as_utc_datetime(session_end or completed_at or created_at)
            if recent_timestamp and recent_timestamp >= cutoff:
                summary["recent_sessions_count"] += 1
                summary["recent_session_duration_seconds"] += session_seconds

            if program_day_id:
                summary["program_sessions_count"] += 1
                if recent_timestamp and recent_timestamp >= cutoff:
                    summary["recent_program_sessions_count"] += 1

        if not matching_activity_ids:
            return summary, None, 200

        instances = self.db_session.query(
            ActivityInstance.activity_definition_id,
            ActivityInstance.duration_seconds,
            ActivityInstance.completed,
            ActivityInstance.time_stop,
            ActivityInstance.updated_at,
            ActivityInstance.created_at,
        ).join(
            Session,
            Session.id == ActivityInstance.session_id,
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None,
            ActivityInstance.activity_definition_id.in_(matching_activity_ids),
            ActivityInstance.session_id.in_(relevant_session_ids),
        ).all()

        for activity_id, duration_seconds, completed, time_stop, updated_at, created_at in instances:
            if not completed:
                continue
            completed_timestamp = _as_utc_datetime(time_stop or updated_at or created_at)
            if not activity_instance_contributes(activity_id, completed_timestamp):
                continue

            summary["completed_instances_count"] += 1
            summary["total_instance_duration_seconds"] += int(duration_seconds or 0)

            if completed_timestamp and completed_timestamp >= cutoff:
                summary["recent_instances_count"] += 1

        return summary, None, 200

    def get_all_sessions(self, current_user_id, limit=None, offset=0) -> ServiceResult[list[JsonDict]]:
        """Get all sessions across fractals for the current user."""
        sessions_q = self.db_session.query(Session).join(
            Goal,
            Goal.id == Session.root_id,
        ).options(
            *self._session_read_options(),
        ).filter(
            Session.deleted_at == None,
            Goal.parent_id == None,
            Goal.owner_id == current_user_id,
            Goal.deleted_at == None,
        ).order_by(Session.created_at.desc())

        if limit is not None:
            sessions_q = sessions_q.offset(offset).limit(limit)

        sessions = sessions_q.all()
        return [serialize_session(s, include_image_data=False) for s in sessions], None, 200

    def get_session_details(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        """Get a single session with full details."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).options(
            *self._session_read_options(),
        ).filter(Session.id == session_id, Session.root_id == root_id, Session.deleted_at == None).first()
        
        if not session:
            return None, "Session not found", 404

        # Backward-compatible fallback for sessions created without persisted links.
        if not session.goals:
            derived_goals = self._derive_session_goals_from_activities(session)
            if derived_goals:
                session._derived_goals = derived_goals

        stats_service = SessionTemplateStatsService(self.db_session)
        if session.template_id:
            session._template_stats = (
                stats_service.persisted_stats_for_templates(root_id, [session.template_id]).get(session.template_id)
                or stats_service.recompute_template_stats(root_id, session.template_id)
                or {}
            )
        activity_definition_ids = [
            instance.activity_definition_id
            for instance in (session.activity_instances or [])
            if instance.activity_definition_id
        ]
        session._activity_duration_stats = stats_service.persisted_activity_duration_stats(
            root_id,
            activity_definition_ids,
        )
        missing_activity_ids = [
            activity_id
            for activity_id in activity_definition_ids
            if activity_id not in session._activity_duration_stats
        ]
        if missing_activity_ids:
            session._activity_duration_stats.update(
                stats_service.recompute_activity_stats(root_id, missing_activity_ids)
            )
            self.db_session.commit()

        return serialize_session(session, include_image_data=True), None, 200

    def get_session_activities(self, root_id, session_id, current_user_id) -> ServiceResult[list[JsonDict]]:
        """Get all non-deleted activity instances for a session in display order."""
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instances = self.db_session.query(ActivityInstance).options(
            *self._session_activity_read_options(),
        ).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None,
        ).order_by(ActivityInstance.created_at).all()

        return [serialize_activity_instance(inst) for inst in instances], None, 200

    def add_activity_to_session(self, root_id, session_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        activity_definition_id = data.get('activity_definition_id')
        if not activity_definition_id:
            return None, "activity_definition_id required", 400

        activity_def = get_owned_activity_definition(self.db_session, root_id, activity_definition_id)
        if not activity_def:
            return None, "Activity definition not found in this fractal", 404

        instance = ActivityInstance(
            id=data.get('instance_id') or str(uuid.uuid4()),
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id,
        )
        self.db_session.add(instance)
        self.db_session.flush()

        associated_goals = [goal for goal in (activity_def.associated_goals or []) if not goal.deleted_at]
        program_goal_ids = set()
        if session.program_day_id:
            raw_program_goals = self.db_session.execute(
                text(
                    "SELECT goal_id FROM program_days "
                    "JOIN program_blocks ON program_blocks.id = program_days.block_id "
                    "JOIN programs ON programs.id = program_blocks.program_id "
                    "JOIN program_goals ON program_goals.program_id = programs.id "
                    "WHERE program_days.id = :day_id AND programs.root_id = :root_id"
                ),
                {"day_id": session.program_day_id, "root_id": root_id},
            ).scalars().all()
            program_goal_ids = set(raw_program_goals)

        for goal in associated_goals:
            if goal.root_id != root_id:
                continue
            if program_goal_ids and goal.id not in program_goal_ids:
                continue
            existing = self.db_session.execute(
                text("SELECT 1 FROM session_goals WHERE session_id = :session_id AND goal_id = :goal_id LIMIT 1"),
                {"session_id": session_id, "goal_id": goal.id},
            ).first()
            if existing:
                continue
            self.db_session.execute(
                session_goals.insert().values(
                    **self._session_goal_insert_values(
                        session_id,
                        goal.id,
                        get_canonical_goal_type(goal),
                        'activity',
                    )
                )
            )

        self.db_session.commit()
        self.db_session.refresh(instance)
        activity_name = activity_def.name if activity_def else 'Unknown'
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_CREATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': activity_name,
                'session_id': session_id,
                'root_id': root_id,
            },
            source='session_service.add_activity_to_session',
        ))
        return {
            "instance": instance,
            "activity_name": activity_name,
        }, None, 201

    def reorder_activities(self, root_id, session_id, current_user_id, activity_ids) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        for idx, instance_id in enumerate(activity_ids):
            instance = self.db_session.query(ActivityInstance).filter_by(
                id=instance_id,
                session_id=session_id,
                deleted_at=None,
            ).first()
            if instance:
                instance.sort_order = idx

        self.db_session.commit()
        return {"status": "success"}, None, 200

    def update_activity_instance(self, root_id, session_id, instance_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Instance not found", 404

        if 'notes' in data:
            instance.notes = data['notes']
        if 'completed' in data:
            instance.completed = data.get('completed')
        self.db_session.commit()
        self._recompute_and_attach_stats(session)
        self.db_session.refresh(instance)
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_UPDATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
                'updated_fields': list(data.keys()),
            },
            source='session_service.update_activity_instance',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
        }, None, 200

    def remove_activity_from_session(self, root_id, session_id, instance_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404
        quick_error = self._quick_session_structure_error(session)
        if quick_error:
            return None, *quick_error

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Activity instance not found", 404

        instance.deleted_at = models.utc_now()
        self.db_session.commit()
        self._recompute_and_attach_stats(session)
        event_bus.emit(Event(
            Events.ACTIVITY_INSTANCE_DELETED,
            {
                'instance_id': instance_id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
            },
            source='session_service.remove_activity_from_session',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
        }, None, 200

    def update_activity_metrics(self, root_id, session_id, instance_id, current_user_id, metric_data_list) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = get_owned_session(self.db_session, root_id, session_id)
        if not session:
            return None, "Session not found", 404

        instance = get_owned_activity_instance(
            self.db_session,
            root_id,
            instance_id,
            session_id=session_id,
            query_options=(joinedload(ActivityInstance.definition),),
        )
        if not instance:
            return None, "Instance not found", 404

        valid_metric_ids = {
            metric_id
            for (metric_id,) in self.db_session.query(MetricDefinition.id).filter_by(
                activity_id=instance.activity_definition_id
            ).all()
        }
        for metric_data in metric_data_list:
            metric_id = metric_data.get('metric_id')
            if metric_id not in valid_metric_ids:
                return None, {
                    "error": "Invalid metric_id",
                    "details": f"Metric {metric_id} does not belong to activity {instance.activity_definition_id}",
                }, 400

        existing_metrics = self.db_session.query(MetricValue).filter_by(
            activity_instance_id=instance_id
        ).all()
        existing_dict = {(metric.metric_definition_id, metric.split_definition_id): metric for metric in existing_metrics}
        updated_keys = set()

        for metric_data in metric_data_list:
            metric_id = metric_data.get('metric_id')
            split_id = metric_data.get('split_id')
            value = metric_data.get('value')
            key = (metric_id, split_id)
            updated_keys.add(key)

            if key in existing_dict:
                existing_dict[key].value = value
            else:
                self.db_session.add(MetricValue(
                    activity_instance_id=instance_id,
                    metric_definition_id=metric_id,
                    split_definition_id=split_id,
                    value=value,
                ))

        for key, existing_metric in existing_dict.items():
            if key not in updated_keys:
                self.db_session.delete(existing_metric)

        self.db_session.commit()
        self.db_session.refresh(instance)
        event_bus.emit(Event(
            Events.ACTIVITY_METRICS_UPDATED,
            {
                'instance_id': instance.id,
                'activity_definition_id': instance.activity_definition_id,
                'activity_name': instance.definition.name if instance.definition else 'Unknown',
                'session_id': session_id,
                'root_id': root_id,
                'updated_fields': ['metrics'],
            },
            source='session_service.update_activity_metrics',
            context={'db_session': self.db_session},
        ))
        return {
            "instance": instance,
            "activity_name": instance.definition.name if instance.definition else 'Unknown',
            "serialized": serialize_activity_instance(instance),
        }, None, 200

    def duplicate_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).options(
            *self._session_read_options(),
        ).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None,
        ).first()
        if not session:
            return None, "Session not found", 404

        template_id = None
        if getattr(session, 'template', None) and getattr(session.template, 'deleted_at', None) is None:
            template_id = session.template_id

        goal_ids = [goal.id for goal in (session.goals or []) if not goal.deleted_at]
        if not goal_ids:
            goal_ids = [goal.id for goal in self._derive_session_goals_from_activities(session)]

        duplicate_payload = {
            'name': session.name,
            'description': session.description or '',
            'template_id': template_id,
            'goal_ids': goal_ids,
            'session_start': models.utc_now().isoformat(),
            'session_data': build_duplicate_session_data(session),
        }

        return self.create_session(root_id, current_user_id, duplicate_payload)

    def create_session(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        """Create a new session with automatic goal inheritance."""
        data = normalize_session_payload(data)
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        # Parse dates (strict ISO-8601)
        try:
            s_start = _parse_iso_datetime_strict(data.get('session_start')) if 'session_start' in data else None
            s_end = _parse_iso_datetime_strict(data.get('session_end')) if 'session_end' in data else None
        except ValueError:
            return None, "Invalid datetime format. Use ISO-8601 (e.g. 2026-02-18T15:30:00Z)", 400

        new_session = Session(
            name=data.get('name', 'Untitled Session'),
            description=data.get('description', ''),
            root_id=root_id,
            duration_minutes=int(data['duration_minutes']) if data.get('duration_minutes') is not None else None,
            session_start=s_start,
            session_end=s_end,
            total_duration_seconds=int(data['total_duration_seconds']) if data.get('total_duration_seconds') is not None else None,
            template_id=data.get('template_id')
        )
        
        session_data_dict = models._safe_load_json(data.get('session_data'), {})
        new_session.attributes = copy.deepcopy(session_data_dict)
        template = None
        template_payload = {}
        template_session_type = get_template_session_type(session_data_dict)
        
        # Program Context
        program_day_id = None
        program_goal_ids = set()
        if new_session.attributes:
            program_context = session_data_dict.get('program_context')
            if program_context and 'day_id' in program_context:
                requested_day_id = program_context['day_id']
                p_day = self.db_session.query(models.ProgramDay).options(
                    joinedload(models.ProgramDay.block).joinedload(models.ProgramBlock.program)
                ).filter(
                    models.ProgramDay.id == requested_day_id
                ).first()
                if p_day and p_day.block and p_day.block.program and p_day.block.program.root_id == root_id:
                    program_day_id = requested_day_id
                    new_session.program_day_id = program_day_id
                    program_goal_ids = _program_goal_ids(self.db_session, p_day.block.program.id)
                else:
                    return None, "Invalid program day context for this fractal", 400

        # Validate template ownership when provided
        if new_session.template_id:
            template = self.db_session.query(models.SessionTemplate).filter(
                models.SessionTemplate.id == new_session.template_id,
                models.SessionTemplate.root_id == root_id,
                models.SessionTemplate.deleted_at == None
            ).first()
            if not template:
                return None, "Template not found in this fractal", 404
            template_payload = models._safe_load_json(template.template_data, {})
            template_session_type = get_template_session_type(template_payload)

            session_data_dict.setdefault('template_id', template.id)
            session_data_dict.setdefault('template_name', template.name)
            session_data_dict.setdefault('session_type', template_session_type)
            session_data_dict.setdefault('template_color', get_template_color(template_payload) or DEFAULT_TEMPLATE_COLOR)

            if template_session_type == SESSION_TYPE_QUICK:
                if program_day_id:
                    return None, "Quick session templates cannot be used from a program day", 400
                if not new_session.session_start:
                    new_session.session_start = datetime.now(timezone.utc)
            elif isinstance(session_data_dict, dict) and not session_data_dict.get('sections'):
                if isinstance(template_payload, dict) and template_payload.get('sections'):
                    session_data_dict['sections'] = template_payload.get('sections', [])
                    if (
                        not session_data_dict.get('total_duration_minutes')
                        and template_payload.get('total_duration_minutes') is not None
                    ):
                        session_data_dict['total_duration_minutes'] = template_payload.get('total_duration_minutes')

            new_session.attributes = copy.deepcopy(session_data_dict)
        
        self.db_session.add(new_session)
        self.db_session.flush()

        # Goal Inheritance Logic (activities only)
        inherited_goal_map = {}
        
        # A. Collect activities from session sections (supports legacy + current shapes)
        def collect_section_exercises(input_sections):
            local_activity_ids = set()
            local_section_exercises = []
            for section in input_sections or []:
                if not isinstance(section, dict):
                    continue
                raw_exercises = section.get('exercises') or section.get('activities') or []
                normalized = []
                for exercise in raw_exercises:
                    activity_id = self._extract_activity_definition_id(exercise)
                    if not activity_id:
                        continue
                    local_activity_ids.add(activity_id)
                    normalized.append((exercise, activity_id))
                local_section_exercises.append((section, normalized))
            return local_activity_ids, local_section_exercises

        is_quick_template = template_session_type == SESSION_TYPE_QUICK

        if is_quick_template:
            quick_items = template_payload.get('activities', []) if isinstance(template_payload, dict) else []
            normalized_quick_items = self._normalize_template_activities(quick_items)
            if not (1 <= len(normalized_quick_items) <= 5):
                return None, "Quick sessions must include between 1 and 5 activities", 400

            unique_activity_def_ids = {activity_id for _, activity_id in normalized_quick_items}
            activities = self.db_session.query(ActivityDefinition).filter(
                ActivityDefinition.id.in_(unique_activity_def_ids),
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None
            ).all()
            found_activity_ids = {a.id for a in activities}
            missing_activity_ids = unique_activity_def_ids - found_activity_ids
            if missing_activity_ids:
                return None, f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400

            created_activity_ids = []
            for raw_item, activity_id in normalized_quick_items:
                raw_dict = raw_item if isinstance(raw_item, dict) else {}
                instance_id = raw_dict.get('instance_id') or str(uuid.uuid4())
                instance = ActivityInstance(
                    id=instance_id,
                    session_id=new_session.id,
                    activity_definition_id=activity_id,
                    root_id=root_id,
                )
                self.db_session.add(instance)
                self.db_session.flush()
                created_activity_ids.append(instance_id)

            session_data_dict['activity_ids'] = created_activity_ids
            session_data_dict.pop('sections', None)
        else:
            sections = session_data_dict.get('sections', []) if isinstance(session_data_dict, dict) else []
            activity_def_ids, section_exercises = collect_section_exercises(sections)

            # If the incoming session payload had sections but no parseable activity ids,
            # fall back to canonical template sections from DB.
            if not activity_def_ids and template:
                template_sections = template_payload.get('sections', []) if isinstance(template_payload, dict) else []
                template_activity_ids, template_section_exercises = collect_section_exercises(template_sections)
                if template_activity_ids:
                    session_data_dict['sections'] = template_sections
                    sections = session_data_dict.get('sections', [])
                    activity_def_ids = template_activity_ids
                    section_exercises = template_section_exercises

            if activity_def_ids:
                activities = self.db_session.query(ActivityDefinition).options(
                    joinedload(ActivityDefinition.associated_goals)
                ).filter(
                    ActivityDefinition.id.in_(activity_def_ids),
                    ActivityDefinition.root_id == root_id,
                    ActivityDefinition.deleted_at == None
                ).all()
                found_activity_ids = {a.id for a in activities}
                missing_activity_ids = activity_def_ids - found_activity_ids
                if missing_activity_ids:
                    return None, f"Invalid activity IDs for this fractal: {', '.join(sorted(missing_activity_ids))}", 400
                activity_map = {a.id: a for a in activities}

                # Persist activity instances and canonical activity ordering for section rendering.
                for section, normalized_exercises in section_exercises:
                    if section.get('id') and not section.get('template_section_id'):
                        section['template_section_id'] = section.get('id')
                    section_activity_ids = []
                    for exercise, activity_id in normalized_exercises:
                        if activity_id not in activity_map:
                            continue
                        instance_id = exercise.get('instance_id') or str(uuid.uuid4())
                        instance = ActivityInstance(
                            id=instance_id,
                            session_id=new_session.id,
                            activity_definition_id=activity_id,
                            root_id=root_id
                        )
                        self.db_session.add(instance)
                        self.db_session.flush()
                        section_activity_ids.append(instance_id)

                    section['activity_ids'] = section_activity_ids
                    section.pop('exercises', None)
                    section.pop('activities', None)
                    if 'estimated_duration_minutes' not in section and section.get('duration_minutes') is not None:
                        section['estimated_duration_minutes'] = section.get('duration_minutes')

                for act in activities:
                    for goal in act.associated_goals:
                        if (
                            goal.root_id == root_id and
                            not goal.completed and
                            not goal.deleted_at
                        ):
                            inherited_goal_map[goal.id] = goal

        # Reassign JSON attributes after in-place section normalization so SQLAlchemy
        # reliably persists updates for non-mutable JSON columns.
        new_session.attributes = copy.deepcopy(session_data_dict)

        # Filter inherited goals by program-selected goals when in program context
        if not is_quick_template and program_day_id and program_goal_ids:
            inherited_goal_map = {gid: g for gid, g in inherited_goal_map.items() if gid in program_goal_ids}

        # Persist Associations
        manual_ids = set()
        manual_ids.update(data.get('parent_ids', []) or [])
        manual_ids.update(data.get('goal_ids', []) or [])
        if data.get('parent_id'):
            manual_ids.add(data.get('parent_id'))

        # Provenance-aware linking
        linked_goal_ids = set()

        # Quick sessions intentionally skip all goal-link creation. Their runtime
        # is measurement-first and does not participate in inherited/manual goal
        # association flows used by normal sessions.
        if not is_quick_template:
            for goal_id, goal_obj in inherited_goal_map.items():
                self.db_session.execute(
                    session_goals.insert().values(
                        **self._session_goal_insert_values(
                            new_session.id, goal_id, get_canonical_goal_type(goal_obj), 'activity'
                        )
                    )
                )
                linked_goal_ids.add(goal_id)

            for goal_id in manual_ids:
                goal_obj = self.db_session.query(Goal).filter(
                    Goal.id == goal_id,
                    Goal.root_id == root_id,
                    Goal.deleted_at == None
                ).first()
                if not goal_obj:
                    return None, f"Goal not found in this fractal: {goal_id}", 400
                if goal_id in linked_goal_ids:
                    continue
                self.db_session.execute(
                    session_goals.insert().values(
                        **self._session_goal_insert_values(
                            new_session.id, goal_id, get_canonical_goal_type(goal_obj), 'manual'
                        )
                    )
                )
                linked_goal_ids.add(goal_id)

            # Immediate Goals
            immediate_goal_ids = data.get('immediate_goal_ids', [])
            for ig_id in immediate_goal_ids:
                goal = self.db_session.query(Goal).filter(
                    Goal.id == ig_id,
                    Goal.root_id == root_id,
                    Goal.deleted_at == None
                ).first()
                if not goal:
                    return None, f"Immediate goal not found in this fractal: {ig_id}", 400
                if get_canonical_goal_type(goal) != 'ImmediateGoal':
                    return None, f"Goal is not an ImmediateGoal: {ig_id}", 400
                if ig_id not in linked_goal_ids:
                    self.db_session.execute(
                        session_goals.insert().values(
                            **self._session_goal_insert_values(
                                new_session.id, ig_id, get_canonical_goal_type(goal), 'manual'
                            )
                        )
                    )
                    linked_goal_ids.add(ig_id)

        if program_day_id:
            from models import ProgramDay
            program_day = self.db_session.query(ProgramDay).filter_by(id=program_day_id).first()
            if program_day:
                program_day.is_completed = program_day.check_completion()

        self.db_session.commit()

        # Force Update Start/End timestamps if needed
        if s_start or s_end:
            params = {'id': new_session.id}
            update_clauses = []
            if s_start:
                update_clauses.append("session_start = :start")
                params['start'] = s_start
            if s_end:
                update_clauses.append("session_end = :end")
                params['end'] = s_end
            if update_clauses:
                sql = f"UPDATE sessions SET {', '.join(update_clauses)} WHERE id = :id"
                self.db_session.execute(text(sql), params)
                self.db_session.commit()
        
        self.db_session.refresh(new_session)
        self._recompute_and_attach_stats(new_session)
        
        event_bus.emit(Event(Events.SESSION_CREATED, {
            'session_id': new_session.id,
            'session_name': new_session.name,
            'root_id': root_id,
            'goal_ids': [g.id for g in new_session.goals]
        }, source='session_service.create_session'))

        return serialize_session(new_session), None, 201

    def create_completed_quick_session(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        create_payload = {key: value for key, value in data.items() if key != 'activity_instances'}
        created_session, error, status = self.create_session(root_id, current_user_id, create_payload)
        if error:
            return None, error, status

        session_id = created_session.get('id')
        if not session_id:
            return None, "Quick session creation returned no session id", 500

        persisted_instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None,
        ).order_by(ActivityInstance.created_at.asc()).all()

        instances_by_definition_id = {}
        for instance in persisted_instances:
            instances_by_definition_id.setdefault(instance.activity_definition_id, []).append(instance)

        from services.timer_service import TimerService
        timer_service = TimerService(self.db_session)

        for draft_instance in data.get('activity_instances', []):
            activity_definition_id = draft_instance.get('activity_definition_id')
            persisted_candidates = instances_by_definition_id.get(activity_definition_id) or []
            if not persisted_candidates:
                continue

            persisted_instance = persisted_candidates.pop(0)
            notes = draft_instance.get('notes')

            if draft_instance.get('has_sets'):
                update_payload = {
                    'completed': bool(draft_instance.get('completed')),
                    'sets': draft_instance.get('sets', []),
                }
                if notes is not None:
                    update_payload['notes'] = notes

                _, instance_error, instance_status = timer_service.update_activity_instance(
                    root_id,
                    persisted_instance.id,
                    current_user_id,
                    update_payload,
                )
                if instance_error:
                    return None, instance_error, instance_status
                continue

            metric_payload = draft_instance.get('metrics', [])
            if metric_payload:
                _, metrics_error, metrics_status = self.update_activity_metrics(
                    root_id,
                    session_id,
                    persisted_instance.id,
                    current_user_id,
                    metric_payload,
                )
                if metrics_error:
                    return None, metrics_error, metrics_status

            instance_payload = {
                'completed': bool(draft_instance.get('completed')),
            }
            if notes is not None:
                instance_payload['notes'] = notes

            _, instance_error, instance_status = timer_service.update_activity_instance(
                root_id,
                persisted_instance.id,
                current_user_id,
                instance_payload,
            )
            if instance_error:
                return None, instance_error, instance_status

        completed_session, complete_error, complete_status = self.update_session(
            root_id,
            session_id,
            current_user_id,
            {'completed': True},
            complete_unstarted_instances=False,
        )
        if complete_error:
            return None, complete_error, complete_status

        return completed_session, None, 201

    def update_session(
        self,
        root_id,
        session_id,
        current_user_id,
        data,
        *,
        complete_unstarted_instances=True,
    ) -> ServiceResult[JsonDict]:
        """Update session details."""
        data = normalize_session_payload(data, partial=True)
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404
        
        session = self.db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        
        if not session:
            return None, "Session not found", 404

        if 'name' in data: session.name = data['name']
        if 'description' in data: session.description = data['description']
        if 'duration_minutes' in data: session.duration_minutes = data['duration_minutes']
        
        if 'completed' in data:
            session.completed = data['completed']
            if data['completed']:
                completion_time = datetime.now(timezone.utc)
                session.completed_at = completion_time
                if is_quick_session(session):
                    if not session.session_start:
                        session.session_start = session.created_at or completion_time
                    session.session_end = None
                    session.total_duration_seconds = None
                    if isinstance(session.attributes, dict) and 'session_data' in session.attributes:
                        session.attributes['session_data']['session_end'] = None
                        session.attributes['session_data']['total_duration_seconds'] = None
                        from sqlalchemy.orm.attributes import flag_modified
                        flag_modified(session, "attributes")

                # Completing a session is an explicit completion gesture for every
                # unfinished instance; active timers are stopped before marking done.
                instances = self.db_session.query(ActivityInstance).filter(
                    ActivityInstance.session_id == session.id,
                    ActivityInstance.deleted_at == None
                ).all()
                for instance in instances:
                    if instance.completed:
                        continue
                    if not instance.time_start:
                        if not complete_unstarted_instances:
                            continue
                        instance.time_start = completion_time
                        instance.time_stop = completion_time
                        instance.duration_seconds = 0
                    elif not instance.time_stop:
                        # Active timer: stop it and mark complete.
                        instance.time_stop = completion_time

                        # Apply any active straggler paused time if the session was currently paused
                        if instance.is_paused and instance.last_paused_at:
                            paused_at = _as_utc_datetime(instance.last_paused_at)
                            if paused_at:
                                paused_duration = (completion_time - paused_at).total_seconds()
                                instance.total_paused_seconds = (
                                    (instance.total_paused_seconds or 0)
                                    + int(max(0, paused_duration))
                                )
                            instance.is_paused = False
                            instance.last_paused_at = None

                        stop_at = _as_utc_datetime(instance.time_stop)
                        start_at = _as_utc_datetime(instance.time_start)
                        duration = (stop_at - start_at).total_seconds() if stop_at and start_at else 0
                        active_duration = max(0, duration - (instance.total_paused_seconds or 0))
                        instance.duration_seconds = int(active_duration)
                    instance.completed = True
            else:
                session.completed_at = None
                session.session_end = None
                session.total_duration_seconds = None
                session.is_paused = False
                session.last_paused_at = None
                
                # Also clear it from the nested session_data if it exists
                if isinstance(session.attributes, dict) and 'session_data' in session.attributes:
                    session.attributes['session_data']['session_end'] = None
                    session.attributes['session_data']['total_duration_seconds'] = None
                    # Flag the JSON column as modified so SQLAlchemy knows to save it
                    from sqlalchemy.orm.attributes import flag_modified
                    flag_modified(session, "attributes")
        
        if 'session_start' in data:
            try:
                session.session_start = _parse_iso_datetime_strict(data['session_start'])
            except ValueError:
                return None, "Invalid session_start format. Use ISO-8601.", 400
        
        if 'session_end' in data:
            try:
                session.session_end = _parse_iso_datetime_strict(data['session_end'])
            except ValueError:
                return None, "Invalid session_end format. Use ISO-8601.", 400
        
        if 'total_duration_seconds' in data:
            session.total_duration_seconds = data['total_duration_seconds']
        if 'template_id' in data:
            session.template_id = data['template_id']
        if 'session_data' in data:
            val = data['session_data']
            session.attributes = models._safe_load_json(val, val)

        if data.get('completed') and session.completed:
            self._finalize_paused_session_duration(session, session.session_end or session.completed_at)
        
        self.db_session.commit()
        self._recompute_and_attach_stats(session)
        
        event_bus.emit(Event(
            Events.SESSION_UPDATED,
            {
                'session_id': session.id,
                'session_name': session.name,
                'root_id': root_id,
                'updated_fields': list(data.keys())
            },
            source='session_service.update_session'
        ))

        if data.get('completed') and session.completed:
            event_bus.emit(Event(
                Events.SESSION_COMPLETED,
                {
                    'session_id': session.id,
                    'session_name': session.name,
                    'root_id': root_id
                },
                source='session_service.update_session',
                context={'db_session': self.db_session},
            ))
            
        return serialize_session(session), None, 200

    def delete_session(self, root_id, session_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
             return None, "Fractal not found or access denied", 404

        session = self.db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()

        if not session:
             return None, "Session not found", 404

        session_name = session.name
        template_id = session.template_id
        activity_definition_ids = [
            instance.activity_definition_id
            for instance in (session.activity_instances or [])
            if instance.activity_definition_id
        ]
        session.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        stats_service = SessionTemplateStatsService(self.db_session)
        if template_id:
            stats_service.recompute_template_stats(root_id, template_id)
        if activity_definition_ids:
            stats_service.recompute_activity_stats(root_id, activity_definition_ids)
        self.db_session.commit()

        event_bus.emit(Event(Events.SESSION_DELETED, {
            'session_id': session_id,
            'session_name': session_name,
            'root_id': root_id
        }, source='session_service.delete_session'))

        return {"message": "Session deleted successfully"}, None, 200
