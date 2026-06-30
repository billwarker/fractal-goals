"""Goal create/get/update/delete (fractal + global).

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime
import uuid

from sqlalchemy.orm import selectinload

from models import Goal, GoalLevel, Session, get_goal_by_id, session_goals
from services.events import event_bus, Event, Events
from services.goal_domain_rules import resolve_completed_via_children, should_inherit_parent_activities
from services.goal_loading import goal_serializer_load_options
from services.payload_normalizers import normalize_goal_payload
from services.quota_service import QuotaService
from services.service_types import JsonDict, ServiceResult

from services._goal_service_common import resolve_level_id, session_goal_insert_values


class _GoalCrudMixin:
    def create_global_goal(self, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data)
        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "goals")
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(
                data.get('name'), data.get('description'), data.get('relevance_statement'),
                data.get('targets'), data.get('progress_settings'),
            ),
        )
        if storage_error:
            return None, storage_error, storage_status
        if not data.get('parent_id'):
            _, quota_error, quota_status = quota_service.check_available(current_user_id, "fractals")
            if quota_error:
                return None, quota_error, quota_status

        parent = None
        parent_id = data.get('parent_id')
        if parent_id:
            parent = get_goal_by_id(self.db_session, parent_id)
            if not parent:
                return None, f"Parent not found: {parent_id}", 404
            if not self._authorize_goal_access(current_user_id, parent):
                return None, "Parent not found or access denied", 404

        target_root_id = parent.root_id or parent.id if parent else None
        activity_definition_id = data.get('activity_definition_id')
        activity = None
        if activity_definition_id and not target_root_id:
            return None, "Activity association requires a parent goal within a fractal", 400
        if activity_definition_id and target_root_id:
            activity, activity_error = self._get_activity_for_goal_association(target_root_id, activity_definition_id)
            if activity_error:
                return None, *activity_error

        session_id = data.get('session_id')
        linked_session = None
        if session_id:
            linked_session = self.db_session.query(Session).filter(
                Session.id == session_id,
                Session.deleted_at.is_(None),
            ).first()
            if not linked_session or (target_root_id and linked_session.root_id != target_root_id):
                return None, "Session not found in this fractal", 400

        deadline, deadline_error = self._parse_deadline(data.get('deadline'))
        if deadline_error:
            return None, deadline_error, 400

        if parent and parent.deadline and deadline:
            parent_deadline = parent.deadline.date() if isinstance(parent.deadline, datetime) else parent.deadline
            if deadline > parent_deadline:
                return None, {
                    "error": "Child deadline cannot be later than parent deadline",
                    "parent_deadline": parent_deadline.isoformat(),
                }, 400

        level_id = resolve_level_id(self.db_session, data.get('type'))
        if not level_id:
            return None, "Invalid goal type", 400
        level_obj = self.db_session.query(GoalLevel).filter_by(id=level_id).first() if level_id else None

        if parent:
            monotonicity_error = self._validate_ancestor_rank_monotonicity(level_obj, parent)
            if monotonicity_error:
                return None, monotonicity_error, 400

        goal_defaults = Goal(parent_id=parent_id)
        goal_defaults.level = level_obj
        inherit_parent_activities = should_inherit_parent_activities(
            goal_defaults,
            parent,
            explicit_value=data.get('inherit_parent_activities'),
        )

        with self.db_session.begin_nested():
            new_goal = Goal(
                level_id=level_id,
                name=data['name'],
                description=data.get('description', ''),
                deadline=deadline,
                completed=False,
                completed_via_children=data.get('completed_via_children', False),
                inherit_parent_activities=inherit_parent_activities,
                relevance_statement=data.get('relevance_statement'),
                parent_id=parent_id,
                owner_id=parent.owner_id if parent else current_user_id,
            )

            if parent:
                current = parent
                while current.parent_id:
                    current = get_goal_by_id(self.db_session, current.parent_id)
                new_goal.root_id = current.id

            self.db_session.add(new_goal)
            self.db_session.flush()

            if not parent:
                new_goal.root_id = new_goal.id

            if data.get('targets'):
                self.sync_targets(self.db_session, new_goal, data['targets'])
                new_goal.targets = None

            if activity:
                self._associate_goal_with_activity(new_goal.id, activity.id)

            if linked_session:
                self.db_session.execute(session_goals.insert().values(
                    **session_goal_insert_values(
                        self.db_session,
                        linked_session.id,
                        new_goal.id,
                        data.get('type', 'Goal'),
                        'manual',
                    )
                ))

        self.db_session.commit()
        self.db_session.refresh(new_goal)
        event_bus.emit(Event(Events.GOAL_CREATED, {
            'goal_id': new_goal.id,
            'goal_name': new_goal.name,
            'goal_type': data.get('type', 'Goal'),
            'parent_id': new_goal.parent_id,
            'root_id': new_goal.root_id,
        }, source='goal_service.create_global_goal'))
        return new_goal, None, 201

    def create_fractal_goal(self, root_id, current_user_id, data) -> ServiceResult[Goal]:
        new_goal, error, status = self.create_fractal_goal_record(root_id, current_user_id, data)
        if error:
            return None, error, status

        self.db_session.commit()
        self.db_session.refresh(new_goal)
        event_bus.emit(Event(Events.GOAL_CREATED, {
            'goal_id': new_goal.id,
            'goal_name': new_goal.name,
            'goal_type': data.get('type', 'Goal'),
            'parent_id': new_goal.parent_id,
            'root_id': new_goal.root_id,
        }, source='goal_service.create_fractal_goal'))
        return new_goal, None, 201

    def create_fractal_goal_record(self, root_id, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        quota_service = QuotaService(self.db_session)
        _, quota_error, quota_status = quota_service.check_available(current_user_id, "goals")
        if quota_error:
            return None, quota_error, quota_status
        _, storage_error, storage_status = quota_service.check_storage_available(
            current_user_id,
            QuotaService._payload_size(
                data.get('name'), data.get('description'), data.get('relevance_statement'),
                data.get('targets'), data.get('progress_settings'),
            ),
        )
        if storage_error:
            return None, storage_error, storage_status

        activity_definition_id = data.get('activity_definition_id')
        activity = None
        if activity_definition_id:
            activity, activity_error = self._get_activity_for_goal_association(root_id, activity_definition_id)
            if activity_error:
                return None, *activity_error

        session_id = data.get('session_id')
        linked_session = None
        if session_id:
            linked_session = self.db_session.query(Session).filter(
                Session.id == session_id,
                Session.root_id == root_id,
                Session.deleted_at.is_(None),
            ).first()
            if not linked_session:
                return None, "Session not found in this fractal", 400

        deadline, deadline_error = self._parse_deadline(data.get('deadline'))
        if deadline_error:
            return None, deadline_error, 400

        level_id = resolve_level_id(self.db_session, data.get('type'))
        if not level_id:
            return None, "Invalid goal type", 400
        level_obj = self.db_session.query(GoalLevel).filter_by(id=level_id).first() if level_id else None

        description_error = self._validate_description_required(level_obj, data.get('description'))
        if description_error:
            return None, description_error, 400

        parent_id = data.get('parent_id')
        parent_goal = None
        if parent_id:
            parent_goal = self.db_session.query(Goal).options(
                selectinload(Goal.level)
            ).filter_by(id=parent_id, root_id=root_id).first()
            if not parent_goal:
                return None, "Parent goal not found in this fractal.", 400
            parent_capacity_error = self._validate_parent_capacity(
                parent_goal,
                error_prefix="Cannot create goal: Parent level",
            )
            if parent_capacity_error:
                return None, parent_capacity_error, 400

            monotonicity_error = self._validate_ancestor_rank_monotonicity(level_obj, parent_goal)
            if monotonicity_error:
                return None, monotonicity_error, 400

        completed_via_children = resolve_completed_via_children(data, level_obj)
        goal_defaults = Goal(parent_id=parent_id)
        goal_defaults.level = level_obj
        inherit_parent_activities = should_inherit_parent_activities(
            goal_defaults,
            parent_goal if parent_id else None,
            explicit_value=data.get('inherit_parent_activities'),
        )

        with self.db_session.begin_nested():
            new_goal = Goal(
                id=str(uuid.uuid4()),
                name=data['name'],
                description=data.get('description', ''),
                level_id=level_id,
                parent_id=parent_id,
                deadline=deadline,
                completed=False,
                completed_via_children=completed_via_children,
                inherit_parent_activities=inherit_parent_activities,
                allow_manual_completion=data.get('allow_manual_completion', True),
                track_activities=data.get('track_activities', True),
                relevance_statement=data.get('relevance_statement'),
                root_id=root_id,
                owner_id=current_user_id,
            )
            self.db_session.add(new_goal)
            self.db_session.flush()

            if data.get('targets'):
                self.sync_targets(self.db_session, new_goal, data['targets'])
                new_goal.targets = None

            if activity:
                self._associate_goal_with_activity(new_goal.id, activity.id)

            if linked_session:
                self.db_session.execute(session_goals.insert().values(
                    **session_goal_insert_values(
                        self.db_session,
                        linked_session.id,
                        new_goal.id,
                        data.get('type', 'Goal'),
                        'manual',
                    )
                ))

        return new_goal, None, 201

    def get_fractal_goal(self, root_id, goal_id, current_user_id, *, include_children=True) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        if include_children:
            goal = self._load_fractal_goals_for_serialization(root_id).get(goal_id)
            if not goal:
                return None, "Goal not found", 404
            return goal, None, 200

        goal = self.db_session.query(Goal).options(
            *goal_serializer_load_options()
        ).filter(
            Goal.id == goal_id,
            Goal.deleted_at.is_(None),
        ).first()
        if not goal or goal.root_id != root_id:
            return None, "Goal not found", 404
        return goal, None, 200

    def get_global_goal(self, goal_id, current_user_id) -> ServiceResult[Goal]:
        goal, error = self._get_authorized_goal(goal_id, current_user_id)
        if error:
            return None, *error
        return goal, None, 200

    def update_fractal_goal(self, root_id, goal_id, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data, partial=True)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if goal.root_id != root_id:
            return None, "Goal not found in this fractal", 404

        goal, update_error = self._apply_goal_updates(
            goal,
            data,
            root_id=root_id,
            allow_parent_update=True,
            allow_extended_fields=True,
        )
        if update_error:
            return None, *update_error

        self.db_session.commit()
        self.db_session.refresh(goal)
        event_bus.emit(Event(Events.GOAL_UPDATED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id,
            'updated_fields': list(data.keys()),
        }, source='goal_service.update_fractal_goal'))
        return goal, None, 200

    def update_global_goal(self, goal_id, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data, partial=True)
        goal, error = self._get_authorized_goal(goal_id, current_user_id)
        if error:
            return None, *error

        root_id = goal.root_id or goal.id
        goal, update_error = self._apply_goal_updates(
            goal,
            data,
            root_id=root_id,
            allow_parent_update=False,
            allow_extended_fields=False,
        )
        if update_error:
            return None, *update_error

        self.db_session.commit()
        self.db_session.refresh(goal)
        event_bus.emit(Event(Events.GOAL_UPDATED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id,
            'updated_fields': list(data.keys()),
        }, source='goal_service.update_global_goal'))
        return goal, None, 200

    def delete_global_goal(self, goal_id, current_user_id) -> ServiceResult[JsonDict]:
        goal, error = self._get_authorized_goal(goal_id, current_user_id)
        if error:
            return None, *error

        is_root = goal.parent_id is None
        goal_name = goal.name
        root_id = goal.root_id or goal.id

        if is_root:
            _, error, status = self.delete_fractal(goal_id, current_user_id)
            if error:
                return None, error, status
        else:
            _, error, status = self.delete_fractal_goal(root_id, goal_id, current_user_id, emit_event=False)
            if error:
                return None, error, status

        event_bus.emit(Event(Events.GOAL_DELETED, {
            'goal_id': goal_id,
            'goal_name': goal_name,
            'root_id': root_id,
            'was_root': is_root,
        }, source='goal_service.delete_global_goal'))

        return {
            "goal_id": goal_id,
            "goal_name": goal_name,
            "root_id": root_id,
            "is_root": is_root,
        }, None, 200
