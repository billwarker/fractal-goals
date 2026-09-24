"""Mixin for SessionLifecycleService: session goal scope.

Resolves template and program goal scope, previews it, and replaces manual scope rows.
"""

from sqlalchemy import inspect
from sqlalchemy.orm import joinedload, selectinload
import models
from models import CircuitDefinition, Goal, session_goals, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from services.service_types import JsonDict, ServiceResult
from services.session_runtime import SESSION_TYPE_QUICK, get_template_session_type
from services.session_structure import extract_activity_definition_id
from services.program_scope import resolve_program_scope


class _SessionGoalScopeMixin:
    @staticmethod
    def _extract_activity_definition_id(raw_item) -> str | None:
        return extract_activity_definition_id(raw_item)

    @classmethod
    def _normalize_template_activities(cls, raw_items) -> list[tuple[dict | str, str]]:
        normalized = []
        for raw_item in raw_items or []:
            activity_id = cls._extract_activity_definition_id(raw_item)
            if not activity_id:
                continue
            normalized.append((raw_item, activity_id))
        return normalized

    def _session_goals_supports_source(self) -> bool:
        if self._session_goals_has_source is None:
            cols = inspect(self.db_session.bind).get_columns('session_goals')
            self._session_goals_has_source = any(c.get('name') == 'association_source' for c in cols)
        return self._session_goals_has_source

    def _session_goal_insert_values(self, session_id, goal_id, goal_type, association_source) -> JsonDict:
        values = {
            'session_id': session_id,
            'goal_id': goal_id,
            'goal_type': goal_type,
        }
        if self._session_goals_supports_source():
            values['association_source'] = association_source
        return values

    def _program_scope_goal_ids(self, root_id, program_day_id=None):
        if program_day_id:
            program_day = self.db_session.query(models.ProgramDay).options(
                joinedload(models.ProgramDay.block).joinedload(models.ProgramBlock.program)
            ).filter(models.ProgramDay.id == program_day_id).first()
            if (
                not program_day
                or not program_day.block
                or not program_day.block.program
                or program_day.block.program.root_id != root_id
            ):
                return None, "Invalid program day context for this fractal"
            return set(resolve_program_scope(
                self.db_session, root_id, program_day.block.program.id
            ).goal_ids), None

        return None, None

    def _template_activity_definition_ids(self, root_id, template):
        payload = models._safe_load_json(template.template_data, {})
        activity_ids = set()
        circuit_ids = set()
        for section in payload.get('sections', []) if isinstance(payload, dict) else []:
            for item in section.get('items') or section.get('exercises') or section.get('activities') or []:
                if isinstance(item, dict) and item.get('type') == 'circuit':
                    if item.get('circuit_definition_id'):
                        circuit_ids.add(item['circuit_definition_id'])
                    continue
                activity_id = self._extract_activity_definition_id(item)
                if activity_id:
                    activity_ids.add(activity_id)

        if circuit_ids:
            circuits = self.db_session.query(CircuitDefinition).options(
                selectinload(CircuitDefinition.slots)
            ).filter(
                CircuitDefinition.id.in_(circuit_ids),
                CircuitDefinition.root_id == root_id,
                CircuitDefinition.deleted_at.is_(None),
            ).all()
            if {circuit.id for circuit in circuits} != circuit_ids:
                return None, "Template contains an unavailable activity circuit"
            activity_ids.update(
                slot.activity_definition_id
                for circuit in circuits
                for slot in circuit.slots
            )
        return activity_ids, None

    def preview_goal_scope(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        template = self.db_session.query(models.SessionTemplate).filter(
            models.SessionTemplate.id == data.get('template_id'),
            models.SessionTemplate.root_id == root_id,
            models.SessionTemplate.deleted_at.is_(None),
        ).first()
        if not template:
            return None, "Template not found in this fractal", 404
        if get_template_session_type(models._safe_load_json(template.template_data, {})) == SESSION_TYPE_QUICK:
            return {"automatic_goal_ids": [], "program_scope_goal_ids": []}, None, 200

        activity_ids, activity_error = self._template_activity_definition_ids(root_id, template)
        if activity_error:
            return None, activity_error, 409
        program_goal_ids, program_error = self._program_scope_goal_ids(
            root_id,
            program_day_id=data.get('program_day_id'),
        )
        if program_error:
            return None, program_error, 400

        effective = self._get_effective_activity_goals(root_id, activity_ids)
        automatic_goal_ids = {
            goal.id
            for goals in effective.values()
            for goal in goals
            if not goal.deleted_at and (program_goal_ids is None or goal.id in program_goal_ids)
        }
        return {
            "automatic_goal_ids": sorted(automatic_goal_ids),
            "program_scope_goal_ids": sorted(program_goal_ids or set()),
        }, None, 200

    def _replace_manual_goal_scope(self, session, root_id, goal_ids):
        requested_ids = set(goal_ids or [])
        valid_goals = self.db_session.query(Goal).filter(
            Goal.id.in_(requested_ids),
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).all() if requested_ids else []
        if {goal.id for goal in valid_goals} != requested_ids:
            return "One or more goals were not found in this fractal"

        delete_query = session_goals.delete().where(session_goals.c.session_id == session.id)
        if self._session_goals_supports_source():
            delete_query = delete_query.where(session_goals.c.association_source == 'manual')
        self.db_session.execute(delete_query)

        existing_ids = set(self.db_session.execute(
            session_goals.select().with_only_columns(session_goals.c.goal_id).where(
                session_goals.c.session_id == session.id
            )
        ).scalars())
        rows = [
            self._session_goal_insert_values(
                session.id,
                goal.id,
                get_canonical_goal_type(goal),
                'manual',
            )
            for goal in valid_goals
            if goal.id not in existing_ids
        ]
        if rows:
            self.db_session.execute(session_goals.insert(), rows)
        self.db_session.expire(session, ['goals'])
        return None
