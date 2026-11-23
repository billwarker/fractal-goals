"""Canonical writes for a goal's activity groups: a goal links any number of live groups.

Every goal↔group write (goal detail link/unlink, the batch association editor, the group-side
goal editor, goal copy) goes through `set_goal_activity_groups`. Links are independent: adding one
group never removes another. Callers hold `lock_root`, own the commit, and emit the returned
pending events after it.
"""
from dataclasses import dataclass

from sqlalchemy import select

from models import (
    COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    ActivityGroup,
    Goal,
    goal_activity_group_associations,
)
from services.association_reconciliation import append_goal_association_event, reconcile_association_rows


@dataclass(frozen=True)
class GroupLinkChange:
    goal_id: str
    added_ids: frozenset
    removed_ids: frozenset

    @property
    def changed(self) -> bool:
        return bool(self.added_ids or self.removed_ids)


def lock_root(db_session, root_id):
    """Serialize group writes per fractal (also orders ancestor condition rollups)."""
    db_session.query(Goal.id).filter(Goal.id == root_id).with_for_update().one()


def live_group(db_session, root_id, group_id) -> ActivityGroup | None:
    return db_session.query(ActivityGroup).filter(
        ActivityGroup.id == group_id,
        ActivityGroup.root_id == root_id,
        ActivityGroup.deleted_at.is_(None),
    ).first()


def current_group_ids(db_session, goal_ids) -> dict[str, set[str]]:
    """{goal_id: live group ids} for the goals that hold any."""
    if not goal_ids:
        return {}
    table = goal_activity_group_associations
    result: dict[str, set[str]] = {}
    for goal_id, group_id in db_session.execute(
        select(table.c.goal_id, table.c.activity_group_id).where(
            table.c.goal_id.in_(list(goal_ids)),
            table.c.deleted_at.is_(None),
        )
    ).all():
        result.setdefault(goal_id, set()).add(group_id)
    return result


def goals_using_group(db_session, group_id) -> set[str]:
    table = goal_activity_group_associations
    return set(db_session.execute(
        select(table.c.goal_id).where(table.c.activity_group_id == group_id, table.c.deleted_at.is_(None))
    ).scalars())


def group_names(db_session, group_ids) -> dict[str, str]:
    group_ids = {group_id for group_id in group_ids if group_id}
    if not group_ids:
        return {}
    return dict(db_session.query(ActivityGroup.id, ActivityGroup.name).filter(
        ActivityGroup.id.in_(group_ids),
    ).all())


def set_goal_activity_groups(db_session, root_id, goal, group_ids, *, names=None) -> GroupLinkChange:
    """Make `group_ids` exactly the goal's live activity groups, recording a history event per change.

    The caller has validated the groups as live rows of `root_id` and holds `lock_root`.
    To add or remove one group, pass the goal's `current_group_ids` with it added or removed.
    """
    table = goal_activity_group_associations
    delta = reconcile_association_rows(
        db_session, table, table.c.goal_id, goal.id, table.c.activity_group_id, set(group_ids),
    )
    changed_ids = delta.added_ids | delta.removed_ids
    names = {**(names or {})}
    names.update(group_names(db_session, changed_ids - set(names)))
    for action, ids in (('disassociated', delta.removed_ids), ('associated', delta.added_ids)):
        for changed_id in sorted(ids):
            append_goal_association_event(
                db_session, root_id=root_id, goal_id=goal.id, association_kind='activity_group',
                association_id=changed_id, association_name=names.get(changed_id, 'Unknown'),
                action=action, occurred_at=delta.occurred_at,
            )
    return GroupLinkChange(goal.id, frozenset(delta.added_ids), frozenset(delta.removed_ids))


def reconcile_group_link_conditions(db_session, root_id, goal_ids, pending_events, *, trigger='activity_group_link_changed'):
    """Re-evaluate activity-threshold goals whose evidence a group link change can move.

    Evidence rolls upward, so each changed goal and its ancestors are candidates.
    """
    goal_ids = set(goal_ids)
    if not goal_ids:
        return {}
    rows = db_session.query(Goal.id, Goal.parent_id, Goal.completion_condition).filter(
        Goal.root_id == root_id, Goal.deleted_at.is_(None),
    ).all()
    parents = {goal_id: parent_id for goal_id, parent_id, _ in rows}
    threshold_ids = {
        goal_id for goal_id, _, condition in rows if condition == COMPLETION_CONDITION_ACTIVITY_THRESHOLD
    }
    candidates = set()
    for goal_id in goal_ids:
        seen = set()
        while goal_id and goal_id not in seen:
            seen.add(goal_id)
            if goal_id in threshold_ids:
                candidates.add(goal_id)
            goal_id = parents.get(goal_id)
    if not candidates:
        return {}

    from services.goal_condition_service import reconcile_goal
    from services.goal_loading import load_fractal_goals_for_serialization
    goals_by_id = load_fractal_goals_for_serialization(db_session, root_id)
    outcomes = {}
    for goal_id in sorted(candidates):
        goal = goals_by_id.get(goal_id)
        if goal is None:
            continue
        outcome = reconcile_goal(db_session, goal, goals_by_id, pending_events, trigger=trigger)
        if outcome:
            outcomes[goal_id] = outcome
    return outcomes
