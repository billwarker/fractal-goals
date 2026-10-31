"""Relational goal/session evidence reused by aggregate analytics reads.

Carry chart and aggregate columns through the evidence union. Every join here is a
fenced LATERAL lookup keyed by the outer row, so the plan stays linear even when
PostgreSQL statistics lag behind a bulk history import or a restore.
"""
from sqlalchemy import Float, cast, func, select, true, union
from sqlalchemy.orm import aliased
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
    # Drive every lookup from the root's goals through fenced LATERAL subqueries
    # (OFFSET/LIMIT stop PostgreSQL flattening them), so each step is an indexed probe
    # keyed by the outer row: goal -> session_goals (goal_id index) -> session (primary
    # key). With stale statistics a flattened join plans nested unparameterized scans
    # and turns quadratic (about 50 s for 10,000 sessions).
    root_goals = select(Goal.id).where(Goal.root_id == root_id, Goal.deleted_at.is_(None)).cte('analytics_root_goals')
    goal_sessions = select(session_goals.c.session_id).where(
        session_goals.c.goal_id == root_goals.c.id,
    ).offset(0).lateral('analytics_goal_sessions')
    # Tenant and deletion checks stay outside each fenced lookup: inside, the planner
    # could otherwise pick the tenant index and filter by key, rescanning the root.
    linked_session = select(Session.id, Session.session_start, Session.root_id, Session.deleted_at,
                            duration.label('duration_seconds')).where(
        Session.id == goal_sessions.c.session_id,
    ).limit(1).lateral('analytics_linked_session')
    manual = select(root_goals.c.id.label('goal_id'), linked_session.c.id.label('session_id'),
                    linked_session.c.session_start, linked_session.c.duration_seconds).select_from(
        root_goals,
    ).join(goal_sessions, true()).join(linked_session, true()).where(
        linked_session.c.root_id == root_id, linked_session.c.deleted_at.is_(None),
    ).cte('analytics_manual_sessions').prefix_with('MATERIALIZED')
    links = activity_instance_goal_associations
    goal_links = select(links.c.activity_instance_id, links.c.deleted_at).where(
        links.c.goal_id == ancestors.c.descendant_id,
    ).offset(0).lateral('analytics_goal_links')
    linked_instance_row = select(
        ActivityInstance.id, ActivityInstance.activity_definition_id, ActivityInstance.duration_seconds,
        ActivityInstance.session_id, ActivityInstance.root_id, ActivityInstance.deleted_at,
        ActivityInstance.completed, ActivityInstance.time_start, ActivityInstance.created_at,
    ).where(ActivityInstance.id == goal_links.c.activity_instance_id).limit(1).lateral('analytics_linked_instance')
    linked_instance = aliased(ActivityInstance, linked_instance_row)
    instance_session = select(Session.session_start, Session.root_id, Session.deleted_at).where(
        Session.id == linked_instance.session_id,
    ).limit(1).lateral('analytics_instance_session')
    explicit = select(ancestors.c.goal_id, linked_instance.id.label('instance_id'),
                      linked_instance.activity_definition_id, linked_instance.duration_seconds,
                      linked_instance.session_id, instance_session.c.session_start).select_from(
        ancestors,
    ).join(goal_links, true()).join(linked_instance_row, true()).join(
        Goal, Goal.id == ancestors.c.goal_id,
    ).join(instance_session, true()).where(
        goal_links.c.deleted_at.is_(None), linked_instance.root_id == root_id,
        linked_instance.deleted_at.is_(None), linked_instance.completed.is_(True),
        instance_session.c.root_id == root_id, instance_session.c.deleted_at.is_(None),
        instance_contribution_clause(linked_instance, Goal),
    ).distinct().cte('analytics_explicit_instances').prefix_with('MATERIALIZED')
    explicit_time = select(explicit.c.goal_id, explicit.c.session_id, explicit.c.session_start,
                           cast(func.sum(func.coalesce(explicit.c.duration_seconds, 0)), Float).label('duration_seconds'))
    explicit_time = explicit_time.where(~select(manual.c.session_id).where(
        manual.c.goal_id == explicit.c.goal_id, manual.c.session_id == explicit.c.session_id,
    ).exists()).group_by(explicit.c.goal_id, explicit.c.session_id, explicit.c.session_start)
    sessions = union(select(manual), explicit_time).cte('analytics_session_evidence')
    session_instances = select(
        ActivityInstance.id, ActivityInstance.activity_definition_id, ActivityInstance.duration_seconds,
        ActivityInstance.root_id, ActivityInstance.deleted_at,
    ).where(ActivityInstance.session_id == manual.c.session_id).offset(0).lateral('analytics_session_instances')
    instances = union(
        select(manual.c.goal_id, session_instances.c.id.label('instance_id'), session_instances.c.activity_definition_id,
               session_instances.c.duration_seconds, manual.c.session_id, manual.c.session_start).select_from(
            manual,
        ).join(session_instances, true()).where(
            session_instances.c.root_id == root_id, session_instances.c.deleted_at.is_(None),
        ),
        select(explicit),
    ).cte('analytics_instance_evidence').prefix_with('MATERIALIZED')
    return sessions, instances
