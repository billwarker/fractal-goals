import datetime
import logging

import jwt

from config import config
from models import User
from services.serializers import serialize_user
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)


class AuthService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def issue_token(user_id: str) -> str:
        return jwt.encode({
            'user_id': user_id,
            'exp': datetime.datetime.now(datetime.timezone.utc)
            + datetime.timedelta(hours=config.JWT_EXPIRATION_HOURS),
        }, config.JWT_SECRET_KEY, algorithm="HS256")

    def _find_user_for_login(self, username_or_email: str):
        return self.db_session.query(User).filter(
            (User.username == username_or_email) |
            (User.email == username_or_email)
        ).first()

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
        existing_user = self.db_session.query(User).filter(
            (User.username == data['username']) |
            (User.email == data['email'])
        ).first()
        if existing_user:
            return None, "Username or email already exists", 400

        new_user = User(
            username=data['username'],
            email=data['email'],
        )
        new_user.set_password(data['password'])

        self.db_session.add(new_user)
        self.db_session.commit()
        self.db_session.refresh(new_user)
        logger.info("Signed up user_id=%s", new_user.id)
        return serialize_user(new_user), None, 201

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
            'token': self.issue_token(user.id),
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
            'token': self.issue_token(user.id),
            'user': serialize_user(user),
        }, None, 200
