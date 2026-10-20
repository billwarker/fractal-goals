"""Completion, copy, pause, move, convert-level.

Mixin for GoalService (audit P1-7). Instance methods; cross-method calls use
`self.<method>(...)` and resolve through the composed GoalService instance.
"""
from datetime import datetime, timezone
from typing import Any

from sqlalchemy.orm import selectinload

from models import COMPLETION_CONDITION_CHILDREN, COMPLETION_CONDITION_MANUAL, Goal, GoalCompletionCondition, activity_goal_associations, goal_activity_group_associations, get_goal_by_id, validate_root_goal
from services.association_reconciliation import append_goal_association_event
from services.goal_type_utils import get_canonical_goal_type
from services.events import event_bus, Event, Events
from services.goal_domain_rules import goal_requires_smart_validation
from services.serializers import serialize_goal_condition
from services.goal_condition_service import condition_met_now
from services.service_types import ServiceResult
from services.serializers import calculate_smart_status
from services.goal_workflow_service import GoalWorkflowService
from services.goal_sequence_service import advance_after_completion, revert_after_uncompletion
from services._completion_context import _emit_pending_events




class _GoalLifecycleMixin:
    db_session: Any  # provided by the composed GoalService

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
            # Manual completion is always available. Confirming a condition that is already met records
            # the condition as the source (so losing that evidence reverts it); otherwise it is an override.
            goal.completion_source = self._manual_completion_source(goal)
            goal.completion_reason = goal.completion_source
            goal.manually_uncompleted_at = None
        else:
            goal.completion_source = None
            goal.completion_reason = 'manual_uncompleted'
            goal.manually_uncompleted_at = completion_time
        # Sequenced goals: completing begins the next step, un-completing re-pauses the step it began.
        pending_events = []
        if goal.completed:
            advance_after_completion(self.db_session, goal, pending_events, begin_next=data.get('begin_next', True) is not False)
        else:
            revert_after_uncompletion(self.db_session, goal, pause_next=data.get('pause_next', True) is not False)
        self.db_session.commit()
        _emit_pending_events(pending_events)
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
            event_payload['reason'] = goal.completion_source
        event_bus.emit(Event(
            event_name,
            event_payload,
            source='goal_service.update_goal_completion',
            context={'db_session': self.db_session},
        ))
        return goal, None, 200

    def _manual_completion_source(self, goal) -> str:
        if goal.completion_condition == COMPLETION_CONDITION_MANUAL:
            return 'manual'
        goals_by_id = self._load_fractal_goals_for_serialization(goal.root_id or goal.id)
        if not condition_met_now(self.db_session, goals_by_id.get(goal.id, goal), goals_by_id):
            return 'manual_override'
        return 'children' if goal.completion_condition == COMPLETION_CONDITION_CHILDREN else 'condition'

    # ========== GOAL OPTIONS ==========

    def copy_goal(self, root_id, goal_id, current_user_id) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        source = self.db_session.query(Goal).options(
            selectinload(Goal.condition).selectinload(GoalCompletionCondition.rules),
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
            'inherit_parent_activities': source.inherit_parent_activities,
            'track_activities': source.track_activities,
            'completion_condition': source.completion_condition,
            'condition': serialize_goal_condition(source.condition),
        }

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
            activity.row_version += 1
            append_goal_association_event(
                self.db_session,
                root_id=root_id,
                goal_id=new_goal.id,
                association_kind="activity",
                association_id=activity.id,
                association_name=activity.name,
                action="associated",
            )

        # Copy activity group associations
        for group in (source.associated_activity_groups or []):
            self.db_session.execute(
                goal_activity_group_associations.insert().values(
                    goal_id=new_goal.id,
                    activity_group_id=group.id,
                )
            )
            append_goal_association_event(
                self.db_session,
                root_id=root_id,
                goal_id=new_goal.id,
                association_kind="activity_group",
                association_id=group.id,
                association_name=group.name,
                action="associated",
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
