import datetime
import hashlib
import secrets
import string

from sqlalchemy import func, or_

from models import Goal, Session, SignupInviteKey, User, utc_now
from services.quota_service import DEFAULT_STORAGE_LIMIT_BYTES, QuotaService
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult


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
        user = User(
            username=data["username"],
            email=data["email"],
            role=data.get("role") or "user",
            membership_tier=data.get("membership_tier") or "free",
            storage_limit_bytes=data.get("storage_limit_bytes", DEFAULT_STORAGE_LIMIT_BYTES),
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

    def delete_user(self, user_id: str, current_user: User) -> ServiceResult[JsonDict]:
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
        self.db_session.commit()
        return {"message": "User deleted", "user_id": user_id}, None, 200

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
            "created_at": format_utc(user.created_at),
            "last_login_at": format_utc(user.last_login_at),
            "usage": usage_payload["usage"],
            "limits": usage_payload["limits"],
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
