from .base import (
    Base, JSON_TYPE, utc_now, format_utc, _safe_load_json,
    get_engine, reset_engine, init_db, get_scoped_session, remove_session, get_session
)
from .user import User, SignupInviteKey, BetaSignupRequest, PasswordResetToken, EmailDeliveryEvent, EmailWebhookEvent, AdminAuditEvent
from .goal import (
    GoalLevel, Goal, GoalPauseInterval, TargetTemplate, Target, TargetMetricCondition, TargetContributionLedger,
    session_goals, activity_goal_associations, goal_activity_group_associations,
    session_template_goals, program_day_goals,
    get_all_root_goals, get_goal_by_id, get_root_id_for_goal, 
    validate_root_goal, delete_goal_recursive
)
from .activity import (
    ActivityGroup, ActivityDefinition, MetricDefinition, FractalMetricDefinition,
    SplitDefinition, ActivityInstance, ActivitySet, MetricValue,
    ActivityTagDefinition, ActivityTag, ActivityProgressView, ActivityInstanceTag, ActivitySetTag,
)
from .circuit import (
    CircuitDefinition, CircuitSlot, CircuitRun, CircuitRunSlot,
    CircuitRound, CircuitRoundMember, CircuitScopeTag, SessionWorkInterval,
)
from .session import (
    Session, SessionTemplate, SessionTemplateStats, TemplateSectionStats, ActivityDurationStats,
    get_session_by_id, get_all_sessions,
    get_sessions_for_root, get_immediate_goals_for_session, delete_session
)
from .program import (
    Program, ProgramBlock, ProgramDay, ProgramDayTemplate, ProgramDaySession,
    ProgramDayStatusOverride,
    program_day_templates, program_goals, program_block_goals
)
from .common import AnalyticsDashboard, AnalyticsQueryProfile, AppSetting, Note, EventLog, PageSurfaceLayout
from .product_event import ProductEvent

# Legacy ALIASES for backward compatibility (Optional)
PracticeSession = Session
