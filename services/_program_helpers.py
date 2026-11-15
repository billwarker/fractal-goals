"""Shared parsing, date, commit/event, and goal-scope helpers.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import logging
from datetime import datetime, date
from typing import List, Dict, Any

from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition, ActivityTagDefinition, Goal, GoalCompletionCondition, Program, ProgramDay,
    ProgramDayActivityCondition, ProgramDayTemplate, SessionTemplate, program_goals, validate_root_goal,
)
from models.base import utc_now
from models.goal import program_day_goals
from models.program import program_day_activity_condition_loads
from services import event_bus
from services.goal_service import GoalService
from services.program_scope import resolve_program_scope

logger = logging.getLogger(__name__)
from services.program_service_errors import ProgramServiceValidationError


class _ProgramHelpersMixin:
    @classmethod
    def _program_serializer_load_options(cls):
        day_load = selectinload(Program.days)
        template_goal_load = day_load.selectinload(ProgramDay.templates).selectinload(SessionTemplate.goals)
        return [
            selectinload(Program.goals),
            selectinload(Program.blocks),
            day_load.selectinload(ProgramDay.goals),
            day_load.selectinload(ProgramDay.template_links).selectinload(ProgramDayTemplate.template),
            *program_day_activity_condition_loads(day_load),
            template_goal_load.selectinload(Goal.level),
            template_goal_load.selectinload(Goal.condition).selectinload(GoalCompletionCondition.rules),
            template_goal_load.selectinload(Goal.condition).selectinload(GoalCompletionCondition.tags),
            template_goal_load.selectinload(Goal.associated_activities),
            template_goal_load.selectinload(Goal.associated_activity_groups),
            day_load.selectinload(ProgramDay.completed_sessions),
        ]

    @classmethod
    def _require_root_access(cls, session, root_id: str, current_user_id: str | None = None):
        root = validate_root_goal(session, root_id, owner_id=current_user_id) if current_user_id else validate_root_goal(session, root_id)
        if not root:
            raise ValueError("Fractal not found or access denied")
        return root

    @classmethod
    def _commit(cls, session, *instances, commit=True):
        session.flush()
        if commit:
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
    def _program_day_scheduled_on(cls, day: ProgramDay, program: Program, target_date: date) -> bool:
        from services.program_day_occurrences import program_day_scheduled_on
        return program_day_scheduled_on(day, program, target_date)

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

        return configs

    @classmethod
    def _normalize_activity_conditions(cls, session, root_id: str, raw_conditions) -> List[Dict[str, Any]]:
        """The day's activity conditions in the order given: the same activity may appear again with
        other tags, never twice alike. Activities and tags must be the fractal's; archived tags stay valid."""
        configs: List[Dict[str, Any]] = []
        seen = set()
        for raw in raw_conditions or []:
            activity_id = raw.get('activity_definition_id')
            tag_ids = list(dict.fromkeys(raw.get('tag_ids') or []))
            tag_match = (raw.get('tag_match') or 'contains') if tag_ids else 'contains'
            key = (activity_id, frozenset(tag_ids), tag_match)
            if not activity_id or key in seen:
                continue
            seen.add(key)
            configs.append({
                'activity_definition_id': activity_id,
                'is_required': bool(raw.get('is_required', True)),
                'tag_ids': tag_ids,
                'tag_match': tag_match,
            })
        if not configs:
            return configs

        activity_ids = {config['activity_definition_id'] for config in configs}
        found_activities = {activity_id for (activity_id,) in session.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.id.in_(activity_ids),
            ActivityDefinition.deleted_at.is_(None),
        )}
        missing_activities = sorted(activity_ids - found_activities)
        if missing_activities:
            raise ValueError(f"Activities not found: {', '.join(missing_activities)}")

        tag_ids = {tag_id for config in configs for tag_id in config['tag_ids']}
        tags_by_id = {tag.id: tag for tag in session.query(ActivityTagDefinition).filter(
            ActivityTagDefinition.root_id == root_id,
            ActivityTagDefinition.id.in_(tag_ids),
        )} if tag_ids else {}
        missing_tags = sorted(tag_ids - set(tags_by_id))
        if missing_tags:
            raise ValueError(f"Activity tags not found: {', '.join(missing_tags)}")
        for config in configs:
            config['tags'] = [tags_by_id[tag_id] for tag_id in config['tag_ids']]
        return configs

    @classmethod
    def _apply_program_day_activity_conditions(cls, session, day: ProgramDay, root_id: str, configs: List[Dict[str, Any]]):
        """Replace the day's activity conditions (a day's definition changes as a whole)."""
        day.activity_conditions = [
            ProgramDayActivityCondition(
                program_day_id=day.id,
                root_id=root_id,
                activity_definition_id=config['activity_definition_id'],
                is_required=config['is_required'],
                order=index,
                tag_match=config['tag_match'],
                tags=config['tags'],
            )
            for index, config in enumerate(configs)
        ]
        session.flush()

    @classmethod
    def _apply_program_day_template_configs(cls, session, day: ProgramDay, template_configs: List[Dict[str, Any]]):
        day = session.query(ProgramDay).filter_by(
            id=day.id,
        ).populate_existing().with_for_update().one()
        day.row_version += 1
        session.query(ProgramDayTemplate).filter(
            ProgramDayTemplate.program_day_id == day.id
        ).delete(synchronize_session=False)
        session.flush()

        if not template_configs:
            session.expire(day, ['templates', 'template_links'])
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
        """"At least N completed" counts the day's templates and activities together."""
        min_items = getattr(day, 'completion_min_templates', None)
        item_count = len(day.templates or []) + len(getattr(day, 'activity_conditions', None) or [])
        if min_items is not None and min_items > item_count:
            raise ValueError("completion_min_templates cannot exceed the number of the day's sessions and activities")

    @classmethod
    def _program_scope_goal_ids(cls, session, program: Program, root_id: str) -> set[str]:
        return set(resolve_program_scope(session, root_id, program.id).goal_ids)

    @classmethod
    def _program_allowed_goal_ids(cls, session, program: Program, root_id: str) -> set[str]:
        return cls._program_scope_goal_ids(session, program, root_id)

    @classmethod
    def _validate_goal_in_program_scope(cls, session, program: Program, root_id: str, goal_id: str):
        allowed_goal_ids = cls._program_allowed_goal_ids(session, program, root_id)
        if not allowed_goal_ids:
            raise ValueError("Program scope is empty. Select medium or long term goals on the program first.")
        if goal_id not in allowed_goal_ids:
            raise ValueError("Goal must be within the configured program scope")

    @classmethod
    def _apply_goal_deadline_with_program_rules(cls, session, root_id: str, current_user_id: str | None, goal: Goal, deadline_value: str):
        goal_service = GoalService(session)
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
        program = session.query(Program).filter_by(
            id=program_id, root_id=root_id,
        ).populate_existing().with_for_update().first()
        if not program:
            raise ValueError("Program not found")
        program.row_version += 1
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
    def _replace_day_goals(cls, session, day: ProgramDay, goal_ids: List[str], root_id: str):
        """Make ``day``'s active goals exactly ``goal_ids``; removed rows are soft-deleted."""
        goal_ids = list(dict.fromkeys(goal_ids or []))
        if goal_ids:
            found_ids = {
                goal_id for (goal_id,) in session.query(Goal.id).filter(
                    Goal.id.in_(goal_ids),
                    Goal.root_id == root_id,
                    Goal.deleted_at == None,
                ).all()
            }
            missing_ids = [gid for gid in goal_ids if gid not in found_ids]
            if missing_ids:
                raise ValueError(f"Goals not found in this fractal: {', '.join(missing_ids)}")

        rows = session.execute(
            program_day_goals.select().where(program_day_goals.c.program_day_id == day.id)
        ).mappings().all()
        existing = {row['goal_id']: row for row in rows}
        wanted = set(goal_ids)
        now = utc_now()
        retired = [goal_id for goal_id, row in existing.items() if row['deleted_at'] is None and goal_id not in wanted]
        revived = [goal_id for goal_id in goal_ids if goal_id in existing and existing[goal_id]['deleted_at'] is not None]
        added = [goal_id for goal_id in goal_ids if goal_id not in existing]
        if retired:
            session.execute(program_day_goals.update().where(
                program_day_goals.c.program_day_id == day.id,
                program_day_goals.c.goal_id.in_(retired),
            ).values(deleted_at=now))
        if revived:
            session.execute(program_day_goals.update().where(
                program_day_goals.c.program_day_id == day.id,
                program_day_goals.c.goal_id.in_(revived),
            ).values(deleted_at=None, created_at=now))
        if added:
            session.execute(
                program_day_goals.insert(),
                [{'program_day_id': day.id, 'goal_id': goal_id, 'created_at': now} for goal_id in added],
            )
        if retired or revived or added:
            session.expire(day, ['goals'])
