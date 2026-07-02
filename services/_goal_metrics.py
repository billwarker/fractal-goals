"""Goal metrics, daily durations, and timeline.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""


from services.metrics import GoalMetricsService
from services.service_types import JsonDict, ServiceResult
from services.goal_timeline_service import GoalTimelineService



class _GoalMetricsMixin:
    def get_goal_metrics(self, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        goal, error = self._get_authorized_goal(goal_id, current_user_id, load_associations=False)
        if error:
            return None, *error

        metrics = GoalMetricsService(self.db_session).get_metrics_for_goal(goal.id)
        if not metrics:
            return None, "Goal not found", 404
        return metrics, None, 200

    def get_goal_daily_durations(self, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        goal, error = self._get_authorized_goal(goal_id, current_user_id, load_associations=False)
        if error:
            return None, *error

        metrics = GoalMetricsService(self.db_session).get_goal_daily_durations(goal.id)
        if metrics is None:
            return None, "Goal not found", 404
        return metrics, None, 200

    def get_goal_timeline(
        self,
        root_id,
        goal_id,
        current_user_id,
        *,
        types=None,
        include_children=True,
        limit=50,
    ) -> ServiceResult[JsonDict]:
        return GoalTimelineService(self.db_session).get_goal_timeline(
            root_id,
            goal_id,
            current_user_id,
            types=types,
            include_children=include_children,
            limit=limit,
        )
