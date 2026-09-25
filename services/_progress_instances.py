"""Mixin for ProgressService: selecting comparable activity instances.

Tag filters, inclusion rules, effective time ordering, and predecessor lookup.
"""

from typing import Optional
from sqlalchemy import and_, func, not_, or_, true
from sqlalchemy.orm import joinedload, selectinload
from models import ActivityDefinition, ActivityInstance, ActivitySet, ActivityTag, Session
from services.activity_instance_data import load_instance_sets


class _ProgressInstancesMixin:
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

    @staticmethod
    def _predecessor_ids_for_targets(included_rows, target_ids):
        target_ids = set(target_ids)
        predecessors = {}
        prior_rows = []
        for row in included_rows:
            if row.id in target_ids:
                eligible = [candidate for candidate in prior_rows if candidate.session_id != row.session_id]
                previous = next((candidate for candidate in reversed(eligible) if candidate.completed), None)
                if previous is None and eligible:
                    previous = eligible[-1]
                predecessors[row.id] = previous.id if previous else None
            prior_rows.append(row)
        return predecessors

    def _get_active_instance(self, activity_instance_id: str) -> Optional[ActivityInstance]:
        return (
            self._active_instances_query()
            .filter(ActivityInstance.id == activity_instance_id)
            .first()
        )
