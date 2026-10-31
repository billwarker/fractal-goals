"""Canonical per-execution attribution. Explicit links never widen definition scope."""
from sqlalchemy import select, func, or_, not_
from models import ActivityDefinition, ActivityInstance, Goal, GoalPauseInterval, Session, activity_instance_goal_associations
from services.goal_contribution import as_utc_datetime, resolve_contribution_goal


def goal_scope_cte(root_id, goal_ids, name='instance_goal_scope'):
    """Recursive CTE of the live `goal_ids` and every live descendant, within one fractal."""
    scope = select(Goal.id).where(
        Goal.id.in_(goal_ids), Goal.root_id == root_id, Goal.deleted_at.is_(None),
    ).cte(name, recursive=True)
    return scope.union(select(Goal.id).join(scope, Goal.parent_id == scope.c.id).where(
        Goal.root_id == root_id, Goal.deleted_at.is_(None),
    ))


def load_instance_goal_ids(db_session, root_id, *, instance_ids=None, goal_ids=None, include_descendants=False):
    """One tenant-scoped query, returning active direct links keyed by instance."""
    if instance_ids is not None and not instance_ids or goal_ids is not None and not goal_ids:
        return {}
    table = activity_instance_goal_associations
    query = select(table.c.activity_instance_id, table.c.goal_id).join(
        ActivityInstance, ActivityInstance.id == table.c.activity_instance_id,
    ).join(Goal, Goal.id == table.c.goal_id).where(
        ActivityInstance.root_id == root_id, ActivityInstance.deleted_at.is_(None),
        ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None)),
        Goal.root_id == root_id, Goal.deleted_at.is_(None), table.c.deleted_at.is_(None),
    )
    if instance_ids is not None:
        query = query.where(table.c.activity_instance_id.in_(instance_ids))
    if goal_ids is not None:
        if include_descendants:
            scope = goal_scope_cte(root_id, goal_ids)
            query = query.where(table.c.goal_id.in_(select(scope.c.id)))
        else:
            query = query.where(table.c.goal_id.in_(goal_ids))
    result = {}
    for instance_id, goal_id in db_session.execute(query):
        result.setdefault(instance_id, set()).add(goal_id)
    return result


INSTANCE_LINKED_ACTIVITY_LIMIT = 500


def load_instance_linked_activities(db_session, root_id, goal_id, *, limit=INSTANCE_LINKED_ACTIVITY_LIMIT):
    """Live definitions whose live instances are directly linked to the goal or a descendant.

    One-off links stay execution evidence: this read never adds the definition to the goal's
    reusable catalog (`resolve_effective_activity_entries`). Newest link first, bounded.
    """
    table = activity_instance_goal_associations
    scope = goal_scope_cte(root_id, [goal_id], name='instance_link_goal_scope')
    last_linked = func.max(table.c.created_at)
    rows = db_session.execute(
        select(
            ActivityDefinition.id, ActivityDefinition.name, ActivityDefinition.group_id,
            func.count(func.distinct(table.c.activity_instance_id)), last_linked,
            func.array_agg(func.distinct(table.c.goal_id)),
        ).select_from(table).join(
            ActivityInstance, ActivityInstance.id == table.c.activity_instance_id,
        ).join(
            ActivityDefinition, ActivityDefinition.id == ActivityInstance.activity_definition_id,
        ).where(
            table.c.deleted_at.is_(None),
            table.c.goal_id.in_(select(scope.c.id)),
            ActivityInstance.root_id == root_id, ActivityInstance.deleted_at.is_(None),
            ActivityInstance.session_id.is_(None) | ActivityInstance.session.has(Session.deleted_at.is_(None)),
            ActivityDefinition.root_id == root_id, ActivityDefinition.deleted_at.is_(None),
        ).group_by(
            ActivityDefinition.id, ActivityDefinition.name, ActivityDefinition.group_id,
        ).order_by(last_linked.desc(), ActivityDefinition.id).limit(limit + 1)
    ).all()
    return [{
        'id': definition_id,
        'name': name,
        'group_id': group_id,
        'link_count': link_count,
        'last_linked_at': linked_at,
        'linked_goal_ids': sorted(linked_goal_ids or []),
    } for definition_id, name, group_id, link_count, linked_at, linked_goal_ids in rows[:limit]], len(rows) > limit


def instance_source_goal_ids(instance_id, definition_goal_ids, direct_links, scope_ids):
    """Union sources once; callers may include inherited definition sources separately."""
    return set(definition_goal_ids) | (direct_links.get(instance_id, set()) & set(scope_ids))


def instance_contributes_to_goal(instance, goal):
    """Use execution time, goal lifetime, and canonical pause/completion exclusions."""
    occurred_at = as_utc_datetime(instance.time_start or instance.created_at)
    created_at = as_utc_datetime(goal.created_at) if goal else None
    if not occurred_at or not goal or goal.deleted_at or created_at and occurred_at < created_at:
        return False
    return resolve_contribution_goal(goal, occurred_at) is not None


def resolve_instance_goals(instance_id, definition_goals, direct_links, goals_by_id, occurred_at=None):
    goals = {goal.id: goal for goal in definition_goals if goal and not goal.deleted_at}
    for goal_id in direct_links.get(instance_id, set()):
        goal = goals_by_id.get(goal_id)
        seen = set()
        while goal and goal.id not in seen:
            seen.add(goal.id)
            created_at = as_utc_datetime(getattr(goal, "created_at", None))
            timestamp = as_utc_datetime(occurred_at)
            if not goal.deleted_at and (not timestamp or not created_at or timestamp >= created_at):
                goals[goal.id] = goal
            goal = goals_by_id.get(goal.parent_id)
    return list(goals.values())


def instance_contribution_clause(instance, goal):
    """SQL equivalent of instance_contributes_to_goal, shared by aggregate reads."""
    occurred = func.coalesce(instance.time_start, instance.created_at)
    paused = select(GoalPauseInterval.id).where(
        GoalPauseInterval.goal_id == goal.id,
        GoalPauseInterval.paused_at <= occurred,
        or_(GoalPauseInterval.resumed_at.is_(None), GoalPauseInterval.resumed_at > occurred),
    ).correlate(instance, goal).exists()
    return (goal.deleted_at.is_(None) & goal.paused.is_not(True)
            & occurred.is_not(None)
            & or_(goal.created_at.is_(None), occurred >= goal.created_at)
            & or_(goal.completed_at.is_(None), occurred <= goal.completed_at)
            & not_(paused))
