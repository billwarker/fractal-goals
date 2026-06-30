"""delete_fractal_goal + goal-target add/remove/update/analytics (delegating).

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone


from models import Goal, get_goal_by_id
from services.events import event_bus, Event, Events
from services.service_types import JsonDict, ServiceResult
from services.goal_target_service import GoalTargetService



class _GoalTargetsMixin:
    def delete_fractal_goal(self, root_id, goal_id, current_user_id, *, emit_event=True) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if goal.root_id != root_id:
            return None, "Goal not found in this fractal", 404

        deleted_at = datetime.now(timezone.utc)
        self._soft_delete_goal_subtree(goal, deleted_at)
        self.db_session.commit()
        if emit_event:
            event_bus.emit(Event(Events.GOAL_DELETED, {
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,
                'was_root': False,
            }, source='goal_service.delete_fractal_goal'))
        return goal, None, 200

    def add_goal_target(self, goal_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).add_goal_target(goal_id, current_user_id, data)

    def remove_goal_target(self, goal_id, target_id, current_user_id) -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).remove_goal_target(goal_id, target_id, current_user_id)

    def update_goal_target(self, goal_id, target_id, current_user_id, data) -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).update_goal_target(goal_id, target_id, current_user_id, data)

    def get_target_analytics(self, root_id, target_id, current_user_id, *, since='creation') -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).get_target_analytics(root_id, target_id, current_user_id, since=since)

    def get_goal_activity_instances(self, root_id, goal_id, activity_id, current_user_id) -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).get_goal_activity_instances(root_id, goal_id, activity_id, current_user_id)
