"""Mixin for AnalyticsEngineService: validating and normalizing structured and SQL query specs.
"""

from services.service_types import JsonDict
from services._analytics_catalog import (
    DANGEROUS_SQL_RE,
    DEFAULT_LIMIT,
    MAX_LIMIT,
    QUERY_SPEC_VERSION,
    RAW_SQL_MAX_LENGTH,
    READ_ONLY_SQL_RE,
    SCHEMA_BYPASS_RE,
)
from services._analytics_datasets import DATASETS


class _AnalyticsQuerySpecMixin:
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
