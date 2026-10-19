"""Authenticated read models for goal completion conditions.

Progress is derived on read from canonical evidence (never stored), bounded to a capped set of
goals per request. Evidence pages power the condition chart and the live editor preview.
"""
from __future__ import annotations

from sqlalchemy.orm import selectinload

from models import ActivityDefinition, MetricDefinition, validate_root_goal
from services.goal_condition_evidence import collect_goal_activity_instances
from services.goal_condition_service import (
    ConditionValidationError,
    clamp_progress_goal_ids,
    condition_met_now,
    condition_progress_payload,
    evaluate_goal_condition,
    yield_metric_ids,
)
from services.goal_loading import load_fractal_goals_for_serialization
from services.serializers import (
    format_utc,
    serialize_activity_instance_for_analytics,
    serialize_goal_condition,
    serialize_metric_definition,
    serialize_split_definition,
)
from services.service_types import JsonDict, ServiceResult


class GoalConditionReadService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _owned_goals(self, root_id, current_user_id):
        if not validate_root_goal(self.db_session, root_id, owner_id=current_user_id):
            return None
        return load_fractal_goals_for_serialization(self.db_session, root_id)

    def _activity(self, root_id, activity_id):
        if not activity_id:
            return None
        return self.db_session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
            selectinload(ActivityDefinition.split_definitions),
        ).filter(
            ActivityDefinition.id == activity_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()

    @staticmethod
    def _activity_payload(activity):
        if activity is None:
            return None
        return {
            'id': activity.id,
            'name': activity.name,
            'has_sets': activity.has_sets,
            'has_metrics': activity.has_metrics,
            'has_splits': activity.has_splits,
            'yield_metric_ids': list(yield_metric_ids(activity)),
            'metric_definitions': [
                serialize_metric_definition(metric)
                for metric in (activity.metric_definitions or []) if not metric.deleted_at
            ],
            'split_definitions': [
                serialize_split_definition(split)
                for split in (activity.split_definitions or []) if not split.deleted_at
            ],
        }

    def get_progress(self, root_id, current_user_id, goal_ids) -> ServiceResult[JsonDict]:
        try:
            requested = clamp_progress_goal_ids(goal_ids)
        except ConditionValidationError as error:
            return None, str(error), 400
        goals_by_id = self._owned_goals(root_id, current_user_id)
        if goals_by_id is None:
            return None, 'Fractal not found or access denied', 404
        progress = {}
        for goal_id in requested:
            goal = goals_by_id.get(goal_id)
            if goal is None:
                continue
            evaluation = evaluate_goal_condition(self.db_session, goal, goals_by_id)
            progress[goal_id] = condition_progress_payload(goal, evaluation, goal.children)
        return {'goals': progress}, None, 200

    def get_evidence(self, root_id, current_user_id, goal_id, *, since='active', activity_id=None) -> ServiceResult[JsonDict]:
        """Contributing instances for the goal's condition (or `activity_id` before one is saved)."""
        goals_by_id = self._owned_goals(root_id, current_user_id)
        if goals_by_id is None:
            return None, 'Fractal not found or access denied', 404
        goal = goals_by_id.get(goal_id)
        if goal is None:
            return None, 'Goal not found', 404
        condition = goal.condition if goal.completion_condition == 'activity_threshold' else None
        activity_id = activity_id or (condition.activity_definition_id if condition else None)
        if not activity_id:
            return None, 'This goal has no activity threshold', 400
        activity = self._activity(root_id, activity_id)
        if activity is None:
            return None, 'Activity not found in this fractal', 404
        instances = collect_goal_activity_instances(
            self.db_session, root_id, goal, goals_by_id, activity_id,
            within_active_window=since != 'all',
        )
        evaluation = (
            evaluate_goal_condition(self.db_session, goal, goals_by_id, activity=activity)
            if condition is not None and condition.activity_definition_id == activity_id else None
        )
        return {
            'goal_id': goal.id,
            'started_at': format_utc(goal.started_at),
            'deadline': format_utc(goal.deadline),
            'condition': serialize_goal_condition(condition),
            'activity_definition': self._activity_payload(activity),
            'instances': [
                serialize_activity_instance_for_analytics(
                    instance,
                    session_name=instance.session.name if instance.session else None,
                    session_date=(instance.session.session_start or instance.session.created_at) if instance.session else None,
                )
                for instance in instances
            ],
            'progress': condition_progress_payload(goal, evaluation, goal.children),
        }, None, 200

    def pending_completion(self, goal) -> bool:
        """True when an incomplete goal's own condition is already met (the client asks to confirm)."""
        if goal.completed or goal.paused or goal.completion_condition == 'manual':
            return False
        goals_by_id = load_fractal_goals_for_serialization(self.db_session, goal.root_id or goal.id)
        return condition_met_now(self.db_session, goals_by_id.get(goal.id, goal), goals_by_id)
