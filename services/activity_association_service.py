from models import (
    ActivityDefinition,
    Goal,
    activity_goal_associations,
    validate_root_goal,
)
from services.association_reconciliation import (
    append_goal_association_event,
    reconcile_association_rows,
)
from services._completion_context import _emit_pending_events
from services.events import Event, Events, event_bus
from services.effective_goal_activities import resolve_effective_activity_entries
from services.goal_activity_group_links import (
    GROUP_SINGLE,
    GoalActivityGroupError,
    current_group_ids,
    flush_group_links,
    live_group,
    lock_root,
    reconcile_group_link_conditions,
    set_goal_activity_group,
)
from services.goal_loading import load_fractal_goals_for_serialization
from services.instance_goal_evidence import load_instance_linked_activities
from services._serialize_common import format_utc
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
        activity = self.db_session.query(ActivityDefinition).filter_by(
            id=activity_id,
            root_id=root_id,
        ).populate_existing().with_for_update().first()
        if not activity:
            return []
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

        delta = reconcile_association_rows(
            self.db_session,
            activity_goal_associations,
            activity_goal_associations.c.activity_id,
            activity_id,
            activity_goal_associations.c.goal_id,
            valid_goal_ids,
        )
        if delta.added_ids or delta.removed_ids:
            activity.row_version += 1
            for action, changed_goal_ids in (
                ("associated", delta.added_ids),
                ("disassociated", delta.removed_ids),
            ):
                for changed_goal_id in changed_goal_ids:
                    append_goal_association_event(
                        self.db_session,
                        root_id=root_id,
                        goal_id=changed_goal_id,
                        association_kind="activity",
                        association_id=activity_id,
                        association_name=activity.name,
                        action=action,
                        occurred_at=delta.occurred_at,
                    )
        return valid_goal_ids

    def set_activity_goals(
        self, root_id, activity_id, current_user_id, goal_ids, *, commit=True,
        pending_events=None,
    ) -> ServiceResult[ActivityDefinition]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(
            id=activity_id, root_id=root_id,
        ).populate_existing().with_for_update().first()
        if not activity:
            return None, "Activity not found", 404

        self.replace_activity_goal_associations(activity_id, root_id, goal_ids)

        if commit:
            self.db_session.commit()
        else:
            self.db_session.flush()
        self.db_session.expire(activity, ['associated_goals'])

        event = Event(Events.ACTIVITY_UPDATED, {
            'activity_id': activity_id,
            'activity_name': activity.name,
            'root_id': root_id,
            'updated_fields': ['associated_goals'],
        }, source='activity_service.set_activity_goals')
        if pending_events is None:
            event_bus.emit(event)
        else:
            pending_events.append(event)

        return activity, None, 200

    def remove_activity_goal(self, root_id, activity_id, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        activity = self.db_session.query(ActivityDefinition).filter_by(
            id=activity_id, root_id=root_id,
        ).populate_existing().with_for_update().first()
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
        activity.row_version += 1

        append_goal_association_event(
            self.db_session,
            root_id=root_id,
            goal_id=goal_id,
            association_kind="activity",
            association_id=activity_id,
            association_name=activity.name,
            action="disassociated",
        )

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
        lock_root(self.db_session, root_id)

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
        # Unknown ids are ignored, as for activities; more than one real group is rejected.
        groups = [group for group in (live_group(self.db_session, root_id, gid) for gid in group_ids) if group]
        if len(groups) > 1:
            self.db_session.rollback()
            return None, GoalActivityGroupError(
                "A goal can have one activity group. Choose one.", 422, GROUP_SINGLE,
            ).payload(), 422
        group = groups[0] if groups else None
        valid_activity_ids = {row[0] for row in valid_activities}
        valid_group_ids = {group.id} if group else set()

        existing_activity_ids = {
            row[0] for row in self.db_session.execute(
                activity_goal_associations.select().with_only_columns(
                    activity_goal_associations.c.activity_id,
                ).where(activity_goal_associations.c.goal_id == goal_id)
            ).all()
        }
        activity_rows = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id.in_(sorted(existing_activity_ids | valid_activity_ids)),
            ActivityDefinition.root_id == root_id,
        ).order_by(ActivityDefinition.id).populate_existing().with_for_update().all()
        activities_by_id = {activity.id: activity for activity in activity_rows}

        activity_delta = reconcile_association_rows(
            self.db_session,
            activity_goal_associations,
            activity_goal_associations.c.goal_id,
            goal_id,
            activity_goal_associations.c.activity_id,
            valid_activity_ids,
        )
        # The batch states the goal's whole association set, so its group replaces any other.
        group_change = set_goal_activity_group(self.db_session, root_id, goal, group, replace=True)

        changed_activity_ids = activity_delta.added_ids | activity_delta.removed_ids
        for activity_id in changed_activity_ids:
            activity = activities_by_id.get(activity_id)
            if activity:
                activity.row_version += 1
        activity_names = {
            activity_id: activity.name for activity_id, activity in activities_by_id.items()
        }
        for action, changed_ids in (
            ("associated", activity_delta.added_ids),
            ("disassociated", activity_delta.removed_ids),
        ):
            for association_id in changed_ids:
                append_goal_association_event(
                    self.db_session,
                    root_id=root_id,
                    goal_id=goal_id,
                    association_kind="activity",
                    association_id=association_id,
                    association_name=activity_names.get(association_id, "Unknown"),
                    action=action,
                    occurred_at=activity_delta.occurred_at,
                )

        pending_events = []
        try:
            flush_group_links(self.db_session)
        except GoalActivityGroupError as conflict:
            return None, conflict.payload(), conflict.status
        if group_change.changed:
            reconcile_group_link_conditions(self.db_session, root_id, {goal_id}, pending_events)
        self.db_session.commit()
        _emit_pending_events(pending_events)
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

    def get_goal_instance_linked_activities(self, root_id, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        if not self._live_goal(root_id, goal_id):
            return None, "Goal not found", 404
        activities, truncated = load_instance_linked_activities(self.db_session, root_id, goal_id)
        for entry in activities:
            entry['last_linked_at'] = format_utc(entry['last_linked_at'])
        return {"activities": activities, "truncated": truncated}, None, 200

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

    def link_goal_activity_group(
        self, root_id, goal_id, group_id, current_user_id, *, replace=False,
    ) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        lock_root(self.db_session, root_id)

        goal = self._live_goal(root_id, goal_id)
        if not goal:
            return None, "Goal not found", 404
        group = live_group(self.db_session, root_id, group_id)
        if not group:
            return None, "Activity group not found", 404

        try:
            change = set_goal_activity_group(self.db_session, root_id, goal, group, replace=replace)
            flush_group_links(self.db_session)
        except GoalActivityGroupError as conflict:
            self.db_session.rollback()
            return None, conflict.payload(), conflict.status
        if not change.changed:
            self.db_session.rollback()
            return {"message": "Group already linked", "group_id": group.id}, None, 200
        pending_events = []
        reconcile_group_link_conditions(self.db_session, root_id, {goal_id}, pending_events)
        self.db_session.commit()
        _emit_pending_events(pending_events)
        return {
            "message": "Group replaced successfully" if change.previous_group_id else "Group linked successfully",
            "group_id": group.id,
            "previous_group_id": change.previous_group_id,
        }, None, 200 if change.previous_group_id else 201

    def unlink_goal_activity_group(self, root_id, goal_id, group_id, current_user_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error
        lock_root(self.db_session, root_id)

        goal = self._live_goal(root_id, goal_id)
        if not goal:
            return None, "Goal not found", 404
        current = current_group_ids(self.db_session, [goal_id]).get(goal_id)
        if current != group_id:
            return None, "Link not found", 404

        set_goal_activity_group(self.db_session, root_id, goal, None, current_group_id=current)
        pending_events = []
        reconcile_group_link_conditions(self.db_session, root_id, {goal_id}, pending_events)
        self.db_session.commit()
        _emit_pending_events(pending_events)
        return {"message": "Group unlinked successfully"}, None, 200

    def _live_goal(self, root_id, goal_id) -> Goal | None:
        return self.db_session.query(Goal).filter(
            Goal.id == goal_id, Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).first()
