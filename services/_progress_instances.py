"""Mixin for ProgressService: selecting comparable activity instances.

Tag filters, inclusion rules, effective time ordering, and predecessor lookup.
"""

from typing import Any, Optional
from sqlalchemy import and_, func, not_, or_, true, select, tuple_
from sqlalchemy.orm import joinedload, selectinload
from models import ActivityDefinition, ActivityInstance, ActivitySet, ActivityTag, Session
from services.activity_instance_data import load_instance_sets


class _ProgressInstancesMixin:
    db: Any
    @staticmethod
    def _matches_tag_config(tag_ids, config) -> bool:
        present = set(tag_ids or [])
        required = set(config.get('all_tag_ids') or [])
        alternatives = set(config.get('any_tag_ids') or [])
        excluded = set(config.get('none_tag_ids') or [])
        return required.issubset(present) and (not alternatives or bool(present & alternatives)) and not bool(present & excluded)

    @staticmethod
    def _instance_tag_ids(instance) -> set[str]:
        return {tag.id for tag in (getattr(instance, 'tags', None) or [])}

    def _sets_for_instance(self, instance: ActivityInstance) -> list:
        serialized = [
            {**payload, '_progress_set_index': index}
            for index, payload in enumerate(load_instance_sets(instance))
        ]
        config = self._calculation_config
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return serialized
        inherited = self._instance_tag_ids(instance)
        rows = list(getattr(instance, 'sets', None) or [])
        filtered = []
        for index, payload in enumerate(serialized):
            row = rows[index] if index < len(rows) else None
            direct = {tag.id for tag in (getattr(row, 'tags', None) or [])}
            if self._matches_tag_config(inherited | direct, config):
                filtered.append(payload)
        return filtered

    def _instance_included(self, instance: ActivityInstance) -> bool:
        config = self._calculation_config
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return True
        if getattr(instance.definition, 'has_sets', False) or getattr(instance, 'sets', None):
            return bool(self._sets_for_instance(instance))
        return self._matches_tag_config(self._instance_tag_ids(instance), config)

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
            )
            .join(Session, ActivityInstance.session_id == Session.id)
            .filter(ActivityInstance.deleted_at.is_(None), Session.deleted_at.is_(None))
        )

    @staticmethod
    def _tag_membership_clause(tag_id, *, include_set_tags):
        inherited = ActivityInstance.tags.any(ActivityTag.id == tag_id)
        if not include_set_tags:
            return inherited
        direct = ActivitySet.tags.any(ActivityTag.id == tag_id)
        return or_(inherited, direct)

    def _included_instance_clause(self, activity_def, config):
        """Return the SQL predicate matching the in-memory tag semantics."""
        if not any(config.get(key) for key in ('all_tag_ids', 'any_tag_ids', 'none_tag_ids')):
            return true()

        if activity_def.has_sets:
            set_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('all_tag_ids') or []
            ]
            any_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('any_tag_ids') or []
            ]
            none_clauses = [
                self._tag_membership_clause(tag_id, include_set_tags=True)
                for tag_id in config.get('none_tag_ids') or []
            ]
            if any_clauses:
                set_clauses.append(or_(*any_clauses))
            if none_clauses:
                set_clauses.append(not_(or_(*none_clauses)))
            return ActivityInstance.sets.any(and_(*set_clauses))

        clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('all_tag_ids') or []
        ]
        any_clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('any_tag_ids') or []
        ]
        none_clauses = [
            self._tag_membership_clause(tag_id, include_set_tags=False)
            for tag_id in config.get('none_tag_ids') or []
        ]
        if any_clauses:
            clauses.append(or_(*any_clauses))
        if none_clauses:
            clauses.append(not_(or_(*none_clauses)))
        return and_(*clauses)

    def _load_predecessor_ids(self, instances, activities, configs, *, exclude_session_id=None):
        """Return at most one identity per requested instance, entirely in SQL.

        Completed predecessors win over incomplete ones; ties use the instance ID.
        Candidate history is never hydrated or transferred to Python.
        """
        scopes = [
            and_(ActivityInstance.activity_definition_id == activity_id,
                 ActivityInstance.root_id == activities[activity_id].root_id,
                 self._included_instance_clause(activities[activity_id], config))
            for activity_id, config in configs.items()
        ]
        if not instances or not scopes:
            return {}
        targets = self._active_instance_identity_query().filter(
            ActivityInstance.id.in_([instance.id for instance in instances]),
        ).add_columns(ActivityInstance.activity_definition_id).subquery('progress_targets')
        candidates = self._active_instance_identity_query().filter(or_(*scopes))
        if exclude_session_id:
            candidates = candidates.filter(ActivityInstance.session_id != exclude_session_id)
        candidates = candidates.add_columns(ActivityInstance.activity_definition_id).subquery('progress_candidates')
        earlier = select(candidates.c.id).where(
            candidates.c.activity_definition_id == targets.c.activity_definition_id,
            candidates.c.session_id != targets.c.session_id,
            tuple_(candidates.c.effective_time, candidates.c.id) < tuple_(targets.c.effective_time, targets.c.id),
        ).order_by(candidates.c.effective_time.desc(), candidates.c.id.desc()).correlate(targets)
        completed = earlier.where(candidates.c.completed.is_(True)).limit(1).scalar_subquery()
        fallback = earlier.limit(1).scalar_subquery()
        return dict(self.db.execute(select(
            targets.c.id, func.coalesce(completed, fallback).label('previous_id'),
        )).all())

    def _get_active_instance(self, activity_instance_id: str) -> Optional[ActivityInstance]:
        return (
            self._active_instances_query()
            .filter(ActivityInstance.id == activity_instance_id)
            .first()
        )
