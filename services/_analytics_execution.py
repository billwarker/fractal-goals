"""Mixin for AnalyticsEngineService: executing structured and sanitized SQL queries.

Builds filters and measures, runs queries with timeouts, and suggests charts.
"""

import re
from typing import Any
from contextlib import contextmanager
from datetime import date, datetime
from decimal import Decimal
from sqlalchemy import distinct, func
from sqlalchemy import text
from sqlalchemy.exc import DBAPIError
from config import config
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult
from services._analytics_datasets import CATALOG_RELATIONS, DATASETS, build_scoped_dataset_query
from services._analytics_catalog import QUERY_SPEC_VERSION, RAW_SQL_TIMEOUT_MS
from services._analytics_sql_guard import SqlGuardError, guard_analytics_sql


_ROLE_NAME_RE = re.compile(r"^[a-z_][a-z0-9_]{0,62}$")


class AnalyticsReadScopeError(RuntimeError):
    """The database refused to establish the read-only analytics scope."""


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


class _AnalyticsExecutionMixin:
    db_session: Any  # provided by the composed AnalyticsEngineService

    def _execute_query(self, current_user_id, root_ids, query_spec) -> ServiceResult[JsonDict]:
        dataset = DATASETS[query_spec["dataset"]]
        query = build_scoped_dataset_query(
            self.db_session, dataset.id, root_ids, current_user_id
        )
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
        if not self._is_postgresql():
            # Read-only enforcement relies on PostgreSQL transaction modes; fail closed elsewhere.
            return None, "Analytics SQL requires PostgreSQL", 503
        try:
            guarded = guard_analytics_sql(query_spec["sql"], CATALOG_RELATIONS)
        except SqlGuardError as error:
            return None, str(error), 400
        cte_sql = self._catalog_cte_sql(current_user_id, root_ids)
        limit = query_spec["limit"]
        final_sql = (
            f"{cte_sql} "
            "SELECT * FROM ("
            # Escape colons so text() never reads user literals such as 'HH24:MI' as bind params.
            f"{guarded.sql.replace(':', chr(92) + ':')}"
            f") AS __analytics_user_query LIMIT {limit + 1}"
        )

        with self._read_only_query_scope(RAW_SQL_TIMEOUT_MS, role=config.ANALYTICS_SQL_ROLE):
            try:
                result = self.db_session.execute(text(final_sql))
                rows = result.mappings().all()
                column_ids = list(result.keys())
            except DBAPIError as error:
                return None, _query_failure_message(error), 400
        truncated = len(rows) > limit
        rows = rows[:limit]
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

    def _is_postgresql(self) -> bool:
        bind = self.db_session.get_bind()
        return bind is not None and bind.dialect.name == "postgresql"

    @contextmanager
    def _read_only_query_scope(self, timeout_ms: int, *, role: str | None = None):
        """Run analytics reads inside a read-only, time-bounded savepoint.

        ``SET TRANSACTION READ ONLY`` inside a savepoint switches the current
        transaction to read-only; rolling the savepoint back afterwards restores the
        request's transaction mode, statement timeout, and role. The mode is read back
        rather than assumed, because setting ``default_transaction_read_only`` would
        only affect later transactions.
        """
        if not self._is_postgresql():
            yield
            return
        savepoint = self.db_session.begin_nested()
        try:
            self.db_session.execute(text("SET TRANSACTION READ ONLY"))
            self.db_session.execute(text("SET LOCAL statement_timeout = :timeout_ms"), {"timeout_ms": int(timeout_ms)})
            if role:
                if not _ROLE_NAME_RE.match(role):
                    raise AnalyticsReadScopeError("ANALYTICS_SQL_ROLE is not a valid role name")
                self.db_session.execute(text(f'SET LOCAL ROLE "{role}"'))
            if self.db_session.execute(text("SHOW transaction_read_only")).scalar() != "on":
                raise AnalyticsReadScopeError("Analytics read scope is not read-only")
            yield
        finally:
            savepoint.rollback()

    def _catalog_cte_sql(self, current_user_id, root_ids) -> str:
        bind = self.db_session.get_bind()
        ctes = []
        for dataset in DATASETS.values():
            columns = [field.expression.label(field_id) for field_id, field in dataset.fields.items()]
            query = build_scoped_dataset_query(
                self.db_session, dataset.id, root_ids, current_user_id
            ).with_entities(*columns)
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


def _query_failure_message(error: DBAPIError) -> str:
    """Describe a rejected user query without echoing driver internals or SQL text."""
    diag = getattr(error.orig, "diag", None)
    primary = getattr(diag, "message_primary", None) if diag is not None else None
    if getattr(error.orig, "pgcode", None) == "57014":
        return "Analytics SQL exceeded its time limit"
    return f"Analytics SQL failed: {primary}" if primary else "Analytics SQL failed"
