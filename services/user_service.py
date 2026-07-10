import uuid
import logging

from sqlalchemy.orm import selectinload
from sqlalchemy.orm.attributes import flag_modified

import models
from config import config
from models import User
from models import ActivityDefinition, Goal, MetricDefinition, Program, Session
from services.account_flags import clear_force_password_change
from services.email_service import EmailSendError, EmailService
from services.email_templates import render_email_changed_email, render_password_changed_email
from services.serializers import calculate_smart_status, serialize_user
from services.quota_service import QuotaService
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)

ONBOARDING_PREFERENCE_KEY = "onboarding"
ONBOARDING_ROOTS_PREFERENCE_KEY = "onboarding_by_root"
ONBOARDING_VERSION = 1


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

    def _onboarding_progress(self, user_id: str, root_id: str | None = None) -> JsonDict:
        roots_query = self.db_session.query(Goal.id).filter(
            Goal.owner_id == user_id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
        )
        if root_id:
            roots_query = roots_query.filter(Goal.id == root_id)
        root_ids = [row[0] for row in roots_query.all()]
        if not root_ids:
            return {
                "create_fractal": False, "break_it_down": False,
                "make_goal_smart": False,
                "create_activity_metric": False, "first_session": False,
                "schedule_program": False,
            }

        has_child = self.db_session.query(Goal.id).filter(
            Goal.root_id.in_(root_ids), Goal.parent_id.isnot(None), Goal.deleted_at.is_(None),
        ).first() is not None
        has_activity_metric = self.db_session.query(MetricDefinition.id).join(
            ActivityDefinition, ActivityDefinition.id == MetricDefinition.activity_id,
        ).filter(
            ActivityDefinition.root_id.in_(root_ids),
            ActivityDefinition.deleted_at.is_(None),
            MetricDefinition.deleted_at.is_(None),
        ).first() is not None
        has_session = self.db_session.query(Session.id).filter(
            Session.root_id.in_(root_ids), Session.deleted_at.is_(None), Session.completed.is_(True),
        ).first() is not None
        has_program = self.db_session.query(Program.id).filter(Program.root_id.in_(root_ids)).first() is not None
        candidate_goals = self.db_session.query(Goal).options(
            selectinload(Goal.targets_rel),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter(
            Goal.root_id.in_(root_ids), Goal.deleted_at.is_(None),
        ).all()
        has_smart_goal = any(all(calculate_smart_status(goal).values()) for goal in candidate_goals)
        return {
            "create_fractal": True,
            "break_it_down": has_child,
            "create_activity_metric": has_activity_metric,
            "first_session": has_session,
            "schedule_program": has_program,
            "make_goal_smart": has_smart_goal,
        }

    @staticmethod
    def _normalize_onboarding_state(raw) -> JsonDict:
        state = raw if isinstance(raw, dict) else {}
        return {
            "version": ONBOARDING_VERSION,
            "revision": int(state.get("revision") or 0),
            "status": state.get("status") if state.get("status") in {"active", "dismissed", "completed"} else None,
            "hints_dismissed": list(dict.fromkeys(state.get("hints_dismissed") or [])),
            "visited": list(dict.fromkeys(state.get("visited") or [])),
            "celebrated_first_session": bool(state.get("celebrated_first_session")),
        }

    def initialize_onboarding_for_root(self, user_id: str, root_id: str) -> None:
        user = self._get_user(user_id)
        if not user:
            return
        preferences = models._safe_load_json(user.preferences, {}) or {}
        root_states = dict(preferences.get(ONBOARDING_ROOTS_PREFERENCE_KEY) or {})
        root_states[root_id] = self._normalize_onboarding_state({"status": "active"})
        preferences[ONBOARDING_ROOTS_PREFERENCE_KEY] = root_states
        user.preferences = preferences
        flag_modified(user, 'preferences')

    def remove_onboarding_for_root(self, user_id: str, root_id: str) -> None:
        user = self._get_user(user_id)
        if not user:
            return
        preferences = models._safe_load_json(user.preferences, {}) or {}
        root_states = dict(preferences.get(ONBOARDING_ROOTS_PREFERENCE_KEY) or {})
        if root_states.pop(root_id, None) is None:
            return
        preferences[ONBOARDING_ROOTS_PREFERENCE_KEY] = root_states
        user.preferences = preferences
        flag_modified(user, 'preferences')

    def get_onboarding(self, user_id: str, root_id: str | None = None) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if root_id and not self.db_session.query(Goal.id).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
        ).first():
            return None, 'Fractal not found or access denied', 404
        preferences = models._safe_load_json(user.preferences, {}) or {}
        root_states = preferences.get(ONBOARDING_ROOTS_PREFERENCE_KEY) or {}
        raw_state = root_states.get(root_id) if root_id else preferences.get(ONBOARDING_PREFERENCE_KEY)
        state = self._normalize_onboarding_state(raw_state)
        progress = self._onboarding_progress(user_id, root_id)
        returning_user = state["status"] is None and progress["create_fractal"]
        effective_status = state["status"] or ("dismissed" if returning_user else "active")
        completed = {
            **progress,
            "see_progress": all(key in state["visited"] for key in ("analytics", "notes")),
        }
        if all(completed.values()):
            effective_status = "completed"
        return {**state, "root_id": root_id, "persisted": isinstance(raw_state, dict), "status": effective_status, "steps": completed}, None, 200

    def update_onboarding(self, user_id: str, data, *, root_id: str | None = None) -> ServiceResult[JsonDict]:
        user = self._get_user(user_id)
        if not user:
            return None, 'User not found', 404
        if root_id and not self.db_session.query(Goal.id).filter(
            Goal.id == root_id,
            Goal.owner_id == user_id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
        ).first():
            return None, 'Fractal not found or access denied', 404
        preferences = models._safe_load_json(user.preferences, {}) or {}
        root_states = dict(preferences.get(ONBOARDING_ROOTS_PREFERENCE_KEY) or {})
        current = self._normalize_onboarding_state(
            root_states.get(root_id) if root_id else preferences.get(ONBOARDING_PREFERENCE_KEY)
        )
        if data["revision"] != current["revision"]:
            payload, _, _ = self.get_onboarding(user_id, root_id)
            return payload, 'Onboarding state changed in another tab', 409
        if data.get("restart"):
            next_state = self._normalize_onboarding_state({
                "status": "active",
                "celebrated_first_session": current["celebrated_first_session"],
            })
        else:
            next_state = dict(current)
            for key in ("status", "hints_dismissed", "visited", "celebrated_first_session"):
                if data.get(key) is not None:
                    next_state[key] = data[key]
        next_state["revision"] = current["revision"] + 1
        if root_id:
            root_states[root_id] = next_state
            preferences[ONBOARDING_ROOTS_PREFERENCE_KEY] = root_states
        else:
            preferences[ONBOARDING_PREFERENCE_KEY] = next_state
        user.preferences = preferences
        flag_modified(user, 'preferences')
        self.db_session.commit()
        return self.get_onboarding(user_id, root_id)

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
