"""Canonical per-execution attribution. Explicit links never widen definition scope."""
from sqlalchemy import select
from models import ActivityInstance, Goal, Session, activity_instance_goal_associations
from services.goal_contribution import as_utc_datetime, resolve_contribution_goal


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
            scope = select(Goal.id).where(
                Goal.id.in_(goal_ids), Goal.root_id == root_id, Goal.deleted_at.is_(None),
            ).cte('instance_goal_scope', recursive=True)
            scope = scope.union(select(Goal.id).join(scope, Goal.parent_id == scope.c.id).where(
                Goal.root_id == root_id, Goal.deleted_at.is_(None),
            ))
            query = query.where(table.c.goal_id.in_(select(scope.c.id)))
        else:
            query = query.where(table.c.goal_id.in_(goal_ids))
    result = {}
    for instance_id, goal_id in db_session.execute(query):
        result.setdefault(instance_id, set()).add(goal_id)
    return result


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
