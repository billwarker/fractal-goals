"""
Progress Service

Computes progress comparisons on demand from canonical activity data.
Compares a completed activity instance against the most recent prior
completed instance of the same activity from a different session.
"""

import logging
from typing import Optional

from sqlalchemy import and_, func, or_

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityProgressView,
    ActivityTag,
    Note,
    Session,
)
from services.activity_progress_view_service import (
    ActivityProgressViewService,
    EMPTY_PROGRESS_VIEW_CONFIG,
    normalize_progress_view_config,
)
from services._progress_aggregation import _ProgressAggregationMixin
from services._progress_comparisons import _ProgressComparisonsMixin
from services._progress_config import _ProgressConfigMixin
from services._progress_instances import _ProgressInstancesMixin
from services._progress_sets import _ProgressSetsMixin

logger = logging.getLogger(__name__)


class ProgressService(
    _ProgressInstancesMixin,
    _ProgressConfigMixin,
    _ProgressSetsMixin,
    _ProgressAggregationMixin,
    _ProgressComparisonsMixin,
):
    def __init__(self, db_session):
        self.db = db_session
        self._calculation_config = dict(EMPTY_PROGRESS_VIEW_CONFIG)
        self._comparison_cache = {}
        self._root_settings_cache = {}

    # ------------------------------------------------------------------
    # Comparison logic
    # ------------------------------------------------------------------

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_comparisons_for_instances(self, instances, *, preloaded=False) -> dict:
        """Batch active-view comparisons for session and analytics read models."""
        target_ids = [instance.id for instance in instances if instance and instance.deleted_at is None]
        if not target_ids:
            return {}
        targets = [
            instance for instance in instances
            if instance.deleted_at is None and instance.session and instance.session.deleted_at is None
        ] if preloaded else self._active_instances_query().filter(ActivityInstance.id.in_(target_ids)).all()
        if not targets:
            return {}
        activities = {instance.definition.id: instance.definition for instance in targets if instance.definition}
        active_ids = {
            activity.active_progress_view_id
            for activity in activities.values()
            if activity.active_progress_view_id
        }
        active_views = {}
        if active_ids:
            active_views = {
                view.id: view
                for view in self.db.query(ActivityProgressView).filter(
                    ActivityProgressView.id.in_(active_ids),
                    ActivityProgressView.deleted_at.is_(None),
                ).all()
            }
        enabled_roots = {
            root_id: self._is_progress_enabled(root_id)
            for root_id in {activity.root_id for activity in activities.values()}
        }
        configs_by_activity = {}
        view_ids_by_activity = {}
        included_scope_clauses = []
        for activity in activities.values():
            if not enabled_roots.get(activity.root_id, True):
                continue
            view = active_views.get(activity.active_progress_view_id)
            config = normalize_progress_view_config(view.config if view else EMPTY_PROGRESS_VIEW_CONFIG)
            configs_by_activity[activity.id] = config
            view_ids_by_activity[activity.id] = view.id if view else None
            included_scope_clauses.append(
                and_(
                    ActivityInstance.activity_definition_id == activity.id,
                    ActivityInstance.root_id == activity.root_id,
                    self._included_instance_clause(activity, config),
                )
            )

        included_rows = []
        if included_scope_clauses:
            included_rows = (
                self._active_instance_identity_query()
                .filter(or_(*included_scope_clauses))
                .add_columns(ActivityInstance.activity_definition_id)
                .order_by(
                    ActivityInstance.activity_definition_id,
                    self._effective_time_expression().asc(),
                    ActivityInstance.id.asc(),
                )
                .all()
            )
        rows_by_activity = {}
        for row in included_rows:
            rows_by_activity.setdefault(row.activity_definition_id, []).append(row)

        predecessor_ids = {}
        included_ids = set()
        target_ids_by_activity = {}
        for target in targets:
            target_ids_by_activity.setdefault(target.activity_definition_id, []).append(target.id)
        for activity_id, rows in rows_by_activity.items():
            included_ids.update(row.id for row in rows)
            predecessor_ids.update(
                self._predecessor_ids_for_targets(rows, target_ids_by_activity.get(activity_id, []))
            )

        required_previous_ids = {instance_id for instance_id in predecessor_ids.values() if instance_id}
        previous_by_id = {}
        if required_previous_ids:
            previous_by_id = {
                instance.id: instance
                for instance in self._active_instances_query().filter(ActivityInstance.id.in_(required_previous_ids)).all()
            }

        results = {}
        for target in targets:
            activity = activities[target.activity_definition_id]
            config = configs_by_activity.get(activity.id)
            if config is None:
                continue
            previous_id = predecessor_ids.get(target.id) if target.id in included_ids else None
            results[target.id] = self._comparison_payload(
                target,
                activity,
                previous_by_id.get(previous_id),
                view_id=view_ids_by_activity.get(activity.id),
                config=config,
            )
        return {instance.id: results.get(instance.id) for instance in targets}

    def compute_live_comparison(self, activity_instance_id: str, *, view_id=None, config=None) -> Optional[dict]:
        """Compute a progress comparison without persisting it.

        Returns a comparison payload, or ``None`` when the instance is missing
        or progress is disabled for its fractal.
        """
        instance = self._get_active_instance(activity_instance_id)
        if not instance:
            return None

        if not self._is_progress_enabled(instance.root_id):
            return None

        activity_def = self.db.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id
        ).first()
        if not activity_def:
            return None

        resolved_config, config_error = self._resolve_calculation_config(
            instance,
            view_id=view_id,
            config=config,
        )
        if config_error:
            return None
        normalized = normalize_progress_view_config(resolved_config)
        selected_view_id = view_id if view_id is not None else activity_def.active_progress_view_id
        return self._activity_comparison_map(activity_def, normalized, selected_view_id).get(instance.id)

    def get_progress_for_instance(self, activity_instance_id: str) -> Optional[dict]:
        """Calculate progress from canonical activity data and the active saved view."""
        return self.compute_live_comparison(activity_instance_id)

    def get_progress_history(
        self,
        activity_definition_id: str,
        root_id: str,
        limit: int = 20,
        offset: int = 0,
        exclude_session_id: str | None = None,
        view_id: str | None = None,
        config: dict | None = None,
    ) -> list:
        """Return paginated progress history aligned to activity history cards."""
        timeline = self.get_progress_timeline(
            activity_definition_id,
            root_id,
            limit=limit,
            offset=offset,
            exclude_session_id=exclude_session_id,
            view_id=view_id,
            config=config,
        )
        return [
            item['progress_comparison']
            for item in timeline.get('items', [])
            if item.get('progress_comparison') is not None
        ]

    def get_progress_timeline(
        self,
        activity_definition_id: str,
        root_id: str,
        *,
        limit: int = 20,
        offset: int = 0,
        exclude_session_id: str | None = None,
        view_id: str | None = None,
        config: dict | None = None,
    ) -> dict:
        from services.activity_progress_view_service import serialize_activity_tag, serialize_progress_view
        from services.view_serializers import serialize_activity_history_entry

        activity = self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return {"items": [], "total": 0}

        if config is not None:
            resolved_config, config_error = ActivityProgressViewService(self.db)._validate_config_tags(activity, config)
        else:
            resolved_config, config_error = ActivityProgressViewService(self.db).resolve_config(
                activity,
                view_id=view_id,
            )
        if config_error:
            raise ValueError(config_error)
        normalized_config = normalize_progress_view_config(resolved_config)
        selected_view_id = view_id if view_id is not None else activity.active_progress_view_id
        base_identity_query = self._active_instance_identity_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            base_identity_query = base_identity_query.filter(ActivityInstance.session_id != exclude_session_id)

        total = base_identity_query.count()
        included_clause = self._included_instance_clause(activity, normalized_config)
        included_count = base_identity_query.filter(included_clause).count()
        included_rows = (
            base_identity_query
            .filter(included_clause)
            .order_by(self._effective_time_expression().asc(), ActivityInstance.id.asc())
            .all()
        )
        page_query = self._active_instances_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            page_query = page_query.filter(ActivityInstance.session_id != exclude_session_id)
        instances = (
            page_query
            .order_by(self._effective_time_expression().desc(), ActivityInstance.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        predecessor_ids = self._predecessor_ids_for_targets(included_rows, [instance.id for instance in instances])
        needed_previous_ids = {row_id for row_id in predecessor_ids.values() if row_id}
        previous_by_id = {}
        if needed_previous_ids:
            previous_by_id = {
                instance.id: instance
                for instance in self._active_instances_query().filter(ActivityInstance.id.in_(needed_previous_ids)).all()
            }

        comparison_map = {}
        self._calculation_config = normalized_config
        included_ids = {row.id for row in included_rows}
        for instance in instances:
            previous_id = predecessor_ids.get(instance.id) if instance.id in included_ids else None
            comparison_map[instance.id] = self._comparison_payload(
                instance,
                activity,
                previous_by_id.get(previous_id),
                view_id=selected_view_id,
                config=normalized_config,
            )
        notes = []
        instance_ids = [instance.id for instance in instances]
        if instance_ids:
            notes = self.db.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at.is_(None),
            ).order_by(Note.pinned_at.desc().nullslast(), Note.created_at.desc()).all()
        notes_by_instance = {}
        for note in notes:
            notes_by_instance.setdefault(note.activity_instance_id, []).append(note)
        items = []
        for instance in instances:
            comparison = comparison_map.get(instance.id)
            payload = serialize_activity_history_entry(instance, notes_by_instance.get(instance.id, []))
            payload["progress_comparison"] = comparison
            payload["included"] = comparison is not None and comparison.get("included", True)
            items.append(payload)

        from models import ActivityTagDefinition
        tags = self.db.query(ActivityTag).join(ActivityTagDefinition).filter(
            ActivityTag.activity_definition_id == activity.id,
        ).order_by(
            ActivityTagDefinition.deleted_at.asc(),
            ActivityTag.deleted_at.asc(),
            ActivityTagDefinition.sort_order,
            ActivityTagDefinition.name,
        ).all()
        views = self.db.query(ActivityProgressView).filter(
            ActivityProgressView.activity_definition_id == activity.id,
            ActivityProgressView.deleted_at.is_(None),
        ).order_by(ActivityProgressView.updated_at.desc()).all()
        return {
            "activity_definition_id": activity.id,
            "active_view_id": activity.active_progress_view_id,
            "selected_view_id": selected_view_id,
            "tags": [serialize_activity_tag(tag) for tag in tags],
            "views": [serialize_progress_view(view) for view in views],
            "items": items,
            "included_count": included_count,
            "total": total,
            "limit": limit,
            "offset": offset,
        }

    def get_progress_summary_for_session(self, session_id: str) -> list:
        """Return dynamic comparisons for completed instances in a session."""
        instances = (
            self._active_instances_query()
            .filter(
                ActivityInstance.session_id == session_id,
                ActivityInstance.completed == True,
            )
            .order_by(
                func.coalesce(ActivityInstance.time_stop, Session.session_start, ActivityInstance.created_at).desc(),
                ActivityInstance.id.desc(),
            )
            .all()
        )

        comparisons = self.compute_comparisons_for_instances(instances)
        return [comparisons[instance.id] for instance in instances if comparisons.get(instance.id) is not None]
