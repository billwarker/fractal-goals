"""Goal charts: saved analytics views attached to goals, and the bounded data they read.

A goal shows its charts one at a time: first the default "progress toward the threshold" chart
(derived from an activity-threshold condition, never stored), then the saved views linked to it in
order. Links point at the view, so edits to the view show everywhere. Only activity and goal views
attach; session views need the whole session history, so they stay on the Analytics page.
"""

from datetime import datetime
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition, ActivityInstance, ActivitySet, AnalyticsDashboard, Goal, GoalAnalyticsView,
    MetricDefinition, MetricValue, Session, validate_root_goal,
)
from services.serializers import format_utc, serialize_activity_instance_for_analytics
from services.service_types import JsonDict, ServiceResult

ATTACHABLE_CATEGORIES = frozenset({'activities', 'goals', 'sessions'})
MAX_CHARTS_PER_GOAL = 12
EVIDENCE_LIMIT = 500
DEFAULT_CHART_CONDITION_PROGRESS = 'condition_progress'


def _configured(state: Any) -> bool:
    return isinstance(state, dict) and bool(state.get('selectedCategory')) and bool(state.get('selectedVisualization'))


def _view_window(layout: Any) -> dict | None:
    """A saved view's one chart window, in either stored shape (as the client's dashboard state reads it).

    Views are stored as `{type: 'analytics_view', profile}`; older ones kept the grid shape with a
    single configured window in `window_states`.
    """
    if not isinstance(layout, dict):
        return None
    if layout.get('type') == 'analytics_view':
        profile = layout.get('profile')
        return profile if _configured(profile) else None
    states = layout.get('window_states')
    if not isinstance(states, dict):
        return None
    selected = states.get(layout.get('selected_window_id'))
    if _configured(selected):
        return selected
    configured = [state for state in states.values() if _configured(state)]
    return configured[0] if len(configured) == 1 else None


def view_category(layout: Any) -> str | None:
    """The chart category of a saved view's single window (None for dashboards or empty views)."""
    window = _view_window(layout)
    return window.get('selectedCategory') if window else None


def attach_problem(view: Any) -> str | None:
    """Why a saved object can't be shown on a goal, or None when it can."""
    if view is None:
        return 'Analytics view not found'
    if view.kind != 'view':
        return 'Only single-chart analytics views can be added to goals'
    category = view_category(view.layout)
    if category is None:
        return 'This view has no chart yet'
    if category not in ATTACHABLE_CATEGORIES:
        return 'Only activity, goal and session charts can be added to goals; query views stay in Analytics'
    return None


class GoalChartError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


class GoalChartService:
    def __init__(self, db_session):
        self.db_session = db_session

    # --- lookups -----------------------------------------------------------------------------

    def _authorize(self, root_id, current_user_id) -> None:
        if not validate_root_goal(self.db_session, root_id, owner_id=current_user_id):
            raise GoalChartError('Fractal not found or access denied', 404)

    def _goal(self, root_id, goal_id) -> Any:
        goal = self.db_session.query(Goal).filter(
            Goal.id == goal_id, Goal.deleted_at.is_(None),
            (Goal.root_id == root_id) | (Goal.id == root_id),
        ).first()
        if goal is None:
            raise GoalChartError('Goal not found', 404)
        return goal

    def _view(self, root_id, current_user_id, dashboard_id) -> Any:
        return self.db_session.query(AnalyticsDashboard).filter(
            AnalyticsDashboard.id == dashboard_id,
            AnalyticsDashboard.root_id == root_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.deleted_at.is_(None),
        ).first()

    def _attachable_view(self, root_id, current_user_id, dashboard_id) -> Any:
        view = self._view(root_id, current_user_id, dashboard_id)
        problem = attach_problem(view)
        if problem:
            raise GoalChartError(problem, 404 if view is None else 400)
        return view

    def _links(self, goal_id, current_user_id) -> list[tuple[Any, Any]]:
        return self.db_session.query(GoalAnalyticsView, AnalyticsDashboard).join(
            AnalyticsDashboard, AnalyticsDashboard.id == GoalAnalyticsView.dashboard_id,
        ).filter(
            GoalAnalyticsView.goal_id == goal_id,
            AnalyticsDashboard.user_id == current_user_id,
            AnalyticsDashboard.deleted_at.is_(None),
        ).order_by(GoalAnalyticsView.position, GoalAnalyticsView.created_at).all()

    def _run(self, call) -> ServiceResult[JsonDict]:
        try:
            payload, status = call()
        except GoalChartError as error:
            self.db_session.rollback()
            return None, str(error), error.status
        return payload, None, status

    # --- a goal's charts ---------------------------------------------------------------------

    def _charts_payload(self, goal, current_user_id) -> JsonDict:
        return {
            'goal_id': goal.id,
            'default_chart': (
                DEFAULT_CHART_CONDITION_PROGRESS if goal.completion_condition == 'activity_threshold' else None
            ),
            'charts': [{
                'dashboard_id': view.id,
                'name': view.name,
                'layout': view.layout,
                'category': view_category(view.layout),
                'position': link.position,
            } for link, view in self._links(goal.id, current_user_id)],
        }

    def list_goal_charts(self, root_id, current_user_id, goal_id) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            return self._charts_payload(self._goal(root_id, goal_id), current_user_id), 200
        return self._run(call)

    def attach(self, root_id, current_user_id, goal_id, dashboard_id) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            goal = self._goal(root_id, goal_id)
            view = self._attachable_view(root_id, current_user_id, dashboard_id)
            links = self._links(goal.id, current_user_id)
            if any(existing.id == view.id for _, existing in links):
                raise GoalChartError('That chart is already on this goal', 409)
            if len(links) >= MAX_CHARTS_PER_GOAL:
                raise GoalChartError(f'A goal can show at most {MAX_CHARTS_PER_GOAL} charts')
            next_position = max((link.position for link, _ in links), default=-1) + 1
            self.db_session.add(GoalAnalyticsView(
                root_id=root_id, goal_id=goal.id, dashboard_id=view.id, position=next_position,
            ))
            self.db_session.commit()
            return self._charts_payload(goal, current_user_id), 201
        return self._run(call)

    def detach(self, root_id, current_user_id, goal_id, dashboard_id) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            goal = self._goal(root_id, goal_id)
            removed = self.db_session.query(GoalAnalyticsView).filter_by(
                goal_id=goal.id, dashboard_id=dashboard_id,
            ).delete(synchronize_session=False)
            if not removed:
                raise GoalChartError('That chart is not on this goal', 404)
            self.db_session.commit()
            return self._charts_payload(goal, current_user_id), 200
        return self._run(call)

    def reorder(self, root_id, current_user_id, goal_id, dashboard_ids) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            goal = self._goal(root_id, goal_id)
            links = self._links(goal.id, current_user_id)
            requested = [str(item) for item in (dashboard_ids or [])]
            if sorted(requested) != sorted(view.id for _, view in links) or len(set(requested)) != len(requested):
                raise GoalChartError("The order must list each of the goal's charts once")
            position_by_id = {dashboard_id: index for index, dashboard_id in enumerate(requested)}
            for link, view in links:
                link.position = position_by_id[view.id]
            self.db_session.commit()
            return self._charts_payload(goal, current_user_id), 200
        return self._run(call)

    # --- a view's goals (Analytics "Add to goal…" and the delete warning) ---------------------

    def _view_goals_payload(self, view) -> JsonDict:
        rows = self.db_session.query(Goal.id, Goal.name).join(
            GoalAnalyticsView, GoalAnalyticsView.goal_id == Goal.id,
        ).filter(
            GoalAnalyticsView.dashboard_id == view.id, Goal.deleted_at.is_(None),
        ).order_by(Goal.name, Goal.id).all()
        return {
            'dashboard_id': view.id,
            'attachable': attach_problem(view) is None,
            'reason': attach_problem(view),
            'goals': [{'goal_id': goal_id, 'goal_name': name} for goal_id, name in rows],
        }

    def view_goals(self, root_id, current_user_id, dashboard_id) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            view = self._view(root_id, current_user_id, dashboard_id)
            if view is None:
                raise GoalChartError('Analytics view not found', 404)
            return self._view_goals_payload(view), 200
        return self._run(call)

    def set_view_goals(self, root_id, current_user_id, dashboard_id, goal_ids) -> ServiceResult[JsonDict]:
        def call():
            self._authorize(root_id, current_user_id)
            view = self._attachable_view(root_id, current_user_id, dashboard_id)
            wanted = list(dict.fromkeys(str(goal_id) for goal_id in (goal_ids or [])))
            goals = self.db_session.query(Goal).filter(
                Goal.id.in_(wanted), Goal.deleted_at.is_(None),
                (Goal.root_id == root_id) | (Goal.id == root_id),
            ).all() if wanted else []
            if len(goals) != len(wanted):
                raise GoalChartError('Goal not found in this fractal', 404)
            existing = {link.goal_id: link for link in self.db_session.query(GoalAnalyticsView).filter_by(dashboard_id=view.id)}
            for goal_id, link in existing.items():
                if goal_id not in wanted:
                    self.db_session.delete(link)
            added = [goal_id for goal_id in wanted if goal_id not in existing]
            if added:
                counts = dict(self.db_session.query(GoalAnalyticsView.goal_id, func.count()).filter(
                    GoalAnalyticsView.goal_id.in_(added),
                ).group_by(GoalAnalyticsView.goal_id).all())
                last = dict(self.db_session.query(GoalAnalyticsView.goal_id, func.max(GoalAnalyticsView.position)).filter(
                    GoalAnalyticsView.goal_id.in_(added),
                ).group_by(GoalAnalyticsView.goal_id).all())
                full = [goal_id for goal_id in added if counts.get(goal_id, 0) >= MAX_CHARTS_PER_GOAL]
                if full:
                    raise GoalChartError(f'A goal can show at most {MAX_CHARTS_PER_GOAL} charts')
                for goal_id in added:
                    previous = last.get(goal_id)
                    self.db_session.add(GoalAnalyticsView(
                        root_id=root_id, goal_id=goal_id, dashboard_id=view.id,
                        position=(previous + 1) if previous is not None else 0,
                    ))
            self.db_session.commit()
            return self._view_goals_payload(view), 200
        return self._run(call)

    # --- bounded data for embedded activity charts --------------------------------------------

    def activity_evidence(self, root_id, current_user_id, activity_id, *, since=None, limit=EVIDENCE_LIMIT) -> ServiceResult[JsonDict]:
        """An activity's most recent completed instances (oldest first), for a chart on a goal."""
        def call():
            self._authorize(root_id, current_user_id)
            activity = self.db_session.query(ActivityDefinition).options(
                selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
                selectinload(ActivityDefinition.split_definitions),
            ).filter(
                ActivityDefinition.id == activity_id,
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.deleted_at.is_(None),
            ).first()
            if activity is None:
                raise GoalChartError('Activity not found in this fractal', 404)
            occurred = func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at)
            query = self.db_session.query(ActivityInstance).options(
                selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
                selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.metric_values),
                selectinload(ActivityInstance.session),
            ).filter(
                ActivityInstance.root_id == root_id,
                ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None)),
                ActivityInstance.activity_definition_id == activity.id,
                ActivityInstance.completed.is_(True),
                ActivityInstance.deleted_at.is_(None),
            )
            if since is not None:
                query = query.filter(occurred >= since)
            bounded = max(1, min(int(limit or EVIDENCE_LIMIT), EVIDENCE_LIMIT))
            rows = query.order_by(occurred.desc(), ActivityInstance.id.desc()).limit(bounded + 1).all()
            truncated = len(rows) > bounded
            instances = list(reversed(rows[:bounded]))
            from services.goal_condition_reads import GoalConditionReadService
            return {
                'activity_definition': GoalConditionReadService._activity_payload(activity),
                'instances': [
                    serialize_activity_instance_for_analytics(
                        instance,
                        session_name=instance.session.name if instance.session else None,
                        session_date=(instance.session.session_start or instance.session.created_at) if instance.session else None,
                    )
                    for instance in instances
                ],
                'truncated': truncated,
                'since': format_utc(since) if isinstance(since, datetime) else None,
            }, 200
        return self._run(call)
