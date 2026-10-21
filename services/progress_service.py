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
from sqlalchemy.orm import selectinload

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

    def _payloads(self, targets, *, signatures, contexts, exclude_session_id=None) -> dict:
        """Comparison payloads for hydrated targets, resolving every predecessor in one query."""
        requests = []
        request_keys = {}
        for target in targets:
            signature = signatures[target.id]
            for set_signature in [None, *self._set_signatures(target)]:
                request_keys[(target.id, set_signature)] = len(requests)
                requests.append((len(requests), target.id, signature, set_signature))
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
            signatures={target.id: self._compare_signature(target) for target in enabled},
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
            signatures={instance.id: self._compare_signature(instance)},
            contexts={instance.id: serialize_compare_context(instance)},
        )[instance.id]

    def get_progress_for_instance(self, activity_instance_id: str) -> Optional[dict]:
        """Calculate progress from canonical activity data in the instance's comparison context."""
        return self.compute_live_comparison(activity_instance_id)

    def _preview_context(self, root_id, mode, tag_ids):
        tags = []
        if mode == 'tags' and tag_ids:
            by_id = {
                tag.id: tag
                for tag in self.db.query(ActivityTagDefinition).filter(
                    ActivityTagDefinition.root_id == root_id,
                    ActivityTagDefinition.id.in_(tag_ids),
                ).all()
            }
            if set(by_id) != set(tag_ids):
                raise ValueError("One or more tags are unavailable")
            tags = [by_id[tag_id] for tag_id in tag_ids]
        return {"mode": mode, "tag_ids": [tag.id for tag in tags], "tags": serialize_tags(tags), "preview": True}

    def get_progress_timeline(
        self,
        activity_definition_id: str,
        root_id: str,
        *,
        instance_id: str | None = None,
        mode: str | None = None,
        tag_ids: list | None = None,
        limit: int = 20,
        offset: int = 0,
    ) -> dict:
        """Past instances in one comparison context, newest first.

        With ``instance_id`` the context is that instance's saved one (or the previewed
        ``mode``/``tag_ids``) and its own session is excluded; without it, all history
        (or the previewed mode) is listed.
        """
        from services.view_serializers import serialize_activity_history_entry

        activity = self.db.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return {"items": [], "total": 0, "total_all": 0}

        instance = None
        if instance_id:
            # Only the context is needed here: its tags, override, and session.
            instance = self.db.query(ActivityInstance).options(selectinload(ActivityInstance.tags)).filter(
                ActivityInstance.id == instance_id,
                ActivityInstance.activity_definition_id == activity.id,
                ActivityInstance.deleted_at.is_(None),
            ).first()
            if not instance:
                raise ValueError("Activity instance not found")
        if mode is not None:
            context = self._preview_context(root_id, mode, tag_ids or [])
            if mode == 'same_tags' and instance is not None:
                context = {**serialize_compare_context(instance), "mode": mode, "preview": True}
            signature = (
                ALL_HISTORY if mode == 'all'
                else self._own_signature(instance) if mode == 'same_tags' and instance is not None
                else tag_signature(context["tag_ids"])
            )
        elif instance is not None:
            context = serialize_compare_context(instance)
            signature = self._compare_signature(instance)
        else:
            context = {"mode": "all", "tag_ids": [], "tags": []}
            signature = ALL_HISTORY
        exclude_session_id = instance.session_id if instance else None

        base_identity_query = self._active_instance_identity_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        page_query = self._active_instances_query().filter(
            ActivityInstance.activity_definition_id == activity.id,
            ActivityInstance.root_id == root_id,
        )
        if exclude_session_id:
            base_identity_query = base_identity_query.filter(ActivityInstance.session_id != exclude_session_id)
            page_query = page_query.filter(ActivityInstance.session_id != exclude_session_id)
        total_all = base_identity_query.count()
        if signature is not ALL_HISTORY:
            base_identity_query = base_identity_query.filter(ActivityInstance.tag_signature == signature)
            page_query = page_query.filter(ActivityInstance.tag_signature == signature)
        total = base_identity_query.count() if signature is not ALL_HISTORY else total_all
        instances = (
            page_query
            .order_by(self._effective_time_expression().desc(), ActivityInstance.id.desc())
            .offset(offset)
            .limit(limit)
            .all()
        )
        comparisons = self._payloads(
            instances,
            signatures={row.id: signature for row in instances},
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
