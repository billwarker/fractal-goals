"""Canonical writes for a goal's activity group: at most one live group per goal.

Every goal↔group write (goal detail link/unlink, the batch association editor, the group-side
goal editor, goal copy) goes through `set_goal_activity_group`, which the partial unique index
`uq_goal_activity_group_associations_one_active` backs. Callers own the commit and emit the
returned pending events after it.
"""
from dataclasses import dataclass, field
from types import EllipsisType

from sqlalchemy import select
from sqlalchemy.exc import IntegrityError

from models import (
    COMPLETION_CONDITION_ACTIVITY_THRESHOLD,
    ActivityGroup,
    Goal,
    goal_activity_group_associations,
)
from services.association_reconciliation import append_goal_association_event, reconcile_association_rows

GROUP_TAKEN = 'goal_activity_group_taken'
GROUP_SINGLE = 'goal_activity_group_single'


@dataclass
class GoalActivityGroupError(Exception):
    message: str
    status: int
    code: str | None = None
    details: dict = field(default_factory=dict)

    def payload(self) -> dict:
        body = {'error': self.message}
        if self.code:
            body['code'] = self.code
        body.update(self.details)
        return body


@dataclass(frozen=True)
class GroupLinkChange:
    goal_id: str
    previous_group_id: str | None
    group_id: str | None

    @property
    def changed(self) -> bool:
        return self.previous_group_id != self.group_id


def lock_root(db_session, root_id):
    """Serialize group writes per fractal (also orders ancestor condition rollups)."""
    db_session.query(Goal.id).filter(Goal.id == root_id).with_for_update().one()


def live_group(db_session, root_id, group_id) -> ActivityGroup | None:
    return db_session.query(ActivityGroup).filter(
        ActivityGroup.id == group_id,
        ActivityGroup.root_id == root_id,
        ActivityGroup.deleted_at.is_(None),
    ).first()


def current_group_ids(db_session, goal_ids) -> dict[str, str]:
    """{goal_id: live group id} for the goals that hold one."""
    if not goal_ids:
        return {}
    table = goal_activity_group_associations
    return dict(db_session.execute(
        select(table.c.goal_id, table.c.activity_group_id).where(
            table.c.goal_id.in_(list(goal_ids)),
            table.c.deleted_at.is_(None),
        )
    ).all())


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


def taken_error(conflicts) -> GoalActivityGroupError:
    if len(conflicts) == 1:
        conflict = conflicts[0]
        message = (
            f"{conflict['goal_name']} already uses the activity group "
            f"{conflict['current_group']['name']}. A goal can have one activity group; replace it instead."
        )
    else:
        message = f"{len(conflicts)} goals already use another activity group. A goal can have one activity group."
    return GoalActivityGroupError(message, 409, GROUP_TAKEN, {
        'conflicts': conflicts,
        **({'current_group': conflicts[0]['current_group']} if len(conflicts) == 1 else {}),
    })


def set_goal_activity_group(
    db_session, root_id, goal, group, *, replace=False,
    current_group_id: str | None | EllipsisType = ..., names=None,
) -> GroupLinkChange:
    """Make `group` (or no group, for None) the goal's one live activity group.

    A different existing group raises 409 `goal_activity_group_taken` unless `replace`.
    The caller has validated `goal` and `group` as live rows of `root_id` and holds `lock_root`;
    callers that already read the goal's group pass it as `current_group_id` (None: no group).
    """
    previous = current_group_ids(db_session, [goal.id]).get(goal.id) if current_group_id is ... else current_group_id
    target = group.id if group is not None else None
    if previous == target:
        return GroupLinkChange(goal.id, previous, target)
    if previous and target and not replace:
        names = names or group_names(db_session, [previous])
        raise taken_error([{
            'goal_id': goal.id,
            'goal_name': goal.name,
            'current_group': {'id': previous, 'name': names.get(previous, 'Unknown')},
        }])

    table = goal_activity_group_associations
    delta = reconcile_association_rows(
        db_session, table, table.c.goal_id, goal.id, table.c.activity_group_id,
        {target} if target else set(),
    )
    names = {**(names or {}), **group_names(db_session, delta.removed_ids - set(names or {}))}
    if group is not None:
        names[group.id] = group.name
    for action, changed_ids in (('disassociated', delta.removed_ids), ('associated', delta.added_ids)):
        for changed_id in sorted(changed_ids):
            append_goal_association_event(
                db_session, root_id=root_id, goal_id=goal.id, association_kind='activity_group',
                association_id=changed_id, association_name=names.get(changed_id, 'Unknown'),
                action=action, occurred_at=delta.occurred_at,
            )
    return GroupLinkChange(goal.id, previous, target)


def flush_group_links(db_session):
    """Flush, mapping a concurrent writer's unique-index violation to the domain conflict."""
    try:
        db_session.flush()
    except IntegrityError as error:
        db_session.rollback()
        if 'uq_goal_activity_group_associations_one_active' not in str(error.orig):
            raise
        raise GoalActivityGroupError(
            'This goal was just given another activity group. Reload and try again.', 409, GROUP_TAKEN,
        ) from error


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
