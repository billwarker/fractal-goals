import datetime
import hashlib
import logging
import secrets
from urllib.parse import quote

import jwt

from account_tiers import DEFAULT_ACCOUNT_TIER
from config import config
from models import EmailDeliveryEvent, PasswordResetToken, User, utc_now
from services.email_service import EmailSendError, EmailService
from services.email_templates import render_password_reset_email
from services.serializers import serialize_user
from services.admin_service import AdminService
from services.quota_service import DEFAULT_STORAGE_LIMIT_BYTES, QuotaService
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def issue_token(user_id: str, *, remember_me: bool = False) -> str:
        return jwt.encode({
            'user_id': user_id,
            'remember_me': bool(remember_me),
            'exp': datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(hours=config.JWT_EXPIRATION_HOURS),
        }, config.JWT_SECRET_KEY, algorithm="HS256")

    def _find_user_for_login(self, username_or_email: str):
        return self.db_session.query(User).filter(
            (User.username == username_or_email) |
            (User.email == username_or_email)
        ).first()

    @staticmethod
    def _hash_token(raw_token: str) -> str:
        return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()

    @staticmethod
    def _public_password_reset_response() -> JsonDict:
        return {"message": "If that email belongs to an active account, a reset link has been sent."}

    @staticmethod
    def _as_aware_utc(value):
        if value is None:
            return None
        if value.tzinfo is None:
            return value.replace(tzinfo=datetime.timezone.utc)
        return value.astimezone(datetime.timezone.utc)

    def get_current_user_for_token(self, token: str) -> ServiceResult[User]:
        try:
            data = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=["HS256"])
        except jwt.ExpiredSignatureError:
            return None, 'Token has expired', 401
        except jwt.InvalidTokenError:
            return None, 'Invalid token', 401

        current_user = self.db_session.query(User).filter_by(id=data['user_id']).first()
        if not current_user:
            return None, 'User not found', 401

        logger.debug("Resolved auth token for user_id=%s", current_user.id)
        self.db_session.expunge(current_user)
        return current_user, None, 200

    def signup(self, data) -> ServiceResult[JsonDict]:
        invite, invite_error, invite_status = AdminService(self.db_session).validate_invite_key(data.get('invite_key', ''))
        if invite_error:
            return None, invite_error, invite_status

        existing_user = self.db_session.query(User).filter(
            (User.username == data['username']) |
            (User.email == data['email'])
        ).first()
        if existing_user:
            return None, "Username or email already exists", 400

        new_user = User(
            username=data['username'],
            email=data['email'],
            storage_limit_bytes=(
                QuotaService(self.db_session).get_tier_storage_limit_bytes(DEFAULT_ACCOUNT_TIER)
                or DEFAULT_STORAGE_LIMIT_BYTES
            ),
        )
        new_user.set_password(data['password'])

        self.db_session.add(new_user)
        self.db_session.flush()
        AdminService(self.db_session).consume_invite_key(invite, new_user.id)
        self.db_session.commit()
        self.db_session.refresh(new_user)
        logger.info("Signed up user_id=%s", new_user.id)
        return serialize_user(new_user), None, 201

    def forgot_password(self, data) -> ServiceResult[JsonDict]:
        email = data["email"].lower()
        user = self.db_session.query(User).filter(User.email == email, User.is_active.is_(True)).first()
        if not user:
            return self._public_password_reset_response(), None, 200

        now = utc_now()
        latest_reset_token = self.db_session.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
        ).order_by(PasswordResetToken.created_at.desc()).first()
        latest_created_at = self._as_aware_utc(latest_reset_token.created_at) if latest_reset_token else None
        cooldown_until = (
            latest_created_at + datetime.timedelta(minutes=config.PASSWORD_RESET_EMAIL_COOLDOWN_MINUTES)
            if latest_created_at else None
        )
        if cooldown_until and cooldown_until > now:
            logger.info("Password reset email cooldown active for user_id=%s", user.id)
            return self._public_password_reset_response(), None, 200

        raw_token = secrets.token_urlsafe(48)
        reset_token = PasswordResetToken(
            user_id=user.id,
            token_hash=self._hash_token(raw_token),
            expires_at=now + datetime.timedelta(minutes=config.PASSWORD_RESET_TOKEN_TTL_MINUTES),
        )
        self.db_session.query(PasswordResetToken).filter(
            PasswordResetToken.user_id == user.id,
            PasswordResetToken.used_at.is_(None),
        ).update({"used_at": now}, synchronize_session=False)
        self.db_session.add(reset_token)
        self.db_session.flush()

        reset_url = f"{config.APP_BASE_URL.rstrip('/')}/reset-password?token={quote(raw_token)}"
        rendered = render_password_reset_email(reset_url)
        try:
            EmailService(self.db_session).send_email(
                to=user.email,
                subject=rendered["subject"],
                html=rendered["html"],
                text=rendered["text"],
                template_key="password_reset",
                entity_type="password_reset_token",
                entity_id=reset_token.id,
                recipient_user_id=user.id,
                idempotency_key=f"password-reset:{reset_token.id}",
            )
        except EmailSendError as exc:
            self.db_session.rollback()
            self.db_session.add(EmailDeliveryEvent(
                provider=config.EMAIL_PROVIDER or 'disabled',
                template_key="password_reset",
                entity_type="user",
                entity_id=user.id,
                recipient_user_id=user.id,
                status="failed",
                error_summary=str(exc)[:500],
            ))
            self.db_session.commit()
            logger.error("Password reset email failed for user_id=%s", user.id)
            return self._public_password_reset_response(), None, 200

        self.db_session.commit()
        logger.info("Password reset requested for user_id=%s", user.id)
        return self._public_password_reset_response(), None, 200

    def reset_password(self, data) -> ServiceResult[JsonDict]:
        token_hash = self._hash_token(data["token"])
        reset_token = self.db_session.query(PasswordResetToken).filter_by(token_hash=token_hash).first()
        if not reset_token or reset_token.used_at is not None:
            return None, "Invalid or expired reset token", 400

        expires_at = reset_token.expires_at
        if expires_at.tzinfo is None:
            expires_at = expires_at.replace(tzinfo=datetime.timezone.utc)
        if expires_at < utc_now():
            reset_token.used_at = utc_now()
            self.db_session.commit()
            return None, "Invalid or expired reset token", 400

        user = self.db_session.get(User, reset_token.user_id)
        if not user or not user.is_active:
            return None, "Invalid or expired reset token", 400

        user.set_password(data["new_password"])
        user.failed_login_count = 0
        user.locked_until = None
        reset_token.used_at = utc_now()
        self.db_session.commit()
        logger.info("Password reset completed for user_id=%s", user.id)
        return {"message": "Password reset successfully. Please log in with your new password."}, None, 200

    def refresh_token(self, token: str) -> ServiceResult[JsonDict]:
        try:
            data = jwt.decode(
                token,
                config.JWT_SECRET_KEY,
                algorithms=["HS256"],
                options={"verify_exp": False},
            )
            exp_timestamp = data.get('exp', 0)
            exp_time = datetime.datetime.fromtimestamp(exp_timestamp, tz=datetime.timezone.utc)
            refresh_window = datetime.timedelta(days=getattr(config, 'JWT_REFRESH_WINDOW_DAYS', 7))

            if datetime.datetime.now(datetime.timezone.utc) > (exp_time + refresh_window):
                return None, 'Refresh window expired. Please log in again.', 401
        except jwt.InvalidTokenError:
            return None, 'Invalid token', 401
        except (TypeError, ValueError):
            return None, 'Failed to refresh token', 500

        user = self.db_session.query(User).filter_by(id=data['user_id']).first()
        if not user or not user.is_active:
            return None, 'User invalid or disabled', 401

        logger.info("Refreshed auth token for user_id=%s", user.id)
        return {
            'token': self.issue_token(user.id, remember_me=bool(data.get('remember_me'))),
            'remember_me': bool(data.get('remember_me')),
            'user': serialize_user(user),
        }, None, 200

    def login(self, data) -> ServiceResult[JsonDict]:
        user = self._find_user_for_login(data['username_or_email'])
        if not user:
            logger.warning("Failed login: unknown identifier=%s", data['username_or_email'])
            return None, "Invalid username or password", 401

        if not user.is_active:
            logger.warning("Rejected login for disabled user_id=%s", user.id)
            return None, "User account is disabled", 403

        if user.locked_until:
            now = datetime.datetime.now(datetime.timezone.utc)
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=datetime.timezone.utc)
            if locked_until > now:
                minutes_left = int((locked_until - now).total_seconds() / 60) + 1
                logger.warning("Rejected login for locked user_id=%s", user.id)
                return None, f"Account temporarily locked. Try again in {minutes_left} minutes.", 403

        if not user.check_password(data['password']):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= 5:
                user.locked_until = datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(minutes=15)
            self.db_session.commit()
            logger.warning(
                "Failed login for user_id=%s failed_count=%s locked_until=%s",
                user.id,
                user.failed_login_count,
                user.locked_until,
            )
            return None, "Invalid username or password", 401

        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = datetime.datetime.now(datetime.timezone.utc)
        self.db_session.commit()
        logger.info("Logged in user_id=%s", user.id)

        return {
            'token': self.issue_token(user.id, remember_me=bool(data.get('remember_me'))),
            'remember_me': bool(data.get('remember_me')),
            'user': serialize_user(user),
        }, None, 200
