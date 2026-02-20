from .base import (
    Base, JSON_TYPE, utc_now, format_utc, _safe_load_json,
    get_engine, reset_engine, init_db, get_scoped_session, remove_session, get_session
)
from .user import User
from .goal import (
    GoalLevel, Goal, TargetTemplate, Target, TargetMetricCondition, TargetContributionLedger,
    session_goals, activity_goal_associations, goal_activity_group_associations,
    session_template_goals, program_day_goals,
    get_all_root_goals, get_goal_by_id, get_root_id_for_goal, 
    validate_root_goal, delete_goal_recursive
)
from .activity import (
    ActivityGroup, ActivityDefinition, MetricDefinition, 
    SplitDefinition, ActivityInstance, MetricValue
)
from .session import (
    Session, SessionTemplate, get_session_by_id, get_all_sessions,
    get_sessions_for_root, get_immediate_goals_for_session, delete_session
)
from .program import (
    Program, ProgramBlock, ProgramDay, ProgramDaySession,
    program_day_templates, program_goals, program_block_goals
)
from .common import Note, VisualizationAnnotation, EventLog

# Legacy ALIASES for backward compatibility (Optional)
PracticeSession = Session
def get_practice_session_by_id(db_session, session_id):
    return get_session_by_id(db_session, session_id)
def get_all_practice_sessions(db_session):
    return get_all_sessions(db_session)
def delete_practice_session(db_session, session_id):
    return delete_session(db_session, session_id)
