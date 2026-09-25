from models import (
    Session,
    validate_root_goal,
)
from services.serializers import serialize_session
from services.service_types import JsonDict, ServiceResult
from services.session_template_stats_service import SessionTemplateStatsService
from services._session_creation import _SessionCreationMixin
from services._session_goal_scope import _SessionGoalScopeMixin
from services._session_updates import _SessionUpdatesMixin


class SessionLifecycleService(_SessionGoalScopeMixin, _SessionCreationMixin, _SessionUpdatesMixin):
    def __init__(
        self,
        db_session,
        *,
        session_read_options_factory,
        derived_goals_resolver,
        effective_activity_goals_resolver,
    ):
        self.db_session = db_session
        self._session_read_options = session_read_options_factory
        self._derive_session_goals_from_activities = derived_goals_resolver
        self._get_effective_activity_goals = effective_activity_goals_resolver
        self._session_goals_has_source = None

    def _recompute_and_attach_stats(self, session, *, commit=True):
        if not session:
            return
        stats_service = SessionTemplateStatsService(self.db_session)
        computed = stats_service.recompute_for_session(session)
        session._template_stats = computed.get("template") or {}
        session._activity_duration_stats = computed.get("activity_durations") or {}
        if commit:
            self.db_session.commit()

    def get_active_session(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        session = self.db_session.query(Session).filter(
            Session.owner_id == current_user_id,
            Session.root_id == root_id,
            Session.completed.is_not(True),
            Session.deleted_at.is_(None),
        ).order_by(Session.created_at.asc()).first()
        return (serialize_session(session) if session else None), None, 200

    def _active_session_conflict(self, root_id, current_user_id, *, exclude_session_id=None):
        query = self.db_session.query(Session).filter(
            Session.owner_id == current_user_id,
            Session.root_id == root_id,
            Session.completed.is_not(True),
            Session.deleted_at.is_(None),
        )
        if exclude_session_id:
            query = query.filter(Session.id != exclude_session_id)
        active = query.order_by(Session.created_at.asc()).first()
        if not active:
            return None
        return {
            'error': 'A session is already in progress',
            'code': 'active_session_exists',
            'active_session': serialize_session(active),
        }
