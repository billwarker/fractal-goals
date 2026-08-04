from __future__ import annotations

from copy import deepcopy
import json
from typing import Optional, Sequence

from sqlalchemy import Text, cast, func, literal, or_, select

from account_tiers import (
    DEFAULT_ACCOUNT_TIER,
    FINITE_QUOTA_TIERS,
    TIER_FREE,
    TIER_LEGACY,
    TIER_PAID,
)
import models
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    CircuitDefinition,
    CircuitSlot,
    AnalyticsDashboard,
    AppSetting,
    FractalMetricDefinition,
    Goal,
    MetricDefinition,
    Note,
    Program,
    ProgramBlock,
    ProgramDay,
    Session,
    SessionTemplate,
    Target,
    User,
)
from services.ops_log import log_ops_event
from services.service_types import JsonDict, ServiceResult


FREE_LIMITS = {
    "fractals": 1,
    "goals": 50,
    "sessions": 200,
    "activity_instances": 500,
    "activities": 50,
    "circuits": 10,
    "metrics": 20,
    "session_templates": 10,
    "notes": 1000,
    "programs": 5,
}

PAID_LIMITS = {
    "fractals": 10,
    "goals": 1000,
    "sessions": 5000,
    "activity_instances": 20000,
    "activities": 500,
    "circuits": 250,
    "metrics": 250,
    "session_templates": 250,
    "notes": 10000,
    "programs": 50,
}

RESOURCE_LABELS = {
    "fractals": "fractals",
    "goals": "goals",
    "sessions": "sessions",
    "activity_instances": "activity instances",
    "activities": "activities",
    "circuits": "circuits",
    "metrics": "metrics",
    "session_templates": "session templates",
    "notes": "notes",
    "programs": "programs",
}

RESOURCE_ORDER = [
    "fractals",
    "goals",
    "sessions",
    "activity_instances",
    "activities",
    "circuits",
    "metrics",
    "session_templates",
    "notes",
    "programs",
]

DEFAULT_STORAGE_LIMIT_BYTES = 104857600
TIER_DEFAULT_LIMITS_SETTING_KEY = "tier_default_limits"


class QuotaService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_user(self, user_id: str) -> Optional[User]:
        return self.db_session.get(User, user_id)

    @staticmethod
    def normalize_tier(tier: Optional[str]) -> str:
        tier = (tier or DEFAULT_ACCOUNT_TIER).strip().lower()
        return tier if tier in {TIER_FREE, TIER_PAID, TIER_LEGACY} else DEFAULT_ACCOUNT_TIER

    @staticmethod
    def get_builtin_tier_default_limits() -> JsonDict:
        return {
            TIER_FREE: deepcopy(FREE_LIMITS),
            TIER_PAID: deepcopy(PAID_LIMITS),
            TIER_LEGACY: None,
        }

    @staticmethod
    def get_builtin_tier_storage_limits() -> JsonDict:
        return {
            TIER_FREE: DEFAULT_STORAGE_LIMIT_BYTES,
            TIER_PAID: DEFAULT_STORAGE_LIMIT_BYTES,
            TIER_LEGACY: None,
        }

    @staticmethod
    def validate_finite_limits(limits: JsonDict) -> JsonDict:
        if not isinstance(limits, dict):
            raise ValueError("Quota limits must be an object")
        expected = set(RESOURCE_ORDER)
        supplied = set(limits.keys())
        missing = expected - supplied
        unknown = supplied - expected
        if missing:
            raise ValueError(f"Missing quota resources: {', '.join(sorted(missing))}")
        if unknown:
            raise ValueError(f"Unknown quota resources: {', '.join(sorted(unknown))}")
        normalized = {}
        for resource in RESOURCE_ORDER:
            value = limits[resource]
            if not isinstance(value, int) or value < 0:
                raise ValueError(f"{resource} quota must be a non-negative integer")
            normalized[resource] = value
        return normalized

    def get_tier_default_limits(self) -> JsonDict:
        defaults = self.get_builtin_tier_default_limits()
        setting = self.db_session.get(AppSetting, TIER_DEFAULT_LIMITS_SETTING_KEY)
        configured = models._safe_load_json(getattr(setting, "value", None), {})
        if not isinstance(configured, dict):
            return defaults

        for tier in FINITE_QUOTA_TIERS:
            tier_limits = configured.get(tier)
            if tier_limits is None:
                continue
            try:
                # New resource types inherit their built-in limit in settings
                # written before that resource existed; existing custom values
                # remain intact instead of resetting the whole tier.
                merged_limits = deepcopy(defaults[tier])
                if isinstance(tier_limits, dict):
                    merged_limits.update(tier_limits)
                defaults[tier] = self.validate_finite_limits(merged_limits)
            except ValueError:
                continue
        return defaults

    def get_tier_storage_limits(self) -> JsonDict:
        defaults = self.get_builtin_tier_storage_limits()
        setting = self.db_session.get(AppSetting, TIER_DEFAULT_LIMITS_SETTING_KEY)
        configured = models._safe_load_json(getattr(setting, "value", None), {})
        if not isinstance(configured, dict):
            return defaults

        configured_storage = configured.get("storage_limit_bytes")
        if not isinstance(configured_storage, dict):
            return defaults

        for tier in FINITE_QUOTA_TIERS:
            value = configured_storage.get(tier)
            if isinstance(value, int) and value >= 0:
                defaults[tier] = value
        return defaults

    def get_tier_storage_limit_bytes(self, tier: Optional[str]) -> Optional[int]:
        normalized_tier = self.normalize_tier(tier)
        return self.get_tier_storage_limits().get(normalized_tier)

    def get_effective_limits(self, user: User) -> Optional[JsonDict]:
        tier = self.normalize_tier(getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER))
        default_limits = self.get_tier_default_limits().get(tier)
        if default_limits is None:
            return None

        limits = deepcopy(default_limits)
        overrides = models._safe_load_json(getattr(user, "quota_overrides", None), {})
        if isinstance(overrides, dict):
            for resource, value in overrides.items():
                if resource in limits and isinstance(value, int) and value >= 0:
                    limits[resource] = value
        return limits

    @staticmethod
    def _payload_size(*values) -> int:
        """Return the canonical logical UTF-8 byte size used by storage quotas.

        JSON is compact and key-sorted for stable application-side estimates.
        ``ensure_ascii=False`` keeps Unicode estimates aligned with stored
        UTF-8 JSONB instead of charging non-ASCII text as six-byte
        ``\\uXXXX`` escape sequences. PostgreSQL owns the authoritative total.
        """
        total = 0
        for value in values:
            if value is None:
                continue
            if isinstance(value, (dict, list)):
                rendered = json.dumps(
                    value,
                    sort_keys=True,
                    default=str,
                    ensure_ascii=False,
                    separators=(",", ":"),
                )
            else:
                rendered = str(value)
            total += len(rendered.encode("utf-8"))
        return total

    def get_storage_usage_bytes(self, user_id: str, root_ids: Optional[Sequence[str]] = None) -> int:
        """Return quota-accounted bytes without transferring stored payloads.

        This deliberately executes one statement whose scalar subqueries sum
        bytes inside Postgres. The previous implementation hydrated every
        owned row into the API process on each write, making uncached egress
        proportional to account history and turning a few MB of stored notes
        into hundreds of MB of daily database traffic.
        """
        scoped_root_ids = list(dict.fromkeys(root_ids or []))
        if scoped_root_ids:
            roots = select(Goal.id).where(
                Goal.id.in_(scoped_root_ids),
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
            )
            goal_filter = or_(Goal.id.in_(scoped_root_ids), Goal.root_id.in_(scoped_root_ids))
        else:
            roots = select(Goal.id).where(
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
            )
            goal_filter = Goal.owner_id == user_id

        def text_bytes(*columns):
            return sum(
                (func.coalesce(func.octet_length(cast(column, Text)), 0) for column in columns),
                literal(0),
            )

        def json_bytes(column):
            return func.coalesce(func.compact_jsonb_octet_length(column), 0)

        def table_total(row_size, *criteria, select_from=None):
            statement = select(func.coalesce(func.sum(row_size), 0))
            if select_from is not None:
                statement = statement.select_from(select_from)
            if criteria:
                statement = statement.where(*criteria)
            return statement.scalar_subquery()

        slot_count = select(func.count(CircuitSlot.id)).where(
            CircuitSlot.circuit_definition_id == CircuitDefinition.id,
        ).correlate(CircuitDefinition).scalar_subquery()
        slot_payload_bytes = select(
            func.coalesce(func.sum(func.compact_jsonb_octet_length(
                func.jsonb_build_object("activity_definition_id", CircuitSlot.activity_definition_id)
            )), 0)
        ).where(
            CircuitSlot.circuit_definition_id == CircuitDefinition.id,
        ).correlate(CircuitDefinition).scalar_subquery()
        compact_slot_list_bytes = (
            literal(2)
            + slot_payload_bytes
            + func.greatest(slot_count - 1, 0)
        )

        totals = [
            table_total(
                text_bytes(Goal.name, Goal.description, Goal.relevance_statement, Goal.completion_reason)
                + json_bytes(Goal.targets)
                + json_bytes(Goal.progress_settings),
                goal_filter,
                Goal.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(Session.name, Session.description) + json_bytes(Session.attributes),
                Session.root_id.in_(roots), Session.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(ActivityGroup.name, ActivityGroup.description),
                ActivityGroup.root_id.in_(roots), ActivityGroup.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(ActivityDefinition.name, ActivityDefinition.description),
                ActivityDefinition.root_id.in_(roots), ActivityDefinition.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(CircuitDefinition.name, CircuitDefinition.description) + compact_slot_list_bytes,
                CircuitDefinition.root_id.in_(roots), CircuitDefinition.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(ActivityInstance.notes) + json_bytes(ActivityInstance.data),
                ActivityInstance.root_id.in_(roots), ActivityInstance.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(
                    FractalMetricDefinition.name,
                    FractalMetricDefinition.unit,
                    FractalMetricDefinition.description,
                ) + json_bytes(FractalMetricDefinition.predefined_values),
                FractalMetricDefinition.root_id.in_(roots),
                FractalMetricDefinition.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(MetricDefinition.name, MetricDefinition.unit, MetricDefinition.progress_aggregation),
                MetricDefinition.root_id.in_(roots), MetricDefinition.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(SessionTemplate.name, SessionTemplate.description)
                + json_bytes(SessionTemplate.template_data),
                SessionTemplate.root_id.in_(roots), SessionTemplate.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(Note.content),
                Note.root_id.in_(roots), Note.deleted_at.is_(None),
            ),
            table_total(
                text_bytes(Program.name, Program.description, Program.color)
                + json_bytes(Program.weekly_schedule),
                Program.root_id.in_(roots),
            ),
            table_total(
                text_bytes(ProgramBlock.name, ProgramBlock.color),
                Program.root_id.in_(roots),
                select_from=ProgramBlock.__table__.join(Program.__table__),
            ),
            table_total(
                text_bytes(ProgramDay.name, ProgramDay.notes, ProgramDay.day_of_week),
                Program.root_id.in_(roots),
                select_from=ProgramDay.__table__.join(ProgramBlock.__table__).join(Program.__table__),
            ),
            table_total(
                text_bytes(AnalyticsDashboard.name) + json_bytes(AnalyticsDashboard.layout),
                AnalyticsDashboard.root_id.in_(roots), AnalyticsDashboard.deleted_at.is_(None),
            ),
            # EventLog rows are platform telemetry, not user-manageable content.
            table_total(
                text_bytes(Target.name, Target.type, Target.time_scope),
                Target.root_id.in_(roots), Target.deleted_at.is_(None),
            ),
        ]

        total = self.db_session.execute(select(sum(totals, literal(0)))).scalar_one()
        return int(total or 0)

    def get_usage(self, user_id: str, root_ids: Optional[Sequence[str]] = None) -> JsonDict:
        scoped_root_ids = list(dict.fromkeys(root_ids or []))
        if scoped_root_ids:
            roots = select(Goal.id).where(
                Goal.id.in_(scoped_root_ids),
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
            )
            goal_filter = or_(
                Goal.id.in_(scoped_root_ids),
                Goal.root_id.in_(scoped_root_ids),
            )
        else:
            roots = select(Goal.id).where(
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
            )
            goal_filter = Goal.owner_id == user_id

        def scalar_count(query):
            return int(query.scalar() or 0)

        metrics_count = scalar_count(
            self.db_session.query(func.count(FractalMetricDefinition.id)).filter(
                FractalMetricDefinition.root_id.in_(roots),
                FractalMetricDefinition.deleted_at.is_(None),
            )
        ) + scalar_count(
            self.db_session.query(func.count(MetricDefinition.id)).filter(
                MetricDefinition.root_id.in_(roots),
                MetricDefinition.fractal_metric_id.is_(None),
                MetricDefinition.deleted_at.is_(None),
            )
        )

        return {
            "fractals": scalar_count(
                self.db_session.query(func.count(Goal.id)).filter(
                    Goal.id.in_(scoped_root_ids) if scoped_root_ids else Goal.owner_id == user_id,
                    Goal.parent_id.is_(None),
                    Goal.deleted_at.is_(None),
                )
            ),
            "goals": scalar_count(
                self.db_session.query(func.count(Goal.id)).filter(
                    goal_filter,
                    Goal.deleted_at.is_(None),
                )
            ),
            "sessions": scalar_count(
                self.db_session.query(func.count(Session.id)).filter(
                    Session.root_id.in_(roots),
                    Session.deleted_at.is_(None),
                )
            ),
            "activity_instances": scalar_count(
                self.db_session.query(func.count(ActivityInstance.id)).filter(
                    ActivityInstance.root_id.in_(roots),
                    ActivityInstance.deleted_at.is_(None),
                )
            ),
            "activities": scalar_count(
                self.db_session.query(func.count(ActivityDefinition.id)).filter(
                    ActivityDefinition.root_id.in_(roots),
                    ActivityDefinition.deleted_at.is_(None),
                )
            ),
            "circuits": scalar_count(
                self.db_session.query(func.count(CircuitDefinition.id)).filter(
                    CircuitDefinition.root_id.in_(roots),
                    CircuitDefinition.deleted_at.is_(None),
                )
            ),
            "metrics": metrics_count,
            "session_templates": scalar_count(
                self.db_session.query(func.count(SessionTemplate.id)).filter(
                    SessionTemplate.root_id.in_(roots),
                    SessionTemplate.deleted_at.is_(None),
                )
            ),
            "notes": scalar_count(
                self.db_session.query(func.count(Note.id)).filter(
                    Note.root_id.in_(roots),
                    Note.deleted_at.is_(None),
                )
            ),
            "programs": scalar_count(
                self.db_session.query(func.count(Program.id)).filter(
                    Program.root_id.in_(roots),
                    or_(Program.is_active.is_(True), Program.is_completed.is_(False)),
                )
            ),
        }

    def validate_root_ids(self, user_id: str, root_ids: Sequence[str]) -> ServiceResult[list[str]]:
        normalized_root_ids = [root_id for root_id in dict.fromkeys(root_ids) if root_id]
        if not normalized_root_ids:
            return [], None, 200

        owned_root_ids = {
            row[0]
            for row in self.db_session.query(Goal.id).filter(
                Goal.id.in_(normalized_root_ids),
                Goal.owner_id == user_id,
                Goal.parent_id.is_(None),
                Goal.deleted_at.is_(None),
            ).all()
        }
        missing_root_ids = [root_id for root_id in normalized_root_ids if root_id not in owned_root_ids]
        if missing_root_ids:
            return None, "Fractal not found", 404
        return normalized_root_ids, None, 200

    def get_account_usage(self, user_id: str, root_ids: Optional[Sequence[str]] = None) -> ServiceResult[JsonDict]:
        user = self.get_user(user_id)
        if not user:
            return None, "User not found", 404

        selected_root_ids, root_error, root_status = self.validate_root_ids(user_id, root_ids or [])
        if root_error:
            return None, root_error, root_status

        limits = self.get_effective_limits(user)
        usage = self.get_usage(user_id, selected_root_ids or None)
        storage_bytes = self.get_storage_usage_bytes(user_id, selected_root_ids or None)
        storage_limit_bytes = getattr(user, "storage_limit_bytes", None)
        return {
            "tier": self.normalize_tier(getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER)),
            "subscription_status": getattr(user, "subscription_status", "none") or "none",
            "paid_amount_cad_cents": getattr(user, "paid_amount_cad_cents", None),
            "unlimited": limits is None,
            "limits": limits,
            "usage": usage,
            "storage": {
                "used_bytes": storage_bytes,
                "limit_bytes": storage_limit_bytes,
                "unlimited": storage_limit_bytes is None,
            },
            "scope": "fractals" if selected_root_ids else "account",
            "root_ids": selected_root_ids,
            "resources": RESOURCE_ORDER,
            "labels": RESOURCE_LABELS,
        }, None, 200

    def check_storage_available(self, user_id: str, estimated_bytes: int = 0) -> ServiceResult[JsonDict]:
        if estimated_bytes <= 0:
            return {"allowed": True}, None, 200

        user = self.get_user(user_id)
        if not user:
            return None, "User not found", 404

        limit = getattr(user, "storage_limit_bytes", DEFAULT_STORAGE_LIMIT_BYTES)
        if limit is None:
            return {"allowed": True, "unlimited": True}, None, 200

        current = self.get_storage_usage_bytes(user_id)
        if current + estimated_bytes <= int(limit):
            return {
                "allowed": True,
                "current": current,
                "limit": int(limit),
                "requested": estimated_bytes,
            }, None, 200

        log_ops_event(
            "quota.denied",
            level="warning",
            user_id=user_id,
            resource="storage",
            current=current,
            limit=int(limit),
            requested=estimated_bytes,
        )
        return None, {
            "error": "Storage quota reached",
            "resource": "storage",
            "current": current,
            "limit": int(limit),
            "requested": estimated_bytes,
        }, 403

    def check_available(self, user_id: str, resource: str, increment: int = 1) -> ServiceResult[JsonDict]:
        if increment <= 0:
            return {"allowed": True}, None, 200

        user = self.get_user(user_id)
        if not user:
            return None, "User not found", 404

        limits = self.get_effective_limits(user)
        if limits is None:
            return {"allowed": True, "unlimited": True}, None, 200

        if resource not in limits:
            return None, f"Unknown quota resource: {resource}", 500

        usage = self.get_usage(user_id)
        current = int(usage.get(resource, 0))
        limit = int(limits[resource])
        if current + increment <= limit:
            return {
                "allowed": True,
                "resource": resource,
                "current": current,
                "limit": limit,
                "requested": increment,
            }, None, 200

        label = RESOURCE_LABELS.get(resource, resource.replace("_", " "))
        log_ops_event(
            "quota.denied",
            level="warning",
            user_id=user_id,
            resource=resource,
            current=current,
            limit=limit,
            requested=increment,
        )
        return None, {
            "error": f"{label.capitalize()} quota reached",
            "resource": resource,
            "current": current,
            "limit": limit,
            "requested": increment,
            "tier": self.normalize_tier(getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER)),
        }, 403
