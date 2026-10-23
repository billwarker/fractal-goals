"""Mixin for ProgressService: selecting comparable activity instances.

An instance compares against the latest earlier instance of the same activity, from a
different session, whose own tags match its comparison context (its own tags by default,
chosen tags, or all history). Each group of identically tagged sets additionally compares
against the latest earlier instance in that context with sets carrying the same set tags.
"""

from typing import Any, Optional

from sqlalchemy import Integer, String, and_, column, exists, func, or_, select, tuple_, values
from sqlalchemy.orm import joinedload, selectinload

from models import ActivityDefinition, ActivityInstance, ActivitySet, Session
from services.activity_instance_data import load_instance_sets
from services.activity_tags import tag_signature

ALL_HISTORY = None


class _ProgressInstancesMixin:
    db: Any
    _sets_cache: dict

    @staticmethod
    def _own_signature(row) -> str:
        return tag_signature(tag.id for tag in (getattr(row, 'tags', None) or []))

    def _compare_signature(self, instance, *, mode=None, tag_ids=None):
        """The instance-tag signature candidates must match, or ALL_HISTORY."""
        mode = mode or instance.progress_compare_mode or 'same_tags'
        if mode == 'all':
            return ALL_HISTORY
        if mode == 'tags':
            chosen = tag_ids if tag_ids is not None else [tag.id for tag in instance.compare_tags or []]
            return tag_signature(chosen)
        return self._own_signature(instance)

    def _compare_criteria(self, instance, *, mode=None, tag_ids=None, same_template=None, same_program_day=None):
        """(tag signature, session template id, program day id) candidates must match; None means any."""
        session = getattr(instance, 'session', None)
        if same_template is None:
            same_template = bool(getattr(instance, 'progress_compare_same_template', False))
        if same_program_day is None:
            same_program_day = bool(getattr(instance, 'progress_compare_same_program_day', False))
        return (
            self._compare_signature(instance, mode=mode, tag_ids=tag_ids),
            getattr(session, 'template_id', None) if same_template else None,
            getattr(session, 'program_day_id', None) if same_program_day else None,
        )

    def _sets_for_instance(self, instance: ActivityInstance) -> list:
        """Serialized sets with their original index and own-tag signature."""
        cache = self._sets_cache
        cached = cache.get(instance.id)
        if cached is not None:
            return cached
        rows = list(getattr(instance, 'sets', None) or [])
        serialized = [
            {
                **payload,
                '_progress_set_index': index,
                '_tag_signature': self._own_signature(rows[index]) if index < len(rows) else '',
            }
            for index, payload in enumerate(load_instance_sets(instance))
        ]
        cache[instance.id] = serialized
        return serialized

    def _set_signatures(self, instance) -> list:
        return list(dict.fromkeys(item['_tag_signature'] for item in self._sets_for_instance(instance)))

    def _active_instances_query(self):
        return (
            self.db.query(ActivityInstance)
            .join(Session, ActivityInstance.session_id == Session.id)
            .options(
                joinedload(ActivityInstance.definition).selectinload(ActivityDefinition.metric_definitions),
                joinedload(ActivityInstance.session).joinedload(Session.template),
                selectinload(ActivityInstance.tags),
                selectinload(ActivityInstance.metric_values),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.tags),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.metric_values),
            )
            .filter(
                ActivityInstance.deleted_at == None,
                Session.deleted_at == None,
            )
        )

    @staticmethod
    def _effective_time_expression():
        return func.coalesce(
            ActivityInstance.time_stop,
            Session.session_start,
            ActivityInstance.created_at,
        )

    def _active_instance_identity_query(self):
        return (
            self.db.query(
                ActivityInstance.id,
                ActivityInstance.session_id,
                ActivityInstance.completed,
                self._effective_time_expression().label('effective_time'),
                Session.template_id.label('session_template_id'),
                Session.program_day_id.label('session_program_day_id'),
            )
            .join(Session, ActivityInstance.session_id == Session.id)
            .filter(ActivityInstance.deleted_at.is_(None), Session.deleted_at.is_(None))
        )

    def _load_predecessor_ids(self, requests, *, exclude_session_id=None) -> dict:
        """Resolve predecessors for request rows, entirely in SQL.

        Each row is (key, instance id, compare signature, set signature, template id,
        program day id). A None compare signature means all history; a None set signature
        asks for the instance-level predecessor; a None template or program day id means
        any session. One statement serves the whole batch. Completed
        predecessors win over incomplete ones; ties use the instance ID. Candidate history
        is never hydrated or transferred to Python.
        """
        if not requests:
            return {}
        request_rows = values(
            column('request_key', Integer),
            column('target_id', String),
            column('compare_signature', String),
            column('set_signature', String),
            column('scope_template_id', String),
            column('scope_program_day_id', String),
            name='progress_requests',
        ).data([tuple(request) for request in requests])
        targets = (
            self._active_instance_identity_query()
            .join(request_rows, request_rows.c.target_id == ActivityInstance.id)
            .add_columns(
                ActivityInstance.activity_definition_id,
                request_rows.c.request_key,
                request_rows.c.compare_signature,
                request_rows.c.set_signature,
                request_rows.c.scope_template_id,
                request_rows.c.scope_program_day_id,
            )
            .subquery('progress_targets')
        )
        candidates = self._active_instance_identity_query().add_columns(
            ActivityInstance.activity_definition_id,
            ActivityInstance.tag_signature,
        )
        if exclude_session_id:
            candidates = candidates.filter(ActivityInstance.session_id != exclude_session_id)
        candidates = candidates.subquery('progress_candidates')
        earlier = select(candidates.c.id).where(
            candidates.c.activity_definition_id == targets.c.activity_definition_id,
            candidates.c.session_id != targets.c.session_id,
            tuple_(candidates.c.effective_time, candidates.c.id) < tuple_(targets.c.effective_time, targets.c.id),
            or_(
                targets.c.compare_signature.is_(None),
                candidates.c.tag_signature == targets.c.compare_signature,
            ),
            or_(
                targets.c.scope_template_id.is_(None),
                candidates.c.session_template_id == targets.c.scope_template_id,
            ),
            or_(
                targets.c.scope_program_day_id.is_(None),
                candidates.c.session_program_day_id == targets.c.scope_program_day_id,
            ),
            or_(
                targets.c.set_signature.is_(None),
                # Correlate to the outer target and candidate rows, never re-select them.
                exists().where(and_(
                    ActivitySet.activity_instance_id == candidates.c.id,
                    ActivitySet.tag_signature == targets.c.set_signature,
                )).correlate_except(ActivitySet),
            ),
        ).order_by(candidates.c.effective_time.desc(), candidates.c.id.desc()).correlate(targets)
        completed = earlier.where(candidates.c.completed.is_(True)).limit(1).scalar_subquery()
        fallback = earlier.limit(1).scalar_subquery()
        return dict(self.db.execute(select(
            targets.c.request_key, func.coalesce(completed, fallback).label('previous_id'),
        )).all())

    def _get_active_instance(self, activity_instance_id: str) -> Optional[ActivityInstance]:
        return (
            self._active_instances_query()
            .filter(ActivityInstance.id == activity_instance_id)
            .first()
        )
