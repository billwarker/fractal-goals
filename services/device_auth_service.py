"""Native-app sessions: a short access token plus a rotating refresh token per device.

Each refresh replaces the token. The old one is honoured again only while its replacement has
never been used, because a phone can lose the response that carried it. Any other use of an old
token means two holders, so the device is signed out.
"""
import datetime
import hashlib
import logging
import secrets

from config import config
from models import DeviceRefreshToken, User, UserDevice, format_utc, utc_now
from services.auth_service import AuthService
from services.ops_log import log_ops_event
from services.serializers import serialize_user
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)


def _hash(raw_token: str) -> str:
    return hashlib.sha256(raw_token.encode('utf-8')).hexdigest()


def _aware(value):
    return value.replace(tzinfo=datetime.timezone.utc) if value.tzinfo is None else value


def serialize_device(device) -> JsonDict:
    return {
        'id': device.id,
        'platform': device.platform,
        'name': device.name,
        'created_at': format_utc(device.created_at),
        'last_seen_at': format_utc(device.last_seen_at),
    }


class DeviceAuthService:
    def __init__(self, db_session):
        self.db_session = db_session

    def sign_in(self, data) -> ServiceResult[JsonDict]:
        # The one login path: lockout, suspension and the demo account behave the same.
        login, error, status = AuthService(self.db_session).login(data)
        if error or login is None:
            return None, error, status
        user = self.db_session.get(User, login['user']['id'])
        device = UserDevice(
            user_id=user.id,
            platform=data['platform'],
            name=data['device_name'],
            session_version=user.session_version or 0,
        )
        self.db_session.add(device)
        self.db_session.flush()
        refresh_token = self._add_token(device)
        self.db_session.commit()
        log_ops_event('auth.device_signed_in', user_id=user.id, platform=device.platform)
        return self._session_payload(user, device, refresh_token), None, 200

    def refresh(self, raw_token: str) -> ServiceResult[JsonDict]:
        token_hash = _hash(raw_token)
        known = self.db_session.get(DeviceRefreshToken, token_hash)
        if known is None:
            return None, 'Invalid refresh token', 401
        # The device row serialises its refreshes; the token is read again under it.
        device = self.db_session.get(UserDevice, known.device_id, with_for_update=True)
        if device is None:
            self.db_session.rollback()
            return None, 'Invalid refresh token', 401
        token = self.db_session.get(DeviceRefreshToken, token_hash, populate_existing=True)
        user = self.db_session.get(User, device.user_id)
        now = utc_now()
        idle_limit = datetime.timedelta(days=config.DEVICE_SESSION_IDLE_DAYS)
        if token is None or device.revoked_at is not None or now - _aware(device.last_seen_at) > idle_limit:
            self.db_session.rollback()
            return None, 'Device session has ended. Please sign in again.', 401
        if user is None or not user.is_active:
            self.db_session.rollback()
            return None, 'User account is suspended', 403
        if device.session_version != (user.session_version or 0):
            self.db_session.rollback()
            return None, 'Session has been revoked', 401

        if token.superseded_at is not None:
            replacement = self.db_session.query(DeviceRefreshToken).filter(
                DeviceRefreshToken.device_id == device.id,
                DeviceRefreshToken.superseded_at.is_(None),
            ).one_or_none()
            if replacement is None or replacement.parent_hash != token.token_hash:
                device.revoked_at = now
                self.db_session.commit()
                log_ops_event('auth.device_token_reused', level='warning', user_id=user.id)
                return None, 'Device session has ended. Please sign in again.', 401
            replacement.superseded_at = now
        token.superseded_at = now
        self.db_session.flush()
        refresh_token = self._add_token(device, parent_hash=token.token_hash)
        device.last_seen_at = now
        self.db_session.commit()
        return self._session_payload(user, device, refresh_token), None, 200

    def sign_out(self, raw_token: str) -> None:
        """Sign this device out. Unknown tokens get the same answer."""
        token = self.db_session.get(DeviceRefreshToken, _hash(raw_token))
        if token is not None:
            self._revoke(self.db_session.get(UserDevice, token.device_id, with_for_update=True))

    def list_devices(self, user_id: str) -> JsonDict:
        devices = self.db_session.query(UserDevice).join(User, User.id == UserDevice.user_id).filter(
            UserDevice.user_id == user_id,
            UserDevice.revoked_at.is_(None),
            UserDevice.session_version == User.session_version,
            UserDevice.last_seen_at > utc_now() - datetime.timedelta(days=config.DEVICE_SESSION_IDLE_DAYS),
        ).order_by(UserDevice.last_seen_at.desc()).all()
        return {'devices': [serialize_device(device) for device in devices]}

    def revoke_device(self, user_id: str, device_id: str) -> ServiceResult[JsonDict]:
        device = self.db_session.query(UserDevice).filter_by(
            id=device_id, user_id=user_id,
        ).with_for_update().one_or_none()
        if device is None:
            return None, 'Device not found', 404
        self._revoke(device)
        return {'message': 'Device signed out'}, None, 200

    def _revoke(self, device) -> None:
        if device is not None and device.revoked_at is None:
            device.revoked_at = utc_now()
            log_ops_event('auth.device_revoked', user_id=device.user_id)
        self.db_session.commit()

    def _add_token(self, device, *, parent_hash=None) -> str:
        raw_token = secrets.token_urlsafe(48)
        self.db_session.add(DeviceRefreshToken(
            token_hash=_hash(raw_token), device_id=device.id, parent_hash=parent_hash,
        ))
        return raw_token

    @staticmethod
    def _session_payload(user, device, refresh_token) -> JsonDict:
        return {
            'access_token': AuthService.issue_token(user, device_id=device.id),
            'expires_in': config.DEVICE_ACCESS_TOKEN_MINUTES * 60,
            'refresh_token': refresh_token,
            'device': serialize_device(device),
            'user': serialize_user(user),
        }
