import uuid
import logging

from sqlalchemy.orm.attributes import flag_modified

import models
from config import config
from models import User
from services.account_flags import clear_force_password_change
from services.email_service import EmailSendError, EmailService
from services.email_templates import render_email_changed_email, render_password_changed_email
from services.serializers import serialize_user
from services.quota_service import QuotaService
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)


class UserService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _get_user(self, user_id: str):
        return self.db_session.get(User, user_id)

    def update_preferences(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404

        current_prefs = models._safe_load_json(user.preferences, {})
        new_prefs = data['preferences']
        if isinstance(new_prefs, dict):
            updated_prefs = dict(current_prefs)
            updated_prefs.update(new_prefs)
            user.preferences = updated_prefs
            flag_modified(user, 'preferences')

        self.db_session.commit()
        logger.info("Updated preferences for user_id=%s", user.id)
        return serialize_user(user), None, 200

    def get_account_usage(self, user_id: str, root_ids=None) -> ServiceResult[JsonDict]:
        return QuotaService(self.db_session).get_account_usage(user_id, root_ids=root_ids)

    def _send_security_notice(self, *, to: str, rendered, template_key: str, user_id: str):
        """Best-effort security notification; must never fail the request."""
        if (config.EMAIL_PROVIDER or 'disabled') == 'disabled':
            return
        try:
            EmailService(self.db_session).send_email(
                to=to,
                subject=rendered["subject"],
                html=rendered["html"],
                text=rendered["text"],
                template_key=template_key,
                entity_type="user",
                entity_id=user_id,
                recipient_user_id=user_id,
            )
            self.db_session.commit()
        except EmailSendError:
            # send_email already marked the delivery event failed; keep it.
            self.db_session.commit()
            logger.warning("Security notice email failed template=%s user_id=%s", template_key, user_id)
        except Exception:
            self.db_session.rollback()
            logger.exception("Security notice email errored template=%s user_id=%s", template_key, user_id)

    def update_password(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if not user.check_password(data['current_password']):
            return None, 'Invalid current password', 401

        user.set_password(data['new_password'])
        cleared_forced_change = clear_force_password_change(user)
        self.db_session.commit()
        logger.info(
            "Updated password for user_id=%s cleared_forced_change=%s",
            user.id,
            cleared_forced_change,
        )
        self._send_security_notice(
            to=user.email,
            rendered=render_password_changed_email(),
            template_key="password_changed_notice",
            user_id=user.id,
        )
        return {"message": "Password updated successfully"}, None, 200

    def update_email(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if not user.check_password(data['password']):
            return None, 'Invalid password', 401

        existing = self.db_session.query(User).filter(User.email == data['email']).first()
        if existing and existing.id != user.id:
            return None, 'Email already in use', 400

        old_email = user.email
        user.email = data['email']
        self.db_session.commit()
        logger.info("Updated email for user_id=%s", user.id)
        # Notify the OLD address so a hijacked account still alerts its owner.
        self._send_security_notice(
            to=old_email,
            rendered=render_email_changed_email(user.email),
            template_key="email_changed_notice",
            user_id=user.id,
        )
        return serialize_user(user), None, 200

    def update_username(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if not user.check_password(data['password']):
            return None, 'Incorrect password', 401

        existing = self.db_session.query(User).filter(
            User.username == data['username'],
            User.id != user.id,
        ).first()
        if existing:
            return None, 'Username already exists', 400

        user.username = data['username']
        self.db_session.commit()
        logger.info("Updated username for user_id=%s", user.id)
        return serialize_user(user), None, 200

    def delete_account(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if not user.check_password(data['password']):
            return None, 'Invalid password', 401

        user.username = f"deleted_{uuid.uuid4()}"
        user.email = f"deleted_{uuid.uuid4()}@fractalgoals.com"
        user.is_active = False
        user.set_password(str(uuid.uuid4()))

        self.db_session.commit()
        logger.info("Deleted account for user_id=%s", user.id)
        return {"message": "Account deleted successfully"}, None, 200
