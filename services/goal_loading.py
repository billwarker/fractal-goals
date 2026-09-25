from sqlalchemy import or_
from sqlalchemy.orm import joinedload, selectinload, with_loader_criteria
from sqlalchemy.orm.attributes import set_committed_value

from models import ActivityGroup, Goal, Target


def goal_serializer_relationship_loaders():
    """Relationship loaders for everything serialize_goal reads.

    Usable at the top level or nested under a relationship that yields goals,
    e.g. ``selectinload(Session.goals).options(*goal_serializer_relationship_loaders())``.
    """
    return [
        joinedload(Goal.level),
        selectinload(Goal.targets_rel).joinedload(Target.metric_conditions),
        selectinload(Goal.associated_activities),
        selectinload(Goal.associated_activity_groups),
        selectinload(Goal.pause_intervals),
    ]


def goal_serializer_load_options(*, include_group_activities=False):
    """Eager-load relationships touched by serialize_goal and goal timeline views."""
    options = [
        with_loader_criteria(Goal, Goal.deleted_at.is_(None), include_aliases=True),
        *goal_serializer_relationship_loaders(),
    ]
    if include_group_activities:
        options.append(selectinload(Goal.associated_activity_groups).selectinload(ActivityGroup.activities))
    return options


def load_fractal_goals_for_serialization(db_session, root_id, *, include_group_activities=False):
    goals = db_session.query(Goal).options(
        *goal_serializer_load_options(include_group_activities=include_group_activities)
    ).filter(
        or_(Goal.root_id == root_id, Goal.id == root_id),
        Goal.deleted_at.is_(None),
    ).order_by(
        Goal.parent_id.asc().nullsfirst(),
        Goal.sort_order.asc(),
        Goal.created_at.asc(),
        Goal.id.asc(),
    ).all()

    children_by_parent = {}
    for goal in goals:
        children_by_parent.setdefault(goal.parent_id, []).append(goal)

    for goal in goals:
        set_committed_value(goal, "children", children_by_parent.get(goal.id, []))

    return {goal.id: goal for goal in goals}
