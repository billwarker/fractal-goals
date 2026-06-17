from datetime import datetime, timezone
import logging
import math
import uuid

from models import (
    ActivityInstance,
    Goal,
    Target,
    TargetMetricCondition,
    get_goal_by_id,
    get_session_by_id,
    validate_root_goal,
)
from services.events import Event, Events, event_bus
from services.goal_target_rules import check_metrics_meet_target
from services.serializers import serialize_activity_instance, serialize_target
from services.service_types import JsonDict, ServiceResult
from services.view_serializers import serialize_goal_target_evaluation_result

logger = logging.getLogger(__name__)


def _parse_target_date(value):
    if not value:
        return None
    if isinstance(value, str):
        if not value.strip():
            return None
        try:
            if 'T' in value:
                value = value.split('T')[0]
            return datetime.strptime(value, '%Y-%m-%d')
        except ValueError:
            logger.warning("Invalid target date format: %s", value)
            return None
    return value


def _parse_target_int(value):
    if value is None or value == '':
        return None
    try:
        return int(value)
    except Exception:
        return None


def normalize_target_metrics(metrics) -> list[JsonDict]:
    if not isinstance(metrics, list):
        return []

    normalized = []
    for metric in metrics:
        metric_id = metric.get('metric_id') or metric.get('metric_definition_id')
        if not metric_id:
            continue

        raw_target = metric.get('value', metric.get('target_value', 0))
        try:
            target_value = float(raw_target)
            if not math.isfinite(target_value):
                target_value = 0.0
        except (TypeError, ValueError):
            target_value = 0.0

        normalized.append({
            'metric_definition_id': metric_id,
            'operator': metric.get('operator', '>='),
            'target_value': target_value,
        })

    return normalized


def sync_goal_targets(db_session, goal, incoming_targets) -> None:
    current_targets = {target.id: target for target in goal.targets_rel if target.deleted_at is None}
    incoming_ids = {target.get('id') for target in incoming_targets if target.get('id')}

    for target_id, target in current_targets.items():
        if target_id not in incoming_ids:
            target.deleted_at = datetime.now(timezone.utc)
            logger.debug("Soft-deleted target %s", target_id)

    for target_data in incoming_targets:
        target_id = target_data.get('id')
        activity_id = target_data.get('activity_id') or None
        activity_instance_id = target_data.get('activity_instance_id') or None
        linked_block_id = target_data.get('linked_block_id') or None
        start_date = _parse_target_date(target_data.get('start_date'))
        end_date = _parse_target_date(target_data.get('end_date'))
        frequency_days = _parse_target_int(target_data.get('frequency_days'))
        frequency_count = _parse_target_int(target_data.get('frequency_count'))
        metrics = normalize_target_metrics(target_data.get('metrics'))

        if target_id and target_id in current_targets:
            target = current_targets[target_id]
            target.name = target_data.get('name', target.name)
            target.activity_id = activity_id
            target.activity_instance_id = activity_instance_id
            target.type = target_data.get('type', target.type)
            target.time_scope = target_data.get('time_scope', target.time_scope)
            target.start_date = start_date
            target.end_date = end_date
            target.linked_block_id = linked_block_id
            target.frequency_days = frequency_days
            target.frequency_count = frequency_count

            existing_conditions = {condition.metric_definition_id: condition for condition in (target.metric_conditions or [])}
            incoming_metric_ids = {metric['metric_definition_id'] for metric in metrics}

            for condition in list(target.metric_conditions or []):
                if condition.metric_definition_id not in incoming_metric_ids:
                    db_session.delete(condition)

            for metric in metrics:
                condition = existing_conditions.get(metric['metric_definition_id'])
                if condition:
                    condition.operator = metric['operator']
                    condition.target_value = metric['target_value']
                else:
                    db_session.add(TargetMetricCondition(
                        target_id=target.id,
                        metric_definition_id=metric['metric_definition_id'],
                        operator=metric['operator'],
                        target_value=metric['target_value'],
                    ))
            logger.debug("Updated target %s", target_id)
            continue

        new_target = Target(
            id=target_id or str(uuid.uuid4()),
            goal_id=goal.id,
            root_id=goal.root_id or goal.id,
            activity_id=activity_id,
            activity_instance_id=activity_instance_id,
            name=target_data.get('name', 'Measure'),
            type=target_data.get('type', 'threshold'),
            time_scope=target_data.get('time_scope', 'all_time'),
            start_date=start_date,
            end_date=end_date,
            linked_block_id=linked_block_id,
            frequency_days=frequency_days,
            frequency_count=frequency_count,
            completed=target_data.get('completed', False),
        )
        db_session.add(new_target)
        db_session.flush()

        for metric in metrics:
            db_session.add(TargetMetricCondition(
                target_id=new_target.id,
                metric_definition_id=metric['metric_definition_id'],
                operator=metric['operator'],
                target_value=metric['target_value'],
            ))
        logger.debug("Created new target %s with activity_id=%s", new_target.id, activity_id)


class GoalTargetService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _authorize_goal_access(self, current_user_id, goal, root_id_hint=None) -> str | None:
        if not goal:
            return None

        authorized_root_id = root_id_hint or goal.root_id or goal.id
        root = validate_root_goal(self.db_session, authorized_root_id, owner_id=current_user_id)
        if not root:
            return None
        if goal.root_id and goal.root_id != authorized_root_id:
            return None
        return authorized_root_id

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def add_goal_target(self, goal_id, current_user_id, data) -> ServiceResult[JsonDict]:
        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if not self._authorize_goal_access(current_user_id, goal):
            return None, "Goal not found or access denied", 404

        metrics = normalize_target_metrics(data.get('metrics'))

        new_target = Target(
            id=data.get('id') or str(uuid.uuid4()),
            goal_id=goal_id,
            root_id=goal.root_id or goal_id,
            activity_id=data.get('activity_id'),
            activity_instance_id=data.get('activity_instance_id'),
            name=data.get('name', 'Measure'),
            type=data.get('type', 'threshold'),
            time_scope=data.get('time_scope', 'all_time'),
            start_date=data.get('start_date'),
            end_date=data.get('end_date'),
            linked_block_id=data.get('linked_block_id'),
            frequency_days=data.get('frequency_days'),
            frequency_count=data.get('frequency_count'),
            completed=False,
        )
        self.db_session.add(new_target)
        self.db_session.flush()

        for metric in metrics:
            self.db_session.add(TargetMetricCondition(
                target_id=new_target.id,
                metric_definition_id=metric['metric_definition_id'],
                operator=metric['operator'],
                target_value=metric['target_value'],
            ))

        self.db_session.commit()
        self.db_session.refresh(new_target)
        event_bus.emit(Event(Events.TARGET_CREATED, {
            'target_id': new_target.id,
            'target_name': new_target.name,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id,
        }, source='goal_service.add_goal_target'))
        return {"goal": goal, "target": new_target}, None, 201

    def remove_goal_target(self, goal_id, target_id, current_user_id) -> ServiceResult[JsonDict]:
        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if not self._authorize_goal_access(current_user_id, goal):
            return None, "Goal not found or access denied", 404

        target = self.db_session.query(Target).filter(
            Target.id == target_id,
            Target.goal_id == goal_id,
            Target.deleted_at.is_(None),
        ).first()
        if not target:
            return None, "Target not found", 404

        target.deleted_at = datetime.now(timezone.utc)
        self.db_session.commit()
        event_bus.emit(Event(Events.TARGET_DELETED, {
            'target_id': target.id,
            'target_name': target.name,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id,
        }, source='goal_service.remove_goal_target'))
        return {"goal": goal, "target": target}, None, 200

    def evaluate_goal_targets(self, root_id, goal_id, current_user_id, session_id) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if goal.root_id != root_id:
            return None, "Goal not found in this fractal", 404
        if not session_id:
            return None, "session_id is required", 400

        session = get_session_by_id(self.db_session, session_id)
        if not session:
            return None, "Session not found", 404

        targets = [target for target in goal.targets_rel if target.deleted_at is None]
        if not targets:
            return serialize_goal_target_evaluation_result(
                goal,
                targets_evaluated=0,
                targets_completed=0,
                newly_completed_targets=[],
                goal_completed=False,
            ), None, 200

        activity_instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at.is_(None),
        ).all()

        instances_by_activity = {}
        for instance in activity_instances:
            instances_by_activity.setdefault(instance.activity_definition_id, []).append(
                serialize_activity_instance(instance)
            )

        now = datetime.now(timezone.utc)
        newly_completed_targets = []

        for target in targets:
            if target.completed:
                continue

            activity_id = target.activity_id
            target_metrics = [
                {
                    'metric_id': condition.metric_definition_id,
                    'metric_definition_id': condition.metric_definition_id,
                    'value': condition.target_value,
                    'target_value': condition.target_value,
                    'operator': condition.operator,
                }
                for condition in (target.metric_conditions or [])
            ]
            if not activity_id or not target_metrics:
                continue

            target_achieved = False
            for instance in instances_by_activity.get(activity_id, []):
                for instance_set in (instance.get('sets') or []):
                    if check_metrics_meet_target(target_metrics, instance_set.get('metrics', [])):
                        target_achieved = True
                        break
                if target_achieved:
                    break
                if check_metrics_meet_target(target_metrics, instance.get('metrics', [])):
                    target_achieved = True
                    break

            if not target_achieved:
                continue

            target.completed = True
            target.completed_at = now
            target.completed_session_id = session_id
            newly_completed_targets.append(serialize_target(target))

        targets_completed = sum(1 for target in targets if target.completed)
        targets_total = len(targets)
        goal_was_completed = False

        if targets_completed == targets_total and targets_total > 0 and not goal.completed and not goal.paused:
            goal.completed = True
            goal.completed_at = now
            goal.completed_session_id = session_id
            goal.completion_source = 'target'
            goal.completion_reason = 'all_targets_achieved'
            goal.manually_uncompleted_at = None
            goal_was_completed = True
            logger.info("Auto-completing goal %s - all %s targets met", goal_id, targets_total)

        self.db_session.commit()
        self.db_session.refresh(goal)

        return serialize_goal_target_evaluation_result(
            goal,
            targets_evaluated=targets_total,
            targets_completed=targets_completed,
            newly_completed_targets=newly_completed_targets,
            goal_completed=goal_was_completed,
        ), None, 200
