"""Revision-local SQL reads for e1a2c3d4f5b6's completion backfill.

Never hydrate application ORM models here: their columns and eager relationships describe HEAD,
not the schema during migration A. Plain objects feed the canonical condition evaluator; passing
no ORM session makes an accidental fallback to application queries fail explicitly.
"""
from types import SimpleNamespace

import sqlalchemy as sa


def _rows(bind, sql, **params):
    return [SimpleNamespace(**row) for row in bind.execute(sa.text(sql), params).mappings()]


def _group(rows, key):
    result = {}
    for row in rows:
        result.setdefault(getattr(row, key), []).append(row)
    return result


class ConditionBackfillHistory:
    """Only columns that exist by migration A; all reads stay inside its transaction/root."""

    def __init__(self, bind, root_id):
        self.goals = {row.id: row for row in _rows(bind, """
            SELECT id, root_id, parent_id, name, created_at, started_at, deadline, deleted_at,
                   completed, completed_at, paused, inherit_parent_activities,
                   completion_condition, manually_uncompleted_at
            FROM goals WHERE root_id = :root OR id = :root
        """, root=root_id)}
        pauses = _group(_rows(bind, """
            SELECT p.goal_id, p.paused_at, p.resumed_at FROM goal_pause_intervals p
            JOIN goals g ON g.id = p.goal_id WHERE g.root_id = :root OR g.id = :root
        """, root=root_id), 'goal_id')
        for goal in self.goals.values():
            goal.pause_intervals = pauses.get(goal.id, [])
        self.conditions = _rows(bind, """
            SELECT * FROM goal_completion_conditions WHERE root_id = :root AND deleted_at IS NULL
        """, root=root_id)
        rules = _group(_rows(bind, """
            SELECT r.* FROM goal_condition_metric_rules r
            JOIN goal_completion_conditions c ON c.id = r.condition_id
            WHERE c.root_id = :root AND c.deleted_at IS NULL
        """, root=root_id), 'condition_id')
        for condition in self.conditions:
            condition.rules = rules.get(condition.id, [])

        self.activities = {row.id: row for row in _rows(bind, """
            SELECT id, group_id, root_id, deleted_at FROM activity_definitions
            WHERE root_id = :root AND deleted_at IS NULL
        """, root=root_id)}
        metrics = _group(_rows(bind, """
            SELECT m.id, m.activity_id, m.deleted_at, m.is_active, m.track_progress, m.sort_order,
                   COALESCE(f.is_multiplicative, m.is_multiplicative, true) AS multiplies
            FROM metric_definitions m LEFT JOIN fractal_metric_definitions f ON f.id = m.fractal_metric_id
            WHERE m.root_id = :root
        """, root=root_id), 'activity_id')
        for activity in self.activities.values():
            activity.metric_definitions = metrics.get(activity.id, [])
        self.definition_links = _group(_rows(bind, """
            SELECT a.activity_id, a.goal_id FROM activity_goal_associations a
            JOIN goals g ON g.id = a.goal_id
            WHERE g.root_id = :root AND g.deleted_at IS NULL AND a.deleted_at IS NULL
        """, root=root_id), 'activity_id')
        self.group_links = _group(_rows(bind, """
            SELECT a.activity_group_id, a.goal_id FROM goal_activity_group_associations a
            JOIN goals g ON g.id = a.goal_id
            WHERE g.root_id = :root AND g.deleted_at IS NULL AND a.deleted_at IS NULL
        """, root=root_id), 'activity_group_id')
        self.direct_links = _rows(bind, """
            SELECT a.activity_instance_id, a.goal_id FROM activity_instance_goal_associations a
            JOIN activity_instances i ON i.id = a.activity_instance_id
            JOIN goals g ON g.id = a.goal_id LEFT JOIN sessions s ON s.id = i.session_id
            WHERE i.root_id = :root AND g.root_id = :root AND i.deleted_at IS NULL
              AND g.deleted_at IS NULL AND a.deleted_at IS NULL AND s.deleted_at IS NULL
        """, root=root_id)
        activity_ids = list({condition.activity_definition_id for condition in self.conditions})
        self.evidence = _rows(bind, """
            SELECT i.id, i.activity_definition_id, i.session_id, i.created_at, i.time_start,
                   i.completed, i.deleted_at
            FROM activity_instances i LEFT JOIN sessions s ON s.id = i.session_id
            WHERE i.root_id = :root AND i.completed IS TRUE AND i.deleted_at IS NULL
              AND s.deleted_at IS NULL AND i.activity_definition_id = ANY(:activities)
        """, root=root_id, activities=activity_ids)
        instance_ids = [instance.id for instance in self.evidence]
        sets = _rows(bind, """
            SELECT id, activity_instance_id, status FROM activity_sets
            WHERE activity_instance_id = ANY(:instances) ORDER BY sort_order, id
        """, instances=instance_ids)
        values = _rows(bind, """
            SELECT activity_instance_id, activity_set_id, metric_definition_id, value FROM metric_values
            WHERE activity_instance_id = ANY(:instances)
        """, instances=instance_ids)
        values_by_set = _group(values, 'activity_set_id')
        for activity_set in sets:
            activity_set.metric_values = values_by_set.get(activity_set.id, [])
        sets_by_instance = _group(sets, 'activity_instance_id')
        values_by_instance = _group(values, 'activity_instance_id')
        for instance in self.evidence:
            instance.sets = sets_by_instance.get(instance.id, [])
            instance.metric_values = values_by_instance.get(instance.id, [])

    def associated_goal_ids(self, activity_id, goal_ids):
        activity = self.activities.get(activity_id)
        links = self.definition_links.get(activity_id, []) + self.group_links.get(
            activity.group_id if activity else None, [],
        )
        return {row.goal_id for row in links} & set(goal_ids)

    def instance_links(self, goal_ids):
        links = {}
        for row in self.direct_links:
            if row.goal_id in goal_ids:
                links.setdefault(row.activity_instance_id, set()).add(row.goal_id)
        return links

    def instances(self, activity_ids, *, linked_instance_ids=None):
        return [row for row in self.evidence if row.activity_definition_id in activity_ids]


def met_conditions(bind, root_id):
    from services.goal_condition_service import evaluate_goal_condition

    history = ConditionBackfillHistory(bind, root_id)
    for condition in history.conditions:
        goal = history.goals.get(condition.goal_id)
        activity = history.activities.get(condition.activity_definition_id)
        if (goal is None or goal.deleted_at or goal.completed or goal.paused
                or goal.completion_condition != 'activity_threshold' or activity is None):
            continue
        evaluation = evaluate_goal_condition(
            None, goal, history.goals, history=history, condition=condition, activity=activity,
            honor_decline=True,
        )
        if evaluation and evaluation.met and evaluation.achieved_at is not None:
            yield goal, evaluation
