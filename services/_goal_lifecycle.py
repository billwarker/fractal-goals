"""Completion, target evaluation, copy, pause, move, convert-level.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone

from sqlalchemy.orm import selectinload

from models import Goal, activity_goal_associations, goal_activity_group_associations, get_goal_by_id, validate_root_goal
from services.goal_type_utils import get_canonical_goal_type
from services.events import event_bus, Event, Events
from services.goal_domain_rules import goal_allows_manual_completion, goal_requires_smart_validation
from services.service_types import JsonDict, ServiceResult
from services.serializers import calculate_smart_status
from services.goal_target_service import GoalTargetService
from services.goal_workflow_service import GoalWorkflowService



class _GoalLifecycleMixin:
    def update_goal_completion(self, goal_id, current_user_id, data, root_id=None) -> ServiceResult[Goal]:
        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404

        authorized_root_id = root_id or goal.root_id or goal.id
        root = validate_root_goal(self.db_session, authorized_root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404
        if goal.root_id and goal.root_id != authorized_root_id:
            return None, "Goal not found in this fractal", 404

        if goal.paused:
            return None, "Cannot complete a paused goal. Resume it first.", 400

        goal.completed = data['completed'] if 'completed' in data else not goal.completed

        if goal.completed:
            if not goal_allows_manual_completion(goal):
                return None, "Manual completion is not allowed for this goal level", 403
            if goal_requires_smart_validation(goal):
                smart_status = calculate_smart_status(goal)
                if not all(smart_status.values()):
                    return None, {
                        "error": f"SMART criteria not met. Missing: {', '.join([key for key, value in smart_status.items() if not value])}",
                        "smart_status": smart_status,
                    }, 400

        completion_time = datetime.now(timezone.utc)
        goal.completed_at = completion_time if goal.completed else None
        goal.completed_session_id = data.get('session_id') if goal.completed else None
        if goal.completed:
            goal.completion_source = 'manual'
            goal.completion_reason = 'manual'
            goal.manually_uncompleted_at = None
        else:
            goal.completion_source = None
            goal.completion_reason = 'manual_uncompleted'
            goal.manually_uncompleted_at = completion_time
        reset_target_events = []
        if not goal.completed:
            active_completed_targets = [
                target
                for target in (goal.targets_rel or [])
                if target.deleted_at is None and target.completed
            ]
            for target in active_completed_targets:
                target.completed = False
                target.completed_at = None
                target.completed_session_id = None
                target.completed_instance_id = None
                reset_target_events.append(Event(
                    Events.TARGET_REVERTED,
                    {
                        'target_id': target.id,
                        'target_name': target.name,
                        'goal_id': goal.id,
                        'goal_name': goal.name,
                        'root_id': goal.root_id or goal.id,
                        'reason': 'goal_manually_uncompleted',
                    },
                    source='goal_service.update_goal_completion',
                    context={'db_session': self.db_session},
                ))
        self.db_session.commit()
        self.db_session.refresh(goal)
        event_name = Events.GOAL_COMPLETED if goal.completed else Events.GOAL_UNCOMPLETED
        event_payload = {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id,
        }
        if goal.completed_session_id:
            event_payload['session_id'] = goal.completed_session_id
        if goal.completed:
            event_payload['auto_completed'] = False
            event_payload['reason'] = 'manual'
        event_bus.emit(Event(
            event_name,
            event_payload,
            source='goal_service.update_goal_completion',
            context={'db_session': self.db_session},
        ))
        for target_event in reset_target_events:
            event_bus.emit(target_event)
        return goal, None, 200

    def evaluate_goal_targets(self, root_id, goal_id, current_user_id, session_id) -> ServiceResult[JsonDict]:
        return GoalTargetService(self.db_session).evaluate_goal_targets(
            root_id,
            goal_id,
            current_user_id,
            session_id,
        )

    # ========== GOAL OPTIONS ==========

    def copy_goal(self, root_id, goal_id, current_user_id) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        source = self.db_session.query(Goal).options(
            selectinload(Goal.targets_rel),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
        if not source:
            return None, "Goal not found", 404

        goal_type = get_canonical_goal_type(source)

        # Build create payload from source
        create_data = {
            'name': f"Copy of {source.name}",
            'type': goal_type,
            'description': source.description or '',
            'parent_id': source.parent_id,
            'deadline': source.deadline.isoformat() if source.deadline else None,
            'relevance_statement': source.relevance_statement,
            'completed_via_children': source.completed_via_children,
            'inherit_parent_activities': source.inherit_parent_activities,
            'allow_manual_completion': source.allow_manual_completion,
            'track_activities': source.track_activities,
        }

        # Serialize source targets for the copy
        if source.targets_rel:
            create_data['targets'] = [
                {
                    'name': t.name,
                    'target_type': t.target_type,
                    'target_value': t.target_value,
                    'target_unit': t.target_unit,
                    'comparison_operator': t.comparison_operator,
                    'activity_definition_id': t.activity_definition_id,
                    'metric_definition_id': t.metric_definition_id,
                    'time_scope': t.time_scope,
                    'time_scope_value': t.time_scope_value,
                    'time_scope_unit': t.time_scope_unit,
                }
                for t in source.targets_rel if t.deleted_at is None
            ]

        new_goal, err, status = self.create_fractal_goal_record(root_id, current_user_id, create_data)
        if err:
            return None, err, status

        # Copy activity associations
        for activity in (source.associated_activities or []):
            self.db_session.execute(
                activity_goal_associations.insert().values(
                    activity_id=activity.id,
                    goal_id=new_goal.id,
                )
            )

        # Copy activity group associations
        for group in (source.associated_activity_groups or []):
            self.db_session.execute(
                goal_activity_group_associations.insert().values(
                    goal_id=new_goal.id,
                    activity_group_id=group.id,
                )
            )

        self.db_session.commit()
        self.db_session.refresh(new_goal)
        return new_goal, None, 201

    def toggle_pause(self, root_id, goal_id, current_user_id, paused: bool) -> ServiceResult[Goal]:
        return GoalWorkflowService(self.db_session).toggle_pause(root_id, goal_id, current_user_id, paused)

    def move_goal(self, root_id, goal_id, current_user_id, new_parent_id) -> ServiceResult[Goal]:
        return GoalWorkflowService(self.db_session).move_goal(root_id, goal_id, current_user_id, new_parent_id)

    def get_eligible_move_parents(self, root_id, goal_id, current_user_id, search=None):
        return GoalWorkflowService(self.db_session).get_eligible_move_parents(
            root_id,
            goal_id,
            current_user_id,
            search=search,
        )

    def convert_goal_level(self, root_id, goal_id, current_user_id, level_id) -> ServiceResult[Goal]:
        return GoalWorkflowService(self.db_session).convert_goal_level(
            root_id,
            goal_id,
            current_user_id,
            level_id,
        )
