"""Mixin for LandingPublishService: landing example settings, eligibility, and admin picker options.
"""

import logging
import re
from copy import deepcopy
from sqlalchemy import or_
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified
from models import (
    ActivityDefinition,
    ActivityGroup,
    AnalyticsDashboard,
    AppSetting,
    Goal,
    GoalLevel,
    User,
)
from services.goal_loading import load_fractal_goals_for_serialization
from services.programs import ProgramService
from services.serializers import format_utc, serialize_activity_group
from services.service_types import JsonDict, ServiceResult
from services.session_service import SessionService
from services._landing_common import (
    LANDING_EXAMPLE_CACHE_KEY,
    LANDING_EXAMPLE_DELIVERY_KEY,
    LANDING_EXAMPLE_OPTIONS_ACTIVITIES_LIMIT,
    LANDING_EXAMPLE_OPTIONS_SESSIONS_LIMIT,
    LANDING_EXAMPLE_SETTINGS_KEY,
    LANDING_EXAMPLE_SHOWCASE_ACTIVITY_LIMIT,
    LANDING_EXAMPLE_SHOWCASE_ANALYTICS_VIEW_LIMIT,
    LANDING_EXAMPLE_SHOWCASE_KEYS,
    LANDING_GOAL_BULLET_DEFAULTS,
    LANDING_TREE_VIEW_SETTING_KEYS,
)

logger = logging.getLogger(__name__)


class _LandingSettingsMixin:
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
            logger.warning(
                "Landing options could not load programs for root_id=%s",
                root.id,
                exc_info=True,
            )
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
