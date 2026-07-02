"""Shared parsing, date, commit/event, and goal-scope helpers.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import logging
from datetime import datetime, date
from typing import List, Dict, Any

from sqlalchemy.orm import selectinload

from models import Program, ProgramBlock, ProgramDay, ProgramDayTemplate, Goal, SessionTemplate, Target, validate_root_goal, program_goals, program_block_goals
from services import event_bus
from services.goal_service import GoalService, sync_goal_targets

logger = logging.getLogger(__name__)
from services.program_service_errors import ProgramServiceValidationError


class _ProgramHelpersMixin:
    @classmethod
    def _program_serializer_load_options(cls):
        day_load = selectinload(Program.blocks).selectinload(ProgramBlock.days)
        template_goal_load = day_load.selectinload(ProgramDay.templates).selectinload(SessionTemplate.goals)
        return [
            selectinload(Program.goals),
            selectinload(Program.blocks).selectinload(ProgramBlock.goals),
            day_load.selectinload(ProgramDay.goals),
            day_load.selectinload(ProgramDay.template_links).selectinload(ProgramDayTemplate.template),
            template_goal_load.selectinload(Goal.level),
            template_goal_load.selectinload(Goal.targets_rel).selectinload(Target.metric_conditions),
            template_goal_load.selectinload(Goal.associated_activities),
            template_goal_load.selectinload(Goal.associated_activity_groups),
            template_goal_load.selectinload(Goal.sessions),
            day_load.selectinload(ProgramDay.completed_sessions),
            day_load.selectinload(ProgramDay.day_sessions),
        ]

    @classmethod
    def _require_root_access(cls, session, root_id: str, current_user_id: str | None = None):
        root = validate_root_goal(session, root_id, owner_id=current_user_id) if current_user_id else validate_root_goal(session, root_id)
        if not root:
            raise ValueError("Fractal not found or access denied")
        return root

    @classmethod
    def _commit(cls, session, *instances):
        session.commit()
        for instance in instances:
            if instance is not None:
                session.refresh(instance)

    @classmethod
    def _queue_or_emit_event(cls, pending_events, event):
        if pending_events is None:
            event_bus.emit(event)
            return
        pending_events.append(event)

    @classmethod
    def _parse_optional_block_date(cls, data: Dict[str, Any], snake_key: str, camel_key: str):
        raw_value = data.get(snake_key)
        if raw_value is None:
            raw_value = data.get(camel_key)
        if not raw_value:
            return None

        try:
            return datetime.strptime(str(raw_value)[:10], '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Invalid {snake_key} format")

    @classmethod
    def _parse_required_date(cls, raw_value: Any, field_name: str = 'date') -> date:
        if not raw_value:
            raise ValueError(f"{field_name} is required")

        try:
            return datetime.strptime(str(raw_value)[:10], '%Y-%m-%d').date()
        except ValueError:
            raise ValueError(f"Invalid {field_name} format")

    @classmethod
    def _parse_program_datetime(cls, raw_value: Any, field_name: str) -> datetime:
        if not raw_value:
            raise ValueError(f"{field_name} is required")
        if isinstance(raw_value, datetime):
            return raw_value
        if isinstance(raw_value, date):
            return datetime.combine(raw_value, datetime.min.time())
        try:
            return datetime.fromisoformat(str(raw_value).replace('Z', '+00:00'))
        except ValueError:
            raise ValueError(f"Invalid {field_name} format")

    @classmethod
    def _date_part(cls, value: Any) -> date | None:
        if value is None:
            return None
        if isinstance(value, datetime):
            return value.date()
        if isinstance(value, date):
            return value
        return cls._parse_program_datetime(value, 'date').date()

    @classmethod
    def _check_no_program_overlap(cls, 
        session,
        root_id: str,
        start_date_value: Any,
        end_date_value: Any,
        exclude_program_id: str | None = None,
    ):
        start_date = cls._date_part(start_date_value)
        end_date = cls._date_part(end_date_value)
        if not start_date or not end_date:
            return

        overlapping_query = session.query(Program).filter(
            Program.root_id == root_id,
            Program.start_date <= end_date,
            Program.end_date >= start_date,
        )
        if exclude_program_id:
            overlapping_query = overlapping_query.filter(Program.id != exclude_program_id)

        overlapping_program = overlapping_query.first()
        if overlapping_program:
            raise ValueError(
                f"Programs cannot overlap in date range. "
                f"Conflicts with {overlapping_program.name} "
                f"({cls._date_part(overlapping_program.start_date)} to "
                f"{cls._date_part(overlapping_program.end_date)})."
            )

    @classmethod
    def _normalize_deadline_value(cls, raw_value: Any) -> str:
        if not raw_value:
            raise ValueError("deadline is required")
        return str(raw_value)[:10]

    @classmethod
    def _normalize_goal_date(cls, value: Any) -> date | None:
        if value is None:
            return None
        return value.date() if isinstance(value, datetime) else value

    @classmethod
    def _program_day_scheduled_on(cls, day: ProgramDay, block: ProgramBlock, target_date: date) -> bool:
        if day.date:
            return day.date == target_date

        if not block.start_date or not block.end_date:
            return False

        if target_date < block.start_date or target_date > block.end_date:
            return False

        day_names = day.day_of_week if isinstance(day.day_of_week, list) else ([day.day_of_week] if day.day_of_week else [])
        return bool(day_names and target_date.strftime('%A') in day_names)

    @classmethod
    def _normalize_template_configs(cls, data: Dict[str, Any]) -> List[Dict[str, Any]]:
        raw_configs = data.get('template_configs')
        configs: List[Dict[str, Any]] = []

        if raw_configs is not None:
            seen_template_ids = set()
            for index, raw_config in enumerate(raw_configs or []):
                template_id = raw_config.get('template_id') if isinstance(raw_config, dict) else None
                if not template_id or template_id in seen_template_ids:
                    continue
                seen_template_ids.add(template_id)
                configs.append({
                    'template_id': template_id,
                    'is_required': bool(raw_config.get('is_required', True)),
                    'order': raw_config.get('order', index) if raw_config.get('order', index) is not None else index,
                })
        else:
            template_ids = list(data.get('template_ids') or [])
            if data.get('template_id') and data['template_id'] not in template_ids:
                template_ids.append(data['template_id'])
            seen_template_ids = set()
            for index, template_id in enumerate(template_ids):
                if not template_id or template_id in seen_template_ids:
                    continue
                seen_template_ids.add(template_id)
                configs.append({
                    'template_id': template_id,
                    'is_required': True,
                    'order': index,
                })

        min_templates = data.get('completion_min_templates')
        if min_templates is not None and min_templates > len(configs):
            raise ValueError("completion_min_templates cannot exceed the number of selected templates")

        return configs

    @classmethod
    def _apply_program_day_template_configs(cls, session, day: ProgramDay, template_configs: List[Dict[str, Any]]):
        session.query(ProgramDayTemplate).filter(
            ProgramDayTemplate.program_day_id == day.id
        ).delete(synchronize_session=False)
        session.flush()

        if not template_configs:
            day.templates = []
            return

        template_ids = [config['template_id'] for config in template_configs]
        templates = session.query(SessionTemplate).filter(SessionTemplate.id.in_(template_ids)).all()
        templates_by_id = {template.id: template for template in templates}
        missing_ids = [template_id for template_id in template_ids if template_id not in templates_by_id]
        if missing_ids:
            raise ValueError(f"Session templates not found: {', '.join(missing_ids)}")

        for index, config in enumerate(template_configs):
            session.add(ProgramDayTemplate(
                program_day_id=day.id,
                session_template_id=config['template_id'],
                order=config.get('order', index),
                is_required=bool(config.get('is_required', True)),
            ))
        session.expire(day, ['templates', 'template_links'])

    @classmethod
    def _validate_program_day_completion_min(cls, day: ProgramDay):
        min_templates = getattr(day, 'completion_min_templates', None)
        if min_templates is not None and min_templates > len(day.templates or []):
            raise ValueError("completion_min_templates cannot exceed the number of selected templates")

    @classmethod
    def _collect_goal_descendant_ids(cls, session, root_id: str, seed_goal_ids: List[str]) -> set[str]:
        normalized_seed_ids = list(dict.fromkeys(seed_goal_ids or []))
        if not normalized_seed_ids:
            return set()

        goal_rows = session.query(Goal.id, Goal.parent_id).filter(
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).all()

        children_by_parent: Dict[str | None, List[str]] = {}
        for goal_id, parent_id in goal_rows:
            children_by_parent.setdefault(parent_id, []).append(goal_id)

        visited: set[str] = set()
        stack = list(normalized_seed_ids)
        while stack:
            goal_id = stack.pop()
            if not goal_id or goal_id in visited:
                continue
            visited.add(goal_id)
            stack.extend(children_by_parent.get(goal_id, []))

        return visited

    @classmethod
    def _program_scope_goal_ids(cls, session, program: Program, root_id: str) -> set[str]:
        return cls._collect_goal_descendant_ids(
            session,
            root_id,
            [goal.id for goal in (program.goals or [])],
        )

    @classmethod
    def _program_allowed_goal_ids(cls, session, program: Program, root_id: str) -> set[str]:
        scope_goal_ids = cls._program_scope_goal_ids(session, program, root_id)
        block_goal_ids = {
            goal.id
            for block in (program.blocks or [])
            for goal in (block.goals or [])
        }
        return scope_goal_ids | block_goal_ids

    @classmethod
    def _validate_goal_in_program_scope(cls, session, program: Program, root_id: str, goal_id: str):
        allowed_goal_ids = cls._program_allowed_goal_ids(session, program, root_id)
        if not allowed_goal_ids:
            raise ValueError("Program scope is empty. Select medium or long term goals on the program first.")
        if goal_id not in allowed_goal_ids:
            raise ValueError("Goal must be within the configured program scope")

    @classmethod
    def _apply_goal_deadline_with_program_rules(cls, session, root_id: str, current_user_id: str | None, goal: Goal, deadline_value: str):
        goal_service = GoalService(session, sync_targets=sync_goal_targets)
        _, update_error = goal_service._apply_goal_updates(
            goal,
            {'deadline': deadline_value},
            root_id=root_id,
            allow_parent_update=False,
            allow_extended_fields=False,
        )
        if update_error:
            error_payload, status_code = update_error
            raise ProgramServiceValidationError(error_payload, status_code)

        session.add(goal)

    @classmethod
    def _replace_program_goals(cls, session, program_id: str, goal_ids: List[str], root_id: str) -> List[Goal]:
        goal_ids = list(dict.fromkeys(goal_ids or []))
        goals = []
        if goal_ids:
            goals = session.query(Goal).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).all()
            found_ids = {g.id for g in goals}
            missing_ids = [gid for gid in goal_ids if gid not in found_ids]
            if missing_ids:
                raise ValueError(f"Goals not found in this fractal: {', '.join(missing_ids)}")

        session.execute(
            program_goals.delete().where(program_goals.c.program_id == program_id)
        )
        if goals:
            session.execute(
                program_goals.insert(),
                [{'program_id': program_id, 'goal_id': g.id} for g in goals]
            )
        return goals

    @classmethod
    def _replace_block_goals(cls, session, block_id: str, goal_ids: List[str], root_id: str):
        goal_ids = list(dict.fromkeys(goal_ids or []))
        goals = []
        if goal_ids:
            goals = session.query(Goal).filter(
                Goal.id.in_(goal_ids),
                Goal.root_id == root_id,
                Goal.deleted_at == None
            ).all()
            found_ids = {g.id for g in goals}
            missing_ids = [gid for gid in goal_ids if gid not in found_ids]
            if missing_ids:
                raise ValueError(f"Goals not found in this fractal: {', '.join(missing_ids)}")

        session.execute(
            program_block_goals.delete().where(program_block_goals.c.program_block_id == block_id)
        )
        if goals:
            session.execute(
                program_block_goals.insert(),
                [{'program_block_id': block_id, 'goal_id': g.id} for g in goals]
            )
        return goals
