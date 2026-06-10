import datetime
import hashlib
import logging
import re
import secrets
import string
from copy import deepcopy

from sqlalchemy import delete, func, or_
from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

from models import (
    ActivityDefinition,
    ActivityDurationStats,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    AppSetting,
    EventLog,
    FractalMetricDefinition,
    Goal,
    GoalLevel,
    MetricDefinition,
    MetricValue,
    Note,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDaySession,
    ProgressRecord,
    Session,
    SessionTemplate,
    SessionTemplateStats,
    SignupInviteKey,
    SplitDefinition,
    Target,
    TargetContributionLedger,
    TargetMetricCondition,
    TemplateSectionStats,
    User,
    activity_goal_associations,
    goal_activity_group_associations,
    program_block_goals,
    program_day_goals,
    program_day_templates,
    program_goals,
    session_goals,
    session_template_goals,
    utc_now,
)
from services.quota_service import (
    DEFAULT_STORAGE_LIMIT_BYTES,
    RESOURCE_LABELS,
    RESOURCE_ORDER,
    TIER_DEFAULT_LIMITS_SETTING_KEY,
    QuotaService,
)
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_timeline_service import GoalTimelineService
from services.goal_type_utils import get_canonical_goal_type
from services.note_service import NoteService
from services.programs import ProgramService
from services.serializers import (
    calculate_smart_status,
    format_utc,
    serialize_activity_definition,
    serialize_activity_group,
    serialize_session_template,
)
from services.service_types import JsonDict, ServiceResult
from services.session_service import SessionService

logger = logging.getLogger(__name__)
FORCE_PASSWORD_CHANGE_PREFERENCE = "admin_force_password_change"
LANDING_EXAMPLE_SETTINGS_KEY = "landing_example_settings"
LANDING_EXAMPLE_CACHE_KEY = "landing_example_cache"
# Bump when the published landing snapshot shape changes so the frontend / future
# migrations can detect and handle stale caches.
LANDING_EXAMPLE_SCHEMA_VERSION = 4
# Bound the per-goal timeline/notes we embed so the public cache stays small.
LANDING_EXAMPLE_TIMELINE_LIMIT = 50
LANDING_EXAMPLE_NOTES_LIMIT = 30
LANDING_EXAMPLE_SESSIONS_LIMIT = 4
LANDING_EXAMPLE_TEMPLATES_LIMIT = 4
LANDING_EXAMPLE_ANALYTICS_LIMIT = 24


def hash_invite_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_secret(prefix: str = "fg") -> str:
    token = secrets.token_urlsafe(24).replace("-", "").replace("_", "")
    return f"{prefix}_{token}"


def generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for _ in range(length - 2))
    return f"A1{password}"


class AdminService:
    def __init__(self, db_session):
        self.db_session = db_session
        self.quota_service = QuotaService(db_session)

    @staticmethod
    def is_admin(user: User) -> bool:
        return bool(getattr(user, "is_admin", False))

    def require_admin(self, current_user: User):
        if not self.is_admin(current_user):
            return "Admin access required", 403
        return None, 200

    def serialize_invite_key(self, invite: SignupInviteKey) -> JsonDict:
        return {
            "id": invite.id,
            "label": invite.label,
            "created_by_user_id": invite.created_by_user_id,
            "used_by_user_id": invite.used_by_user_id,
            "created_at": format_utc(invite.created_at),
            "expires_at": format_utc(invite.expires_at),
            "used_at": format_utc(invite.used_at),
            "revoked_at": format_utc(invite.revoked_at),
            "status": self.invite_status(invite),
        }

    @staticmethod
    def invite_status(invite: SignupInviteKey) -> str:
        now = utc_now()
        if invite.revoked_at:
            return "revoked"
        if invite.used_at:
            return "used"
        if invite.expires_at and invite.expires_at < now:
            return "expired"
        return "available"

    def validate_invite_key(self, raw_key: str) -> ServiceResult[SignupInviteKey]:
        invite = self.db_session.query(SignupInviteKey).filter_by(key_hash=hash_invite_key(raw_key)).first()
        if not invite:
            return None, "Invalid invite key", 400
        if self.invite_status(invite) != "available":
            return None, "Invite key is no longer available", 400
        return invite, None, 200

    def consume_invite_key(self, invite: SignupInviteKey, user_id: str):
        invite.used_by_user_id = user_id
        invite.used_at = utc_now()

    def create_invite_key(self, current_user: User, data: JsonDict) -> ServiceResult[JsonDict]:
        raw_key = generate_secret("fg_invite")
        expires_at = None
        if data.get("expires_at"):
            try:
                expires_at = datetime.datetime.fromisoformat(data["expires_at"].replace("Z", "+00:00"))
                if expires_at.tzinfo is not None:
                    expires_at = expires_at.astimezone(datetime.timezone.utc).replace(tzinfo=None)
            except ValueError:
                return None, "Invalid expires_at", 400

        invite = SignupInviteKey(
            key_hash=hash_invite_key(raw_key),
            label=data.get("label"),
            created_by_user_id=current_user.id,
            expires_at=expires_at,
        )
        self.db_session.add(invite)
        self.db_session.commit()
        self.db_session.refresh(invite)
        payload = self.serialize_invite_key(invite)
        payload["key"] = raw_key
        return payload, None, 201

    def list_invite_keys(self) -> ServiceResult[list[JsonDict]]:
        invites = self.db_session.query(SignupInviteKey).order_by(SignupInviteKey.created_at.desc()).all()
        return [self.serialize_invite_key(invite) for invite in invites], None, 200

    def revoke_invite_key(self, invite_id: str) -> ServiceResult[JsonDict]:
        invite = self.db_session.get(SignupInviteKey, invite_id)
        if not invite:
            return None, "Invite key not found", 404
        if invite.used_at:
            return None, "Used invite keys cannot be revoked", 400
        invite.revoked_at = utc_now()
        self.db_session.commit()
        return self.serialize_invite_key(invite), None, 200

    def create_user(self, data: JsonDict) -> ServiceResult[JsonDict]:
        existing = self.db_session.query(User).filter(
            (User.username == data["username"]) | (User.email == data["email"])
        ).first()
        if existing:
            return None, "Username or email already exists", 400

        raw_password = data.get("password") or generate_password()
        membership_tier = data.get("membership_tier") or "free"
        user = User(
            username=data["username"],
            email=data["email"],
            role=data.get("role") or "user",
            membership_tier=membership_tier,
            storage_limit_bytes=data.get(
                "storage_limit_bytes",
                self.quota_service.get_tier_storage_limit_bytes(membership_tier) or DEFAULT_STORAGE_LIMIT_BYTES,
            ),
        )
        user.set_password(raw_password)
        self.db_session.add(user)
        self.db_session.commit()
        self.db_session.refresh(user)
        payload = self.serialize_admin_user(user)
        payload["temporary_password"] = raw_password
        return payload, None, 201

    def update_user(self, user_id: str, data: JsonDict) -> ServiceResult[JsonDict]:
        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404
        for field in ("role", "is_active", "membership_tier", "quota_overrides", "storage_limit_bytes"):
            if field in data:
                setattr(user, field, data[field])
        self.db_session.commit()
        self.db_session.refresh(user)
        return self.serialize_admin_user(user), None, 200

    def update_role(self, user_id: str, current_user: User, role: str) -> ServiceResult[JsonDict]:
        if user_id == current_user.id and role != "admin":
            return None, "Admins cannot remove their own admin role from the admin console", 400
        return self.update_user(user_id, {"role": role})

    def update_tier(self, user_id: str, membership_tier: str) -> ServiceResult[JsonDict]:
        return self.update_user(user_id, {"membership_tier": membership_tier})

    def update_quota(self, user_id: str, data: JsonDict) -> ServiceResult[JsonDict]:
        updates = {}
        if "quota_overrides" in data:
            updates["quota_overrides"] = data["quota_overrides"] or {}
        if "storage_limit_bytes" in data:
            updates["storage_limit_bytes"] = data["storage_limit_bytes"]
        return self.update_user(user_id, updates)

    def get_tier_quota_settings(self) -> ServiceResult[JsonDict]:
        return {
            "tier_default_limits": self.quota_service.get_tier_default_limits(),
            "tier_storage_limit_bytes": self.quota_service.get_tier_storage_limits(),
            "resources": RESOURCE_ORDER,
            "labels": RESOURCE_LABELS,
            "editable_tiers": ["free", "paid"],
            "unlimited_tiers": ["legacy"],
        }, None, 200

    def update_tier_quota_settings(self, data: JsonDict) -> ServiceResult[JsonDict]:
        tier = self.quota_service.normalize_tier(data.get("tier"))
        if tier == "legacy":
            return None, "Legacy tier remains unlimited and cannot be assigned finite default quotas", 400

        try:
            normalized_limits = self.quota_service.validate_finite_limits(data.get("limits") or {})
        except ValueError as exc:
            return None, str(exc), 400
        storage_limit_bytes = data.get("storage_limit_bytes")
        if not isinstance(storage_limit_bytes, int) or storage_limit_bytes < 0:
            return None, "Storage limit bytes must be a non-negative integer", 400

        apply_existing_users = bool(data.get("apply_existing_users", False))
        current_defaults = self.quota_service.get_tier_default_limits()
        current_storage_defaults = self.quota_service.get_tier_storage_limits()
        target_users = self.db_session.query(User).filter(User.membership_tier == tier).all()

        if not apply_existing_users:
            for user in target_users:
                current_limits = self.quota_service.get_effective_limits(user)
                user.quota_overrides = deepcopy(current_limits or {})
                flag_modified(user, "quota_overrides")

        setting = self.db_session.get(AppSetting, TIER_DEFAULT_LIMITS_SETTING_KEY)
        configured_defaults = deepcopy(current_defaults)
        configured_defaults[tier] = normalized_limits
        configured_defaults["legacy"] = None
        configured_defaults["storage_limit_bytes"] = deepcopy(current_storage_defaults)
        configured_defaults["storage_limit_bytes"][tier] = storage_limit_bytes
        configured_defaults["storage_limit_bytes"]["legacy"] = None

        if setting is None:
            setting = AppSetting(key=TIER_DEFAULT_LIMITS_SETTING_KEY, value=configured_defaults)
            self.db_session.add(setting)
        else:
            setting.value = configured_defaults
            flag_modified(setting, "value")

        if apply_existing_users:
            for user in target_users:
                user.quota_overrides = {}
                user.storage_limit_bytes = storage_limit_bytes
                flag_modified(user, "quota_overrides")

        self.db_session.commit()
        return {
            "tier": tier,
            "tier_default_limits": self.quota_service.get_tier_default_limits(),
            "tier_storage_limit_bytes": self.quota_service.get_tier_storage_limits(),
            "apply_existing_users": apply_existing_users,
            "affected_user_count": len(target_users),
        }, None, 200

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

    def _normalize_landing_example_settings(self, examples: list[JsonDict]) -> list[JsonDict]:
        normalized = []
        for index, item in enumerate(examples or []):
            normalized.append({
                "root_id": item["root_id"],
                "label": item["label"],
                "sort_order": int(item.get("sort_order", index)),
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
        return {
            "eligible_fractals": [self._serialize_landing_eligible_fractal(root) for root in eligible_roots],
            "examples": draft_examples,
            "published_at": cache.get("published_at"),
            "published_example_count": len(cache.get("examples") or []),
        }, None, 200

    def update_landing_example_settings(self, data: JsonDict) -> ServiceResult[JsonDict]:
        examples = self._normalize_landing_example_settings(data.get("examples", []))
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        self._set_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": examples})
        self.db_session.commit()
        return self.get_landing_example_settings()

    def _serialize_public_target(self, target: Target) -> JsonDict:
        metrics = []
        for condition in getattr(target, "metric_conditions", []) or []:
            metrics.append({
                "operator": condition.operator,
                "value": condition.target_value,
                "target_value": condition.target_value,
            })
        return {
            "id": target.id,
            "name": target.name,
            "type": target.type or "threshold",
            "metrics": metrics,
            "time_scope": target.time_scope or "all_time",
            "start_date": format_utc(target.start_date),
            "end_date": format_utc(target.end_date),
            "frequency_days": target.frequency_days,
            "frequency_count": target.frequency_count,
            "completed": bool(target.completed),
            "completed_at": format_utc(target.completed_at),
        }

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
            serialize_activity_definition(activity)
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
            "frozen": bool(getattr(goal, "frozen", False)),
            "frozen_at": format_utc(getattr(goal, "frozen_at", None)),
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": bool(getattr(goal, "frozen", False)),
            "paused_at": format_utc(getattr(goal, "frozen_at", None)),
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
            "frozen": attributes["frozen"],
            "frozen_at": attributes["frozen_at"],
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

    def _enrich_landing_tree_with_history(self, serialized_root: JsonDict, root: Goal) -> None:
        """Embed bounded per-goal timeline + notes into the serialized snapshot tree.

        Publishing is a rare manual admin action and example fractals are small, so
        per-goal service calls are acceptable. This keeps the public read model
        self-contained: the landing modal renders Timeline / Notes tabs entirely
        from this cache, with no authenticated API calls.
        """
        timeline_service = GoalTimelineService(self.db_session)
        note_service = NoteService(self.db_session)
        owner_id = root.owner_id

        def visit(node: JsonDict) -> None:
            attributes = node.get("attributes") or {}
            goal_id = attributes.get("id") or node.get("id")
            if goal_id:
                timeline_result, timeline_error, _ = timeline_service.get_goal_timeline(
                    root.id,
                    goal_id,
                    owner_id,
                    include_children=False,
                    limit=LANDING_EXAMPLE_TIMELINE_LIMIT,
                )
                attributes["timeline_events"] = (
                    timeline_result.get("entries", []) if timeline_result and not timeline_error else []
                )

                notes_result, notes_error, _ = note_service.get_goal_notes(
                    root.id,
                    goal_id,
                    owner_id,
                    include_descendants=False,
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

    @staticmethod
    def _build_landing_analytics_charts(summary: JsonDict | None) -> list[JsonDict]:
        """Convert the private analytics summary into static Chart.js payloads."""
        if not isinstance(summary, dict):
            return []

        sessions = list(reversed(summary.get("sessions") or []))[-12:]
        charts: list[JsonDict] = []
        if sessions:
            charts.append({
                "id": "session-duration-trend",
                "title": "Session Duration Trend",
                "type": "bar",
                "data": {
                    "labels": [session.get("name") or "Session" for session in sessions],
                    "datasets": [{
                        "label": "Minutes",
                        "data": [
                            round((session.get("total_duration_seconds") or 0) / 60, 1)
                            for session in sessions
                        ],
                        "backgroundColor": "#3A86FF",
                        "borderColor": "#3A86FF",
                    }],
                },
                "options": {
                    "plugins": {"legend": {"display": False}},
                    "scales": {"y": {"beginAtZero": True}},
                },
            })

        activity_instances = summary.get("activity_instances") or {}
        activity_totals = []
        for activity_id, instances in activity_instances.items():
            if not isinstance(instances, list):
                continue
            total_seconds = sum(instance.get("duration_seconds") or 0 for instance in instances)
            label = next(
                (instance.get("definition_name") or instance.get("name") for instance in instances if isinstance(instance, dict)),
                activity_id,
            )
            activity_totals.append({
                "label": label or activity_id,
                "minutes": round(total_seconds / 60, 1),
            })
        activity_totals = sorted(activity_totals, key=lambda item: item["minutes"], reverse=True)[:8]
        if activity_totals:
            charts.append({
                "id": "activity-time-totals",
                "title": "Activity Time Totals",
                "type": "bar",
                "data": {
                    "labels": [item["label"] for item in activity_totals],
                    "datasets": [{
                        "label": "Minutes",
                        "data": [item["minutes"] for item in activity_totals],
                        "backgroundColor": "#06A77D",
                        "borderColor": "#06A77D",
                    }],
                },
                "options": {
                    "indexAxis": "y",
                    "plugins": {"legend": {"display": False}},
                    "scales": {"x": {"beginAtZero": True}},
                },
            })

        return charts

    def _build_landing_showcase_data(self, root: Goal) -> dict:
        owner_id = root.owner_id
        session_service = SessionService(self.db_session)
        sessions_result, sessions_error, _ = session_service.get_fractal_sessions(
            root.id,
            owner_id,
            limit=LANDING_EXAMPLE_SESSIONS_LIMIT,
            offset=0,
            filters={"sort_by": "session_start", "sort_order": "desc"},
        )
        sessions = sessions_result.get("sessions", []) if sessions_result and not sessions_error else []

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
            ).all()
            activity_definitions = [serialize_activity_definition(activity) for activity in activities]

        activity_groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root.id,
            ActivityGroup.deleted_at == None,
        ).order_by(ActivityGroup.sort_order.asc(), ActivityGroup.name.asc()).all()

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
            "analytics_charts": self._build_landing_analytics_charts(analytics_summary),
            "session_templates": [serialize_session_template(template) for template in templates],
        }

    def publish_landing_examples(self) -> ServiceResult[JsonDict]:
        examples = self._normalize_landing_example_settings(
            self._get_app_setting_value(LANDING_EXAMPLE_SETTINGS_KEY, {"examples": []}).get("examples", [])
        )
        _, error, status = self._validate_landing_example_roots(examples)
        if error:
            return None, error, status

        published_examples = []
        for item in examples:
            goals_by_id = load_fractal_goals_for_serialization(self.db_session, item["root_id"])
            root = goals_by_id.get(item["root_id"])
            if not root:
                return None, "Landing example root not found", 404
            effective_levels_by_name = self._load_effective_landing_levels(root.owner_id, root.id)
            serialized_tree = self._serialize_public_goal_tree(root, effective_levels_by_name)
            self._enrich_landing_tree_with_history(serialized_tree, root)
            flowtree_data = self._build_landing_flowtree_data(root, serialized_tree)
            showcase_data = self._build_landing_showcase_data(root)
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
                "sessions": showcase_data["sessions"],
                "activity_definitions": showcase_data["activity_definitions"],
                "activity_groups": showcase_data["activity_groups"],
                "analytics_charts": showcase_data["analytics_charts"],
                "session_templates": showcase_data["session_templates"],
            })

        cache = {
            "published_at": format_utc(utc_now()),
            "schema_version": LANDING_EXAMPLE_SCHEMA_VERSION,
            "examples": published_examples,
        }
        self._set_app_setting_value(LANDING_EXAMPLE_CACHE_KEY, cache)
        self.db_session.commit()
        return {
            "published_at": cache["published_at"],
            "published_example_count": len(published_examples),
            "examples": examples,
        }, None, 200

    def update_status(self, user_id: str, is_active: bool) -> ServiceResult[JsonDict]:
        return self.update_user(user_id, {"is_active": is_active})

    def unlock_user(self, user_id: str) -> ServiceResult[JsonDict]:
        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404
        user.failed_login_count = 0
        user.locked_until = None
        self.db_session.commit()
        self.db_session.refresh(user)
        return self.serialize_admin_user(user), None, 200

    def set_force_password_change(self, user_id: str, enabled: bool = True) -> ServiceResult[JsonDict]:
        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404
        preferences = dict(user.preferences or {})
        preferences[FORCE_PASSWORD_CHANGE_PREFERENCE] = bool(enabled)
        user.preferences = preferences
        flag_modified(user, "preferences")
        self.db_session.commit()
        self.db_session.refresh(user)
        return self.serialize_admin_user(user), None, 200

    def generate_temporary_password(self, user_id: str) -> ServiceResult[JsonDict]:
        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404
        raw_password = generate_password()
        user.set_password(raw_password)
        user.failed_login_count = 0
        user.locked_until = None
        preferences = dict(user.preferences or {})
        preferences[FORCE_PASSWORD_CHANGE_PREFERENCE] = True
        user.preferences = preferences
        flag_modified(user, "preferences")
        self.db_session.commit()
        self.db_session.refresh(user)
        payload = self.serialize_admin_user(user)
        payload["temporary_password"] = raw_password
        return payload, None, 200

    def soft_delete_user(self, user_id: str, current_user: User) -> ServiceResult[JsonDict]:
        if user_id == current_user.id:
            return None, "Admins cannot delete their own account from the admin console", 400

        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404

        user.username = f"deleted_{user.id}_{generate_secret('user')[:12]}"
        user.email = f"deleted_{user.id}@fractalgoals.com"
        user.is_active = False
        user.role = "user"
        user.set_password(generate_secret("disabled"))
        user.failed_login_count = 0
        user.locked_until = None
        self.db_session.commit()
        return {"message": "User soft deleted", "user_id": user_id}, None, 200

    def delete_user(self, user_id: str, current_user: User) -> ServiceResult[JsonDict]:
        return self.soft_delete_user(user_id, current_user)

    def hard_delete_user(self, user_id: str, current_user: User) -> ServiceResult[JsonDict]:
        if user_id == current_user.id:
            return None, "Admins cannot hard delete their own account from the admin console", 400

        user = self.db_session.get(User, user_id)
        if not user:
            return None, "User not found", 404

        root_ids = [
            row[0] for row in self.db_session.query(Goal.id).filter(
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
            ).all()
        ]

        if root_ids:
            self._hard_delete_roots(root_ids)

        self.db_session.execute(delete(GoalLevel).where(GoalLevel.owner_id == user_id))
        self.db_session.delete(user)
        self.db_session.commit()
        return {"message": "User hard deleted", "user_id": user_id, "deleted_root_count": len(root_ids)}, None, 200

    def _delete_for_roots(self, model, root_ids: list[str]):
        self.db_session.execute(delete(model).where(model.root_id.in_(root_ids)))

    def _hard_delete_roots(self, root_ids: list[str]):
        goal_ids = [
            row[0] for row in self.db_session.query(Goal.id).filter(
                or_(Goal.id.in_(root_ids), Goal.root_id.in_(root_ids))
            ).all()
        ]

        if goal_ids:
            for table, column_name in (
                (session_goals, "goal_id"),
                (activity_goal_associations, "goal_id"),
                (goal_activity_group_associations, "goal_id"),
                (session_template_goals, "goal_id"),
                (program_day_goals, "goal_id"),
                (program_goals, "goal_id"),
                (program_block_goals, "goal_id"),
            ):
                self.db_session.execute(delete(table).where(getattr(table.c, column_name).in_(goal_ids)))

        self._delete_for_roots(Note, root_ids)
        self._delete_for_roots(EventLog, root_ids)
        self._delete_for_roots(AnalyticsDashboard, root_ids)

        target_ids = [
            row[0] for row in self.db_session.query(Target.id).filter(Target.root_id.in_(root_ids)).all()
        ]
        if target_ids:
            self.db_session.execute(delete(TargetContributionLedger).where(TargetContributionLedger.target_id.in_(target_ids)))
            self.db_session.execute(delete(TargetMetricCondition).where(TargetMetricCondition.target_id.in_(target_ids)))
        self._delete_for_roots(Target, root_ids)

        self._delete_for_roots(ProgressRecord, root_ids)
        metric_ids = [
            row[0] for row in self.db_session.query(MetricDefinition.id).filter(
                MetricDefinition.root_id.in_(root_ids)
            ).all()
        ]
        if metric_ids:
            self.db_session.execute(delete(MetricValue).where(MetricValue.metric_definition_id.in_(metric_ids)))
        self._delete_for_roots(ActivityInstance, root_ids)

        self._delete_for_roots(SessionTemplateStats, root_ids)
        self._delete_for_roots(TemplateSectionStats, root_ids)
        self._delete_for_roots(ActivityDurationStats, root_ids)
        self._delete_for_roots(Session, root_ids)

        template_ids = [
            row[0] for row in self.db_session.query(SessionTemplate.id).filter(
                SessionTemplate.root_id.in_(root_ids)
            ).all()
        ]
        if template_ids:
            self.db_session.execute(delete(program_day_templates).where(
                program_day_templates.c.session_template_id.in_(template_ids)
            ))
        self._delete_for_roots(SessionTemplate, root_ids)

        program_ids = [
            row[0] for row in self.db_session.query(Program.id).filter(Program.root_id.in_(root_ids)).all()
        ]
        if program_ids:
            block_ids = [
                row[0] for row in self.db_session.query(ProgramBlock.id).filter(
                    ProgramBlock.program_id.in_(program_ids)
                ).all()
            ]
            if block_ids:
                day_ids = [
                    row[0] for row in self.db_session.query(ProgramDay.id).filter(
                        ProgramDay.block_id.in_(block_ids)
                    ).all()
                ]
                if day_ids:
                    self.db_session.execute(delete(ProgramDaySession).where(ProgramDaySession.program_day_id.in_(day_ids)))
                    self.db_session.execute(delete(program_day_templates).where(program_day_templates.c.program_day_id.in_(day_ids)))
                    self.db_session.execute(delete(ProgramDay).where(ProgramDay.id.in_(day_ids)))
                self.db_session.execute(delete(ProgramBlock).where(ProgramBlock.id.in_(block_ids)))
            self.db_session.execute(delete(Program).where(Program.id.in_(program_ids)))

        self._delete_for_roots(MetricDefinition, root_ids)
        self._delete_for_roots(SplitDefinition, root_ids)
        self._delete_for_roots(FractalMetricDefinition, root_ids)
        self._delete_for_roots(ActivityDefinition, root_ids)
        self._delete_for_roots(ActivityGroup, root_ids)

        if goal_ids:
            self.db_session.execute(delete(Goal).where(Goal.id.in_(goal_ids)))

    def serialize_fractal_summary(self, root: Goal) -> JsonDict:
        session_count = int(self.db_session.query(func.count(Session.id)).filter(
            Session.root_id == root.id,
            Session.deleted_at.is_(None),
        ).scalar() or 0)
        goal_count = int(self.db_session.query(func.count(Goal.id)).filter(
            or_(Goal.id == root.id, Goal.root_id == root.id),
            Goal.deleted_at.is_(None),
        ).scalar() or 0)
        return {
            "id": root.id,
            "name": root.name,
            "type": getattr(root, "type", None) or getattr(root.level, "name", None) or "Fractal",
            "created_at": format_utc(root.created_at),
            "completed": bool(root.completed),
            "session_count": session_count,
            "goal_count": goal_count,
        }

    def serialize_admin_user(self, user: User) -> JsonDict:
        usage_payload, _, _ = self.quota_service.get_account_usage(user.id)
        roots = self.db_session.query(Goal).filter(
            Goal.owner_id == user.id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
        ).order_by(Goal.created_at.desc()).all()
        return {
            "id": user.id,
            "username": user.username,
            "email": user.email,
            "role": getattr(user, "role", "user") or "user",
            "is_admin": bool(getattr(user, "is_admin", False)),
            "is_active": bool(user.is_active),
            "membership_tier": getattr(user, "membership_tier", "free") or "free",
            "quota_overrides": user.quota_overrides or {},
            "storage_limit_bytes": getattr(user, "storage_limit_bytes", DEFAULT_STORAGE_LIMIT_BYTES),
            "tier_storage_limit_bytes": self.quota_service.get_tier_storage_limits(),
            "created_at": format_utc(user.created_at),
            "last_login_at": format_utc(user.last_login_at),
            "failed_login_count": getattr(user, "failed_login_count", 0) or 0,
            "locked_until": format_utc(user.locked_until),
            "force_password_change": bool((user.preferences or {}).get(FORCE_PASSWORD_CHANGE_PREFERENCE)),
            "usage": usage_payload["usage"],
            "limits": usage_payload["limits"],
            "tier_default_limits": self.quota_service.get_tier_default_limits(),
            "storage": usage_payload["storage"],
            "resources": usage_payload["resources"],
            "labels": usage_payload["labels"],
            "fractals": [self.serialize_fractal_summary(root) for root in roots],
        }

    def list_users(self, search: str = "", limit: int = 50, offset: int = 0) -> ServiceResult[JsonDict]:
        query = self.db_session.query(User)
        if search:
            term = f"%{search}%"
            query = query.filter((User.username.ilike(term)) | (User.email.ilike(term)))
        total = int(query.with_entities(func.count(User.id)).scalar() or 0)
        users = query.order_by(User.created_at.desc()).limit(limit).offset(offset).all()
        return {
            "users": [self.serialize_admin_user(user) for user in users],
            "total": total,
            "limit": limit,
            "offset": offset,
        }, None, 200

    def summary(self) -> ServiceResult[JsonDict]:
        total_users = int(self.db_session.query(func.count(User.id)).scalar() or 0)
        active_users = int(self.db_session.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0)
        total_fractals = int(self.db_session.query(func.count(Goal.id)).filter(
            Goal.parent_id.is_(None), Goal.deleted_at.is_(None)
        ).scalar() or 0)
        total_sessions = int(self.db_session.query(func.count(Session.id)).filter(Session.deleted_at.is_(None)).scalar() or 0)
        total_storage = sum(
            self.quota_service.get_storage_usage_bytes(user.id)
            for user in self.db_session.query(User).all()
        )
        invite_counts = {
            "available": 0,
            "used": 0,
            "revoked": 0,
            "expired": 0,
        }
        for invite in self.db_session.query(SignupInviteKey).all():
            invite_counts[self.invite_status(invite)] += 1
        recent_users = self.db_session.query(User).order_by(User.created_at.desc()).limit(5).all()
        recent_logins = self.db_session.query(User).filter(User.last_login_at.isnot(None)).order_by(User.last_login_at.desc()).limit(5).all()
        return {
            "total_users": total_users,
            "active_users": active_users,
            "total_fractals": total_fractals,
            "total_sessions": total_sessions,
            "storage_bytes": total_storage,
            "invite_keys": invite_counts,
            "recent_signups": [self.serialize_admin_user(user) for user in recent_users],
            "recent_logins": [self.serialize_admin_user(user) for user in recent_logins],
        }, None, 200
