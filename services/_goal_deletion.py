"""delete_fractal_goal.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone
from typing import Any

from models import Goal, get_goal_by_id
from services._completion_context import _emit_pending_events
from services.goal_sequence_service import leave_track
from services.events import event_bus, Event, Events
from services.service_types import ServiceResult



class _GoalDeletionMixin:
    db_session: Any  # provided by the composed GoalService

    def delete_fractal_goal(self, root_id, goal_id, current_user_id, *, emit_event=True, begin_next=True) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if goal.root_id != root_id:
            return None, "Goal not found in this fractal", 404

        deleted_at = datetime.now(timezone.utc)
        # Deleting the active step of a sequence begins the next one unless the user declines.
        pending_events = []
        leave_track(self.db_session, goal, pending_events, begin_next=begin_next)
        self._soft_delete_goal_subtree(goal, deleted_at)
        self.db_session.commit()
        _emit_pending_events(pending_events)
        if emit_event:
            event_bus.emit(Event(Events.GOAL_DELETED, {
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,
                'was_root': False,
            }, source='goal_service.delete_fractal_goal'))
        return goal, None, 200
