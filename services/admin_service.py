import datetime
import hashlib
import logging
import secrets
import string
from copy import deepcopy
from urllib.parse import quote

from sqlalchemy import delete, func, or_, text
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm.attributes import flag_modified

from account_tiers import (
    DEFAULT_ACCOUNT_TIER,
    FINITE_QUOTA_TIERS,
    TIER_LEGACY,
    UNLIMITED_QUOTA_TIERS,
)
from models import (
    ActivityDefinition,
    ActivityDurationStats,
    ActivityGroup,
    ActivityInstance,
    AnalyticsDashboard,
    AppSetting,
    BetaSignupRequest,
    EmailDeliveryEvent,
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
from services.email_service import EmailSendError, EmailService
from services.email_templates import render_beta_invite_email
from services.ops_log import log_ops_event
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult
from config import config

logger = logging.getLogger(__name__)
# Shared with auth/user services; re-exported here for existing imports.
from services.account_flags import FORCE_PASSWORD_CHANGE_PREFERENCE


def hash_invite_key(raw_key: str) -> str:
    return hashlib.sha256(raw_key.encode("utf-8")).hexdigest()


def generate_secret(prefix: str = "fg") -> str:
    token = secrets.token_urlsafe(24).replace("-", "").replace("_", "")
    return f"{prefix}_{token}"


def generate_password(length: int = 14) -> str:
    alphabet = string.ascii_letters + string.digits
    password = ''.join(secrets.choice(alphabet) for _ in range(length - 2))
    return f"A1{password}"


def as_aware_utc(value):
    if value is None:
        return None
    if value.tzinfo is None:
        return value.replace(tzinfo=datetime.timezone.utc)
    return value.astimezone(datetime.timezone.utc)


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
            "assigned_email": invite.assigned_email,
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
            label=data.get("label") or f"Invite for {data['email']}",
            assigned_email=data["email"],
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
        membership_tier = data.get("membership_tier") or DEFAULT_ACCOUNT_TIER
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
            "editable_tiers": list(FINITE_QUOTA_TIERS),
            "unlimited_tiers": list(UNLIMITED_QUOTA_TIERS),
        }, None, 200

    def update_tier_quota_settings(self, data: JsonDict) -> ServiceResult[JsonDict]:
        tier = self.quota_service.normalize_tier(data.get("tier"))
        if tier == TIER_LEGACY:
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
        configured_defaults[TIER_LEGACY] = None
        configured_defaults["storage_limit_bytes"] = deepcopy(current_storage_defaults)
        configured_defaults["storage_limit_bytes"][tier] = storage_limit_bytes
        configured_defaults["storage_limit_bytes"][TIER_LEGACY] = None

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
            "membership_tier": getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER) or DEFAULT_ACCOUNT_TIER,
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

    BETA_SIGNUP_STATUSES = ("new", "invited", "dismissed")

    def _beta_signup_base_query(self, status: str = "", search: str = ""):
        query = self.db_session.query(BetaSignupRequest)
        if status in self.BETA_SIGNUP_STATUSES:
            query = query.filter(BetaSignupRequest.status == status)
        if search:
            term = f"%{search}%"
            query = query.filter(
                or_(
                    BetaSignupRequest.email.ilike(term),
                    BetaSignupRequest.use_case.ilike(term),
                )
            )
        return query

    def list_beta_signups(
        self,
        status: str = "",
        search: str = "",
        limit: int = 50,
        offset: int = 0,
    ) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        query = self._beta_signup_base_query(status=status, search=search)
        total = int(query.with_entities(func.count(BetaSignupRequest.id)).scalar() or 0)
        requests = (
            query.order_by(BetaSignupRequest.created_at.desc())
            .limit(limit)
            .offset(offset)
            .all()
        )

        # Counts are computed across all statuses (ignoring the status filter) so
        # the admin UI can show the full breakdown regardless of the active tab.
        status_counts = {key: 0 for key in self.BETA_SIGNUP_STATUSES}
        for value, count in (
            self.db_session.query(BetaSignupRequest.status, func.count(BetaSignupRequest.id))
            .group_by(BetaSignupRequest.status)
            .all()
        ):
            status_counts[value] = int(count)
        status_counts["total"] = sum(status_counts[key] for key in self.BETA_SIGNUP_STATUSES)

        latest_email_by_signup = {}
        signup_ids = [request.id for request in requests]
        if signup_ids:
            events = (
                self.db_session.query(EmailDeliveryEvent)
                .filter(
                    EmailDeliveryEvent.template_key == "beta_invite",
                    EmailDeliveryEvent.beta_signup_id.in_(signup_ids),
                )
                .order_by(EmailDeliveryEvent.created_at.desc())
                .all()
            )
            for event in events:
                latest_email_by_signup.setdefault(event.beta_signup_id, event)

        serialized_requests = []
        for request in requests:
            payload = PublicService.serialize_beta_signup(request)
            latest_email = latest_email_by_signup.get(request.id)
            payload["invite_email_status"] = latest_email.status if latest_email else None
            payload["invite_email_last_event_type"] = latest_email.last_event_type if latest_email else None
            payload["invite_email_last_event_at"] = format_utc(latest_email.last_event_at) if latest_email else None
            serialized_requests.append(payload)

        return {
            "requests": serialized_requests,
            "total": total,
            "limit": limit,
            "offset": offset,
            "status_counts": status_counts,
        }, None, 200

    def update_beta_signup_status(self, signup_id: str, status: str) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        if status not in self.BETA_SIGNUP_STATUSES:
            return None, "Invalid beta signup status", 400
        request = self.db_session.get(BetaSignupRequest, signup_id)
        if request is None:
            return None, "Beta signup request not found", 404
        previous_status = request.status
        request.status = status
        if status == "invited" and request.invited_at is None:
            request.invited_at = utc_now()
        self.db_session.commit()
        self.db_session.refresh(request)
        if previous_status != status:
            log_ops_event(
                "beta.signup_status_changed",
                beta_signup_id=request.id,
                email=request.email,
                from_status=previous_status,
                to_status=status,
            )
        return {"request": PublicService.serialize_beta_signup(request)}, None, 200

    def send_beta_signup_invite(self, signup_id: str, current_user: User) -> ServiceResult[JsonDict]:
        from services.public_service import PublicService

        request = self.db_session.get(BetaSignupRequest, signup_id)
        if request is None:
            return None, "Beta signup request not found", 404

        now = utc_now()
        last_sent_at = as_aware_utc(request.last_invite_email_sent_at)
        cooldown_until = (
            last_sent_at + datetime.timedelta(minutes=config.BETA_INVITE_EMAIL_COOLDOWN_MINUTES)
            if last_sent_at else None
        )
        if cooldown_until and cooldown_until > now:
            logger.info("Beta invite email cooldown active beta_signup_id=%s", request.id)
            return None, "Beta invite email was sent recently. Please wait before resending.", 429

        previous_invite = self.db_session.get(SignupInviteKey, request.invite_key_id) if request.invite_key_id else None
        if previous_invite and not previous_invite.used_at and not previous_invite.revoked_at:
            previous_invite.revoked_at = now

        raw_key = generate_secret("fg_invite")
        invite = SignupInviteKey(
            key_hash=hash_invite_key(raw_key),
            label=f"Beta invite for {request.email}",
            assigned_email=request.email,
            created_by_user_id=current_user.id,
        )
        self.db_session.add(invite)
        self.db_session.flush()

        signup_url = f"{config.APP_BASE_URL.rstrip('/')}/?invite_key={quote(raw_key)}&email={quote(request.email)}"
        rendered = render_beta_invite_email(signup_url, request.use_case, invite_key=raw_key)
        try:
            EmailService(self.db_session).send_email(
                to=request.email,
                subject=rendered["subject"],
                html=rendered["html"],
                text=rendered["text"],
                template_key="beta_invite",
                entity_type="beta_signup_request",
                entity_id=request.id,
                beta_signup_id=request.id,
                idempotency_key=f"beta-invite:{request.id}:{invite.id}",
            )
        except EmailSendError as exc:
            self.db_session.rollback()
            self.db_session.add(EmailDeliveryEvent(
                provider=config.EMAIL_PROVIDER or 'disabled',
                template_key="beta_invite",
                entity_type="beta_signup_request",
                entity_id=request.id,
                beta_signup_id=request.id,
                status="failed",
                error_summary=str(exc)[:500],
            ))
            self.db_session.commit()
            logger.error("Beta invite email failed beta_signup_id=%s", request.id)
            log_ops_event(
                "email.invite_failed",
                level="error",
                beta_signup_id=request.id,
                email=request.email,
            )
            return None, "Failed to send beta invite email", 502

        request.status = "invited"
        request.invited_at = request.invited_at or now
        request.invite_key_id = invite.id
        request.last_invite_email_sent_at = now
        self.db_session.commit()
        self.db_session.refresh(request)
        log_ops_event(
            "email.invite_sent",
            beta_signup_id=request.id,
            email=request.email,
        )
        return {"request": PublicService.serialize_beta_signup(request)}, None, 200

    def iter_beta_signups_for_export(self, status: str = "", search: str = ""):
        """Yield beta signup rows oldest-first for CSV export."""
        query = self._beta_signup_base_query(status=status, search=search)
        yield from query.order_by(BetaSignupRequest.created_at.asc()).all()

    def summary(self) -> ServiceResult[JsonDict]:
        total_users = int(self.db_session.query(func.count(User.id)).scalar() or 0)
        active_users = int(self.db_session.query(func.count(User.id)).filter(User.is_active.is_(True)).scalar() or 0)
        total_fractals = int(self.db_session.query(func.count(Goal.id)).filter(
            Goal.parent_id.is_(None), Goal.deleted_at.is_(None)
        ).scalar() or 0)
        total_sessions = int(self.db_session.query(func.count(Session.id)).filter(Session.deleted_at.is_(None)).scalar() or 0)
        total_storage = self._database_storage_bytes()
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

    def _database_storage_bytes(self) -> int:
        try:
            total = self.db_session.execute(text("SELECT pg_database_size(current_database())")).scalar()
            return int(total or 0)
        except SQLAlchemyError:
            logger.warning(
                "Could not fetch PostgreSQL database size for admin summary; falling back to quota-accounted storage.",
                exc_info=True,
            )
            return self._quota_accounted_storage_bytes()

    def _quota_accounted_storage_bytes(self) -> int:
        return sum(
            self.quota_service.get_storage_usage_bytes(user.id)
            for user in self.db_session.query(User).all()
        )
