from sqlalchemy import select

from models import (
    ActivityDefinition,
    ActivityGroup,
    Goal,
    activity_goal_associations,
    goal_activity_group_associations,
    validate_root_goal,
)
from services.association_reconciliation import reconcile_association_rows
from services.events import Event, Events, event_bus
from services.effective_goal_activities import resolve_effective_activity_entries
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
            valid_goal_id_set = {
                goal_id
                for (goal_id,) in self.db_session.query(Goal.id).filter(
                    Goal.id.in_(goal_ids),
                    Goal.root_id == root_id,
                    Goal.deleted_at.is_(None),
                ).all()
            }
            valid_goal_ids = [
                goal_id for goal_id in goal_ids if goal_id in valid_goal_id_set
            ]

        reconcile_association_rows(
            self.db_session,
            activity_goal_associations,
            activity_goal_associations.c.activity_id,
            activity_id,
            activity_goal_associations.c.goal_id,
            valid_goal_ids,
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
        if not isinstance(activity_ids, list) or not isinstance(group_ids, list):
            return None, "activity_ids and group_ids must be lists", 400
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

        reconcile_association_rows(
            self.db_session,
            activity_goal_associations,
            activity_goal_associations.c.goal_id,
            goal_id,
            activity_goal_associations.c.activity_id,
            valid_activity_ids,
        )
        reconcile_association_rows(
            self.db_session,
            goal_activity_group_associations,
            goal_activity_group_associations.c.goal_id,
            goal_id,
            goal_activity_group_associations.c.activity_group_id,
            valid_group_ids,
        )

        self.db_session.commit()
        return {
            "activity_ids": sorted(valid_activity_ids),
            "group_ids": sorted(valid_group_ids),
        }, None, 200

    def get_goal_activities(
        self, root_id, goal_id, current_user_id, *, validated_root=None, goals_by_id=None,
    ) -> ServiceResult[JsonList]:
        if validated_root is not None and (
            validated_root.id != root_id or validated_root.owner_id != current_user_id
        ):
            return None, "Fractal not found or access denied", 404
        if validated_root is None:
            _, error = self._validate_owned_root(root_id, current_user_id)
            if error:
                return None, *error

        if goals_by_id is None:
            goals_by_id = load_fractal_goals_for_serialization(
                self.db_session, root_id, include_group_activities=True,
            )
        goal = goals_by_id.get(goal_id)
        if not goal:
            return None, "Goal not found", 404

        return resolve_effective_activity_entries(goal, goals_by_id), None, 200

    def get_goal_activity_groups(
        self, root_id, goal_id, current_user_id, *, validated_root=None, goals_by_id=None,
    ) -> ServiceResult[JsonList]:
        if validated_root is not None and (
            validated_root.id != root_id or validated_root.owner_id != current_user_id
        ):
            return None, "Fractal not found or access denied", 404
        if validated_root is None:
            _, error = self._validate_owned_root(root_id, current_user_id)
            if error:
                return None, *error

        goal = goals_by_id.get(goal_id) if goals_by_id is not None else self.db_session.query(Goal).filter_by(
            id=goal_id, root_id=root_id,
        ).first()
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
