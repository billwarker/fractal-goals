from __future__ import annotations

from copy import deepcopy
from typing import Optional, Sequence

from sqlalchemy import func, or_, select

import models
from models import (
    ActivityDefinition,
    ActivityInstance,
    FractalMetricDefinition,
    Goal,
    MetricDefinition,
    Note,
    Program,
    Session,
    SessionTemplate,
    User,
)
from services.service_types import JsonDict, ServiceResult


FREE_LIMITS = {
    "fractals": 1,
    "goals": 50,
    "sessions": 200,
    "activity_instances": 500,
    "activities": 50,
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
    "metrics",
    "session_templates",
    "notes",
    "programs",
]


class QuotaService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_user(self, user_id: str) -> Optional[User]:
        return self.db_session.get(User, user_id)

    @staticmethod
    def normalize_tier(tier: Optional[str]) -> str:
        tier = (tier or "free").strip().lower()
        return tier if tier in {"free", "paid", "legacy"} else "free"

    def get_effective_limits(self, user: User) -> Optional[JsonDict]:
        tier = self.normalize_tier(getattr(user, "membership_tier", "free"))
        if tier == "legacy":
            return None

        limits = deepcopy(PAID_LIMITS if tier == "paid" else FREE_LIMITS)
        overrides = models._safe_load_json(getattr(user, "quota_overrides", None), {})
        if isinstance(overrides, dict):
            for resource, value in overrides.items():
                if resource in limits and isinstance(value, int) and value >= 0:
                    limits[resource] = value
        return limits

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
        return {
            "tier": self.normalize_tier(getattr(user, "membership_tier", "free")),
            "subscription_status": getattr(user, "subscription_status", "none") or "none",
            "paid_amount_cad_cents": getattr(user, "paid_amount_cad_cents", None),
            "unlimited": limits is None,
            "limits": limits,
            "usage": usage,
            "scope": "fractals" if selected_root_ids else "account",
            "root_ids": selected_root_ids,
            "resources": RESOURCE_ORDER,
            "labels": RESOURCE_LABELS,
        }, None, 200

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
        return None, {
            "error": f"{label.capitalize()} quota reached",
            "resource": resource,
            "current": current,
            "limit": limit,
            "requested": increment,
            "tier": self.normalize_tier(getattr(user, "membership_tier", "free")),
        }, 403
