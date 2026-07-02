"""Module-level surface shared by the GoalService mixins (audit P1-7):
level-rank constants and the standalone module functions. Imported
explicitly by the mixins and re-exported from services.goal_service.
"""
import logging

from sqlalchemy import inspect

from models import GoalLevel, validate_root_goal
from services.service_types import JsonDict

logger = logging.getLogger(__name__)
_SESSION_GOALS_SUPPORTS_SOURCE = None

_TYPE_TO_LEVEL_NAME = {
    'UltimateGoal': 'Ultimate Goal',
    'LongTermGoal': 'Long Term Goal',
    'MidTermGoal': 'Mid Term Goal',
    'ShortTermGoal': 'Short Term Goal',
    'ImmediateGoal': 'Immediate Goal',
}

_DEFAULT_LEVEL_RANKS = {
    'Ultimate Goal': 0,
    'Long Term Goal': 1,
    'Mid Term Goal': 2,
    'Short Term Goal': 3,
    'Immediate Goal': 4,
}

def resolve_level_id(db_session, type_value) -> str | None:
    level_name = _TYPE_TO_LEVEL_NAME.get(type_value)
    if not level_name:
        return None

    level = db_session.query(GoalLevel).filter_by(
        name=level_name,
        owner_id=None,
        deleted_at=None,
    ).first()
    if not level:
        level = db_session.query(GoalLevel).filter_by(
            name=level_name,
            deleted_at=None,
        ).first()
    if not level and level_name in _DEFAULT_LEVEL_RANKS:
        level = GoalLevel(name=level_name, rank=_DEFAULT_LEVEL_RANKS[level_name])
        db_session.add(level)
        db_session.flush()
    return level.id if level else None


def session_goals_supports_source(db_session) -> bool:
    global _SESSION_GOALS_SUPPORTS_SOURCE
    if _SESSION_GOALS_SUPPORTS_SOURCE is None:
        cols = inspect(db_session.bind).get_columns('session_goals')
        _SESSION_GOALS_SUPPORTS_SOURCE = any(
            column.get('name') == 'association_source' for column in cols
        )
    return _SESSION_GOALS_SUPPORTS_SOURCE


def session_goal_insert_values(db_session, session_id, goal_id, goal_type, association_source) -> JsonDict:
    values = {
        'session_id': session_id,
        'goal_id': goal_id,
        'goal_type': goal_type,
    }
    if session_goals_supports_source(db_session):
        values['association_source'] = association_source
    return values


def authorize_goal_access(db_session, current_user_id, goal, root_id_hint=None) -> str | None:
    if not goal:
        return None

    authorized_root_id = root_id_hint or goal.root_id or goal.id
    root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user_id)
    if not root:
        return None
    if goal.root_id and goal.root_id != authorized_root_id:
        return None
    return authorized_root_id


