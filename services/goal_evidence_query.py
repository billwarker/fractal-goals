"""SQL identity projection for goal evidence; pages and calendars share one scope."""
from typing import Any
from sqlalchemy import Float, cast, func, literal, or_, select, union_all
from models import (
    ActivityDefinition, ActivityInstance, EventLog, Goal, GoalPauseInterval, Session,
    activity_goal_associations, activity_instance_goal_associations, goal_activity_group_associations,
)
from services.instance_goal_evidence import instance_contribution_clause

ASSOCIATION_EVENTS = (
    'activity.associated', 'activity.disassociated', 'activity_group.associated',
    'activity_group.disassociated', 'activity_instance.associated', 'activity_instance.disassociated',
)


def timeline_evidence_query(root_id, goal_ids, *, inherited_parent_id=None):
    """Deduplicate executions with EXISTS; retain the canonical source eligibility rules."""
    sources = set(goal_ids) | ({inherited_parent_id} if inherited_parent_id else set())
    direct = select(activity_goal_associations.c.goal_id).where(
        activity_goal_associations.c.goal_id == Goal.id,
        activity_goal_associations.c.activity_id == ActivityInstance.activity_definition_id,
        activity_goal_associations.c.deleted_at.is_(None),
    ).correlate(Goal, ActivityInstance).exists()
    grouped = select(ActivityDefinition.id).join(
        goal_activity_group_associations,
        goal_activity_group_associations.c.activity_group_id == ActivityDefinition.group_id,
    ).where(
        ActivityDefinition.id == ActivityInstance.activity_definition_id,
        ActivityDefinition.root_id == root_id, ActivityDefinition.deleted_at.is_(None),
        goal_activity_group_associations.c.goal_id == Goal.id,
        goal_activity_group_associations.c.deleted_at.is_(None),
    ).correlate(Goal, ActivityInstance).exists()
    explicit = select(activity_instance_goal_associations.c.goal_id).where(
        activity_instance_goal_associations.c.goal_id == Goal.id,
        activity_instance_goal_associations.c.goal_id.in_(goal_ids),
        activity_instance_goal_associations.c.activity_instance_id == ActivityInstance.id,
        activity_instance_goal_associations.c.deleted_at.is_(None),
    ).correlate(Goal, ActivityInstance).exists()
    eligible = select(Goal.id).where(
        Goal.root_id == root_id, Goal.id.in_(sources),
        or_(direct, grouped, explicit), instance_contribution_clause(ActivityInstance, Goal),
    ).correlate(ActivityInstance).exists()

    def row(prefix, entity_id, timestamp, event_type, entity_type, duration: Any = 0):
        return select(
            (literal(prefix + ':') + entity_id).label('id'), timestamp.label('timestamp'),
            literal(event_type).label('event_type'), entity_id.label('entity_id'),
            literal(entity_type).label('entity_type'), cast(literal(duration) if isinstance(duration, int) else duration, Float).label('duration_seconds'),
        )

    activity = row('activity_completed', ActivityInstance.id,
                   func.coalesce(ActivityInstance.time_stop, ActivityInstance.time_start, ActivityInstance.created_at),
                   'activity.completed', 'activity_instance', func.coalesce(ActivityInstance.duration_seconds, 0)).where(
        ActivityInstance.root_id == root_id, ActivityInstance.completed.is_(True),
        ActivityInstance.deleted_at.is_(None),
        or_(ActivityInstance.session_id.is_(None), ActivityInstance.session.has(Session.deleted_at.is_(None))),
        eligible,
    )
    queries = [activity]
    for prefix, timestamp, event_type in (
        ('goal_lifecycle_created', Goal.created_at, 'goal.created'),
        ('goal_lifecycle_completed', Goal.completed_at, 'goal.completed'),
        ('goal_lifecycle_uncompleted', Goal.manually_uncompleted_at, 'goal.uncompleted'),
    ):
        query = row(prefix, Goal.id, timestamp, event_type, 'goal').where(
            Goal.root_id == root_id, Goal.id.in_(goal_ids), Goal.deleted_at.is_(None),
        )
        if event_type == 'goal.completed':
            query = query.where(Goal.completed.is_(True))
        elif event_type == 'goal.uncompleted':
            query = query.where(or_(Goal.completed.is_not(True), Goal.completed_at.is_(None)))
        queries.append(query)
    for prefix, timestamp, event_type in (
        ('goal_lifecycle_paused', GoalPauseInterval.paused_at, 'goal.paused'),
        ('goal_lifecycle_resumed', GoalPauseInterval.resumed_at, 'goal.resumed'),
    ):
        queries.append(row(prefix, GoalPauseInterval.id, timestamp, event_type, 'goal').where(
            GoalPauseInterval.root_id == root_id, GoalPauseInterval.goal_id.in_(goal_ids),
        ))
    queries.append(select(
        (literal('association_event:') + EventLog.id).label('id'), EventLog.timestamp.label('timestamp'),
        EventLog.event_type.label('event_type'), EventLog.entity_id.label('entity_id'),
        EventLog.entity_type.label('entity_type'), cast(literal(0), Float).label('duration_seconds'),
    ).where(EventLog.root_id == root_id, EventLog.event_type.in_(ASSOCIATION_EVENTS),
            EventLog.payload['goal_id'].astext.in_(sources)))
    return union_all(*queries).subquery('goal_evidence')
