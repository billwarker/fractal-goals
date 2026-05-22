import copy
from datetime import date, datetime, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import joinedload, load_only

import models
from models import ActivityDefinition, ActivityInstance, Goal, MetricValue, Session, session_goals, validate_root_goal
from services.serializers import (
    format_utc,
    serialize_activity_instance_for_analytics,
    serialize_session_for_analytics,
)
from services.service_types import JsonDict, ServiceResult
from services.session_filters import normalize_id_list, session_duration_seconds_from_row
from services.session_template_stats_service import SessionTemplateStatsService
from services.goal_contribution import as_utc_datetime, resolve_contribution_goal


MAX_FLOWTREE_WINDOW_DAYS = 90


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    return as_utc_datetime(value)


class SessionAnalyticsService:
    def __init__(self, db_session, *, session_filters, effective_activity_goals_resolver):
        self.db_session = db_session
        self._session_filters = session_filters
        self._get_effective_activity_goals = effective_activity_goals_resolver

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
    def _session_activity_read_options():
        return (
            joinedload(ActivityInstance.definition).joinedload(ActivityDefinition.group),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.definition),
            joinedload(ActivityInstance.metric_values).joinedload(MetricValue.split),
        )

    @staticmethod
    def _effective_activity_completion_timestamp():
        return func.coalesce(ActivityInstance.time_stop, ActivityInstance.updated_at, ActivityInstance.created_at)

    @staticmethod
    def _normalize_window_days(raw_days, default=7, max_days=MAX_FLOWTREE_WINDOW_DAYS) -> int:
        try:
            days = int(default if raw_days is None or raw_days == '' else raw_days)
        except (TypeError, ValueError):
            return default
        return max(1, min(days, max_days))

    @classmethod
    def _active_goal_window_days_for_root(cls, root) -> int:
        settings = getattr(root, 'progress_settings', None)
        if not isinstance(settings, dict):
            return cls._normalize_window_days(None)
        return cls._normalize_window_days(settings.get('active_goal_window_days'))

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

    def get_session_analytics_summary(self, root_id, current_user_id, limit=50) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        clamped_limit = max(1, min(int(limit or 50), 200))
        ordering = self._session_filters.build_ordering({
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
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        normalized_filters, error, status = self._session_filters.normalize_filters(filters)
        if error:
            return None, error, status

        base_query = self.db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
        )
        filtered_query = self._session_filters.apply_filters(base_query, root_id, normalized_filters)

        timestamp_rows = filtered_query.with_entities(
            self._session_filters.effective_timestamp_factory().label("effective_timestamp"),
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
                    session_duration_seconds_from_row(
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
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        rows = self.db_session.query(
            ActivityInstance.activity_definition_id,
            func.max(
                func.coalesce(
                    Session.session_start,
                    Session.created_at,
                    self._effective_activity_completion_timestamp(),
                )
            ).label("latest_timestamp"),
            func.count(ActivityInstance.id).label("instance_count"),
        ).join(
            Session,
            Session.id == ActivityInstance.session_id,
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at == None,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None,
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

    def get_recent_evidence_goal_ids(self, root_id, current_user_id, days=None) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        window_days = self._normalize_window_days(days, self._active_goal_window_days_for_root(root))
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
        goals_by_id = {
            goal.id: goal
            for goal in self.db_session.query(Goal).filter(
                Goal.root_id == root_id,
                Goal.deleted_at == None,
            ).all()
        }
        goal_ids = set()
        for activity_id, time_stop, updated_at, created_at in recent_instance_rows:
            completed_timestamp = time_stop or updated_at or created_at
            for goal in effective_goals_by_activity.get(activity_id, []):
                contribution_goal = resolve_contribution_goal(goal, completed_timestamp, goals_by_id)
                if contribution_goal:
                    goal_ids.add(str(contribution_goal.id))

        return {
            "goal_ids": sorted(goal_ids),
            "window_days": window_days,
            "cutoff": format_utc(cutoff),
        }, None, 200

    def get_flowtree_session_metrics(self, root_id, current_user_id, goal_ids=None, days=None) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        window_days = self._normalize_window_days(days, self._active_goal_window_days_for_root(root))
        visible_goal_ids = set(normalize_id_list(goal_ids))
        if not visible_goal_ids:
            return self._empty_flowtree_session_metrics(window_days), None, 200

        target_goal_ids = {str(goal_id) for goal_id in visible_goal_ids}
        goals_by_id = {
            goal.id: goal
            for goal in self.db_session.query(Goal).filter(
                Goal.root_id == root_id,
                Goal.deleted_at == None,
            ).all()
        }

        activity_ids = [
            activity_id
            for (activity_id,) in self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at == None,
            ).all()
        ]
        effective_goals_by_activity = self._get_effective_activity_goals(root_id, activity_ids)

        def activity_instance_contributes(activity_id, timestamp):
            for goal in effective_goals_by_activity.get(activity_id, []):
                contribution_goal = resolve_contribution_goal(goal, timestamp, goals_by_id)
                if contribution_goal and str(contribution_goal.id) in target_goal_ids:
                    return True
            return False

        relevant_session_ids = set()

        if activity_ids:
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
                    ActivityInstance.activity_definition_id.in_(activity_ids),
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
        for session_id, goal_id, session_start, session_end, completed_at, created_at in session_goal_rows:
            goal = goals_by_id.get(goal_id)
            session_timestamp = session_end or completed_at or session_start or created_at
            contribution_goal = resolve_contribution_goal(goal, session_timestamp, goals_by_id)
            if session_id and contribution_goal and str(contribution_goal.id) in target_goal_ids:
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
            session_seconds = session_duration_seconds_from_row(
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

        if not activity_ids:
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
            ActivityInstance.activity_definition_id.in_(activity_ids),
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
