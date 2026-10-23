"""
Progress Service

Computes progress comparisons on demand from canonical activity data.
Each activity instance compares against the most recent earlier instance of the
same activity, from a different session, in its comparison context: past instances
with the same tags by default, or the tags or all history the user chose for it.
"""

import logging
from typing import Optional

from sqlalchemy import func
from sqlalchemy.orm import joinedload, selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivityTagDefinition,
    Note,
    Session,
)
from services.activity_tags import serialize_compare_context, serialize_tags, tag_signature
from services._progress_aggregation import _ProgressAggregationMixin
from services._progress_comparisons import _ProgressComparisonsMixin
from services._progress_config import _ProgressConfigMixin
from services._progress_instances import ALL_HISTORY, _ProgressInstancesMixin
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
        self._root_settings_cache = {}
        self._sets_cache = {}
        self._set_group_previous = {}

    # ------------------------------------------------------------------
    # Batch calculation
    # ------------------------------------------------------------------

    def _payloads(self, targets, *, criteria, contexts, exclude_session_id=None) -> dict:
        """Comparison payloads for hydrated targets, resolving every predecessor in one query.

        ``criteria`` maps each target id to (tag signature, template id, program day id).
        """
        requests = []
        request_keys = {}
        for target in targets:
            signature, template_id, program_day_id = criteria[target.id]
            for set_signature in [None, *self._set_signatures(target)]:
                request_keys[(target.id, set_signature)] = len(requests)
                requests.append((len(requests), target.id, signature, set_signature, template_id, program_day_id))
        previous_ids = self._load_predecessor_ids(requests, exclude_session_id=exclude_session_id)
        needed_ids = {previous_id for previous_id in previous_ids.values() if previous_id}
        previous_by_id = {
            instance.id: instance
            for instance in self._active_instances_query().filter(ActivityInstance.id.in_(needed_ids)).all()
        } if needed_ids else {}

        results = {}
        for target in targets:
            previous = previous_by_id.get(previous_ids.get(request_keys[(target.id, None)]))
            set_group_previous = {}
            for set_signature in self._set_signatures(target):
                group_previous = previous_by_id.get(previous_ids.get(request_keys[(target.id, set_signature)]))
                if group_previous is not None:
                    set_group_previous[set_signature] = group_previous
            results[target.id] = self._comparison_payload(
                target,
                target.definition,
                previous,
                set_group_previous=set_group_previous,
                context=contexts[target.id],
            )
        return results

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def compute_comparisons_for_instances(self, instances, *, preloaded=False) -> dict:
        """Batch comparisons, each in its instance's own context, for session and analytics reads."""
        target_ids = [instance.id for instance in instances if instance and instance.deleted_at is None]
        if not target_ids:
            return {}
        targets = [
            instance for instance in instances
            if instance.deleted_at is None and instance.session and instance.session.deleted_at is None
        ] if preloaded else self._active_instances_query().filter(ActivityInstance.id.in_(target_ids)).all()
        enabled = [
            target for target in targets
            if target.definition and self._is_progress_enabled(target.root_id)
        ]
        results = self._payloads(
            enabled,
            criteria={target.id: self._compare_criteria(target) for target in enabled},
            contexts={target.id: serialize_compare_context(target) for target in enabled},
        )
        return {instance.id: results.get(instance.id) for instance in targets}

    def compute_live_comparison(self, activity_instance_id: str) -> Optional[dict]:
        """Compute a progress comparison without persisting it.

        Returns a comparison payload, or ``None`` when the instance is missing
        or progress is disabled for its fractal.
        """
        instance = self._get_active_instance(activity_instance_id)
        if not instance or not instance.definition or not self._is_progress_enabled(str(instance.root_id)):
            return None
        return self._payloads(
            [instance],
            criteria={instance.id: self._compare_criteria(instance)},
            contexts={instance.id: serialize_compare_context(instance)},
        )[instance.id]

    def get_progress_for_instance(self, activity_instance_id: str) -> Optional[dict]:
        """Calculate progress from canonical activity data in the instance's comparison context."""
        return self.compute_live_comparison(activity_instance_id)

    def _preview_tags(self, root_id, tag_ids):
        if not tag_ids:
            return []
        by_id = {
            tag.id: tag
            for tag in self.db.query(ActivityTagDefinition).filter(
                ActivityTagDefinition.root_id == root_id,
                ActivityTagDefinition.id.in_(tag_ids),
            ).all()
        }
        if set(by_id) != set(tag_ids):
            raise ValueError("One or more tags are unavailable")
        return [by_id[tag_id] for tag_id in tag_ids]

    def _resolve_scope(self, activity, root_id, *, instance_id=None, mode=None, tag_ids=None,
                       same_template=None, same_program_day=None):
        """The instance, comparison context and (signature, template, program day) criteria.

        With ``instance_id`` the context is that instance's saved one, overridden by any
        previewed ``mode``/``tag_ids``/toggles; without it, all history (or the preview).
        """
        instance = None
        if instance_id:
            # Only the context is needed here: its tags, override, and session.
            instance = self.db.query(ActivityInstance).options(
                selectinload(ActivityInstance.tags),
                joinedload(ActivityInstance.session),
            ).filter(
                ActivityInstance.id == instance_id,
                ActivityInstance.activity_definition_id == activity.id,
                ActivityInstance.deleted_at.is_(None),
            ).first()
            if not instance:
                raise ValueError("Activity instance not found")
        context = serialize_compare_context(instance) if instance is not None else {
            "mode": "all", "tag_ids": [], "tags": [], "same_template": False, "same_program_day": False,
            "template": None, "program_day": None,
        }
        previewing = any(value is not None for value in (mode, same_template, same_program_day))
        if mode is not None:
            tags = (
                list(instance.tags or []) if mode == "same_tags" and instance is not None
                else self._preview_tags(root_id, tag_ids or []) if mode == "tags" else []
            )
            context = {**context, "mode": mode, "tag_ids": [tag.id for tag in tags], "tags": serialize_tags(tags)}
        if same_template is not None:
            context = {**context, "same_template": bool(same_template)}
        if same_program_day is not None:
            context = {**context, "same_program_day": bool(same_program_day)}
        if previewing:
            context = {**context, "preview": True}
        if instance is not None:
            criteria = self._compare_criteria(
                instance,
                mode=context["mode"],
                tag_ids=context["tag_ids"],
                same_template=context["same_template"],
                same_program_day=context["same_program_day"],
            )
        else:
            criteria = (ALL_HISTORY if context["mode"] == "all" else tag_signature(context["tag_ids"]), None, None)
        return instance, context, criteria

    def _scoped_queries(self, activity, root_id, criteria, exclude_session_id):
        """(identity query, hydrated query) over past instances matching the criteria."""
        signature, template_id, program_day_id = criteria
        identity_query = self._active_instance_identity_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        hydrated_query = self._active_instances_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        filters = []
        if exclude_session_id:
            filters.append(ActivityInstance.session_id != exclude_session_id)
        if signature is not ALL_HISTORY:
            filters.append(ActivityInstance.tag_signature == signature)
        if template_id is not None:
            filters.append(Session.template_id == template_id)
        if program_day_id is not None:
            filters.append(Session.program_day_id == program_day_id)
        return identity_query.filter(*filters), hydrated_query.filter(*filters)

    def _activity(self, activity_definition_id, root_id):
        return self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()

    def get_progress_timeline(
        self,
        activity_definition_id: str,
        root_id: str,
        *,
        instance_id: str | None = None,
        mode: str | None = None,
        tag_ids: list | None = None,
        same_template: bool | None = None,
        same_program_day: bool | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """Past instances in one comparison context, newest first; the instance's session is excluded."""
        from services.view_serializers import serialize_activity_history_entry

        activity = self._activity(activity_definition_id, root_id)
        if not activity:
            return {"items": [], "total": 0, "total_all": 0}
        instance, context, criteria = self._resolve_scope(
            activity, root_id, instance_id=instance_id, mode=mode, tag_ids=tag_ids,
            same_template=same_template, same_program_day=same_program_day,
        )
        exclude_session_id = instance.session_id if instance else None
        all_query, _ = self._scoped_queries(activity, root_id, (ALL_HISTORY, None, None), exclude_session_id)
        identity_query, page_query = self._scoped_queries(activity, root_id, criteria, exclude_session_id)
        total_all = all_query.count()
        total = identity_query.count() if criteria != (ALL_HISTORY, None, None) else total_all
        instances = (
            page_query
            .order_by(self._effective_time_expression().desc(), ActivityInstance.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        comparisons = self._payloads(
            instances,
            criteria={row.id: criteria for row in instances},
            contexts={row.id: context for row in instances},
            exclude_session_id=exclude_session_id,
        ) if self._is_progress_enabled(root_id) else {}

        notes_by_instance = {}
        instance_ids = [row.id for row in instances]
        if instance_ids:
            for note in self.db.query(Note).filter(
                Note.activity_instance_id.in_(instance_ids),
                Note.deleted_at.is_(None),
            ).order_by(Note.pinned_at.desc().nullslast(), Note.created_at.desc()).all():
                notes_by_instance.setdefault(note.activity_instance_id, []).append(note)
        items = []
        for row in instances:
            payload = serialize_activity_history_entry(row, notes_by_instance.get(row.id, []))
            payload["progress_comparison"] = comparisons.get(row.id)
            items.append(payload)
        return {
            "activity_definition_id": activity.id,
            "instance_id": instance.id if instance else None,
            "comparison_context": context,
            "items": items,
            "total": total,
            "total_all": total_all,
            "limit": limit,
            "offset": offset,
        }

    def get_progress_series(
        self,
        activity_definition_id: str,
        root_id: str,
        *,
        instance_id: str | None = None,
        mode: str | None = None,
        tag_ids: list | None = None,
        same_template: bool | None = None,
        same_program_day: bool | None = None,
        limit: int = 60,
    ) -> dict:
        """The scoped instances a compact chart plots (oldest first, the instance last) and what to plot."""
        from services.goal_condition_reads import GoalConditionReadService
        from services.progress_chart_spec import chart_spec
        from services.serializers import serialize_activity_instance_for_analytics

        activity = self._activity(activity_definition_id, root_id)
        if not activity:
            return {"instances": [], "chart": None, "activity_definition": None, "truncated": False}
        instance, context, criteria = self._resolve_scope(
            activity, root_id, instance_id=instance_id, mode=mode, tag_ids=tag_ids,
            same_template=same_template, same_program_day=same_program_day,
        )
        _, history_query = self._scoped_queries(
            activity, root_id, criteria, instance.session_id if instance else None,
        )
        newest_first = (
            history_query
            .order_by(self._effective_time_expression().desc(), ActivityInstance.id.desc())
            .limit(limit + 1)
            .all()
        )
        truncated = len(newest_first) > limit
        rows = list(reversed(newest_first[:limit]))
        if instance is not None:
            current = self._get_active_instance(instance.id)
            if current is not None:
                rows.append(current)

        def serialize(row):
            session = row.session
            return serialize_activity_instance_for_analytics(
                row,
                session_name=session.name if session else None,
                session_date=(session.session_start or session.created_at) if session else None,
                compact=True,
            )

        return {
            "activity_definition": GoalConditionReadService._activity_payload(activity),
            "comparison_context": context,
            "chart": chart_spec(self.db, activity, instance.session_id if instance else None),
            "instances": [serialize(row) for row in rows],
            "current_instance_id": instance.id if instance else None,
            "truncated": truncated,
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
