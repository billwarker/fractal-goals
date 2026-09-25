"""The governed analytics dataset registry and canonical scoped dataset queries.
"""

from sqlalchemy import case, func
import models
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityDurationStats,
    ActivityInstance,
    ActivitySet,
    AnalyticsDashboard,
    AnalyticsQueryProfile,
    CircuitDefinition,
    CircuitRound,
    CircuitRoundMember,
    CircuitRun,
    CircuitRunSlot,
    CircuitSlot,
    EventLog,
    FractalMetricDefinition,
    Goal,
    GoalLevel,
    GoalPauseInterval,
    MetricDefinition,
    MetricValue,
    Note,
    Program,
    ProgramBlock,
    ProgramDay,
    ProgramDaySession,
    Session,
    SessionWorkInterval,
    SessionTemplate,
    SessionTemplateStats,
    SplitDefinition,
    Target,
    TargetContributionLedger,
    TargetMetricCondition,
    TemplateSectionStats,
)
from services._analytics_catalog import (
    AnalyticsDataset,
    _dashboard_policy,
    _field,
    _goal_level_policy,
    _goal_policy,
    _merge_model_columns,
    _metric_value_policy,
    _model_dataset,
    _profile_policy,
    _root_policy,
    _table_dataset,
)


def _datasets() -> dict[str, AnalyticsDataset]:
    session_duration = func.coalesce(
        Session.total_duration_seconds,
        Session.duration_minutes * 60,
        0,
    )
    session_effective_at = func.coalesce(Session.session_start, Session.completed_at, Session.created_at)
    activity_effective_at = func.coalesce(
        ActivityInstance.time_stop,
        ActivityInstance.updated_at,
        ActivityInstance.created_at,
    )
    activity_completed_int = case((ActivityInstance.completed.is_(True), 1), else_=0)
    goal_completed_int = case((Goal.completed.is_(True), 1), else_=0)

    datasets = [
        AnalyticsDataset(
            id="sessions",
            label="Sessions",
            description="Practice/work sessions across all owned fractals.",
            base_model=Session,
            tenant_policy=_root_policy(Session.root_id),
            soft_delete_field=Session.deleted_at,
            default_sort=(("session_start", "desc"), ("created_at", "desc")),
            chart_families=("table", "line", "bar"),
            fields={
                "id": _field("id", "Session ID", "string", Session.id),
                "root_id": _field("root_id", "Fractal ID", "string", Session.root_id),
                "name": _field("name", "Name", "string", Session.name),
                "description": _field("description", "Description", "string", Session.description),
                "session_start": _field("session_start", "Started", "datetime", Session.session_start),
                "completed_at": _field("completed_at", "Completed At", "datetime", Session.completed_at),
                "created_at": _field("created_at", "Created", "datetime", Session.created_at),
                "effective_at": _field("effective_at", "Effective At", "datetime", session_effective_at),
                "completed": _field("completed", "Completed", "boolean", Session.completed),
                "attributes": _field("attributes", "Attributes", "json", Session.attributes, filterable=False, sortable=False),
                "duration_seconds": _field("duration_seconds", "Duration Seconds", "number", session_duration, aggs=("sum", "avg", "min", "max")),
            },
        ),
        AnalyticsDataset(
            id="goals",
            label="Goals",
            description="Goals owned by the current user.",
            base_model=Goal,
            tenant_policy=_goal_policy,
            soft_delete_field=Goal.deleted_at,
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "bar", "line"),
            fields={
                "id": _field("id", "Goal ID", "string", Goal.id),
                "root_id": _field("root_id", "Fractal ID", "string", Goal.root_id),
                "parent_id": _field("parent_id", "Parent Goal ID", "string", Goal.parent_id),
                "level_id": _field("level_id", "Level ID", "string", Goal.level_id),
                "name": _field("name", "Name", "string", Goal.name),
                "deadline": _field("deadline", "Deadline", "datetime", Goal.deadline),
                "created_at": _field("created_at", "Created", "datetime", Goal.created_at),
                "completed_at": _field("completed_at", "Completed At", "datetime", Goal.completed_at),
                "completed": _field("completed", "Completed", "boolean", Goal.completed),
                "paused": _field("paused", "Paused", "boolean", Goal.paused),
                "completed_count": _field("completed_count", "Completed Count", "number", goal_completed_int, aggs=("sum",)),
            },
        ),
        AnalyticsDataset(
            id="activity_definitions",
            label="Activities",
            description="Activity definitions users can complete in sessions.",
            base_model=ActivityDefinition,
            tenant_policy=_root_policy(ActivityDefinition.root_id),
            soft_delete_field=ActivityDefinition.deleted_at,
            default_sort=(("name", "asc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Activity ID", "string", ActivityDefinition.id),
                "root_id": _field("root_id", "Fractal ID", "string", ActivityDefinition.root_id),
                "group_id": _field("group_id", "Group ID", "string", ActivityDefinition.group_id),
                "name": _field("name", "Name", "string", ActivityDefinition.name),
                "created_at": _field("created_at", "Created", "datetime", ActivityDefinition.created_at),
                "has_sets": _field("has_sets", "Has Sets", "boolean", ActivityDefinition.has_sets),
                "has_metrics": _field("has_metrics", "Has Metrics", "boolean", ActivityDefinition.has_metrics),
            },
        ),
        AnalyticsDataset(
            id="activity_instances",
            label="Completed Activity",
            description="Activity completions and timers recorded inside sessions.",
            base_model=ActivityInstance,
            tenant_policy=_root_policy(ActivityInstance.root_id),
            soft_delete_field=ActivityInstance.deleted_at,
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "bar"),
            fields={
                "id": _field("id", "Instance ID", "string", ActivityInstance.id),
                "root_id": _field("root_id", "Fractal ID", "string", ActivityInstance.root_id),
                "session_id": _field("session_id", "Session ID", "string", ActivityInstance.session_id),
                "activity_definition_id": _field("activity_definition_id", "Activity ID", "string", ActivityInstance.activity_definition_id),
                "created_at": _field("created_at", "Created", "datetime", ActivityInstance.created_at),
                "time_start": _field("time_start", "Started", "datetime", ActivityInstance.time_start),
                "time_stop": _field("time_stop", "Stopped", "datetime", ActivityInstance.time_stop),
                "effective_at": _field("effective_at", "Effective At", "datetime", activity_effective_at),
                "completed": _field("completed", "Completed", "boolean", ActivityInstance.completed),
                "duration_seconds": _field("duration_seconds", "Duration Seconds", "number", func.coalesce(ActivityInstance.duration_seconds, 0), aggs=("sum", "avg", "min", "max")),
                "completed_count": _field("completed_count", "Completed Count", "number", activity_completed_int, aggs=("sum",)),
            },
        ),
        AnalyticsDataset(
            id="metric_values",
            label="Metric Values",
            description="Metric measurements captured on activity instances.",
            base_model=MetricValue,
            joins=((ActivityInstance, MetricValue.activity_instance_id == ActivityInstance.id), (MetricDefinition, MetricValue.metric_definition_id == MetricDefinition.id)),
            tenant_policy=_metric_value_policy,
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "scatter", "bar"),
            fields={
                "id": _field("id", "Metric Value ID", "string", MetricValue.id),
                "activity_instance_id": _field("activity_instance_id", "Instance ID", "string", MetricValue.activity_instance_id),
                "activity_definition_id": _field("activity_definition_id", "Activity ID", "string", ActivityInstance.activity_definition_id),
                "metric_definition_id": _field("metric_definition_id", "Metric ID", "string", MetricValue.metric_definition_id),
                "metric_name": _field("metric_name", "Metric Name", "string", MetricDefinition.name),
                "unit": _field("unit", "Unit", "string", MetricDefinition.unit),
                "created_at": _field("created_at", "Created", "datetime", MetricValue.created_at),
                "value": _field("value", "Value", "number", MetricValue.value, aggs=("sum", "avg", "min", "max")),
            },
        ),
        AnalyticsDataset(
            id="targets",
            label="Targets",
            description="Goal targets and completion state.",
            base_model=Target,
            tenant_policy=_root_policy(Target.root_id),
            soft_delete_field=Target.deleted_at,
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Target ID", "string", Target.id),
                "root_id": _field("root_id", "Fractal ID", "string", Target.root_id),
                "goal_id": _field("goal_id", "Goal ID", "string", Target.goal_id),
                "activity_id": _field("activity_id", "Activity ID", "string", Target.activity_id),
                "name": _field("name", "Name", "string", Target.name),
                "type": _field("type", "Type", "string", Target.type),
                "created_at": _field("created_at", "Created", "datetime", Target.created_at),
                "completed_at": _field("completed_at", "Completed At", "datetime", Target.completed_at),
                "completed": _field("completed", "Completed", "boolean", Target.completed),
            },
        ),
        AnalyticsDataset(
            id="notes",
            label="Notes",
            description="Notes attached to user-owned fractals and objects.",
            base_model=Note,
            tenant_policy=_root_policy(Note.root_id),
            soft_delete_field=Note.deleted_at,
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Note ID", "string", Note.id),
                "root_id": _field("root_id", "Fractal ID", "string", Note.root_id),
                "context_type": _field("context_type", "Context Type", "string", Note.context_type),
                "context_id": _field("context_id", "Context ID", "string", Note.context_id),
                "goal_id": _field("goal_id", "Goal ID", "string", Note.goal_id),
                "session_id": _field("session_id", "Session ID", "string", Note.session_id),
                "created_at": _field("created_at", "Created", "datetime", Note.created_at),
                "updated_at": _field("updated_at", "Updated", "datetime", Note.updated_at),
                "pinned_at": _field("pinned_at", "Pinned At", "datetime", Note.pinned_at),
            },
        ),
        AnalyticsDataset(
            id="programs",
            label="Programs",
            description="Programs across owned fractals.",
            base_model=Program,
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("start_date", "desc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Program ID", "string", Program.id),
                "root_id": _field("root_id", "Fractal ID", "string", Program.root_id),
                "name": _field("name", "Name", "string", Program.name),
                "start_date": _field("start_date", "Start Date", "datetime", Program.start_date),
                "end_date": _field("end_date", "End Date", "datetime", Program.end_date),
                "is_active": _field("is_active", "Active", "boolean", Program.is_active),
                "is_completed": _field("is_completed", "Completed", "boolean", Program.is_completed),
                "completion_percentage": _field("completion_percentage", "Completion %", "number", Program.completion_percentage, aggs=("avg", "min", "max")),
            },
        ),
        AnalyticsDataset(
            id="session_templates",
            label="Session Templates",
            description="Reusable session templates.",
            base_model=SessionTemplate,
            tenant_policy=_root_policy(SessionTemplate.root_id),
            soft_delete_field=SessionTemplate.deleted_at,
            default_sort=(("updated_at", "desc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Template ID", "string", SessionTemplate.id),
                "root_id": _field("root_id", "Fractal ID", "string", SessionTemplate.root_id),
                "name": _field("name", "Name", "string", SessionTemplate.name),
                "created_at": _field("created_at", "Created", "datetime", SessionTemplate.created_at),
                "updated_at": _field("updated_at", "Updated", "datetime", SessionTemplate.updated_at),
                "archived_at": _field("archived_at", "Archived At", "datetime", SessionTemplate.archived_at),
            },
        ),
        AnalyticsDataset(
            id="event_logs",
            label="Event Logs",
            description="Audit-style event log rows for owned fractals.",
            base_model=EventLog,
            tenant_policy=_root_policy(EventLog.root_id),
            default_sort=(("timestamp", "desc"),),
            chart_families=("table", "bar", "line"),
            fields={
                "id": _field("id", "Event ID", "string", EventLog.id),
                "root_id": _field("root_id", "Fractal ID", "string", EventLog.root_id),
                "event_type": _field("event_type", "Event Type", "string", EventLog.event_type),
                "entity_type": _field("entity_type", "Entity Type", "string", EventLog.entity_type),
                "entity_id": _field("entity_id", "Entity ID", "string", EventLog.entity_id),
                "timestamp": _field("timestamp", "Timestamp", "datetime", EventLog.timestamp),
            },
        ),
        AnalyticsDataset(
            id="analytics_dashboards",
            label="Analytics Dashboards",
            description="Saved dashboard layouts owned by the current user.",
            base_model=AnalyticsDashboard,
            tenant_policy=_dashboard_policy,
            soft_delete_field=AnalyticsDashboard.deleted_at,
            default_sort=(("updated_at", "desc"),),
            chart_families=("table",),
            fields={
                "id": _field("id", "View ID", "string", AnalyticsDashboard.id),
                "root_id": _field("root_id", "Fractal ID", "string", AnalyticsDashboard.root_id),
                "name": _field("name", "Name", "string", AnalyticsDashboard.name),
                "kind": _field("kind", "Kind", "string", AnalyticsDashboard.kind),
                "created_at": _field("created_at", "Created", "datetime", AnalyticsDashboard.created_at),
                "updated_at": _field("updated_at", "Updated", "datetime", AnalyticsDashboard.updated_at),
            },
        ),
        AnalyticsDataset(
            id="activity_groups",
            label="Activity Groups",
            description="Activity grouping hierarchy across owned fractals.",
            base_model=ActivityGroup,
            tenant_policy=_root_policy(ActivityGroup.root_id),
            soft_delete_field=ActivityGroup.deleted_at,
            default_sort=(("name", "asc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Group ID", "string", ActivityGroup.id),
                "root_id": _field("root_id", "Fractal ID", "string", ActivityGroup.root_id),
                "parent_id": _field("parent_id", "Parent Group ID", "string", ActivityGroup.parent_id),
                "name": _field("name", "Name", "string", ActivityGroup.name),
                "created_at": _field("created_at", "Created", "datetime", ActivityGroup.created_at),
            },
        ),
        AnalyticsDataset(
            id="goal_levels",
            label="Goal Levels",
            description="System, user, and root-specific goal levels visible to the user.",
            base_model=GoalLevel,
            tenant_policy=_goal_level_policy,
            soft_delete_field=GoalLevel.deleted_at,
            default_sort=(("rank", "asc"),),
            chart_families=("table", "bar"),
            fields={
                "id": _field("id", "Level ID", "string", GoalLevel.id),
                "root_id": _field("root_id", "Fractal ID", "string", GoalLevel.root_id),
                "owner_id": _field("owner_id", "Owner ID", "string", GoalLevel.owner_id),
                "name": _field("name", "Name", "string", GoalLevel.name),
                "rank": _field("rank", "Rank", "number", GoalLevel.rank, aggs=("avg", "min", "max")),
                "created_at": _field("created_at", "Created", "datetime", GoalLevel.created_at),
            },
        ),
    ]
    dataset_map = {dataset.id: _merge_model_columns(dataset) for dataset in datasets}

    generated_model_datasets = [
        _model_dataset(
            FractalMetricDefinition,
            tenant_policy=_root_policy(FractalMetricDefinition.root_id),
            soft_delete_field=FractalMetricDefinition.deleted_at,
            default_sort=(("name", "asc"),),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            SplitDefinition,
            tenant_policy=_root_policy(SplitDefinition.root_id),
            soft_delete_field=SplitDefinition.deleted_at,
            default_sort=(("order", "asc"),),
        ),
        _model_dataset(
            GoalPauseInterval,
            tenant_policy=_root_policy(GoalPauseInterval.root_id),
            default_sort=(("paused_at", "desc"),),
        ),
        _model_dataset(
            TargetMetricCondition,
            joins=((Target, TargetMetricCondition.target_id == Target.id),),
            tenant_policy=_root_policy(Target.root_id),
            default_sort=(("created_at", "desc"),),
        ),
        _model_dataset(
            TargetContributionLedger,
            joins=((Target, TargetContributionLedger.target_id == Target.id),),
            tenant_policy=_root_policy(Target.root_id),
            default_sort=(("created_at", "desc"),),
        ),
        _model_dataset(
            ProgramBlock,
            joins=((Program, ProgramBlock.program_id == Program.id),),
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("start_date", "desc"),),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            ProgramDay,
            joins=((ProgramBlock, ProgramDay.block_id == ProgramBlock.id), (Program, ProgramBlock.program_id == Program.id)),
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("date", "desc"), ("day_number", "asc")),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            ProgramDaySession,
            joins=(
                (ProgramDay, ProgramDaySession.program_day_id == ProgramDay.id),
                (ProgramBlock, ProgramDay.block_id == ProgramBlock.id),
                (Program, ProgramBlock.program_id == Program.id),
            ),
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("created_at", "desc"),),
        ),
        _model_dataset(
            SessionTemplateStats,
            tenant_policy=_root_policy(SessionTemplateStats.root_id),
            default_sort=(("updated_at", "desc"),),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            TemplateSectionStats,
            tenant_policy=_root_policy(TemplateSectionStats.root_id),
            default_sort=(("updated_at", "desc"),),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            ActivityDurationStats,
            tenant_policy=_root_policy(ActivityDurationStats.root_id),
            default_sort=(("updated_at", "desc"),),
            chart_families=("table", "bar"),
        ),
        _model_dataset(
            AnalyticsQueryProfile,
            tenant_policy=_profile_policy,
            soft_delete_field=AnalyticsQueryProfile.deleted_at,
            default_sort=(("updated_at", "desc"),),
        ),
        _model_dataset(
            CircuitDefinition,
            tenant_policy=_root_policy(CircuitDefinition.root_id),
            default_sort=(("updated_at", "desc"),),
            chart_families=("table", "bar", "line"),
        ),
        _model_dataset(
            CircuitSlot,
            joins=((CircuitDefinition, CircuitSlot.circuit_definition_id == CircuitDefinition.id),),
            tenant_policy=_root_policy(CircuitDefinition.root_id),
            default_sort=(("sort_order", "asc"),),
        ),
        _model_dataset(
            CircuitRun,
            tenant_policy=_root_policy(CircuitRun.root_id),
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "bar"),
        ),
        _model_dataset(
            CircuitRunSlot,
            joins=((CircuitRun, CircuitRunSlot.circuit_run_id == CircuitRun.id),),
            tenant_policy=_root_policy(CircuitRun.root_id),
            default_sort=(("sort_order", "asc"),),
        ),
        _model_dataset(
            CircuitRound,
            joins=((CircuitRun, CircuitRound.circuit_run_id == CircuitRun.id),),
            tenant_policy=_root_policy(CircuitRun.root_id),
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "bar"),
        ),
        _model_dataset(
            CircuitRoundMember,
            joins=(
                (CircuitRound, CircuitRoundMember.circuit_round_id == CircuitRound.id),
                (CircuitRun, CircuitRound.circuit_run_id == CircuitRun.id),
            ),
            tenant_policy=_root_policy(CircuitRun.root_id),
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "bar"),
        ),
        _model_dataset(
            ActivitySet,
            joins=((ActivityInstance, ActivitySet.activity_instance_id == ActivityInstance.id),),
            tenant_policy=_root_policy(ActivityInstance.root_id),
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "line", "bar"),
        ),
        _model_dataset(
            SessionWorkInterval,
            tenant_policy=_root_policy(SessionWorkInterval.root_id),
            default_sort=(("started_at", "desc"),),
            chart_families=("table", "line", "bar"),
        ),
    ]
    for dataset in generated_model_datasets:
        dataset_map.setdefault(dataset.id, dataset)

    generated_table_datasets = [
        _table_dataset(
            models.session_goals,
            joins=((Session, models.session_goals.c.session_id == Session.id),),
            tenant_policy=_root_policy(Session.root_id),
            soft_delete_field=models.session_goals.c.deleted_at,
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.activity_goal_associations,
            joins=((ActivityDefinition, models.activity_goal_associations.c.activity_id == ActivityDefinition.id),),
            tenant_policy=_root_policy(ActivityDefinition.root_id),
            soft_delete_field=models.activity_goal_associations.c.deleted_at,
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.goal_activity_group_associations,
            joins=((ActivityGroup, models.goal_activity_group_associations.c.activity_group_id == ActivityGroup.id),),
            tenant_policy=_root_policy(ActivityGroup.root_id),
            soft_delete_field=models.goal_activity_group_associations.c.deleted_at,
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.session_template_goals,
            joins=((SessionTemplate, models.session_template_goals.c.session_template_id == SessionTemplate.id),),
            tenant_policy=_root_policy(SessionTemplate.root_id),
            soft_delete_field=models.session_template_goals.c.deleted_at,
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.program_day_goals,
            joins=(
                (ProgramDay, models.program_day_goals.c.program_day_id == ProgramDay.id),
                (ProgramBlock, ProgramDay.block_id == ProgramBlock.id),
                (Program, ProgramBlock.program_id == Program.id),
            ),
            tenant_policy=_root_policy(Program.root_id),
            soft_delete_field=models.program_day_goals.c.deleted_at,
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.program_day_templates,
            joins=(
                (ProgramDay, models.program_day_templates.c.program_day_id == ProgramDay.id),
                (ProgramBlock, ProgramDay.block_id == ProgramBlock.id),
                (Program, ProgramBlock.program_id == Program.id),
            ),
            tenant_policy=_root_policy(Program.root_id),
        ),
        _table_dataset(
            models.program_goals,
            joins=((Program, models.program_goals.c.program_id == Program.id),),
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("created_at", "desc"),),
        ),
        _table_dataset(
            models.program_block_goals,
            joins=((ProgramBlock, models.program_block_goals.c.program_block_id == ProgramBlock.id), (Program, ProgramBlock.program_id == Program.id)),
            tenant_policy=_root_policy(Program.root_id),
            default_sort=(("created_at", "desc"),),
        ),
    ]
    for dataset in generated_table_datasets:
        dataset_map.setdefault(dataset.id, dataset)

    return dict(sorted(dataset_map.items()))


DATASETS = _datasets()


def get_analytics_dataset(dataset_id: str) -> AnalyticsDataset:
    """Return a governed dataset definition for internal analytics consumers."""
    return DATASETS[dataset_id]


def build_scoped_dataset_query(db_session, dataset_id: str, root_ids, current_user_id):
    """Build the canonical tenant- and soft-delete-scoped dataset query.

    Fixed product analytics such as Program Insights may add bounded filters
    and projections to this query without duplicating the analytics engine's
    ownership and deletion policies or going through the public query-spec API.
    """
    dataset = get_analytics_dataset(dataset_id)
    query = db_session.query().select_from(dataset.base_model)
    for model, on_clause in dataset.joins:
        query = query.join(model, on_clause)
    query = query.filter(dataset.tenant_policy(db_session, list(root_ids or []), current_user_id))
    if dataset.soft_delete_field is not None:
        query = query.filter(dataset.soft_delete_field.is_(None))
    return query
