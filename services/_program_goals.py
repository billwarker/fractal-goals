"""Goal attachment to days and blocks.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import logging
from typing import Dict


from models import ProgramBlock, ProgramDay, Goal
from services import event_bus, Event, Events
from services.owned_entity_queries import get_owned_program
from services.serializers import serialize_program_block, serialize_program_day

logger = logging.getLogger(__name__)


class _ProgramGoalsMixin:
    @classmethod
    def attach_goal_to_day(cls, session, root_id: str, program_id: str, block_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        """Attach a single goal to a specific program day."""
        cls._require_root_access(session, root_id, current_user_id)
        day = session.query(ProgramDay).filter_by(id=day_id, block_id=block_id).first()
        if not day or day.block.program_id != program_id:
            raise ValueError("Program Day not found")

        goal_id = data.get('goal_id')
        if not goal_id:
             raise ValueError("Goal ID required")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        deadline_date = cls._normalize_goal_date(goal.deadline)
        if not deadline_date:
            raise ValueError("Goal must have a deadline before it can be attached to a program day")

        block = day.block
        if not block.start_date or not block.end_date:
            raise ValueError("Program day block must have a start and end date")

        if deadline_date < block.start_date or deadline_date > block.end_date:
            raise ValueError("Goal deadline must fall within the selected day block")

        if day.date and deadline_date != day.date:
            raise ValueError("Goal deadline must match the selected program day date")

        if day.day_of_week:
            day_names = day.day_of_week if isinstance(day.day_of_week, list) else [day.day_of_week]
            if day_names and deadline_date.strftime('%A') not in day_names:
                raise ValueError("Goal deadline must match one of the selected program day weekdays")

        # Insert directly into program_day_goals junction
        from models.goal import program_day_goals
        from sqlalchemy.exc import IntegrityError
        
        # Check if already attached to avoid IntegrityError triggering overall rollback
        existing = session.execute(
            program_day_goals.select().where(
                (program_day_goals.c.program_day_id == day_id) &
                (program_day_goals.c.goal_id == goal_id)
            )
        ).first()
        
        if existing:
            logger.debug(f"Goal {goal_id} already attached to day {day_id}")
            return serialize_program_day(day)
            
        stmt = program_day_goals.insert().values(
            program_day_id=day_id,
            goal_id=goal_id
        )
        
        try:
            # Use nested transaction for safe concurrency handling
            with session.begin_nested():
                session.execute(stmt)
        except IntegrityError:
            # Goal already attached to this day concurrently — idempotent
            logger.debug(f"Goal {goal_id} already attached to day {day_id} (concurrent)")
            return serialize_program_day(day)

        session.expire(day, ['goals'])
        cls._commit(session, day)

        event_bus.emit(Event(Events.GOAL_DAY_ASSOCIATED, {
            'day_id': day.id,
            'day_name': day.name,
            'goal_id': goal_id,
            'block_id': block_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='cls.attach_goal_to_day'))

        return serialize_program_day(day)

    @classmethod
    def attach_goal_to_block(cls, session, root_id: str, program_id: str, block_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        cls._require_root_access(session, root_id, current_user_id)
        block = session.query(ProgramBlock).filter_by(id=block_id, program_id=program_id).first()
        if not block:
            raise ValueError("Block not found")
        program = get_owned_program(session, root_id, program_id)
        if not program:
            raise ValueError("Program not found in this fractal")
        
        goal_id = data.get('goal_id')
        deadline_str = cls._normalize_deadline_value(data.get('deadline'))
        deadline_date = cls._parse_required_date(deadline_str, 'deadline')
        
        if not goal_id:
             raise ValueError("Goal ID required")

        goal = session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).first()
        if not goal:
            raise ValueError("Goal not found in this fractal")

        if block.start_date is None or block.end_date is None:
            raise ValueError("Block must have a start and end date before goals can be attached")

        if deadline_date < block.start_date or deadline_date > block.end_date:
            raise ValueError("Goal deadline must be within the selected block date range")

        current_block_goal_ids = [g.id for g in (block.goals or [])]
        scope_goal_ids = cls._program_scope_goal_ids(session, program, root_id)
        if not scope_goal_ids:
            raise ValueError("Program scope is empty. Select medium or long term goals on the program first.")
        if goal.id not in scope_goal_ids and goal.id not in current_block_goal_ids:
            raise ValueError("Goal must be within the configured program scope")
        if goal.id not in current_block_goal_ids:
            cls._replace_block_goals(
                session, block.id, current_block_goal_ids + [goal.id], root_id
            )
            session.expire(block, ['goals'])

        cls._apply_goal_deadline_with_program_rules(session, root_id, current_user_id, goal, deadline_str)

        cls._commit(session, block)
        
        event_bus.emit(Event(Events.GOAL_BLOCK_ASSOCIATED, {
            'block_id': block.id,
            'block_name': block.name,
            'goal_id': goal_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='cls.attach_goal_to_block'))

        return serialize_program_block(block)
