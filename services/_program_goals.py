"""Program-day goals.

Mixin for ProgramService (audit P1-7). Methods are classmethods; cross-method
calls use cls.<method>(...) and resolve through the composed ProgramService class.
"""

import logging
from typing import Dict

from models import ProgramDay, Goal
from services import event_bus, Event, Events
from services.program_calendar_invariants import lock_program_calendar
from services.program_focus import assert_day_goals_valid, resolve_focus_scopes
from services.serializers import serialize_program_day

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    # Mixins resolve shared helpers through the composed ProgramService.
    from services._program_helpers import _ProgramHelpersMixin as _ProgramMixinBase
else:
    _ProgramMixinBase = object

logger = logging.getLogger(__name__)



class _ProgramGoalsMixin(_ProgramMixinBase):
    @classmethod
    def attach_goal_to_day(cls, session, root_id: str, program_id: str, day_id: str, data: Dict, current_user_id: str | None = None) -> Dict:
        """Add one goal to a program day; it must sit within the program's goals."""
        cls._require_root_access(session, root_id, current_user_id)
        if not lock_program_calendar(session, program_id, root_id):
            raise ValueError("Program not found")
        day = session.query(ProgramDay).filter_by(id=day_id, program_id=program_id).first()
        if not day:
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

        scopes = resolve_focus_scopes(session, root_id, program_id)
        assert_day_goals_valid(scopes, [goal_id])
        current_goal_ids = sorted(scopes.day_seed_ids.get(str(day.id), ()))
        if goal_id in current_goal_ids:
            return serialize_program_day(day)

        cls._replace_day_goals(session, day, current_goal_ids + [goal_id], root_id)
        cls._commit(session, day)

        event_bus.emit(Event(Events.GOAL_DAY_ASSOCIATED, {
            'day_id': day.id,
            'day_name': day.name,
            'goal_id': goal_id,
            'program_id': program_id,
            'root_id': root_id
        }, source='cls.attach_goal_to_day'))

        return serialize_program_day(day)
