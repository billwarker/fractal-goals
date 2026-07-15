"""Landing-example settings, snapshot building, and publish pipeline.

Extracted from AdminService so the ~1k-line landing read-model builder lives
in its own service boundary. AdminService and the admin blueprint compose this
service; the public landing read path (`PublicService.get_landing_examples`)
consumes the published cache via `LANDING_EXAMPLE_CACHE_KEY`.
"""
import gzip
import json
import logging
import os
import re
import tempfile
import threading
import uuid
from contextlib import contextmanager
from copy import deepcopy
from pathlib import Path
from time import perf_counter

from google.api_core.retry import Retry
from google.cloud import storage
from sqlalchemy import and_, case, func, or_, text
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from config import config
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    AppSetting,
    Goal,
    GoalLevel,
    MetricDefinition,
    MetricValue,
    Program,
    Session,
    SessionTemplate,
    Target,
    User,
    utc_now,
)
from services.activity_association_service import ActivityAssociationService
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_target_service import GoalTargetService
from services.goal_timeline_service import GoalTimelineService
from services.goal_type_utils import get_canonical_goal_type
from services.note_service import NoteService
from services.ops_log import log_ops_event
from services.programs import ProgramService
from services.serializers import (
    calculate_smart_status,
    format_utc,
    serialize_activity_definition,
    serialize_activity_group,
    serialize_activity_instance_for_analytics,
    serialize_analytics_dashboard,
    serialize_session_template,
)
from services.service_types import JsonDict, ServiceResult
from services.session_service import SessionService
from services.session_template_stats_service import MAX_DURATION_SECONDS

logger = logging.getLogger(__name__)

LANDING_EXAMPLE_SETTINGS_KEY = "landing_example_settings"
LANDING_EXAMPLE_CACHE_KEY = "landing_example_cache"
LANDING_EXAMPLE_DELIVERY_KEY = "landing_example_delivery"
# PostgreSQL transaction-scoped advisory lock key for the single public
# landing publication stream. The in-process lock covers SQLite/tests and also
# avoids duplicate work between threads before PostgreSQL grants the lock.
LANDING_EXAMPLE_PUBLISH_LOCK_KEY = 1_176_518_982
_landing_publish_process_lock = threading.Lock()
# Bump when the published landing snapshot shape changes so the frontend / future
# migrations can detect and handle stale caches.
LANDING_EXAMPLE_SCHEMA_VERSION = 12
# Match the production goal timeline's first-page depth so the landing modal
# keeps feature parity while the payload stays lean through field compaction.
LANDING_EXAMPLE_TIMELINE_LIMIT = 50
LANDING_EXAMPLE_NOTES_LIMIT = 30
LANDING_EXAMPLE_SESSIONS_LIMIT = 4
LANDING_EXAMPLE_TEMPLATES_LIMIT = 4
LANDING_EXAMPLE_ANALYTICS_LIMIT = 24
# Bound the admin showcase picker lists so the options endpoint stays light.
LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT = 50
LANDING_EXAMPLE_OPTIONS_ACTIVITIES_LIMIT = 200
LANDING_EXAMPLE_ACTIVITY_CATALOGUE_LIMIT = 200
LANDING_EXAMPLE_SHOWCASE_ACTIVITY_LIMIT = 1
LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT = 3
LANDING_EXAMPLE_SHOWCASE_KEYS = (
    "session_id",
    "activity_ids",
    "program_id",
    "program_start_date",
    "program_end_date",
    "analytics_view_ids",
)
LANDING_TREE_VIEW_SETTING_KEYS = (
    "fadeInactiveBranches",
    "hideInactiveGoals",
    "hideCompletedGoals",
    "showMetricsOverlay",
)
LANDING_GOAL_BULLET_DEFAULTS = (
    {
        "key": "break_down",
        "heading": "Break it down",
        "body": "Turn ambitious outcomes into achievable child goals. Map the journey one step at a time—and build momentum every time you complete one.",
    },
    {
        "key": "associate_activities",
        "heading": "Connect your work to your goals",
        "body": "Attach activities as evidence of progress. Each completed activity advances the goal it supports and carries that evidence up through its lineage.",
    },
    {
        "key": "set_targets",
        "heading": "Set measurable targets",
        "body": "Define performance targets for the activities behind each goal, then see your progress build over time.",
    },
)


class LandingPublishService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _get_app_setting_value(self, key: str, default):
        setting = self.db_session.get(AppSetting, key)
        if setting is None or setting.value is None:
            return deepcopy(default)
        return deepcopy(setting.value)

    def _set_app_setting_value(self, key: str, value):
        setting = self.db_session.get(AppSetting, key)
        if setting is None:
            setting = AppSetting(key=key, value=value)
            self.db_session.add(setting)
        else:
            setting.value = value
            flag_modified(setting, "value")
        return setting

    def _list_admin_owned_roots(self) -> list[Goal]:
        return self.db_session.query(Goal).join(
            User,
            Goal.owner_id == User.id,
        ).options(
            selectinload(Goal.level),
        ).filter(
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
            User.role == "admin",
            User.is_active.is_(True),
        ).order_by(
            User.username.asc(),
            Goal.created_at.desc(),
            Goal.name.asc(),
        ).all()

    def _serialize_landing_eligible_fractal(self, root: Goal) -> JsonDict:
        return {
            "root_id": root.id,
            "name": root.name,
            "description": root.description,
            "owner": getattr(getattr(root, "owner", None), "username", None),
            "created_at": format_utc(root.created_at),
            "updated_at": format_utc(root.updated_at),
        }

    @staticmethod
    def _normalize_landing_example_showcase(showcase: JsonDict | None) -> JsonDict:
        """Keep only the known showcase keys with stable null/empty defaults."""
        source = showcase if isinstance(showcase, dict) else {}
        normalized: JsonDict = {}
        for key in LANDING_EXAMPLE_SHOWCASE_KEYS:
            value = source.get(key)
            if key in ("activity_ids", "analytics_view_ids"):
                normalized[key] = [str(item) for item in (value or []) if item]
            else:
                normalized[key] = str(value) if value else None
        normalized["activity_ids"] = normalized["activity_ids"][:LANDING_EXAMPLE_SHOWCASE_ACTIVITY_LIMIT]
        normalized["analytics_view_ids"] = (
            normalized["analytics_view_ids"][:LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT]
        )
        return normalized

    @staticmethod
    def _normalize_landing_tree_view_settings(settings: JsonDict | None) -> JsonDict:
        """Return the exact public tree-view defaults, including legacy-safe false values."""
        source = settings if isinstance(settings, dict) else {}
        return {
            key: source.get(key) is True
            for key in LANDING_TREE_VIEW_SETTING_KEYS
        }

    @staticmethod
    def _normalize_landing_example_content(content: JsonDict | None) -> JsonDict:
        source = content if isinstance(content, dict) else {}
        goals = source.get("goals") if isinstance(source.get("goals"), dict) else {}
        supplied = goals.get("bullets") if isinstance(goals.get("bullets"), list) else []
        supplied_by_key = {
            item.get("key"): item
            for item in supplied
            if isinstance(item, dict) and item.get("key")
        }
        bullets = []
        for default in LANDING_GOAL_BULLET_DEFAULTS:
            item = supplied_by_key.get(default["key"], {})
            bullets.append({
                "key": default["key"],
                "heading": str(item.get("heading") or default["heading"]),
                "body": str(item.get("body") or default["body"]),
                "goal_id": str(item["goal_id"]) if item.get("goal_id") else None,
                "target_id": (
                    str(item["target_id"])
                    if default["key"] == "set_targets" and item.get("target_id")
                    else None
                ),
            })
        return {"goals": {"bullets": bullets}}

    def _normalize_landing_example_settings(self, examples: list[JsonDict]) -> list[JsonDict]:
        normalized = []
        for index, item in enumerate(examples or []):
            normalized.append({
                "root_id": item["root_id"],
                "label": item["label"],
                "sort_order": int(item.get("sort_order", index)),
                "showcase": self._normalize_landing_example_showcase(item.get("showcase")),
                "tree_view_settings": self._normalize_landing_tree_view_settings(
                    item.get("tree_view_settings")
                ),
                "landing_content": self._normalize_landing_example_content(item.get("landing_content")),
            })
        return sorted(normalized, key=lambda item: (item["sort_order"], item["label"].lower()))

    def _validate_landing_example_roots(self, examples: list[JsonDict]) -> tuple[dict[str, Goal], str | None, int]:
        root_ids = [item["root_id"] for item in examples]
        if not root_ids:
            return {}, None, 200

        roots = self.db_session.query(Goal).join(
            User,
            Goal.owner_id == User.id,
        ).filter(
            Goal.id.in_(root_ids),
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
            User.role == "admin",
            User.is_active.is_(True),
        ).all()
        roots_by_id = {root.id: root for root in roots}
        missing = [root_id for root_id in root_ids if root_id not in roots_by_id]
        if missing:
            return {}, "Landing examples must be active root fractals owned by active admins", 400
        return roots_by_id, None, 200

    def _load_effective_landing_levels(self, owner_id: str | None, root_id: str) -> dict[str, GoalLevel]:
        levels = self.db_session.query(GoalLevel).filter(
            GoalLevel.deleted_at.is_(None),
            or_(
                GoalLevel.owner_id.is_(None),
                GoalLevel.owner_id == owner_id,
            ),
        ).all()
        level_map: dict[str, GoalLevel] = {}
        for level in levels:
            if level.owner_id is None and level.root_id is None:
                level_map[level.name] = level
        for level in levels:
            if level.owner_id == owner_id and level.root_id is None:
                level_map[level.name] = level
        for level in levels:
            if level.owner_id == owner_id and level.root_id == root_id:
                level_map[level.name] = level
        return level_map

    @staticmethod
    def _normalize_level_type_name(goal_type: str | None) -> str | None:
        if not goal_type:
            return None
        return re.sub(r"(?<!^)([A-Z])", r" \1", goal_type).strip()

    def _resolve_effective_landing_level(
        self,
        goal: Goal,
        effective_levels_by_name: dict[str, GoalLevel] | None,
        goal_type: str | None,
    ) -> GoalLevel | None:
        attached_level = getattr(goal, "level", None)
        level_name = getattr(attached_level, "name", None) or self._normalize_level_type_name(goal_type)
        if level_name and effective_levels_by_name:
            return effective_levels_by_name.get(level_name) or attached_level
        return attached_level

    def get_landing_example_settings(self) -> ServiceResult[JsonDict]:
        eligible_roots = self._list_admin_owned_roots()
        draft_examples = self._normalize_landing_example_settings(
            self._get_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": []}).get("examples", [])
        )
        cache = self._get_app_setting_value(LANDING_EXAMPLE_CACHE_KEY, {"published_at": None, "examples": []})
        delivery = self._get_app_setting_value(LANDING_EXAMPLE_DELIVERY_KEY, {})
        return {
            "eligible_fractals": [self._serialize_landing_eligible_fractal(root) for root in eligible_roots],
            "examples": draft_examples,
            "published_at": cache.get("published_at"),
            "published_example_count": len(cache.get("examples") or []),
            "delivery": delivery,
        }, None, 200

    def update_landing_example_settings(self, data: JsonDict) -> ServiceResult[JsonDict]:
        examples = self._normalize_landing_example_settings(data.get("examples", []))
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": examples})
        self.db_session.commit()
        return self.get_landing_example_settings()

    def get_landing_example_options(self, root_id: str) -> ServiceResult[JsonDict]:
        """Bounded picker lists (sessions/activities/programs) for the admin
        landing showcase editor, scoped to one admin-owned root."""
        roots_by_id, error, status = self._validate_landing_example_roots([{"root_id": root_id}])
        if error:
            return None, error, status
        root = roots_by_id[root_id]
        owner_id = root.owner_id

        session_service = SessionService(self.db_session)
        sessions_result, sessions_error, _ = session_service.get_fractal_sessions(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT,
            offset=0,
            filters={"sort_by": "session_start", "sort_order": "desc"},
        )
        sessions = sessions_result.get("sessions", []) if sessions_result and not sessions_error else []

        activities = self.db_session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.associated_goals),
        ).filter(
            ActivityDefinition.root_id == root.id,
            ActivityDefinition.deleted_at.is_(None),
        ).order_by(ActivityDefinition.name.asc()).limit(LANDING_EXAMPLE_OPTIONS_ACTIVITIES_LIMIT).all()

        activity_groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root.id,
            ActivityGroup.deleted_at.is_(None),
        ).order_by(ActivityGroup.sort_order.asc(), ActivityGroup.name.asc()).all()

        try:
            programs = ProgramService.get_programs(self.db_session, root.id, owner_id)
        except Exception:
            programs = []

        analytics_views = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.root_id == root.id,
            AnalyticsDashboard.user_id == owner_id,
            AnalyticsDashboard.kind == "view",
            AnalyticsDashboard.deleted_at.is_(None),
        ).order_by(
            AnalyticsDashboard.updated_at.desc(),
            AnalyticsDashboard.created_at.desc(),
            AnalyticsDashboard.name.asc(),
        ).all()

        goals = load_fractal_goals_for_serialization(self.db_session, root.id)
        goal_options = sorted(
            (
                {
                    "id": goal.id,
                    "name": goal.name,
                    "parent_id": goal.parent_id,
                    "level_name": getattr(getattr(goal, "level", None), "name", None),
                    "targets": [
                        {
                            "id": target.id,
                            "name": target.name,
                            "activity_id": target.activity_id,
                        }
                        for target in (goal.targets_rel or [])
                        if target.deleted_at is None
                    ],
                }
                for goal in goals.values()
                if goal.deleted_at is None
            ),
            key=lambda item: (item["name"].lower(), item["id"]),
        )

        return {
            "root_id": root.id,
            "goals": goal_options,
            "sessions": [
                {
                    "id": session.get("id"),
                    "name": session.get("name"),
                    "session_start": session.get("session_start"),
                    "total_duration_seconds": session.get("total_duration_seconds"),
                    "completed": session.get("completed"),
                    "activity_instance_count": len(session.get("activity_instances") or []),
                }
                for session in sessions
            ],
            "activities": [
                {
                    "id": activity.id,
                    "name": activity.name,
                    "group_id": activity.group_id,
                    "associated_goal_count": len([
                        goal for goal in (activity.associated_goals or [])
                        if getattr(goal, "deleted_at", None) is None
                    ]),
                }
                for activity in activities
            ],
            "activity_groups": [serialize_activity_group(group) for group in activity_groups],
            "programs": [
                {
                    "id": program.get("id"),
                    "name": program.get("name"),
                    "color": program.get("color"),
                    "start_date": program.get("start_date"),
                    "end_date": program.get("end_date"),
                    "blocks": [
                        {
                            "id": block.get("id"),
                            "name": block.get("name"),
                            "start_date": block.get("start_date"),
                            "end_date": block.get("end_date"),
                        }
                        for block in (program.get("blocks") or [])
                    ],
                }
                for program in programs
            ],
            "analytics_views": [
                {
                    "id": view.id,
                    "name": view.name,
                    "updated_at": format_utc(view.updated_at),
                }
                for view in analytics_views
            ],
        }, None, 200

    def _serialize_public_target(self, target: Target) -> JsonDict:
        metrics = []
        for condition in getattr(target, "metric_conditions", []) or []:
            metrics.append({
                "metric_id": condition.metric_definition_id,
                "metric_definition_id": condition.metric_definition_id,
                "operator": condition.operator,
                "value": condition.target_value,
                "target_value": condition.target_value,
            })
        return {
            "id": target.id,
            "name": target.name,
            "activity_id": target.activity_id,
            "type": target.type or "threshold",
            "metrics": metrics,
            "time_scope": target.time_scope or "all_time",
            "start_date": format_utc(target.start_date),
            "end_date": format_utc(target.end_date),
            "frequency_days": target.frequency_days,
            "frequency_count": target.frequency_count,
            "completed": bool(target.completed),
            "completed_at": format_utc(target.completed_at),
            "created_at": format_utc(target.created_at),
        }

    def _build_landing_target_analytics(
        self, root: Goal, serialized_tree: JsonDict, goals_by_id: dict[str, Goal]
    ) -> dict[str, JsonDict]:
        """Publish bounded target analytics for the read-only public demo."""
        targets = []
        stack = [serialized_tree]
        while stack:
            node = stack.pop()
            targets.extend(node.get("attributes", {}).get("targets") or [])
            stack.extend(node.get("children") or [])

        target_service = GoalTargetService(self.db_session)
        result = {}
        for target in targets:
            target_id = target.get("id")
            if not target_id:
                continue
            if not target.get("activity_id"):
                result[target_id] = {
                    "target": target,
                    "activity_definition": None,
                    "instances": [],
                    "summary": {
                        "created_at": target.get("created_at"),
                        "total_count": 0,
                        "last_instance_at": None,
                        "days_since_created": None,
                        "conditions": [],
                        "completed": bool(target.get("completed")),
                        "completed_at": target.get("completed_at"),
                    },
                }
                continue
            payload, error, _ = target_service.get_target_analytics(
                root.id,
                target_id,
                root.owner_id,
                since="all",
                validated_root=root,
                preloaded_goals_by_id=goals_by_id,
            )
            if error or not payload:
                continue
            instances = payload.get("instances") or []
            payload["instances"] = instances[-LANDING_EXAMPLE_ANALYTICS_LIMIT:]
            result[target_id] = payload
        return result

    @staticmethod
    def _serialize_landing_metric_ref(metric: MetricDefinition) -> JsonDict:
        fm = getattr(metric, 'fractal_metric', None)
        return {
            "id": metric.id,
            "fractal_metric_id": metric.fractal_metric_id,
            "name": fm.name if fm else metric.name,
            "unit": fm.unit if fm else metric.unit,
            "input_type": fm.input_type if fm else "number",
            "track_progress": metric.track_progress,
        }

    def _serialize_landing_activity_ref(self, activity: ActivityDefinition) -> JsonDict:
        """Serialize the compact activity embed stored per goal.

        Root-level ``activity_definitions`` still carries the fuller activity
        records needed by sessions, analytics, and the activity feature. Goal
        attributes only need enough data for read-only activity cards and
        lineage detection, so avoid duplicating full definitions on every goal.
        """
        return {
            "id": activity.id,
            "name": activity.name,
            "description": activity.description,
            "group_id": activity.group_id,
            "has_sets": activity.has_sets,
            "has_metrics": activity.has_metrics,
            "metric_definitions": [
                self._serialize_landing_metric_ref(metric)
                for metric in (activity.metric_definitions or [])
                if not metric.deleted_at
            ],
        }

    @staticmethod
    def _compact_landing_timeline_payload(payload):
        if not isinstance(payload, dict):
            return payload

        allowed_keys = {
            "id",
            "name",
            "content",
            "notes",
            "created_at",
            "completed",
            "completed_at",
            "goal_id",
            "goal_name",
            "type",
            "level",
            "level_id",
            "level_name",
            "is_smart",
            "activity_definition_id",
            "activity_id",
            "activity_name",
            "definition_name",
            "activity_group_id",
            "activity_group_name",
            "session_id",
            "session_name",
            "session_date",
            "duration_seconds",
            "metric_values",
            "metrics",
            "progress_comparison",
            "progress_record",
            "target_value",
            "value",
            "operator",
            "unit",
            "time_scope",
            "start_date",
            "end_date",
            "completed_session_id",
            "completed_instance_id",
        }
        compacted = {
            key: value
            for key, value in payload.items()
            if key in allowed_keys and value is not None
        }
        if isinstance(compacted.get("notes"), str):
            compacted["notes"] = compacted["notes"][:1000]
        return compacted

    @classmethod
    def _compact_landing_timeline_entry(cls, entry: JsonDict) -> JsonDict:
        if not isinstance(entry, dict):
            return entry

        compacted = {
            key: entry.get(key)
            for key in (
                "id",
                "type",
                "category",
                "event_type",
                "entity_type",
                "entity_id",
                "relationship",
                "source_goal_id",
                "source_goal_name",
                "title",
                "subtitle",
                "timestamp",
            )
            if entry.get(key) is not None
        }
        payload = cls._compact_landing_timeline_payload(entry.get("payload"))
        if payload:
            compacted["payload"] = payload
        return compacted

    def _serialize_public_goal_tree(
        self,
        goal: Goal,
        effective_levels_by_name: dict[str, GoalLevel] | None = None,
    ) -> JsonDict:
        goal_type = get_canonical_goal_type(goal) or (
            getattr(getattr(goal, "level", None), "name", "Goal").replace(" ", "")
        )
        level = self._resolve_effective_landing_level(goal, effective_levels_by_name, goal_type)
        level_name = getattr(level, "name", None)
        level_payload = {
            "id": getattr(level, "id", None),
            "name": level_name,
            "color": getattr(level, "color", None),
            "secondary_color": getattr(level, "secondary_color", None),
            "icon": getattr(level, "icon", None),
        } if level else None
        # Use the app's canonical SMART logic so the snapshot's is_smart / smart_status
        # match the authenticated app (which also passes measurable/achievable via
        # child-completion or activity associations, not just targets).
        smart_status = calculate_smart_status(goal)
        targets = [
            self._serialize_public_target(target)
            for target in (goal.targets_rel or [])
            if target.deleted_at is None
        ]
        associated_activities = [
            self._serialize_landing_activity_ref(activity)
            for activity in (goal.associated_activities or [])
            if getattr(activity, "deleted_at", None) is None
        ]
        associated_activity_ids = [activity["id"] for activity in associated_activities]
        associated_activity_group_ids = [
            group.id
            for group in (goal.associated_activity_groups or [])
            if getattr(group, "deleted_at", None) is None
        ]
        children = [
            self._serialize_public_goal_tree(child, effective_levels_by_name)
            for child in (goal.children or [])
            if child.deleted_at is None
        ]
        attributes = {
            "id": goal.id,
            "type": goal_type,
            "parent_id": goal.parent_id,
            "root_id": goal.root_id or goal.id,
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "completed": bool(goal.completed),
            "completed_at": format_utc(goal.completed_at),
            "completion_state": "completed" if goal.completed else "active",
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "level_id": goal.level_id,
            "level_name": level_name,
            "level": level_payload,
            "targets": targets,
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": bool(goal.completed_via_children),
            "inherit_parent_activities": bool(goal.inherit_parent_activities),
            "allow_manual_completion": bool(goal.allow_manual_completion),
            "track_activities": bool(goal.track_activities),
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": bool(getattr(goal, "paused", False)),
            "paused_at": format_utc(getattr(goal, "paused_at", None)),
            "associated_activity_ids": associated_activity_ids,
            "associated_activity_group_ids": associated_activity_group_ids,
            "associated_activities": associated_activities,
            # Filled in by the publish walk so the read-only landing modal can
            # render the Timeline and Notes tabs without any authenticated API.
            "timeline_events": [],
            "notes": [],
            "progress_settings": None,
        }
        result = {
            "name": goal.name,
            "id": goal.id,
            "type": goal_type,
            "level_id": goal.level_id,
            "level_name": level_name,
            "level": level_payload,
            "completed": bool(goal.completed),
            "completed_at": format_utc(goal.completed_at),
            "completion_state": attributes["completion_state"],
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": attributes["paused"],
            "paused_at": attributes["paused_at"],
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "attributes": attributes,
            "children": children,
        }
        if level:
            result["level_characteristics"] = {
                "can_have_targets": getattr(level, "can_have_targets", True),
                "deadline_min_value": level.deadline_min_value,
                "deadline_min_unit": level.deadline_min_unit,
                "deadline_max_value": level.deadline_max_value,
                "deadline_max_unit": level.deadline_max_unit,
                "max_children": level.max_children,
                "auto_complete_when_children_done": getattr(level, "auto_complete_when_children_done", False),
                "description_required": getattr(level, "description_required", False),
                "default_deadline_offset_value": level.default_deadline_offset_value,
                "default_deadline_offset_unit": level.default_deadline_offset_unit,
                "sort_children_by": level.sort_children_by,
                "allow_manual_completion": level.allow_manual_completion,
                "requires_smart": getattr(level, "requires_smart", False),
            }
        return result

    def _enrich_landing_tree_with_history(
        self,
        serialized_root: JsonDict,
        root: Goal,
        goals_by_id: dict[str, Goal],
        effective_levels_by_name: dict[str, GoalLevel],
    ) -> None:
        """Embed bounded per-goal timeline + notes into the serialized snapshot tree.

        Publishing is a rare manual admin action and example fractals are small, so
        per-goal service calls are acceptable. This keeps the public read model
        self-contained: the landing modal renders Timeline / Notes tabs entirely
        from this cache, with no authenticated API calls.
        """
        timeline_service = GoalTimelineService(self.db_session)
        note_service = NoteService(self.db_session)
        activity_association_service = ActivityAssociationService(self.db_session)
        owner_id = root.owner_id

        def visit(node: JsonDict) -> None:
            attributes = node.get("attributes") or {}
            goal_id = attributes.get("id") or node.get("id")
            if goal_id:
                goal = goals_by_id.get(goal_id)
                activities, activities_error, _ = activity_association_service.get_goal_activities(
                    root.id,
                    goal_id,
                    owner_id,
                    validated_root=root,
                    goals_by_id=goals_by_id,
                )
                if activities_error is None and isinstance(activities, list):
                    attributes["associated_activities"] = activities
                    attributes["associated_activity_ids"] = [
                        activity.get("id")
                        for activity in activities
                        if activity.get("id")
                    ]

                groups, groups_error, _ = activity_association_service.get_goal_activity_groups(
                    root.id,
                    goal_id,
                    owner_id,
                    validated_root=root,
                    goals_by_id=goals_by_id,
                )
                if groups_error is None and isinstance(groups, list):
                    attributes["associated_activity_groups"] = groups
                    attributes["associated_activity_group_ids"] = [
                        group.get("id")
                        for group in groups
                        if group.get("id")
                    ]

                timeline_result, timeline_error, _ = timeline_service.get_goal_timeline(
                    root.id,
                    goal_id,
                    owner_id,
                    include_children=False,
                    limit=LANDING_EXAMPLE_TIMELINE_LIMIT,
                    validated_root=root,
                    preloaded_goals_by_id=goals_by_id,
                    preloaded_levels_by_name=effective_levels_by_name,
                )
                attributes["timeline_events"] = (
                    [
                        self._compact_landing_timeline_entry(entry)
                        for entry in timeline_result.get("entries", [])
                    ] if timeline_result and not timeline_error else []
                )

                direct_activity_ids = {
                    activity.id
                    for activity in (getattr(goal, "associated_activities", None) or [])
                    if not activity.deleted_at
                }
                for group in (getattr(goal, "associated_activity_groups", None) or []):
                    direct_activity_ids.update(
                        activity.id
                        for activity in (group.activities or [])
                        if not activity.deleted_at
                    )
                notes_result, notes_error, _ = note_service.get_goal_notes(
                    root.id,
                    goal_id,
                    owner_id,
                    include_descendants=False,
                    validated_root=root,
                    preloaded_goal=goal,
                    preloaded_activity_definition_ids=list(direct_activity_ids),
                )
                notes = notes_result if notes_result and not notes_error else []
                attributes["notes"] = notes[:LANDING_EXAMPLE_NOTES_LIMIT]
            node["attributes"] = attributes
            for child in node.get("children") or []:
                visit(child)

        visit(serialized_root)

    @staticmethod
    def _collect_serialized_goal_ids(serialized_root: JsonDict) -> list[str]:
        ids: list[str] = []
        stack = [serialized_root]
        while stack:
            node = stack.pop()
            if not node:
                continue
            node_id = (node.get("attributes") or {}).get("id") or node.get("id")
            if node_id:
                ids.append(node_id)
            stack.extend(node.get("children") or [])
        return ids

    def _build_landing_flowtree_data(self, root: Goal, serialized_root: JsonDict) -> dict:
        """Compute the root-scoped flowtree data the authenticated goals page fetches
        (recent-evidence goal ids, a whole-fractal metrics summary, and programs), so
        the landing view-options widget acts on real data without any public API.
        """
        owner_id = root.owner_id
        session_service = SessionService(self.db_session)

        evidence_result, evidence_error, _ = session_service.get_recent_evidence_goal_ids(root.id, owner_id)
        evidence_goal_ids = (
            evidence_result.get("goal_ids", []) if evidence_result and not evidence_error else []
        )

        all_goal_ids = self._collect_serialized_goal_ids(serialized_root)
        metrics_result, metrics_error, _ = session_service.get_flowtree_session_metrics(
            root.id, owner_id, goal_ids=all_goal_ids
        )
        metrics_summary = metrics_result if metrics_result and not metrics_error else None

        try:
            programs = ProgramService.get_programs(self.db_session, root.id, owner_id)
        except Exception:
            programs = []

        return {
            "evidence_goal_ids": evidence_goal_ids,
            "metrics_summary": metrics_summary,
            "programs": programs,
        }

    def _resolve_landing_goal_content(
        self,
        root: Goal,
        content: JsonDict | None,
    ) -> tuple[JsonDict, list[str]]:
        """Resolve per-bullet demo references without making stale content unpublishable."""
        resolved = self._normalize_landing_example_content(content)
        warnings: list[str] = []
        goal_ids = {
            bullet.get("goal_id")
            for bullet in resolved["goals"]["bullets"]
            if bullet.get("goal_id")
        }
        existing_goals = {
            row[0]
            for row in self.db_session.query(Goal.id).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root.id,
                Goal.deleted_at.is_(None),
            ).all()
        } if goal_ids else set()

        for bullet in resolved["goals"]["bullets"]:
            goal_id = bullet.get("goal_id")
            if goal_id and goal_id not in existing_goals:
                warnings.append(f"{bullet['heading']}: selected goal no longer exists and was skipped")
                bullet["goal_id"] = None
                bullet["target_id"] = None
                continue
            target_id = bullet.get("target_id")
            if not target_id:
                continue
            target_exists = self.db_session.query(Target.id).filter(
                Target.id == target_id,
                Target.goal_id == goal_id,
                Target.root_id == root.id,
                Target.deleted_at.is_(None),
            ).first()
            if not target_exists:
                warnings.append(f"{bullet['heading']}: selected target no longer exists and was skipped")
                bullet["target_id"] = None
        return resolved, warnings

    def _resolve_landing_showcase(self, root: Goal, showcase: JsonDict | None) -> tuple[JsonDict, list[str]]:
        """Validate admin-picked showcase references against the root, dropping any
        stale ids (deleted/moved content) instead of failing publish."""
        resolved = self._normalize_landing_example_showcase(showcase)
        warnings: list[str] = []

        if resolved["session_id"]:
            session = self.db_session.query(Session).options(
                selectinload(Session.activity_instances),
            ).filter(
                Session.id == resolved["session_id"],
                Session.root_id == root.id,
                Session.deleted_at.is_(None),
            ).first()
            if not session:
                warnings.append("Featured session no longer exists and was skipped")
                resolved["session_id"] = None
            elif not any(instance.deleted_at is None for instance in (session.activity_instances or [])):
                warnings.append("Featured session has no activities and was skipped")
                resolved["session_id"] = None

        if resolved["activity_ids"]:
            existing_ids = {
                row[0]
                for row in self.db_session.query(ActivityDefinition.id).filter(
                    ActivityDefinition.id.in_(resolved["activity_ids"]),
                    ActivityDefinition.root_id == root.id,
                    ActivityDefinition.deleted_at.is_(None),
                ).all()
            }
            dropped = [activity_id for activity_id in resolved["activity_ids"] if activity_id not in existing_ids]
            if dropped:
                warnings.append(f"{len(dropped)} featured activities no longer exist and were skipped")
            resolved["activity_ids"] = [
                activity_id for activity_id in resolved["activity_ids"] if activity_id in existing_ids
            ]

        if resolved["analytics_view_ids"]:
            existing_ids = {
                row[0]
                for row in self.db_session.query(AnalyticsDashboard.id).filter(
                    AnalyticsDashboard.id.in_(resolved["analytics_view_ids"]),
                    AnalyticsDashboard.root_id == root.id,
                    AnalyticsDashboard.user_id == root.owner_id,
                    AnalyticsDashboard.kind == "view",
                    AnalyticsDashboard.deleted_at.is_(None),
                ).all()
            }
            dropped = [
                view_id for view_id in resolved["analytics_view_ids"]
                if view_id not in existing_ids
            ]
            if dropped:
                if len(dropped) == 1:
                    warnings.append("1 analytics view no longer exists and was removed")
                else:
                    warnings.append(f"{len(dropped)} analytics views no longer exist and were removed")
            resolved["analytics_view_ids"] = [
                view_id for view_id in resolved["analytics_view_ids"] if view_id in existing_ids
            ]

        if resolved["program_id"]:
            program_exists = self.db_session.query(Program.id).filter(
                Program.id == resolved["program_id"],
                Program.root_id == root.id,
            ).first()
            if not program_exists:
                warnings.append("Featured program no longer exists and was skipped")
                resolved["program_id"] = None
                resolved["program_start_date"] = None
                resolved["program_end_date"] = None

        return resolved, warnings

    def _build_landing_analytics_views(self, root: Goal, showcase: JsonDict) -> list[JsonDict]:
        query = self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.root_id == root.id,
            AnalyticsDashboard.user_id == root.owner_id,
            AnalyticsDashboard.kind == "view",
            AnalyticsDashboard.deleted_at.is_(None),
        )
        selected_ids = showcase.get("analytics_view_ids") or []
        if selected_ids:
            views = query.filter(AnalyticsDashboard.id.in_(selected_ids)).all()
            by_id = {view.id: view for view in views}
            ordered = [by_id[view_id] for view_id in selected_ids if view_id in by_id]
        else:
            ordered = query.order_by(
                AnalyticsDashboard.updated_at.desc(),
                AnalyticsDashboard.created_at.desc(),
                AnalyticsDashboard.name.asc(),
            ).limit(LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT).all()
        return [
            serialize_analytics_dashboard(view)
            for view in ordered[:LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT]
        ]

    @staticmethod
    def _dashboard_activity_refs(analytics_views: list[JsonDict]) -> tuple[set[str], set[str]]:
        """Collect activity/group refs a saved dashboard needs to render faithfully."""
        activity_ids: set[str] = set()
        group_ids: set[str] = set()

        def add_activity_id(value):
            if value:
                activity_ids.add(str(value))

        def collect_filters(filters):
            if not isinstance(filters, dict):
                return
            activities = filters.get("activities") if isinstance(filters.get("activities"), dict) else {}
            for activity_id in activities.get("activityIds") or []:
                add_activity_id(activity_id)
            for group_id in activities.get("groupIds") or []:
                if group_id:
                    group_ids.add(str(group_id))

        for view in analytics_views:
            layout = view.get("layout") if isinstance(view.get("layout"), dict) else {}
            collect_filters(layout.get("global_filters"))
            window_states = layout.get("window_states") if isinstance(layout.get("window_states"), dict) else {}
            for state in window_states.values():
                if not isinstance(state, dict):
                    continue
                selected_activity = state.get("selectedActivity")
                if isinstance(selected_activity, dict):
                    add_activity_id(selected_activity.get("id"))
                else:
                    add_activity_id(selected_activity)

        return activity_ids, group_ids

    @staticmethod
    def _collect_descendant_activity_group_ids(groups: list[ActivityGroup], selected_ids: set[str]) -> set[str]:
        children_by_parent: dict[str, list[str]] = {}
        for group in groups:
            if not group.parent_id:
                continue
            children_by_parent.setdefault(group.parent_id, []).append(group.id)

        collected = set(selected_ids)
        stack = list(selected_ids)
        while stack:
            group_id = stack.pop()
            for child_id in children_by_parent.get(group_id, []):
                if child_id in collected:
                    continue
                collected.add(child_id)
                stack.append(child_id)
        return collected

    def _build_landing_analytics_activity_instances(
        self,
        root: Goal,
        activity_ids: set[str],
        seed_instances: dict[str, list[JsonDict]] | None = None,
    ) -> dict[str, list[JsonDict]]:
        instances_by_activity: dict[str, list[JsonDict]] = {
            str(activity_id): [deepcopy(instance) for instance in instances or []]
            for activity_id, instances in (seed_instances or {}).items()
        }
        if not activity_ids:
            return instances_by_activity

        existing_instance_ids = {
            instance.get("id")
            for instances in instances_by_activity.values()
            for instance in instances
            if instance.get("id")
        }

        instances = self.db_session.query(ActivityInstance).options(
            selectinload(ActivityInstance.session),
            selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(ActivityInstance.progress_record),
        ).filter(
            ActivityInstance.root_id == root.id,
            ActivityInstance.activity_definition_id.in_(activity_ids),
            ActivityInstance.deleted_at == None,
        ).order_by(
            func.coalesce(ActivityInstance.time_stop, ActivityInstance.updated_at, ActivityInstance.created_at).desc()
        ).limit(LANDING_EXAMPLE_ANALYTICS_LIMIT).all()

        for instance in instances:
            if instance.id in existing_instance_ids:
                continue
            session = instance.session
            if session and session.deleted_at is not None:
                continue
            serialized = serialize_activity_instance_for_analytics(
                instance,
                session_name=session.name if session else None,
                session_date=(session.session_start or session.created_at) if session else None,
            )
            instances_by_activity.setdefault(instance.activity_definition_id, []).append(serialized)
            existing_instance_ids.add(instance.id)

        return instances_by_activity

    def _build_landing_showcase_data(self, root: Goal, showcase: JsonDict | None = None) -> dict:
        owner_id = root.owner_id
        showcase = self._normalize_landing_example_showcase(showcase)
        analytics_views = self._build_landing_analytics_views(root, showcase)
        analytics_activity_ids, analytics_group_ids = self._dashboard_activity_refs(analytics_views)
        session_service = SessionService(self.db_session)
        sessions_result, sessions_error, _ = session_service.get_fractal_sessions(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_SESSIONS_LIMIT,
            offset=0,
            filters={"sort_by": "session_start", "sort_order": "desc"},
        )
        sessions = sessions_result.get("sessions", []) if sessions_result and not sessions_error else []

        featured_session_id = showcase["session_id"]
        if featured_session_id and not any(session.get("id") == featured_session_id for session in sessions):
            featured_result, featured_error, _ = session_service.get_session_details(
                root.id,
                featured_session_id,
                owner_id,
            )
            if featured_result and not featured_error:
                sessions = [featured_result, *sessions]

        analytics_result, analytics_error, _ = session_service.get_session_analytics_summary(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_ANALYTICS_LIMIT,
        )
        analytics_summary = analytics_result if analytics_result and not analytics_error else None

        activity_ids = {
            instance.get("activity_definition_id")
            for session in sessions
            for instance in (session.get("activity_instances") or [])
            if instance.get("activity_definition_id")
        }
        if analytics_summary:
            activity_ids.update((analytics_summary.get("activity_instances") or {}).keys())
        # Explicitly featured activities must always serialize, even when no
        # recent session or analytics row references them.
        activity_ids.update(showcase["activity_ids"])
        activity_ids.update(analytics_activity_ids)

        # The Activities feature opens on a read-only Manage Activities-style
        # catalogue, so publish the bounded fractal catalogue rather than only
        # definitions referenced by recent sessions or analytics. Explicit
        # showcase/analytics references above remain included beyond the cap.
        catalogue_activity_ids = self.db_session.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root.id,
            ActivityDefinition.deleted_at == None,
        ).order_by(ActivityDefinition.name.asc()).limit(LANDING_EXAMPLE_ACTIVITY_CATALOGUE_LIMIT).all()
        activity_ids.update(row[0] for row in catalogue_activity_ids)

        activity_groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root.id,
            ActivityGroup.deleted_at == None,
        ).order_by(ActivityGroup.sort_order.asc(), ActivityGroup.name.asc()).all()
        analytics_instance_activity_ids = set(analytics_activity_ids)
        if analytics_group_ids:
            scoped_group_ids = self._collect_descendant_activity_group_ids(activity_groups, analytics_group_ids)
            grouped_activity_ids = self.db_session.query(ActivityDefinition.id).filter(
                ActivityDefinition.root_id == root.id,
                ActivityDefinition.group_id.in_(scoped_group_ids),
                ActivityDefinition.deleted_at == None,
            ).all()
            grouped_ids = {row[0] for row in grouped_activity_ids}
            activity_ids.update(grouped_ids)
            analytics_instance_activity_ids.update(grouped_ids)

        activity_definitions = []
        if activity_ids:
            activities = self.db_session.query(ActivityDefinition).options(
                selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
                selectinload(ActivityDefinition.split_definitions),
                selectinload(ActivityDefinition.group),
                selectinload(ActivityDefinition.associated_goals),
            ).filter(
                ActivityDefinition.id.in_(activity_ids),
                ActivityDefinition.root_id == root.id,
                ActivityDefinition.deleted_at == None,
            ).order_by(ActivityDefinition.name.asc()).all()
            activity_definitions = [serialize_activity_definition(activity) for activity in activities]

        activity_instantiation_summary = {}
        if activity_ids:
            summary_rows = self.db_session.query(
                ActivityInstance.activity_definition_id,
                func.count(ActivityInstance.id),
                func.max(func.coalesce(Session.session_start, Session.created_at, ActivityInstance.created_at)),
                func.avg(case(
                    (
                        and_(
                            ActivityInstance.completed.is_(True),
                            ActivityInstance.duration_seconds > 0,
                            ActivityInstance.duration_seconds <= MAX_DURATION_SECONDS,
                        ),
                        ActivityInstance.duration_seconds,
                    ),
                    else_=None,
                )),
            ).join(
                Session,
                Session.id == ActivityInstance.session_id,
            ).filter(
                ActivityInstance.activity_definition_id.in_(activity_ids),
                ActivityInstance.root_id == root.id,
                ActivityInstance.deleted_at == None,
                Session.root_id == root.id,
                Session.deleted_at == None,
            ).group_by(ActivityInstance.activity_definition_id).all()
            activity_instantiation_summary = {
                str(activity_id): {
                    "instance_count": int(instance_count or 0),
                    "last_used_at": format_utc(last_used_at),
                    "average_duration_seconds": (
                        int(round(float(average_duration_seconds)))
                        if average_duration_seconds is not None
                        else None
                    ),
                }
                for activity_id, instance_count, last_used_at, average_duration_seconds in summary_rows
            }

        analytics_activity_instances = self._build_landing_analytics_activity_instances(
            root,
            analytics_instance_activity_ids,
            (analytics_summary or {}).get("activity_instances") if analytics_summary else None,
        )

        templates = self.db_session.query(SessionTemplate).options(
            selectinload(SessionTemplate.goals).selectinload(Goal.level),
        ).filter(
            SessionTemplate.root_id == root.id,
            SessionTemplate.deleted_at == None,
        ).order_by(SessionTemplate.updated_at.desc()).limit(LANDING_EXAMPLE_TEMPLATES_LIMIT).all()

        return {
            "sessions": sessions,
            "activity_definitions": activity_definitions,
            "activity_groups": [serialize_activity_group(group) for group in activity_groups],
            "activity_instantiation_summary": activity_instantiation_summary,
            "analytics_views": analytics_views,
            "analytics_activity_instances": analytics_activity_instances,
            "session_templates": [serialize_session_template(template) for template in templates],
        }

    @contextmanager
    def _landing_publish_lock(self):
        """Serialize the one global landing publication stream.

        Production uses a PostgreSQL transaction advisory lock so ordering is
        preserved across threads and instances. The process lock supplies the
        equivalent invariant for SQLite tests and local development.
        """
        with _landing_publish_process_lock:
            bind = self.db_session.get_bind()
            if bind is not None and bind.dialect.name == "postgresql":
                self.db_session.execute(
                    text("SELECT pg_advisory_xact_lock(:lock_key)"),
                    {"lock_key": LANDING_EXAMPLE_PUBLISH_LOCK_KEY},
                )
            yield

    def publish_landing_examples(
        self, *, examples_override: list[JsonDict] | None = None,
    ) -> ServiceResult[JsonDict]:
        with self._landing_publish_lock():
            return self._publish_landing_examples_locked(examples_override=examples_override)

    def _publish_landing_examples_locked(
        self, *, examples_override: list[JsonDict] | None = None,
    ) -> ServiceResult[JsonDict]:
        publish_started = perf_counter()
        source_examples = examples_override
        if source_examples is None:
            source_examples = self._get_app_setting_value(
                LANDING_EXAMPLE_SETTINGS_KEY, {"examples": []}
            ).get("examples", [])
        examples = self._normalize_landing_example_settings(source_examples)
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        published_examples = []
        showcase_warnings: list[str] = []
        for item in examples:
            example_started = perf_counter()
            goals_by_id = load_fractal_goals_for_serialization(
                self.db_session, item["root_id"], include_group_activities=True,
            )
            root = goals_by_id.get(item["root_id"])
            if not root:
                return None, "Landing example root not found", 404
            effective_levels_by_name = self._load_effective_landing_levels(root.owner_id, root.id)
            serialized_tree = self._serialize_public_goal_tree(root, effective_levels_by_name)
            self._enrich_landing_tree_with_history(
                serialized_tree, root, goals_by_id, effective_levels_by_name,
            )
            flowtree_data = self._build_landing_flowtree_data(root, serialized_tree)
            resolved_showcase, warnings = self._resolve_landing_showcase(root, item.get("showcase"))
            showcase_warnings.extend(f"{item['label']}: {warning}" for warning in warnings)
            resolved_content, content_warnings = self._resolve_landing_goal_content(
                root, item.get("landing_content")
            )
            showcase_warnings.extend(f"{item['label']}: {warning}" for warning in content_warnings)
            item["showcase"] = resolved_showcase
            item["landing_content"] = resolved_content
            showcase_data = self._build_landing_showcase_data(root, resolved_showcase)
            target_analytics = self._build_landing_target_analytics(
                root, serialized_tree, goals_by_id,
            )
            published_examples.append({
                "root_id": root.id,
                "label": item["label"],
                "sort_order": item["sort_order"],
                "root_name": root.name,
                "schema_version": LANDING_EXAMPLE_SCHEMA_VERSION,
                "tree": serialized_tree,
                "evidence_goal_ids": flowtree_data["evidence_goal_ids"],
                "metrics_summary": flowtree_data["metrics_summary"],
                "programs": flowtree_data["programs"],
                "showcase": resolved_showcase,
                "tree_view_settings": item["tree_view_settings"],
                "landing_content": resolved_content,
                "sessions": showcase_data["sessions"],
                "activity_definitions": showcase_data["activity_definitions"],
                "activity_groups": showcase_data["activity_groups"],
                "activity_instantiation_summary": showcase_data["activity_instantiation_summary"],
                "analytics_views": showcase_data["analytics_views"],
                "analytics_activity_instances": showcase_data["analytics_activity_instances"],
                "target_analytics": target_analytics,
                "session_templates": showcase_data["session_templates"],
            })
            logger.info(
                "Landing publish example built root_id=%s goals=%s duration_ms=%s",
                root.id,
                len(goals_by_id),
                round((perf_counter() - example_started) * 1000),
            )

        cache = {
            "published_at": format_utc(utc_now()),
            "revision": str(uuid.uuid4()),
            "schema_version": LANDING_EXAMPLE_SCHEMA_VERSION,
            "examples": published_examples,
        }
        serialized_snapshot = self._serialized_landing_snapshot(cache)
        snapshot_bytes = len(serialized_snapshot.encode("utf-8"))
        compressed_snapshot = gzip.compress(
            serialized_snapshot.encode("utf-8"), compresslevel=9, mtime=0,
        )
        compressed_bytes = len(compressed_snapshot)
        if snapshot_bytes > config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:
            self.db_session.rollback()
            return None, (
                "Landing snapshot is too large to publish "
                f"({snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}; "
                f"{compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413
        if compressed_bytes > config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:
            self.db_session.rollback()
            return None, (
                "Compressed landing snapshot is too large to publish "
                f"({compressed_bytes:,} transfer bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_COMPRESSED_BYTES:,}; "
                f"{snapshot_bytes:,} expanded bytes; "
                f"limit {config.LANDING_EXAMPLES_MAX_UNCOMPRESSED_BYTES:,}). "
                "Choose fewer or smaller example fractals."
            ), 413

        previous_cache = self._get_app_setting_value(
            LANDING_EXAMPLE_CACHE_KEY, {"published_at": None, "examples": []},
        )
        delivery_started = perf_counter()
        static_snapshot = self._write_landing_static_snapshot(
            cache,
            payload=serialized_snapshot,
            compressed_payload=compressed_snapshot,
        )
        if static_snapshot == "failed":
            self.db_session.rollback()
            logger.error(
                "Landing publish delivery failed revision=%s; database snapshot unchanged",
                cache["revision"],
            )
            log_ops_event(
                "landing.publish_failed",
                level="error",
                revision=cache["revision"],
                reason="static_delivery",
            )
            return None, (
                "Static landing snapshot delivery failed; published examples were not changed. "
                "Retry publishing."
            ), 503

        # Reconcile stale references back into the editable draft so an
        # unavailable hidden selection warns once instead of on every publish.
        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": examples})
        self._set_app_setting_value(LANDING_EXAMPLE_CACHE_KEY, cache)
        delivery = {
            "revision": cache["revision"],
            "status": "delivered" if static_snapshot == "ok" else "database_only",
            "published_at": cache["published_at"],
            "snapshot_bytes": snapshot_bytes,
            "compressed_snapshot_bytes": compressed_bytes,
        }
        self._set_app_setting_value(LANDING_EXAMPLE_DELIVERY_KEY, delivery)
        try:
            self.db_session.commit()
        except Exception:
            self.db_session.rollback()
            if static_snapshot == "ok":
                restored = self._restore_landing_static_snapshot(previous_cache)
                if not restored:
                    logger.critical(
                        "Landing publish database commit failed and static rollback failed revision=%s",
                        cache["revision"],
                        exc_info=True,
                    )
                    log_ops_event(
                        "landing.publish_failed",
                        level="error",
                        revision=cache["revision"],
                        reason="database_commit_and_static_rollback",
                    )
            raise
        committed_ms = round((perf_counter() - publish_started) * 1000)
        delivery_ms = round((perf_counter() - delivery_started) * 1000)
        total_ms = round((perf_counter() - publish_started) * 1000)
        logger.info(
            "Landing publish completed examples=%s snapshot_bytes=%s committed_ms=%s "
            "delivery_ms=%s total_ms=%s static_snapshot=%s",
            len(published_examples),
            snapshot_bytes,
            committed_ms,
            delivery_ms,
            total_ms,
            static_snapshot,
        )
        log_ops_event(
            "landing.publish_delivered",
            revision=cache["revision"],
            examples=len(published_examples),
            snapshot_bytes=snapshot_bytes,
            compressed_bytes=compressed_bytes,
            static_snapshot=static_snapshot,
        )
        return {
            "published_at": cache["published_at"],
            "revision": cache["revision"],
            "published_example_count": len(published_examples),
            "examples": examples,
            "showcase_warnings": showcase_warnings,
            "static_snapshot": static_snapshot,
            "publish_duration_ms": total_ms,
            "snapshot_bytes": snapshot_bytes,
            "compressed_snapshot_bytes": compressed_bytes,
        }, None, 200

    @staticmethod
    def _serialized_landing_snapshot(cache: JsonDict) -> str:
        return json.dumps(cache, ensure_ascii=False, separators=(",", ":"))

    @classmethod
    def _write_landing_static_snapshot(
        cls,
        cache: JsonDict,
        *,
        payload: str | None = None,
        compressed_payload: bytes | None = None,
    ) -> str:
        """Materialize the candidate snapshot before its database commit.

        A configured static destination is part of the publication contract:
        failure leaves the prior database/static publication unchanged.
        """
        payload = payload or cls._serialized_landing_snapshot(cache)
        compressed_payload = compressed_payload or gzip.compress(
            payload.encode("utf-8"), compresslevel=9, mtime=0,
        )

        bucket_name = config.LANDING_EXAMPLES_STATIC_GCS_BUCKET
        if bucket_name:
            try:
                bucket = storage.Client().bucket(bucket_name)
                blob = bucket.blob(config.LANDING_EXAMPLES_STATIC_GCS_BLOB or "landing-examples.json")
                # The URL is stable across publishes, so browsers must
                # revalidate it instead of retaining an older selection for a
                # fixed TTL. GCS ETags make unchanged responses inexpensive,
                blob.cache_control = "public, max-age=0, must-revalidate, no-transform"
                # Cloud Storage does not dynamically compress objects. Store
                # the JSON as deterministic gzip so landing hydration transfers
                blob.content_encoding = "gzip"
                blob.upload_from_string(
                    compressed_payload,
                    content_type="application/json",
                    timeout=min(5.0, config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                    retry=Retry(
                        initial=0.25,
                        maximum=1.0,
                        multiplier=2.0,
                        deadline=config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS,
                    ),
                )
                return "ok"
            except Exception:
                logger.warning("Landing static GCS snapshot write failed", exc_info=True)
                return "failed"

        static_path = config.LANDING_EXAMPLES_STATIC_PATH
        if not static_path:
            if config.ENV == "production":
                logger.error(
                    "Landing static snapshot destination is not configured in production"
                )
                return "failed"
            return "skipped"

        temp_name = None
        try:
            destination = Path(static_path)
            destination.parent.mkdir(parents=True, exist_ok=True)
            with tempfile.NamedTemporaryFile(
                "w",
                encoding="utf-8",
                dir=destination.parent,
                prefix=f".{destination.name}.",
                suffix=".tmp",
                delete=False,
            ) as temp_file:
                temp_file.write(payload)
                temp_file.write("\n")
                temp_name = temp_file.name
            os.replace(temp_name, destination)
            return "ok"
        except Exception:
            if temp_name:
                try:
                    os.unlink(temp_name)
                except OSError:
                    pass
            logger.warning("Landing static filesystem snapshot write failed for %s", static_path, exc_info=True)
            return "failed"

    @classmethod
    def _restore_landing_static_snapshot(cls, previous_cache: JsonDict) -> bool:
        """Compensate an external write when the database commit fails."""
        if previous_cache.get("published_at"):
            return cls._write_landing_static_snapshot(previous_cache) == "ok"
        return cls._delete_landing_static_snapshot()

    @staticmethod
    def _delete_landing_static_snapshot() -> bool:
        bucket_name = config.LANDING_EXAMPLES_STATIC_GCS_BUCKET
        if bucket_name:
            try:
                blob = storage.Client().bucket(bucket_name).blob(
                    config.LANDING_EXAMPLES_STATIC_GCS_BLOB or "landing-examples.json"
                )
                blob.delete(
                    timeout=min(5.0, config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                    retry=Retry(deadline=config.LANDING_EXAMPLES_STATIC_UPLOAD_TIMEOUT_SECONDS),
                )
                return True
            except Exception:
                logger.critical("Landing static GCS rollback delete failed", exc_info=True)
                return False

        static_path = config.LANDING_EXAMPLES_STATIC_PATH
        if not static_path:
            return True
        try:
            Path(static_path).unlink(missing_ok=True)
            return True
        except OSError:
            logger.critical(
                "Landing static filesystem rollback delete failed for %s",
                static_path,
                exc_info=True,
            )
            return False
