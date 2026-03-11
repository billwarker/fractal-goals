import uuid
import logging

from sqlalchemy.orm.attributes import flag_modified

import models
from models import User
from services.serializers import serialize_user
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

    def update_password(self, user_id: str, data) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if not user.check_password(data['current_password']):
            return None, 'Invalid current password', 401

        user.set_password(data['new_password'])
        self.db_session.commit()
        logger.info("Updated password for user_id=%s", user.id)
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

        user.email = data['email']
        self.db_session.commit()
        logger.info("Updated email for user_id=%s", user.id)
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
