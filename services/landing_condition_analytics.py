"""Bounded activity-threshold progress per goal for published landing snapshots."""
from models import COMPLETION_CONDITION_ACTIVITY_THRESHOLD, Goal
from services._landing_common import LANDING_EXAMPLE_ANALYTICS_LIMIT
from services.goal_condition_evidence import collect_goal_activity_instances
from services.goal_condition_service import condition_progress_payload, evaluate_goal_condition
from services.serializers import serialize_activity_instance_for_analytics, serialize_goal_condition
from services.service_types import JsonDict


def build_landing_condition_analytics(
    db_session, root: Goal, goals_by_id: dict[str, Goal], serialize_activity, history=None,
) -> dict[str, JsonDict]:
    """Progress and recent evidence for each goal with an activity threshold (no authenticated reads)."""
    result: dict[str, JsonDict] = {}
    for goal in goals_by_id.values():
        condition = getattr(goal, "condition", None)
        if goal.deleted_at is not None or condition is None:
            continue
        if getattr(goal, "completion_condition", None) != COMPLETION_CONDITION_ACTIVITY_THRESHOLD:
            continue
        activity = history.activity_definition(condition.activity_definition_id) if history is not None else None
        instances = collect_goal_activity_instances(
            db_session, root.id, goal, goals_by_id, condition.activity_definition_id,
            history=history, within_active_window=False,
        )
        evaluation = evaluate_goal_condition(
            db_session, goal, goals_by_id, history=history, condition=condition, activity=activity,
        )
        result[str(goal.id)] = {
            "goal_id": goal.id,
            "condition": serialize_goal_condition(condition),
            "activity_definition": serialize_activity(activity) if activity else None,
            "instances": [
                serialize_activity_instance_for_analytics(
                    instance,
                    session_name=instance.session.name if instance.session else None,
                    session_date=(instance.session.session_start or instance.session.created_at) if instance.session else None,
                    compact=True,
                )
                for instance in instances[-LANDING_EXAMPLE_ANALYTICS_LIMIT:]
            ],
            "progress": condition_progress_payload(goal, evaluation, goal.children),
        }
    return result
