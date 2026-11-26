"""What the canonical serializers return. A field added to a serializer is added here in the same change."""
from typing import Any, Literal, Optional

from pydantic import BaseModel, ConfigDict


class Payload(BaseModel):
    # Tests refuse an undescribed field; the published schema lets clients ignore ones they don't know.
    model_config = ConfigDict(extra='forbid', strict=True)


Json = dict[str, Any]


class Tag(Payload):
    id: str
    name: str
    color: Optional[str]
    family_id: Optional[str]
    sort_order: int
    archived: bool


class MetricValue(Payload):
    id: str
    name: str
    metric_definition_id: str
    metric_id: str
    value: Optional[float | int]
    unit: Optional[str]
    split_id: Optional[str]
    split_name: Optional[str]


class ActivitySet(Payload):
    id: str
    sort_order: int
    status: str
    completed: bool
    duration_seconds: Optional[int]
    notes: Optional[str]
    metrics: list[MetricValue]
    created_at: Optional[str]
    updated_at: Optional[str]
    tag_assignment_version: int
    tags: list[Tag]
    inherited_tags: list[Tag]
    effective_tags: list[Tag]


class ComparisonScope(Payload):
    id: str
    name: Optional[str]
    color: Optional[str] = None


class ComparisonContext(Payload):
    mode: str
    tag_ids: list[str]
    tags: list[Tag]
    same_template: bool
    same_program_day: bool
    template: Optional[ComparisonScope]
    program_day: Optional[ComparisonScope]
    remembered_for: Optional[str]
    version: int


class ActivityInstance(Payload):
    id: str
    session_id: Optional[str]
    activity_definition_id: str
    associated_goal_ids: list[str]
    name: str
    definition_name: str
    group_name: Optional[str]
    created_at: Optional[str]
    time_start: Optional[str]
    time_stop: Optional[str]
    duration_seconds: Optional[int]
    target_duration_seconds: Optional[int]
    is_paused: bool
    last_paused_at: Optional[str]
    total_paused_seconds: Optional[int]
    completed: bool
    notes: Optional[str]
    has_sets: bool
    has_metrics: bool
    sets: list[ActivitySet]
    data: Json
    metric_values: list[MetricValue]
    metrics: list[MetricValue]
    tags: list[Tag]
    tag_assignment_version: int
    comparison_context: ComparisonContext
    progress_comparison: Optional[Json]
    prescription: Optional[Json]


class MetricDefinition(Payload):
    id: str
    fractal_metric_id: Optional[str]
    name: str
    unit: Optional[str]
    is_active: bool
    is_best_set_metric: Optional[bool]
    is_multiplicative: Optional[bool]
    track_progress: Optional[bool]
    progress_aggregation: Optional[str]
    is_additive: Optional[bool]
    input_type: str
    precision: int
    default_value: Optional[float | int]
    higher_is_better: Optional[bool]
    default_progress_aggregation: Optional[str]
    predefined_values: Optional[list[float | int]]
    min_value: Optional[float | int]
    max_value: Optional[float | int]


class SplitDefinition(Payload):
    id: str
    name: str
    order: int


class GoalReference(Payload):
    id: str
    name: str
    type: Optional[str]


class Activity(Payload):
    id: str
    name: str
    description: Optional[str]
    group_id: Optional[str]
    has_sets: Optional[bool]
    has_metrics: Optional[bool]
    metrics_multiplicative: Optional[bool]
    has_splits: Optional[bool]
    track_progress: Optional[bool]
    progress_aggregation: Optional[str]
    delta_display_mode: Optional[str]
    created_at: Optional[str]
    metric_definitions: list[MetricDefinition]
    split_definitions: list[SplitDefinition]
    associated_goal_ids: list[str]
    associated_goals: list[GoalReference]


class ActivityGroup(Payload):
    id: str
    root_id: str
    name: str
    description: Optional[str]
    sort_order: Optional[int]
    parent_id: Optional[str]
    created_at: Optional[str]
    associated_goal_ids: list[str]


class ConditionRule(Payload):
    id: str
    metric_definition_id: str
    metric_name: Optional[str]
    unit: Optional[str]
    operator: str
    value: float | int


class GoalCondition(Payload):
    id: str
    activity_definition_id: str
    activity_name: Optional[str]
    activity_has_sets: Optional[bool]
    name: Optional[str]
    kind: str
    measure: str
    min_sets: Optional[int]
    required_count: Optional[int]
    metric_definition_id: Optional[str]
    metric_name: Optional[str]
    metric_unit: Optional[str]
    operator: Optional[str]
    target_value: Optional[float | int]
    rules: list[ConditionRule]
    consecutive: bool
    set_aggregate: str
    tag_match: str
    tag_ids: list[str]
    tags: list[Tag]


class CompletionState(Payload):
    completed: bool
    completed_at: Optional[str]
    completed_session_id: Optional[str]
    source: Optional[str]
    reason: Optional[str]
    manually_uncompleted_at: Optional[str]
    note_dismissed_at: Optional[str]


class Review(Payload):
    cadence: Optional[Json]
    last_review_on: Optional[str]
    next_review_on: Optional[str]
    deferred_until: Optional[str]
    pauses: list[Json]
    status: str


class GoalAttributes(Payload):
    parent_id: Optional[str]
    root_id: Optional[str]
    owner_id: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    inherit_parent_activities: Optional[bool]
    track_activities: Optional[bool]
    associated_activity_ids: list[str]
    associated_activity_group_ids: list[str]
    progress_settings: Optional[Json]


class Attachment(Payload):
    model_config = ConfigDict(extra='allow')
    id: str


class Goal(Payload):
    id: str
    name: str
    type: Optional[str]
    level_id: Optional[str]
    level_name: Optional[str]
    completed: Optional[bool]
    completed_at: Optional[str]
    completed_session_id: Optional[str]
    completion_state: CompletionState
    completion_condition: Optional[str]
    condition: Optional[GoalCondition]
    is_smart: bool
    smart_status: dict[str, bool]
    paused: bool
    paused_at: Optional[str]
    pause_reason: Optional[str]
    description: Optional[str]
    deadline: Optional[str]
    started_at: Optional[str]
    sequence_track_id: Optional[str]
    sequence_position: Optional[int]
    attributes: GoalAttributes
    children: list['Goal']
    # Present only where they apply.
    attachments: Optional[list[Attachment]] = None
    sequence_begun_by: Optional[str] = None
    review: Optional[Review] = None
    review_cadence_value: Optional[int] = None
    review_cadence_unit: Optional[str] = None
    review_disabled: Optional[bool] = None
    review_deferred_until: Optional[str] = None


class SavedGoal(Goal):
    deadline_warnings: Optional[list[Any]] = None
    condition_pending_completion: Optional[bool] = None


class Note(Payload):
    id: str
    root_id: str
    context_type: str
    context_id: str
    session_id: Optional[str]
    activity_instance_id: Optional[str]
    activity_definition_id: Optional[str]
    set_index: Optional[int]
    activity_set_id: Optional[str]
    content: Optional[str]
    attachments: list[Attachment]
    note_kind: Optional[str]
    note_type: str
    note_type_label: str
    note_category: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    goal_id: Optional[str]
    agent_grant_id: Optional[str]
    agent_run_id: Optional[str]
    program_id: Optional[str]
    calendar_date: Optional[str]
    carry_forward: Optional[Literal['pending', 'delivered']]
    carried_into_instance_id: Optional[str]
    carried_into_session_id: Optional[str]
    review_data: Optional[Json]


class NoteDisplay(Note):
    """A note with where it was written, as note lists show it."""
    session_name: Optional[str] = None
    session_date: Optional[str] = None
    session_template_name: Optional[str] = None
    session_template_color: Optional[str] = None
    goal_name: Optional[str] = None
    goal_type: Optional[str] = None
    goal_is_smart: Optional[bool] = None
    goal_completed: Optional[bool] = None
    activity_definition_name: Optional[str] = None
    program_name: Optional[str] = None
    program_color: Optional[str] = None
    block_name: Optional[str] = None
    block_color: Optional[str] = None


class SessionTemplate(Payload):
    id: str
    name: str
    description: str
    root_id: Optional[str]
    template_data: Json
    template_color: Optional[str]
    revision: int
    archived_at: Optional[str]
    is_archived: bool
    is_used_in_active_program: bool
    is_effectively_active: bool
    created_at: Optional[str]
    updated_at: Optional[str]
    stats: Json
    goals: list[Goal]


class ProgramDayTemplate(SessionTemplate):
    is_required: bool
    order: int


class ProgramDaySession(Payload):
    id: str
    name: Optional[str]
    description: Optional[str]
    root_id: Optional[str]
    session_start: Optional[str]
    session_end: Optional[str]
    duration_minutes: Optional[int]
    total_duration_seconds: Optional[int]
    template_id: Optional[str]
    program_day_id: Optional[str]
    program_id: Optional[str]
    program_block_id: Optional[str]
    completed: Optional[bool]
    completed_at: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]


class ProgramDayActivityCondition(Payload):
    id: str
    activity_definition_id: str
    activity_name: Optional[str]
    activity_has_sets: bool
    activity_deleted: bool
    is_required: bool
    order: int
    tag_match: str
    tag_ids: list[str]
    tags: list[Tag]


class ProgramDay(Payload):
    id: str
    program_id: str
    day_number: Optional[int]
    name: Optional[str]
    notes: Optional[str]
    day_of_week: list[str]
    repeat_every_weeks: Optional[int]
    templates: list[ProgramDayTemplate]
    goal_ids: list[str]
    activity_conditions: list[ProgramDayActivityCondition]
    completion_min_templates: Optional[int]
    sessions: list[ProgramDaySession]
    excluded_dates: list[str]
    scheduled_dates: list[Optional[str]]


class ProgramBlock(Payload):
    id: str
    program_id: str
    name: str
    start_date: Optional[str]
    end_date: Optional[str]
    color: Optional[str]
    is_completed: Optional[bool]
    track_weeks: bool
    week_start_day: Optional[str | int]
    program_goal_ids: list[str]


class Program(Payload):
    id: str
    root_id: str
    name: str
    description: Optional[str]
    color: Optional[str]
    is_active: bool
    is_completed: Optional[bool]
    goals_completed: Optional[int]
    goals_total: Optional[int]
    completion_percentage: Optional[float | int]
    start_date: Optional[str]
    end_date: Optional[str]
    weekly_schedule: list[Any]
    blocks: list[ProgramBlock]
    days: list[ProgramDay]
    goal_ids: list[str]
    selected_goals: list[str]
    scope_seed_goal_ids: list[str]
    scope_goal_ids: list[str]
    created_at: Optional[str]
    updated_at: Optional[str]


class Session(Payload):
    id: str
    name: Optional[str]
    description: Optional[str]
    root_id: str
    session_start: Optional[str]
    session_end: Optional[str]
    duration_minutes: Optional[int]
    total_duration_seconds: Optional[int]
    is_paused: Optional[bool]
    last_paused_at: Optional[str]
    total_paused_seconds: Optional[int]
    template_id: Optional[str]
    program_day_id: Optional[str]
    program_id: Optional[str]
    program_block_id: Optional[str]
    program_session_plan_id: Optional[str]
    completed: Optional[bool]
    completed_at: Optional[str]
    created_at: Optional[str]
    updated_at: Optional[str]
    attributes: Json
    stats: Json
    activity_instances: list[ActivityInstance]
    notes: list[Note]
    session_type: Optional[str]
    template_color: Optional[str]
    session_goals: list[Goal]
    completed_goals: list[Goal]
    program_info: Optional[Json] = None


class User(Payload):
    id: str
    username: str
    email: str
    is_active: Optional[bool]
    role: str
    is_admin: bool
    preferences: Json
    must_change_password: bool
    membership_tier: str
    subscription_status: str
    paid_amount_cad_cents: Optional[int]
    storage_limit_bytes: Optional[int]
    last_login_at: Optional[str]
    legal_acceptance: Json
    legal_acceptance_required: bool
    erasure_requested_at: Optional[str]
    created_at: Optional[str]
