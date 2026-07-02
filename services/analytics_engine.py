import logging
import re
import time
from dataclasses import dataclass, field
from datetime import date, datetime, timezone
from decimal import Decimal
from typing import Any, Callable

from sqlalchemy import and_, case, distinct, func, or_
from sqlalchemy.sql.sqltypes import Boolean, Date, DateTime, Float, Integer, Numeric
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

import models
from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityDurationStats,
    ActivityInstance,
    AnalyticsDashboard,
    AnalyticsQueryProfile,
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
    ProgressRecord,
    Session,
    SessionTemplate,
    SessionTemplateStats,
    SplitDefinition,
    Target,
    TargetContributionLedger,
    TargetMetricCondition,
    TemplateSectionStats,
)
from services.analytics_query_cache import build_cache_key, get_cached_result, set_cached_result
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult


logger = logging.getLogger(__name__)

QUERY_SPEC_VERSION = 1
DEFAULT_LIMIT = 500
MAX_LIMIT = 5000
SLOW_QUERY_MS = 1500
RAW_SQL_TIMEOUT_MS = 5000
RAW_SQL_MAX_LENGTH = 20000
READ_ONLY_SQL_RE = re.compile(r"^\s*(select|with)\b", re.IGNORECASE)
DANGEROUS_SQL_RE = re.compile(
    r"\b(insert|update|delete|truncate|alter|drop|create|grant|revoke|copy|vacuum|call|do|merge|refresh|reindex|cluster|listen|notify|set|reset|commit|rollback|savepoint)\b",
    re.IGNORECASE,
)
SCHEMA_BYPASS_RE = re.compile(r"\b(public|pg_catalog|information_schema)\s*\.", re.IGNORECASE)


@dataclass(frozen=True)
class AnalyticsField:
    id: str
    label: str
    type: str
    expression: Any
    filterable: bool = True
    sortable: bool = True
    aggregations: tuple[str, ...] = ()

    def to_catalog(self) -> JsonDict:
        return {
            "id": self.id,
            "label": self.label,
            "type": self.type,
            "filterable": self.filterable,
            "sortable": self.sortable,
            "aggregations": list(self.aggregations),
        }


@dataclass(frozen=True)
class AnalyticsDataset:
    id: str
    label: str
    description: str
    base_model: Any
    fields: dict[str, AnalyticsField]
    tenant_policy: Callable[[Any, list[str], str], Any]
    joins: tuple[tuple[Any, Any], ...] = ()
    soft_delete_field: Any | None = None
    default_sort: tuple[tuple[str, str], ...] = ()
    chart_families: tuple[str, ...] = ("table",)

    def to_catalog(self) -> JsonDict:
        return {
            "id": self.id,
            "label": self.label,
            "description": self.description,
            "fields": [field.to_catalog() for field in self.fields.values()],
            "default_sort": [{"field": field_id, "direction": direction} for field_id, direction in self.default_sort],
            "chart_families": list(self.chart_families),
        }


def _labelize(identifier: str) -> str:
    return identifier.replace("_", " ").title()


def _root_policy(column):
    return lambda _db, root_ids, _user_id: column.in_(root_ids)


def _goal_policy(_db, root_ids, user_id):
    return and_(Goal.owner_id == user_id, Goal.root_id.in_(root_ids))


def _goal_level_policy(_db, root_ids, user_id):
    return or_(
        GoalLevel.owner_id.is_(None),
        GoalLevel.owner_id == user_id,
        GoalLevel.root_id.in_(root_ids),
    )


def _dashboard_policy(_db, _root_ids, user_id):
    return AnalyticsDashboard.user_id == user_id


def _profile_policy(_db, _root_ids, user_id):
    return AnalyticsQueryProfile.user_id == user_id


def _metric_value_policy(_db, root_ids, _user_id):
    return ActivityInstance.root_id.in_(root_ids)


def _field(id, label, type, expression, *, aggs=(), filterable=True, sortable=True):
    return AnalyticsField(
        id=id,
        label=label,
        type=type,
        expression=expression,
        aggregations=tuple(aggs),
        filterable=filterable,
        sortable=sortable,
    )


def _infer_column_type(column) -> str:
    column_type = column.type
    if isinstance(column_type, Boolean):
        return "boolean"
    if isinstance(column_type, (Integer, Float, Numeric)):
        return "number"
    if isinstance(column_type, DateTime):
        return "datetime"
    if isinstance(column_type, Date):
        return "date"
    return "string"


def _column_aggs(field_type: str) -> tuple[str, ...]:
    if field_type == "number":
        return ("sum", "avg", "min", "max")
    return ()


def _column_field(column) -> AnalyticsField:
    field_type = _infer_column_type(column)
    return _field(
        column.name,
        _labelize(column.name),
        field_type,
        column,
        aggs=_column_aggs(field_type),
    )


def _model_fields(model, *, overrides=None) -> dict[str, AnalyticsField]:
    fields = {column.name: _column_field(getattr(model, column.name)) for column in model.__table__.columns}
    if overrides:
        fields.update(overrides)
    return fields


def _table_fields(table, *, overrides=None) -> dict[str, AnalyticsField]:
    fields = {column.name: _column_field(column) for column in table.columns}
    if overrides:
        fields.update(overrides)
    return fields


def _merge_model_columns(dataset: AnalyticsDataset) -> AnalyticsDataset:
    table = getattr(dataset.base_model, "__table__", None)
    if table is None:
        return dataset
    fields = dict(dataset.fields)
    for column in table.columns:
        if column.name not in fields:
            fields[column.name] = _column_field(getattr(dataset.base_model, column.name))
    return AnalyticsDataset(
        id=dataset.id,
        label=dataset.label,
        description=dataset.description,
        base_model=dataset.base_model,
        fields=fields,
        tenant_policy=dataset.tenant_policy,
        joins=dataset.joins,
        soft_delete_field=dataset.soft_delete_field,
        default_sort=dataset.default_sort,
        chart_families=dataset.chart_families,
    )


def _model_dataset(
    model,
    *,
    label=None,
    description=None,
    tenant_policy=None,
    joins=(),
    soft_delete_field=None,
    default_sort=(),
    chart_families=("table",),
    overrides=None,
):
    table_name = model.__tablename__
    return AnalyticsDataset(
        id=table_name,
        label=label or _labelize(table_name),
        description=description or f"Rows from the {table_name} database table.",
        base_model=model,
        tenant_policy=tenant_policy,
        joins=tuple(joins),
        soft_delete_field=soft_delete_field,
        default_sort=tuple(default_sort),
        chart_families=tuple(chart_families),
        fields=_model_fields(model, overrides=overrides),
    )


def _table_dataset(
    table,
    *,
    label=None,
    description=None,
    tenant_policy=None,
    joins=(),
    soft_delete_field=None,
    default_sort=(),
):
    return AnalyticsDataset(
        id=table.name,
        label=label or _labelize(table.name),
        description=description or f"Rows from the {table.name} database table.",
        base_model=table,
        tenant_policy=tenant_policy,
        joins=tuple(joins),
        soft_delete_field=soft_delete_field,
        default_sort=tuple(default_sort),
        fields=_table_fields(table),
    )


def _datasets() -> dict[str, AnalyticsDataset]:
    session_duration = func.coalesce(
        Session.total_duration_seconds,
        Session.duration_minutes * 60,
        0,
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
            ProgressRecord,
            tenant_policy=_root_policy(ProgressRecord.root_id),
            default_sort=(("created_at", "desc"),),
            chart_families=("table", "bar"),
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


def _json_value(value):
    if isinstance(value, (datetime, date)):
        return format_utc(value)
    if isinstance(value, Decimal):
        return float(value)
    return value


def _result_type(value) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, (int, float, Decimal)) and not isinstance(value, bool):
        return "number"
    if isinstance(value, datetime):
        return "datetime"
    if isinstance(value, date):
        return "date"
    return "string"


def serialize_query_profile(profile: AnalyticsQueryProfile) -> JsonDict:
    return {
        "id": profile.id,
        "user_id": profile.user_id,
        "name": profile.name,
        "description": profile.description,
        "query_spec": profile.query_spec,
        "visualization_spec": profile.visualization_spec,
        "spec_version": profile.spec_version,
        "created_at": format_utc(profile.created_at),
        "updated_at": format_utc(profile.updated_at),
    }


class AnalyticsEngineService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_catalog(self, current_user_id) -> ServiceResult[JsonDict]:
        root_ids = self._owned_root_ids(current_user_id)
        return {
            "version": QUERY_SPEC_VERSION,
            "scope": {
                "type": "user",
                "owned_root_count": len(root_ids),
            },
            "datasets": [dataset.to_catalog() for dataset in DATASETS.values()],
            "operators": ["eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "is_null", "not_null"],
            "aggregations": ["count", "sum", "avg", "min", "max"],
        }, None, 200

    def run_query(self, current_user_id, query_spec) -> ServiceResult[JsonDict]:
        normalized, error, status = self._normalize_query_spec(query_spec)
        if error:
            return None, error, status

        cache_key = build_cache_key(current_user_id, normalized)
        cached = get_cached_result(cache_key)
        if cached:
            return cached, None, 200

        root_ids = self._owned_root_ids(current_user_id)
        if not root_ids and normalized.get("mode") != "sql":
            empty = self._empty_result(normalized, cache_hit=False)
            set_cached_result(cache_key, empty)
            return empty, None, 200

        start = time.perf_counter()
        if normalized.get("mode") == "sql":
            payload, error, status = self._execute_sql_query(current_user_id, root_ids, normalized)
        else:
            payload, error, status = self._execute_query(current_user_id, root_ids, normalized)
        duration_ms = round((time.perf_counter() - start) * 1000, 2)
        if error:
            return None, error, status

        payload["metadata"]["duration_ms"] = duration_ms
        payload["metadata"]["cache_hit"] = False
        if duration_ms >= SLOW_QUERY_MS:
            logger.info(
                "analytics_query_slow user_id=%s dataset=%s duration_ms=%s row_count=%s",
                current_user_id,
                normalized.get("dataset") or "sql",
                duration_ms,
                payload["metadata"].get("row_count"),
            )
        set_cached_result(cache_key, payload)
        return payload, None, 200

    def list_profiles(self, current_user_id) -> ServiceResult[JsonDict]:
        profiles = self.db_session.query(AnalyticsQueryProfile).filter(
            AnalyticsQueryProfile.user_id == current_user_id,
            AnalyticsQueryProfile.deleted_at.is_(None),
        ).order_by(
            AnalyticsQueryProfile.updated_at.desc(),
            AnalyticsQueryProfile.created_at.desc(),
        ).all()
        return {"data": [serialize_query_profile(profile) for profile in profiles]}, None, 200

    def create_profile(self, current_user_id, data) -> ServiceResult[JsonDict]:
        normalized, error, status = self._normalize_query_spec(data["query_spec"])
        if error:
            return None, error, status
        existing = self._profile_by_name(current_user_id, data["name"])
        if existing:
            return None, "An analytics query profile with that name already exists", 409

        profile = AnalyticsQueryProfile(
            user_id=current_user_id,
            name=data["name"],
            description=data.get("description"),
            query_spec=normalized,
            visualization_spec=data.get("visualization_spec") or {},
            spec_version=normalized["version"],
        )
        self.db_session.add(profile)
        error = self._commit("An analytics query profile with that name already exists")
        if error:
            return None, error, 409
        return {"data": serialize_query_profile(profile), "message": "Analytics query profile created"}, None, 201

    def update_profile(self, profile_id, current_user_id, data) -> ServiceResult[JsonDict]:
        profile = self._profile_by_id(profile_id, current_user_id)
        if not profile:
            return None, "Analytics query profile not found", 404

        if "name" in data and data["name"] != profile.name:
            existing = self._profile_by_name(current_user_id, data["name"], exclude_id=profile.id)
            if existing:
                return None, "An analytics query profile with that name already exists", 409
            profile.name = data["name"]
        if "description" in data:
            profile.description = data.get("description")
        if "query_spec" in data:
            normalized, error, status = self._normalize_query_spec(data["query_spec"])
            if error:
                return None, error, status
            profile.query_spec = normalized
            profile.spec_version = normalized["version"]
        if "visualization_spec" in data:
            profile.visualization_spec = data.get("visualization_spec") or {}

        error = self._commit("An analytics query profile with that name already exists")
        if error:
            return None, error, 409
        return {"data": serialize_query_profile(profile), "message": "Analytics query profile updated"}, None, 200

    def delete_profile(self, profile_id, current_user_id) -> ServiceResult[JsonDict]:
        profile = self._profile_by_id(profile_id, current_user_id)
        if not profile:
            return None, "Analytics query profile not found", 404
        profile.deleted_at = models.utc_now()
        self.db_session.commit()
        return {"message": "Analytics query profile deleted"}, None, 200

    def _owned_root_ids(self, current_user_id) -> list[str]:
        rows = self.db_session.query(Goal.id).filter(
            Goal.owner_id == current_user_id,
            Goal.parent_id.is_(None),
            Goal.deleted_at.is_(None),
        ).all()
        return [row[0] for row in rows]

    def _profile_by_id(self, profile_id, current_user_id):
        return self.db_session.query(AnalyticsQueryProfile).filter(
            AnalyticsQueryProfile.id == profile_id,
            AnalyticsQueryProfile.user_id == current_user_id,
            AnalyticsQueryProfile.deleted_at.is_(None),
        ).first()

    def _profile_by_name(self, current_user_id, name, *, exclude_id=None):
        query = self.db_session.query(AnalyticsQueryProfile).filter(
            AnalyticsQueryProfile.user_id == current_user_id,
            AnalyticsQueryProfile.name == name,
            AnalyticsQueryProfile.deleted_at.is_(None),
        )
        if exclude_id:
            query = query.filter(AnalyticsQueryProfile.id != exclude_id)
        return query.first()

    def _commit(self, conflict_message):
        try:
            self.db_session.commit()
            return None
        except IntegrityError:
            self.db_session.rollback()
            return conflict_message

    def _normalize_query_spec(self, query_spec) -> tuple[JsonDict | None, str | None, int]:
        if not isinstance(query_spec, dict):
            return None, "query_spec must be an object", 400
        version = query_spec.get("version", QUERY_SPEC_VERSION)
        if version != QUERY_SPEC_VERSION:
            return None, f"Unsupported analytics query spec version: {version}", 400

        if query_spec.get("mode") == "sql":
            return self._normalize_sql_query_spec(query_spec)

        dataset_id = query_spec.get("dataset")
        dataset = DATASETS.get(dataset_id)
        if not dataset:
            return None, "Unknown analytics dataset", 400

        dimensions = self._normalize_field_list(query_spec.get("dimensions") or [], dataset, require_sortable=False)
        if dimensions is None:
            return None, "dimensions must reference known dataset fields", 400

        raw_measures = query_spec.get("measures") or []
        measures = []
        if not isinstance(raw_measures, list):
            return None, "measures must be a list", 400
        for raw_measure in raw_measures:
            if not isinstance(raw_measure, dict):
                return None, "each measure must be an object", 400
            field_id = raw_measure.get("field")
            aggregation = raw_measure.get("aggregation") or "count"
            field = dataset.fields.get(field_id) if field_id else None
            if aggregation == "count" and field_id in (None, "*"):
                measures.append({
                    "field": "*",
                    "aggregation": "count",
                    "alias": raw_measure.get("alias") or "count",
                    "distinct": False,
                })
                continue
            if aggregation == "count" and field:
                is_distinct = bool(raw_measure.get("distinct"))
                alias = raw_measure.get("alias") or ("count_distinct_" if is_distinct else "count_") + field_id
                measures.append({
                    "field": field_id,
                    "aggregation": "count",
                    "alias": alias,
                    "distinct": is_distinct,
                })
                continue
            if not field or aggregation not in field.aggregations:
                return None, "measure uses an unsupported field or aggregation", 400
            measures.append({
                "field": field_id,
                "aggregation": aggregation,
                "alias": raw_measure.get("alias") or f"{aggregation}_{field_id}",
                "distinct": False,
            })

        raw_filters = query_spec.get("filters") or []
        if not isinstance(raw_filters, list):
            return None, "filters must be a list", 400
        filters = []
        for raw_filter in raw_filters:
            if not isinstance(raw_filter, dict):
                return None, "each filter must be an object", 400
            field_id = raw_filter.get("field")
            operator = raw_filter.get("operator")
            field = dataset.fields.get(field_id)
            if not field or not field.filterable:
                return None, "filter uses an unsupported field", 400
            if operator not in {"eq", "neq", "contains", "in", "gt", "gte", "lt", "lte", "is_null", "not_null"}:
                return None, "filter uses an unsupported operator", 400
            filters.append({"field": field_id, "operator": operator, "value": raw_filter.get("value")})

        raw_sort = query_spec.get("sort")
        if raw_sort is None and not measures:
            raw_sort = [{"field": field_id, "direction": direction} for field_id, direction in dataset.default_sort]
        elif raw_sort is None:
            raw_sort = []
        if not isinstance(raw_sort, list):
            return None, "sort must be a list", 400
        sort = []
        for raw_sort_item in raw_sort:
            if not isinstance(raw_sort_item, dict):
                return None, "each sort item must be an object", 400
            field_id = raw_sort_item.get("field")
            field = dataset.fields.get(field_id)
            if not field or not field.sortable:
                return None, "sort uses an unsupported field", 400
            direction = str(raw_sort_item.get("direction") or "asc").lower()
            sort.append({"field": field_id, "direction": "desc" if direction == "desc" else "asc"})

        try:
            limit = int(query_spec.get("limit") or DEFAULT_LIMIT)
        except (TypeError, ValueError):
            limit = DEFAULT_LIMIT

        if not dimensions and not measures:
            fields = self._normalize_field_list(query_spec.get("fields") or ["id"], dataset, require_sortable=False)
            if fields is None:
                return None, "fields must reference known dataset fields", 400
        else:
            fields = []

        return {
            "version": QUERY_SPEC_VERSION,
            "dataset": dataset_id,
            "fields": fields,
            "dimensions": dimensions,
            "measures": measures,
            "filters": filters,
            "sort": sort,
            "limit": max(1, min(limit, MAX_LIMIT)),
        }, None, 200

    def _normalize_sql_query_spec(self, query_spec) -> tuple[JsonDict | None, str | None, int]:
        sql = query_spec.get("sql")
        if not isinstance(sql, str) or not sql.strip():
            return None, "sql must be a non-empty string", 400
        if len(sql) > RAW_SQL_MAX_LENGTH:
            return None, f"sql must be {RAW_SQL_MAX_LENGTH} characters or fewer", 400

        normalized_sql = sql.strip()
        if normalized_sql.endswith(";"):
            normalized_sql = normalized_sql[:-1].strip()
        if ";" in normalized_sql:
            return None, "Only one SQL statement can be executed at a time", 400
        if "--" in normalized_sql or "/*" in normalized_sql or "*/" in normalized_sql:
            return None, "SQL comments are not supported in analytics queries yet", 400
        if not READ_ONLY_SQL_RE.match(normalized_sql):
            return None, "Analytics SQL must start with SELECT or WITH", 400
        if DANGEROUS_SQL_RE.search(normalized_sql):
            return None, "Analytics SQL is read-only and cannot contain mutating statements", 400
        if SCHEMA_BYPASS_RE.search(normalized_sql):
            return None, "Use catalog table names without schema qualification", 400

        try:
            limit = int(query_spec.get("limit") or MAX_LIMIT)
        except (TypeError, ValueError):
            limit = MAX_LIMIT

        return {
            "version": QUERY_SPEC_VERSION,
            "mode": "sql",
            "sql": normalized_sql,
            "limit": max(1, min(limit, MAX_LIMIT)),
        }, None, 200

    def _normalize_field_list(self, raw_fields, dataset, *, require_sortable):
        if not isinstance(raw_fields, list):
            return None
        normalized = []
        for field_id in raw_fields:
            if not isinstance(field_id, str):
                return None
            field = dataset.fields.get(field_id)
            if not field or (require_sortable and not field.sortable):
                return None
            if field_id not in normalized:
                normalized.append(field_id)
        return normalized

    def _execute_query(self, current_user_id, root_ids, query_spec) -> ServiceResult[JsonDict]:
        dataset = DATASETS[query_spec["dataset"]]
        query = self.db_session.query().select_from(dataset.base_model)
        for model, on_clause in dataset.joins:
            query = query.join(model, on_clause)
        query = query.filter(dataset.tenant_policy(self.db_session, root_ids, current_user_id))
        if dataset.soft_delete_field is not None:
            query = query.filter(dataset.soft_delete_field.is_(None))
        for filter_spec in query_spec["filters"]:
            query = query.filter(self._build_filter(dataset, filter_spec))

        columns = []
        select_expressions = []
        group_by = []

        if query_spec["measures"] or query_spec["dimensions"]:
            for field_id in query_spec["dimensions"]:
                field = dataset.fields[field_id]
                columns.append({"id": field_id, "label": field.label, "type": field.type, "role": "dimension"})
                select_expressions.append(field.expression.label(field_id))
                group_by.append(field.expression)
            for measure in query_spec["measures"] or [{"field": "*", "aggregation": "count", "alias": "count"}]:
                expression = self._measure_expression(dataset, measure)
                columns.append({"id": measure["alias"], "label": measure["alias"], "type": "number", "role": "measure"})
                select_expressions.append(expression.label(measure["alias"]))
            query = query.with_entities(*select_expressions)
            if group_by:
                query = query.group_by(*group_by)
        else:
            for field_id in query_spec["fields"]:
                field = dataset.fields[field_id]
                columns.append({"id": field_id, "label": field.label, "type": field.type, "role": "field"})
                select_expressions.append(field.expression.label(field_id))
            query = query.with_entities(*select_expressions)

        for sort_spec in query_spec["sort"]:
            sort_field = dataset.fields[sort_spec["field"]]
            direction = sort_field.expression.desc() if sort_spec["direction"] == "desc" else sort_field.expression.asc()
            query = query.order_by(direction)

        rows = query.limit(query_spec["limit"] + 1).all()
        truncated = len(rows) > query_spec["limit"]
        rows = rows[:query_spec["limit"]]
        row_dicts = [
            {column["id"]: _json_value(value) for column, value in zip(columns, tuple(row))}
            for row in rows
        ]

        return {
            "columns": columns,
            "rows": row_dicts,
            "chart_suggestions": self._chart_suggestions(columns, dataset),
            "metadata": {
                "dataset": dataset.id,
                "limit": query_spec["limit"],
                "row_count": len(row_dicts),
                "truncated": truncated,
                "spec_version": QUERY_SPEC_VERSION,
            },
        }, None, 200

    def _execute_sql_query(self, current_user_id, root_ids, query_spec) -> ServiceResult[JsonDict]:
        cte_sql = self._catalog_cte_sql(current_user_id, root_ids)
        limit = query_spec["limit"]
        final_sql = (
            f"{cte_sql} "
            "SELECT * FROM ("
            f"{query_spec['sql']}"
            f") AS __analytics_user_query LIMIT {limit + 1}"
        )

        bind = self.db_session.get_bind()
        if bind is not None and bind.dialect.name == "postgresql":
            self.db_session.execute(text("SET LOCAL statement_timeout = :timeout_ms"), {"timeout_ms": RAW_SQL_TIMEOUT_MS})

        result = self.db_session.execute(text(final_sql))
        rows = result.mappings().all()
        truncated = len(rows) > limit
        rows = rows[:limit]
        column_ids = list(result.keys())
        first_row = rows[0] if rows else {}
        columns = [
            {
                "id": column_id,
                "label": column_id,
                "type": _result_type(first_row.get(column_id)),
                "role": "field",
            }
            for column_id in column_ids
        ]
        row_dicts = [
            {column_id: _json_value(row.get(column_id)) for column_id in column_ids}
            for row in rows
        ]

        return {
            "columns": columns,
            "rows": row_dicts,
            "chart_suggestions": [{"type": "table", "label": "Table", "confidence": 1.0}],
            "metadata": {
                "dataset": "sql",
                "limit": limit,
                "row_count": len(row_dicts),
                "truncated": truncated,
                "spec_version": QUERY_SPEC_VERSION,
                "mode": "sql",
            },
        }, None, 200

    def _catalog_cte_sql(self, current_user_id, root_ids) -> str:
        bind = self.db_session.get_bind()
        ctes = []
        for dataset in DATASETS.values():
            columns = [field.expression.label(field_id) for field_id, field in dataset.fields.items()]
            query = self.db_session.query(*columns).select_from(dataset.base_model)
            for model, on_clause in dataset.joins:
                query = query.join(model, on_clause)
            query = query.filter(dataset.tenant_policy(self.db_session, root_ids, current_user_id))
            if dataset.soft_delete_field is not None:
                query = query.filter(dataset.soft_delete_field.is_(None))
            sql = str(query.statement.compile(bind=bind, compile_kwargs={"literal_binds": True}))
            ctes.append(f"{dataset.id} AS ({sql})")
        return "WITH " + ", ".join(ctes)

    def _build_filter(self, dataset, filter_spec):
        field = dataset.fields[filter_spec["field"]]
        value = filter_spec.get("value")
        operator = filter_spec["operator"]
        expression = field.expression
        if operator == "eq":
            return expression == value
        if operator == "neq":
            return expression != value
        if operator == "contains":
            return expression.ilike(f"%{value or ''}%")
        if operator == "in":
            values = value if isinstance(value, list) else []
            return expression.in_(values)
        if operator == "gt":
            return expression > value
        if operator == "gte":
            return expression >= value
        if operator == "lt":
            return expression < value
        if operator == "lte":
            return expression <= value
        if operator == "is_null":
            return expression.is_(None)
        return expression.is_not(None)

    def _measure_expression(self, dataset, measure):
        if measure["aggregation"] == "count":
            field_id = measure.get("field")
            if field_id in (None, "*"):
                return func.count()
            expression = dataset.fields[field_id].expression
            if measure.get("distinct"):
                return func.count(distinct(expression))
            return func.count(expression)
        expression = dataset.fields[measure["field"]].expression
        if measure["aggregation"] == "sum":
            return func.sum(expression)
        if measure["aggregation"] == "avg":
            return func.avg(expression)
        if measure["aggregation"] == "min":
            return func.min(expression)
        return func.max(expression)

    def _chart_suggestions(self, columns, dataset) -> list[JsonDict]:
        dimensions = [column for column in columns if column.get("role") == "dimension"]
        measures = [column for column in columns if column.get("role") == "measure"]
        suggestions = [{"type": "table", "label": "Table", "confidence": 1.0}]
        if dimensions and measures:
            first_dimension = dimensions[0]
            first_measure = measures[0]
            if first_dimension["type"] in {"datetime", "date"} and "line" in dataset.chart_families:
                suggestions.insert(0, {
                    "type": "line",
                    "label": f"{first_measure['label']} over time",
                    "x": first_dimension["id"],
                    "y": first_measure["id"],
                    "confidence": 0.92,
                })
            elif "bar" in dataset.chart_families:
                suggestions.insert(0, {
                    "type": "bar",
                    "label": f"{first_measure['label']} by {first_dimension['label']}",
                    "x": first_dimension["id"],
                    "y": first_measure["id"],
                    "confidence": 0.88,
                })
        numeric_columns = [column for column in columns if column["type"] == "number"]
        if len(numeric_columns) >= 2 and "scatter" in dataset.chart_families:
            suggestions.insert(0, {
                "type": "scatter",
                "label": f"{numeric_columns[1]['label']} vs {numeric_columns[0]['label']}",
                "x": numeric_columns[0]["id"],
                "y": numeric_columns[1]["id"],
                "confidence": 0.78,
            })
        return suggestions

    def _empty_result(self, query_spec, *, cache_hit):
        dataset = DATASETS[query_spec["dataset"]]
        return {
            "columns": [],
            "rows": [],
            "chart_suggestions": [{"type": "table", "label": "Table", "confidence": 1.0}],
            "metadata": {
                "dataset": dataset.id,
                "limit": query_spec["limit"],
                "row_count": 0,
                "truncated": False,
                "cache_hit": cache_hit,
                "spec_version": QUERY_SPEC_VERSION,
            },
        }
