"""Request-scoped history queries shared by goal timelines and snapshot publication.

A publisher can preload one owned root and reuse the same timeline evaluator for
all goals. No data survives the request or crosses a root boundary.
"""

from sqlalchemy import func, select, or_
from services.instance_goal_evidence import load_instance_goal_ids
from sqlalchemy.orm import joinedload, selectinload
from models import (
    ActivityDefinition,
    ActivityInstance,
    ActivitySet,
    EventLog,
    GoalPauseInterval,
    MetricDefinition,
    MetricValue,
    Session,
    activity_goal_associations, activity_instance_goal_associations,
    goal_activity_group_associations,
)


class GoalHistoryReadModel:

    def __init__(self, db_session, root_id):
        self.db_session = db_session
        self.root_id = root_id
        self._rows = {}
        self._definitions = {}

    def preload(self, goal_ids, *, goals_by_id=None):
        self._rows["direct_activities"] = self.direct_activities(goal_ids)
        self._rows["group_associations"] = self.group_associations(goal_ids)
        group_ids = {row.activity_group_id for row in self._rows["group_associations"]}
        self._rows["group_activities"] = (
            self.group_activities(group_ids) if group_ids else []
        )
        activity_ids = {row.activity_id for row in self._rows["direct_activities"]}
        activity_ids.update((row.id for row in self._rows["group_activities"]))
        self._rows["instances"] = self.instances(activity_ids, linked_goal_ids=goal_ids)
        self._rows["instance_links"] = {row.id: set(row.associated_goal_ids or []) & set(goal_ids) for row in self._rows["instances"] if row.associated_goal_ids}
        self._rows["association_events"] = self.association_events(goal_ids)
        if goals_by_id is None:
            self._rows["pause_intervals"] = self.pause_intervals(goal_ids)
        else:
            scoped_goals = [
                goal
                for goal in goals_by_id.values()
                if goal.root_id == self.root_id
                and goal.id in goal_ids
                and goal.deleted_at is None
            ]
            self._rows["pause_intervals"] = [
                interval for goal in scoped_goals for interval in goal.pause_intervals
            ]
        return self

    def direct_activities(self, goal_ids):
        if "direct_activities" in self._rows:
            rows = [
                row
                for row in self._rows["direct_activities"]
                if row.goal_id in goal_ids
            ]
            return rows
        return self.db_session.execute(
            select(
                activity_goal_associations.c.activity_id,
                activity_goal_associations.c.goal_id,
                activity_goal_associations.c.created_at,
            ).where(
                activity_goal_associations.c.goal_id.in_(goal_ids),
                activity_goal_associations.c.deleted_at.is_(None),
            )
        ).all()

    def group_associations(self, goal_ids):
        if "group_associations" in self._rows:
            rows = [
                row
                for row in self._rows["group_associations"]
                if row.goal_id in goal_ids
            ]
            return rows
        return self.db_session.execute(
            select(
                goal_activity_group_associations.c.activity_group_id,
                goal_activity_group_associations.c.goal_id,
                goal_activity_group_associations.c.created_at,
            ).where(
                goal_activity_group_associations.c.goal_id.in_(goal_ids),
                goal_activity_group_associations.c.deleted_at.is_(None),
            )
        ).all()

    def group_activities(self, group_ids):
        if "group_activities" in self._rows:
            rows = [
                row
                for row in self._rows["group_activities"]
                if row.group_id in group_ids
            ]
            return rows
        return (
            self.db_session.query(ActivityDefinition)
            .options(
                selectinload(ActivityDefinition.metric_definitions).selectinload(
                    MetricDefinition.fractal_metric
                ),
                selectinload(ActivityDefinition.split_definitions),
            )
            .filter(
                ActivityDefinition.root_id == self.root_id,
                ActivityDefinition.group_id.in_(group_ids),
                ActivityDefinition.deleted_at.is_(None),
            )
            .all()
        )

    def instance_links(self, goal_ids, *, instance_ids=None):
        if "instance_links" in self._rows:
            return {key: values & set(goal_ids) for key, values in self._rows["instance_links"].items() if values & set(goal_ids)}
        return load_instance_goal_ids(self.db_session, self.root_id, goal_ids=goal_ids, instance_ids=instance_ids)

    def instances(self, activity_ids, *, summary_only=False, occurred_range=None, instance_ids=None, linked_instance_ids=None, linked_goal_ids=None):
        if instance_ids is not None and not instance_ids:
            return []
        if "instances" in self._rows:
            rows = [
                row
                for row in self._rows["instances"]
                if (row.activity_definition_id in activity_ids or row.id in (linked_instance_ids or set())) and (instance_ids is None or row.id in instance_ids)
            ]
            return rows
        query = (
            self.db_session.query(ActivityInstance)
            .options(*([joinedload(ActivityInstance.definition)] if summary_only else [
                selectinload(ActivityInstance.sets)
                .joinedload(ActivitySet.metric_values)
                .joinedload(MetricValue.definition),
                selectinload(ActivityInstance.sets)
                .joinedload(ActivitySet.metric_values)
                .joinedload(MetricValue.split),
                selectinload(ActivityInstance.sets).selectinload(ActivitySet.tags),
                selectinload(ActivityInstance.tags),
                joinedload(ActivityInstance.definition).selectinload(
                    ActivityDefinition.group
                ),
                joinedload(ActivityInstance.definition)
                .joinedload(ActivityDefinition.metric_definitions)
                .joinedload(MetricDefinition.fractal_metric),
                joinedload(ActivityInstance.definition).joinedload(
                    ActivityDefinition.split_definitions
                ),
                selectinload(ActivityInstance.metric_values).joinedload(
                    MetricValue.definition
                ),
                selectinload(ActivityInstance.metric_values).joinedload(
                    MetricValue.split
                ),
                joinedload(ActivityInstance.session).joinedload(Session.template),
            ]))
            .filter(
                ActivityInstance.root_id == self.root_id,
                ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None)),
                or_(ActivityInstance.activity_definition_id.in_(activity_ids), ActivityInstance.id.in_(linked_instance_ids or set()), select(activity_instance_goal_associations.c.activity_instance_id).where(
                    activity_instance_goal_associations.c.activity_instance_id == ActivityInstance.id,
                    activity_instance_goal_associations.c.goal_id.in_(linked_goal_ids or set()),
                    activity_instance_goal_associations.c.deleted_at.is_(None),
                ).exists()),
                ActivityInstance.completed.is_(True),
                ActivityInstance.deleted_at.is_(None),
            )
        )
        if occurred_range is not None:
            occurred_at = func.coalesce(ActivityInstance.time_stop, ActivityInstance.time_start, ActivityInstance.created_at)
            query = query.filter(occurred_at >= occurred_range[0], occurred_at <= occurred_range[1])
        if instance_ids is not None:
            query = query.filter(ActivityInstance.id.in_(instance_ids))
        return query.all()

    def association_events(self, goal_ids, limit=None, *, event_ids=None):
        if "association_events" in self._rows:
            rows = [
                row
                for row in self._rows["association_events"]
                if (row.payload or {}).get("goal_id") in goal_ids
            ]
            return rows[:limit] if limit is not None else rows
        query = (
            self.db_session.query(EventLog)
            .filter(
                EventLog.root_id == self.root_id,
                EventLog.event_type.in_(
                    {
                        "activity.associated",
                        "activity.disassociated",
                        "activity_instance.associated",
                        "activity_instance.disassociated",
                        "activity_group.associated",
                        "activity_group.disassociated",
                    }
                ),
                EventLog.payload["goal_id"].astext.in_(goal_ids),
            )
            .order_by(EventLog.timestamp.desc(), EventLog.id.desc())
        )
        if event_ids is not None:
            query = query.filter(EventLog.id.in_(event_ids))
        return query.limit(limit).all()

    def pause_intervals(self, goal_ids):
        if "pause_intervals" in self._rows:
            rows = [
                row for row in self._rows["pause_intervals"] if row.goal_id in goal_ids
            ]
            return rows
        return (
            self.db_session.query(GoalPauseInterval)
            .filter(GoalPauseInterval.goal_id.in_(goal_ids))
            .all()
        )

    def activity_definition(self, activity_id):
        if activity_id not in self._definitions:
            self._definitions[activity_id] = (
                self.db_session.query(ActivityDefinition)
                .options(
                    joinedload(ActivityDefinition.metric_definitions).joinedload(
                        MetricDefinition.fractal_metric
                    ),
                    joinedload(ActivityDefinition.split_definitions),
                )
                .filter(
                    ActivityDefinition.id == activity_id,
                    ActivityDefinition.root_id == self.root_id,
                    ActivityDefinition.deleted_at.is_(None),
                )
                .first()
            )
        return self._definitions[activity_id]

    def associated_goal_ids(self, activity_id, goal_ids):
        result = {
            row.goal_id
            for row in self.direct_activities(goal_ids)
            if row.activity_id == activity_id
        }
        activity = self.activity_definition(activity_id)
        if activity and activity.group_id:
            result.update(
                row.goal_id
                for row in self.group_associations(goal_ids)
                if row.activity_group_id == activity.group_id
            )
        return result
