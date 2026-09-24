import logging
import time

from sqlalchemy.exc import IntegrityError

import models
from models import (
    AnalyticsQueryProfile,
    Goal,
)
from services.analytics_query_cache import build_cache_key, get_cached_result, set_cached_result
from services.serializers import format_utc
from services.service_types import JsonDict, ServiceResult
from services._analytics_catalog import QUERY_SPEC_VERSION, SLOW_QUERY_MS
from services._analytics_datasets import DATASETS
from services._analytics_datasets import (  # noqa: F401 - re-exported for existing imports
    build_scoped_dataset_query,
    get_analytics_dataset,
)
from services._analytics_execution import _AnalyticsExecutionMixin
from services._analytics_query_spec import _AnalyticsQuerySpecMixin


logger = logging.getLogger(__name__)


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


class AnalyticsEngineService(_AnalyticsQuerySpecMixin, _AnalyticsExecutionMixin):
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
