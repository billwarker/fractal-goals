"""What the Progress pane's compact chart plots for an activity.

An activity-threshold goal condition on the activity wins, plotted exactly as the goal's own
condition chart (same series, same threshold). Otherwise a condition is synthesized from the
activity's metrics with the evaluator's semantics, and no threshold:

- yield, when every tracked metric is multiplicative and there are two or more;
- otherwise the best set of the best-set metric (or the first tracked metric);
- set-less activities plot the metric's per-session total.

The client renders either through ``buildConditionSeries`` / ``ConditionProgressChart``.
"""

from __future__ import annotations

from sqlalchemy import select

from models import Goal, GoalCompletionCondition, session_goals
from services._serialize_goals import serialize_goal_condition
from services.goal_condition_service import active_metric_definitions, yield_metric_ids


def _higher_is_better(metric) -> bool:
    fractal_metric = getattr(metric, "fractal_metric", None)
    if fractal_metric is not None and fractal_metric.higher_is_better is not None:
        return bool(fractal_metric.higher_is_better)
    return True


def synthesize_condition(activity) -> dict | None:
    """A threshold-less condition describing the activity's headline progress value."""
    if yield_metric_ids(activity):
        return {"kind": "single_session", "measure": "yield", "rules": [], "target_value": None}
    tracked = [metric for metric in active_metric_definitions(activity) if metric.track_progress is not False]
    if not tracked:
        return None
    metric = next((row for row in tracked if getattr(row, "is_best_set_metric", False) is True), None) or sorted(
        tracked, key=lambda row: (row.sort_order or 0, str(row.id)),
    )[0]
    if activity.has_sets:
        return {
            "kind": "single_session",
            "measure": "sets",
            "rules": [{
                "metric_definition_id": metric.id,
                "metric_name": metric.name,
                "unit": metric.unit,
                "operator": ">=" if _higher_is_better(metric) else "<=",
                "value": None,
            }],
        }
    return {
        "kind": "single_session",
        "measure": "metric",
        "metric_definition_id": metric.id,
        "metric_name": metric.name,
        "metric_unit": metric.unit,
        "operator": None,
        "target_value": None,
        "rules": [],
    }


def chart_spec(db_session, activity, session_id=None) -> dict | None:
    """The goal condition this session works toward on the activity, else a synthesized one.

    Among unfinished goals whose condition targets the activity, a goal linked to the
    session comes first, then the most recently started.
    """
    session_goal_ids = select(session_goals.c.goal_id).where(session_goals.c.session_id == session_id)
    rows = db_session.query(Goal, GoalCompletionCondition).join(
        GoalCompletionCondition, GoalCompletionCondition.goal_id == Goal.id,
    ).filter(
        Goal.root_id == activity.root_id,
        Goal.deleted_at.is_(None),
        Goal.completed.isnot(True),
        Goal.completion_condition == "activity_threshold",
        GoalCompletionCondition.deleted_at.is_(None),
        GoalCompletionCondition.activity_definition_id == activity.id,
    ).order_by(Goal.started_at.desc(), Goal.id).all()
    if rows:
        linked = set(db_session.execute(session_goal_ids).scalars()) if session_id else set()
        goal, condition = next(((goal, cond) for goal, cond in rows if goal.id in linked), rows[0])
        return {
            "source": "goal_condition",
            "goal_id": goal.id,
            "goal_name": goal.name,
            "condition": serialize_goal_condition(condition),
        }
    condition = synthesize_condition(activity)
    return {"source": "activity", "condition": condition} if condition else None
