"""Analytics catalog primitives: query limits, SQL safety patterns, and field/dataset types.

Datasets are assembled from model and table metadata with explicit tenant policies.
"""

import re
from dataclasses import dataclass
from typing import Any, Callable
from sqlalchemy import and_, or_
from sqlalchemy.sql.sqltypes import Boolean, Date, DateTime, Float, Integer, Numeric
from models import ActivityInstance, AnalyticsDashboard, AnalyticsQueryProfile, Goal, GoalLevel
from services.service_types import JsonDict


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
