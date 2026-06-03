from sqlalchemy import select

from models import (
    ActivityDefinition,
    ActivityGroup,
    Goal,
    activity_goal_associations,
    goal_activity_group_associations,
    validate_root_goal,
)
from services.events import Event, Events, event_bus
from services.goal_loading import load_fractal_goals_for_serialization
from services.payload_normalizers import normalize_id_list
from services.service_types import JsonDict, JsonList, ServiceResult


class ActivityAssociationService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def replace_activity_goal_associations(self, activity_id, root_id, goal_ids) -> list[str]:
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
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id
            )
        )
        if valid_goal_ids:
            self.db_session.execute(
                activity_goal_associations.insert(),
                [
                    {"activity_id": activity_id, "goal_id": goal_id}
                    for goal_id in valid_goal_ids
                ],
            )
        return valid_goal_ids

    def set_activity_goals(self, root_id, activity_id, current_user_id, goal_ids) -> ServiceResult[ActivityDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return None, "Activity not found", 404

        self.replace_activity_goal_associations(activity_id, root_id, goal_ids)

        self.db_session.commit()
        self.db_session.expire(activity, ['associated_goals'])

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity_id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.set_activity_goals'))

        return activity, None, 200

    def remove_activity_goal(self, root_id, activity_id, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return None, "Activity not found", 404

        result = self.db_session.execute(
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id,
                activity_goal_associations.c.goal_id == goal_id,
            )
        )
        if result.rowcount == 0:
            return None, "Association not found", 404

        self.db_session.commit()

        event_bus.emit(Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity_id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.remove_activity_goal'))

        return {"message": "Goal association removed"}, None, 200

    def set_goal_associations_batch(
        self, root_id, goal_id, current_user_id, activity_ids, group_ids
    ) -> ServiceResult[JsonDict]:
        activity_ids = normalize_id_list(activity_ids)
        group_ids = normalize_id_list(group_ids)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goals_by_id = load_fractal_goals_for_serialization(
            self.db_session,
            root_id,
            include_group_activities=True,
        )
        goal = goals_by_id.get(goal_id)
        if not goal:
            return None, "Goal not found", 404

        if not isinstance(activity_ids, list) or not isinstance(group_ids, list):
            return None, "activity_ids and group_ids must be lists", 400

        valid_activities = self.db_session.query(ActivityDefinition.id).filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.id.in_(activity_ids),
            ActivityDefinition.deleted_at.is_(None),
        ).all()
        valid_groups = self.db_session.query(ActivityGroup.id).filter(
            ActivityGroup.root_id == root_id,
            ActivityGroup.id.in_(group_ids),
            ActivityGroup.deleted_at.is_(None),
        ).all()
        valid_activity_ids = {row[0] for row in valid_activities}
        valid_group_ids = {row[0] for row in valid_groups}

        self.db_session.execute(
            activity_goal_associations.delete().where(activity_goal_associations.c.goal_id == goal_id)
        )
        if valid_activity_ids:
            self.db_session.execute(
                activity_goal_associations.insert(),
                [{"goal_id": goal_id, "activity_id": activity_id} for activity_id in valid_activity_ids],
            )

        self.db_session.execute(
            goal_activity_group_associations.delete().where(goal_activity_group_associations.c.goal_id == goal_id)
        )
        if valid_group_ids:
            self.db_session.execute(
                goal_activity_group_associations.insert(),
                [{"goal_id": goal_id, "activity_group_id": group_id} for group_id in valid_group_ids],
            )

        self.db_session.commit()
        return {
            "activity_ids": list(valid_activity_ids),
            "group_ids": list(valid_group_ids),
        }, None, 200

    def get_goal_activities(self, root_id, goal_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        def upsert_activity(
            activity,
            activities_map,
            *,
            is_inherited,
            source_name=None,
            source_goal_id=None,
            from_linked_group=False,
            direction=None,
        ):
            entry = activities_map.get(activity.id)
            if entry is None:
                entry = {
                    "id": activity.id,
                    "name": activity.name,
                    "description": activity.description,
                    "group_id": activity.group_id,
                    "from_linked_group": from_linked_group,
                    "has_direct_association": not is_inherited,
                    "inherited_from_children": direction == "child",
                    "inherited_from_parent": direction == "parent",
                    "inherited_source_goal_names": [source_name] if direction == "child" and source_name else [],
                    "inherited_source_goal_ids": [source_goal_id] if direction == "child" and source_goal_id else [],
                    "is_inherited": is_inherited,
                    "source_goal_name": source_name if is_inherited else None,
                    "source_goal_id": source_goal_id if is_inherited else None,
                }
                activities_map[activity.id] = entry
                return

            if is_inherited:
                if direction == "parent":
                    entry["inherited_from_parent"] = True
                else:
                    entry["inherited_from_children"] = True
                    if source_name and source_name not in entry["inherited_source_goal_names"]:
                        entry["inherited_source_goal_names"].append(source_name)
                    if source_goal_id and source_goal_id not in entry["inherited_source_goal_ids"]:
                        entry["inherited_source_goal_ids"].append(source_goal_id)
                if entry["source_goal_name"] is None and source_name:
                    entry["source_goal_name"] = source_name
                if entry["source_goal_id"] is None and source_goal_id:
                    entry["source_goal_id"] = source_goal_id
                return

            entry["has_direct_association"] = True
            entry["is_inherited"] = False
            entry["from_linked_group"] = from_linked_group
            if not entry["inherited_from_children"]:
                entry["source_goal_name"] = None
                entry["source_goal_id"] = None

        def process_goal(goal_node, activities_map, *, is_inherited=False, source_name=None, direction=None):
            source_goal_id = goal_node.id if is_inherited else None

            for activity in goal_node.associated_activities:
                if activity.deleted_at:
                    continue

                upsert_activity(
                    activity,
                    activities_map,
                    is_inherited=is_inherited,
                    source_name=source_name,
                    source_goal_id=source_goal_id,
                    from_linked_group=False,
                    direction=direction,
                )

            for group in goal_node.associated_activity_groups:
                for activity in group.activities:
                    if activity.deleted_at:
                        continue

                    upsert_activity(
                        activity,
                        activities_map,
                        is_inherited=is_inherited,
                        source_name=source_name,
                        source_goal_id=source_goal_id,
                        from_linked_group=True,
                        direction=direction,
                    )

        activities = {}
        process_goal(goal, activities, is_inherited=False)

        stack = [goal]
        while stack:
            current = stack.pop(0)
            for child in current.children:
                if child.deleted_at:
                    continue
                process_goal(child, activities, is_inherited=True, source_name=child.name, direction="child")
                stack.append(child)

        if goal.inherit_parent_activities and goal.parent_id:
            parent = goals_by_id.get(goal.parent_id)
            if parent and not parent.deleted_at:
                process_goal(parent, activities, is_inherited=True, source_name=parent.name, direction="parent")

        return list(activities.values()), None, 200

    def get_goal_activity_groups(self, root_id, goal_id, current_user_id) -> ServiceResult[JsonList]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        groups = [{"id": group.id, "name": group.name} for group in goal.associated_activity_groups]
        return groups, None, 200

    def link_goal_activity_group(self, root_id, goal_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        group = self.db_session.query(ActivityGroup).filter_by(id=group_id, root_id=root_id).first()
        if not group:
            return None, "Activity group not found", 404

        existing = self.db_session.execute(
            select(goal_activity_group_associations).where(
                goal_activity_group_associations.c.goal_id == goal_id,
                goal_activity_group_associations.c.activity_group_id == group_id,
            )
        ).first()
        if existing:
            return {"message": "Group already linked"}, None, 200

        self.db_session.execute(
            goal_activity_group_associations.insert().values(
                goal_id=goal_id,
                activity_group_id=group_id,
            )
        )
        self.db_session.commit()
        return {"message": "Group linked successfully"}, None, 201

    def unlink_goal_activity_group(self, root_id, goal_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        result = self.db_session.execute(
            goal_activity_group_associations.delete().where(
                goal_activity_group_associations.c.goal_id == goal_id,
                goal_activity_group_associations.c.activity_group_id == group_id,
            )
        )
        if result.rowcount == 0:
            return None, "Link not found", 404

        self.db_session.commit()
        return {"message": "Group unlinked successfully"}, None, 200
