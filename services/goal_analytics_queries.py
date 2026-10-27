"""Relational goal/session evidence reused by aggregate analytics reads.

Carry chart and aggregate columns through the evidence union. Joining an unindexed
CTE of occurrence IDs back to sessions/instances can cause quadratic nested loops
when PostgreSQL statistics lag behind a bulk history import.
"""
from sqlalchemy import Float, cast, func, select, true, union
from models import ActivityInstance, Goal, Session, activity_instance_goal_associations, session_goals
from services.instance_goal_evidence import instance_contribution_clause


def analytics_evidence(root_id):
    ancestors = select(Goal.id.label('descendant_id'), Goal.id.label('goal_id'), Goal.parent_id).where(
        Goal.root_id == root_id, Goal.deleted_at.is_(None),
    ).cte('analytics_ancestors', recursive=True)
    ancestors = ancestors.union(select(ancestors.c.descendant_id, Goal.id, Goal.parent_id).join(
        ancestors, Goal.id == ancestors.c.parent_id,
    ).where(Goal.root_id == root_id, Goal.deleted_at.is_(None)))
    fallback_duration = func.trunc(func.extract('epoch', Session.session_end - Session.session_start))
    duration = cast(func.coalesce(func.nullif(Session.total_duration_seconds, 0), fallback_duration, 0), Float)
    manual_scope = (Session.root_id == root_id, Session.deleted_at.is_(None),
                    Goal.root_id == root_id, Goal.deleted_at.is_(None))
    manual = select(session_goals.c.goal_id, Session.id.label('session_id'), Session.session_start,
                    duration.label('duration_seconds')).join(
        Session, Session.id == session_goals.c.session_id,
    ).join(Goal, Goal.id == session_goals.c.goal_id).where(
        *manual_scope,
    ).cte('analytics_manual_sessions').prefix_with('MATERIALIZED')
    links = activity_instance_goal_associations
    # Keep the session lookup correlated and bounded. With stale tenant statistics,
    # a flattened join can scan every root session for every instance before finding
    # that the explicit-link table is empty. LIMIT prevents that join reordering;
    # tenant/deletion checks stay outside it so the inner lookup uses the primary key.
    instance_session = select(Session.session_start, Session.root_id, Session.deleted_at).where(
        Session.id == ActivityInstance.session_id,
    ).limit(1).lateral('analytics_instance_session')
    explicit = select(ancestors.c.goal_id, ActivityInstance.id.label('instance_id'),
                      ActivityInstance.activity_definition_id, ActivityInstance.duration_seconds,
                      ActivityInstance.session_id, instance_session.c.session_start).join(
        links, links.c.goal_id == ancestors.c.descendant_id,
    ).join(ActivityInstance, ActivityInstance.id == links.c.activity_instance_id).join(
        Goal, Goal.id == ancestors.c.goal_id,
    ).join(instance_session, true()).where(
        links.c.deleted_at.is_(None), ActivityInstance.root_id == root_id,
        ActivityInstance.deleted_at.is_(None), ActivityInstance.completed.is_(True),
        instance_session.c.root_id == root_id, instance_session.c.deleted_at.is_(None),
        instance_contribution_clause(ActivityInstance, Goal),
    ).distinct().cte('analytics_explicit_instances').prefix_with('MATERIALIZED')
    explicit_time = select(explicit.c.goal_id, explicit.c.session_id, explicit.c.session_start,
                           cast(func.sum(func.coalesce(explicit.c.duration_seconds, 0)), Float).label('duration_seconds'))
    explicit_time = explicit_time.where(~select(manual.c.session_id).where(
        manual.c.goal_id == explicit.c.goal_id, manual.c.session_id == explicit.c.session_id,
    ).exists()).group_by(explicit.c.goal_id, explicit.c.session_id, explicit.c.session_start)
    sessions = union(select(manual), explicit_time).cte('analytics_session_evidence')
    instances = union(
        select(session_goals.c.goal_id, ActivityInstance.id.label('instance_id'), ActivityInstance.activity_definition_id,
               ActivityInstance.duration_seconds, ActivityInstance.session_id, Session.session_start).select_from(
            ActivityInstance,
        ).join(session_goals, session_goals.c.session_id == ActivityInstance.session_id).join(
            Session, Session.id == ActivityInstance.session_id,
        ).join(Goal, Goal.id == session_goals.c.goal_id).where(
            *manual_scope, ActivityInstance.root_id == root_id, ActivityInstance.deleted_at.is_(None),
        ),
        select(explicit),
    ).cte('analytics_instance_evidence').prefix_with('MATERIALIZED')
    return sessions, instances
