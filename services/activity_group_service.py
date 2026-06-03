from sqlalchemy import func
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityGroup,
    Goal,
    goal_activity_group_associations,
    validate_root_goal,
    utc_now,
)
from services.events import Event, Events, event_bus
from services.payload_normalizers import normalize_activity_payload, normalize_id_list
from services.service_types import JsonDict, ServiceResult


def validate_activity_group_parent(db_session, root_id, group_id, parent_id):
    """Validate parent assignment to avoid missing refs and cycles."""
    if parent_id in (None, ''):
        return None

    parent = db_session.query(ActivityGroup).filter(
        ActivityGroup.id == parent_id,
        ActivityGroup.root_id == root_id,
        ActivityGroup.deleted_at.is_(None),
    ).first()
    if not parent:
        return "Parent group not found in this fractal"

    if group_id and parent_id == group_id:
        return "A group cannot be its own parent"

    depth = 0
    cursor = parent
    seen = set()
    while cursor and cursor.parent_id:
        if cursor.id in seen:
            return "Invalid parent group: cycle detected"
        seen.add(cursor.id)
        depth += 1
        cursor = db_session.query(ActivityGroup).filter(
            ActivityGroup.id == cursor.parent_id,
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).first()
    if depth + 1 >= 3:
        return "Maximum nesting depth (3 levels) reached. Cannot nest deeper."

    if not group_id:
        return None

    seen = set()
    cursor = parent
    while cursor:
        if cursor.id == group_id or cursor.id in seen:
            return "Invalid parent group: cycle detected"
        seen.add(cursor.id)
        if not cursor.parent_id:
            break
        cursor = db_session.query(ActivityGroup).filter(
            ActivityGroup.id == cursor.parent_id,
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).first()
    return None


def validate_activity_group_id(db_session, root_id, group_id):
    """Ensure activity group belongs to the same fractal."""
    if group_id in (None, ''):
        return None
    group = db_session.query(ActivityGroup).filter(
        ActivityGroup.id == group_id,
        ActivityGroup.root_id == root_id,
        ActivityGroup.deleted_at.is_(None),
    ).first()
    if not group:
        return "Invalid group_id for this fractal"
    return None


class ActivityGroupService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _replace_group_goal_associations(self, group_id, root_id, goal_ids) -> list[str]:
        goal_ids = normalize_id_list(goal_ids)
        valid_goal_ids = []
        if goal_ids:
            valid_goal_ids = [
                goal_id
                for (goal_id,) in self.db_session.query(Goal.id).filter(
                    Goal.id.in_(goal_ids),
                    Goal.root_id == root_id,
                    Goal.deleted_at.is_(None),
                ).all()
            ]

        self.db_session.execute(
            goal_activity_group_associations.delete().where(
                goal_activity_group_associations.c.activity_group_id == group_id
            )
        )
        if valid_goal_ids:
            self.db_session.execute(
                goal_activity_group_associations.insert(),
                [
                    {"activity_group_id": group_id, "goal_id": goal_id}
                    for goal_id in valid_goal_ids
                ],
            )
        return valid_goal_ids

    def _get_active_group(self, root_id, group_id) -> ActivityGroup | None:
        return self.db_session.query(ActivityGroup).filter(
            ActivityGroup.id == group_id,
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).first()

    def _get_group_subtree(self, root_id, group_id) -> list[ActivityGroup]:
        groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).all()
        groups_by_id = {group.id: group for group in groups}
        children_by_parent: dict[str | None, list[ActivityGroup]] = {}
        for group in groups:
            children_by_parent.setdefault(group.parent_id, []).append(group)

        subtree: list[ActivityGroup] = []
        stack = [group_id]
        seen: set[str] = set()
        while stack:
            current_id = stack.pop()
            if current_id in seen:
                continue
            seen.add(current_id)

            current = groups_by_id.get(current_id)
            if not current:
                continue

            subtree.append(current)
            stack.extend(child.id for child in children_by_parent.get(current.id, []))

        return subtree

    def list_activity_groups(self, root_id, current_user_id) -> ServiceResult[list[ActivityGroup]]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        groups = self.db_session.query(ActivityGroup).filter(
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).options(
            selectinload(ActivityGroup.associated_goals),
        ).order_by(
            ActivityGroup.sort_order,
            ActivityGroup.created_at,
        ).all()
        return groups, None, 200

    def create_activity_group(self, root_id, current_user_id, data) -> ServiceResult[ActivityGroup]:
        data = normalize_activity_payload(data)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        parent_id = data.get('parent_id')
        parent_err = validate_activity_group_parent(self.db_session, root_id, None, parent_id)
        if parent_err:
            return None, parent_err, 400

        max_order = self.db_session.query(func.max(ActivityGroup.sort_order)).filter(
            ActivityGroup.root_id == root_id,
            ActivityGroup.deleted_at.is_(None),
        ).scalar()
        new_order = (max_order or 0) + 1

        new_group = ActivityGroup(
            root_id=root_id,
            name=data['name'],
            description=data.get('description', ''),
            sort_order=new_order,
            parent_id=parent_id,
        )
        self.db_session.add(new_group)
        self.db_session.flush()

        goal_ids = data.get('goal_ids', [])
        if goal_ids:
            self._replace_group_goal_associations(new_group.id, root_id, goal_ids)

        self.db_session.commit()
        new_group_id = new_group.id
        new_group_name = new_group.name
        self.db_session.expunge(new_group)
        created_group = self.db_session.query(ActivityGroup).filter_by(
            id=new_group_id,
            root_id=root_id,
        ).filter(ActivityGroup.deleted_at.is_(None)).first()

        event_bus.emit(Event(Events.ACTIVITY_GROUP_CREATED, {
            'group_id': new_group_id,
            'name': new_group_name,
            'root_id': root_id,
        }, source='activity_service.create_activity_group'))

        return created_group, None, 201

    def update_activity_group(self, root_id, group_id, current_user_id, data) -> ServiceResult[ActivityGroup]:
        data = normalize_activity_payload(data, partial=True)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        group = self._get_active_group(root_id, group_id)
        if not group:
            return None, "Group not found", 404

        if 'parent_id' in data:
            parent_err = validate_activity_group_parent(self.db_session, root_id, group_id, data.get('parent_id'))
            if parent_err:
                return None, parent_err, 400

        if 'name' in data:
            group.name = data['name']
        if 'description' in data:
            group.description = data['description']
        if 'parent_id' in data:
            group.parent_id = data['parent_id']

        if 'goal_ids' in data:
            self._replace_group_goal_associations(group.id, root_id, data.get('goal_ids', []))

        self.db_session.commit()
        self.db_session.refresh(group)
        if 'goal_ids' in data:
            self.db_session.expire(group, ['associated_goals'])

        event_bus.emit(Event(Events.ACTIVITY_GROUP_UPDATED, {
            'group_id': group.id,
            'name': group.name,
            'root_id': root_id,
            'updated_fields': list(data.keys()),
        }, source='activity_service.update_activity_group'))

        return group, None, 200

    def delete_activity_group(self, root_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        group = self._get_active_group(root_id, group_id)
        if not group:
            return None, "Group not found", 404

        groups_to_delete = self._get_group_subtree(root_id, group_id)
        group_ids_to_delete = [doomed_group.id for doomed_group in groups_to_delete]

        activities = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.group_id.in_(group_ids_to_delete),
            ActivityDefinition.deleted_at.is_(None),
        ).all()
        for activity in activities:
            activity.group_id = None

        deleted_group_id = group.id
        deleted_group_name = group.name
        deleted_at = utc_now()
        for doomed_group in groups_to_delete:
            doomed_group.deleted_at = deleted_at
        self.db_session.commit()

        event_bus.emit(Event(Events.ACTIVITY_GROUP_DELETED, {
            'group_id': deleted_group_id,
            'name': deleted_group_name,
            'root_id': root_id,
        }, source='activity_service.delete_activity_group'))

        return {"message": "Group deleted"}, None, 200

    def reorder_activity_groups(self, root_id, current_user_id, group_ids) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        for idx, group_id in enumerate(group_ids):
            group = self._get_active_group(root_id, group_id)
            if group:
                group.sort_order = idx

        self.db_session.commit()
        return {"message": "Groups reordered"}, None, 200

    def set_activity_group_goals(self, root_id, group_id, current_user_id, goal_ids) -> ServiceResult[ActivityGroup]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        group = self._get_active_group(root_id, group_id)
        if not group:
            return None, "Activity group not found", 404

        self._replace_group_goal_associations(group_id, root_id, goal_ids)
        self.db_session.commit()
        self.db_session.refresh(group)
        self.db_session.expire(group, ['associated_goals'])

        event_bus.emit(Event(Events.ACTIVITY_GROUP_UPDATED, {
            'group_id': group_id,
            'name': group.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.set_activity_group_goals'))

        return group, None, 200
