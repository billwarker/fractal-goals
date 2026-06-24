from datetime import datetime, timezone
import logging
import math
import uuid

from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityInstance,
    Goal,
    MetricDefinition,
    MetricValue,
    Target,
    TargetMetricCondition,
    activity_goal_associations,
    goal_activity_group_associations,
    get_goal_by_id,
    get_session_by_id,
    validate_root_goal,
)
from services.events import Event, Events, event_bus
from services.goal_contribution import resolve_contribution_goal
from services.goal_loading import load_fractal_goals_for_serialization
from services.goal_target_rules import check_metric_value, check_metrics_meet_target
from services.serializers import (
    format_utc,
    serialize_activity_instance,
    serialize_metric_definition,
    serialize_split_definition,
    serialize_target,
)
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


def _reconcile_target_conditions(db_session, target, metrics) -> None:
    """Add/update/remove TargetMetricCondition rows so they match `metrics`.

    Shared by the goal-level bulk sync path and the per-target update path.
    """
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

            _reconcile_target_conditions(db_session, target, metrics)
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
            start_date=_parse_target_date(data.get('start_date')),
            end_date=_parse_target_date(data.get('end_date')),
            linked_block_id=data.get('linked_block_id') or None,
            frequency_days=_parse_target_int(data.get('frequency_days')),
            frequency_count=_parse_target_int(data.get('frequency_count')),
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

    def update_goal_target(self, goal_id, target_id, current_user_id, data) -> ServiceResult[JsonDict]:
        """Update a single existing target in place (per-target edit path).

        Only fields present in `data` are applied. Metric conditions are fully
        reconciled when a `metrics` array is supplied.
        """
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

        if 'name' in data and data.get('name') is not None:
            target.name = data['name']
        if 'activity_id' in data:
            target.activity_id = data.get('activity_id') or None
        if 'activity_instance_id' in data:
            target.activity_instance_id = data.get('activity_instance_id') or None
        if 'type' in data and data.get('type') is not None:
            target.type = data['type']
        if 'time_scope' in data and data.get('time_scope') is not None:
            target.time_scope = data['time_scope']
        if 'start_date' in data:
            target.start_date = _parse_target_date(data.get('start_date'))
        if 'end_date' in data:
            target.end_date = _parse_target_date(data.get('end_date'))
        if 'linked_block_id' in data:
            target.linked_block_id = data.get('linked_block_id') or None
        if 'frequency_days' in data:
            target.frequency_days = _parse_target_int(data.get('frequency_days'))
        if 'frequency_count' in data:
            target.frequency_count = _parse_target_int(data.get('frequency_count'))

        if data.get('metrics') is not None:
            metrics = normalize_target_metrics(data.get('metrics'))
            _reconcile_target_conditions(self.db_session, target, metrics)

        self.db_session.commit()
        self.db_session.refresh(target)
        event_bus.emit(Event(Events.TARGET_UPDATED, {
            'target_id': target.id,
            'target_name': target.name,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id,
        }, source='goal_service.update_goal_target'))
        return {"goal": goal, "target": target}, None, 200

    def _collect_goal_subtree_ids(self, goal: Goal) -> set[str]:
        ids: set[str] = set()
        stack = [goal]
        while stack:
            current = stack.pop()
            if not current or current.deleted_at:
                continue
            ids.add(current.id)
            stack.extend(child for child in (current.children or []) if not child.deleted_at)
        return ids

    def _load_activity_definition(self, root_id, activity_id):
        if not activity_id:
            return None
        return self.db_session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
            selectinload(ActivityDefinition.split_definitions),
        ).filter(
            ActivityDefinition.id == activity_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()

    @staticmethod
    def _serialize_activity_definition_payload(activity_def):
        if not activity_def:
            return None
        return {
            'id': activity_def.id,
            'name': activity_def.name,
            'has_sets': activity_def.has_sets,
            'has_metrics': activity_def.has_metrics,
            'has_splits': activity_def.has_splits,
            'metric_definitions': [
                serialize_metric_definition(metric)
                for metric in (activity_def.metric_definitions or [])
                if not metric.deleted_at
            ],
            'split_definitions': [
                serialize_split_definition(split)
                for split in (activity_def.split_definitions or [])
                if not split.deleted_at
            ],
        }

    def _collect_goal_activity_instances(
        self, root_id, goal, goals_by_id, activity_id, effective_start=None, effective_end=None
    ) -> list[JsonDict]:
        """Serialized completed instances of `activity_id` contributing to `goal`'s
        subtree (respecting the evidence rule), optionally bounded by a date window.
        """
        if not activity_id:
            return []

        subtree_ids = self._collect_goal_subtree_ids(goal)
        effective_goal_ids = set(subtree_ids)
        if goal.inherit_parent_activities and goal.parent_id:
            parent_goal = goals_by_id.get(goal.parent_id)
            if parent_goal:
                effective_goal_ids.add(parent_goal.id)

        associated_goal_ids = self._activity_associated_goal_ids(root_id, activity_id, effective_goal_ids)
        if not associated_goal_ids:
            return []

        occurred_at_expr = func.coalesce(
            ActivityInstance.time_stop,
            ActivityInstance.time_start,
            ActivityInstance.created_at,
        )
        query = self.db_session.query(ActivityInstance).options(
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
            selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
            selectinload(ActivityInstance.session),
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.activity_definition_id == activity_id,
            ActivityInstance.completed.is_(True),
            ActivityInstance.deleted_at.is_(None),
        )
        if effective_start:
            query = query.filter(occurred_at_expr >= effective_start)
        if effective_end:
            query = query.filter(occurred_at_expr <= effective_end)

        instances = query.all()

        serialized_instances = []
        for instance in instances:
            occurred_at = self._as_utc(instance.time_stop or instance.time_start or instance.created_at)
            if not occurred_at:
                continue
            contributes = any(
                resolve_contribution_goal(goals_by_id.get(gid), occurred_at) is not None
                for gid in associated_goal_ids
            )
            if not contributes:
                continue
            serialized = serialize_activity_instance(instance)
            session = instance.session
            serialized['session_name'] = session.name if session else None
            serialized['session_date'] = format_utc(
                (session.session_start or session.created_at) if session else None
            )
            serialized_instances.append(serialized)

        serialized_instances.sort(key=lambda item: item.get('session_date') or item.get('created_at') or '')
        return serialized_instances

    def get_goal_activity_instances(self, root_id, goal_id, activity_id, current_user_id) -> ServiceResult[JsonDict]:
        """Instances + activity definition for a goal/activity pair (no target).

        Powers the live graph preview while a user is creating or editing a target
        before it has been saved. Returns the full (unbounded) contributing history.
        """
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goals_by_id = load_fractal_goals_for_serialization(self.db_session, root_id)
        goal = goals_by_id.get(goal_id)
        if not goal:
            return None, "Goal not found", 404

        activity_def = self._load_activity_definition(root_id, activity_id)
        instances = self._collect_goal_activity_instances(root_id, goal, goals_by_id, activity_id)

        return {
            'activity_definition': self._serialize_activity_definition_payload(activity_def),
            'instances': instances,
        }, None, 200

    def get_target_analytics(self, root_id, target_id, current_user_id, *, since='creation') -> ServiceResult[JsonDict]:
        """Assemble a self-contained analytics read model for a single target.

        Returns the serialized target, its activity definition, the completed
        activity instances that contribute to the target's goal subtree, and a
        summary of progress against each metric condition. Reuses the app's
        evidence rule (resolve_contribution_goal) so paused / post-completion
        activity is excluded, matching the tree/metrics surfaces.

        `since='creation'` (default) bounds instances to the target's effective
        start; `since='all'` returns the full activity history.
        """
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        target = self.db_session.query(Target).options(
            selectinload(Target.metric_conditions).selectinload(TargetMetricCondition.metric),
        ).filter(
            Target.id == target_id,
            Target.root_id == root_id,
            Target.deleted_at.is_(None),
        ).first()
        if not target:
            return None, "Target not found", 404

        goals_by_id = load_fractal_goals_for_serialization(self.db_session, root_id)
        goal = goals_by_id.get(target.goal_id)
        if not goal:
            return None, "Goal not found", 404

        # Effective window: explicit start_date, else the target creation date.
        # `since='all'` removes the lower bound so the full history is returned.
        effective_start = None if since == 'all' else self._as_utc(target.start_date or target.created_at)
        effective_end = self._as_utc(target.end_date)

        activity_def = self._load_activity_definition(root_id, target.activity_id)

        activity_definition_payload = self._serialize_activity_definition_payload(activity_def)

        serialized_instances = self._collect_goal_activity_instances(
            root_id, goal, goals_by_id, target.activity_id, effective_start, effective_end
        )

        summary = self._build_target_summary(target, serialized_instances)

        return {
            'target': serialize_target(target),
            'activity_definition': activity_definition_payload,
            'instances': serialized_instances,
            'summary': summary,
        }, None, 200

    def _activity_associated_goal_ids(self, root_id, activity_id, effective_goal_ids) -> set[str]:
        """Return goal ids in `effective_goal_ids` this activity contributes to.

        Includes direct activity-goal associations and associations via any
        activity group the activity belongs to.
        """
        result: set[str] = set()
        if not effective_goal_ids:
            return result

        direct_rows = self.db_session.execute(
            select(activity_goal_associations.c.goal_id).where(
                activity_goal_associations.c.activity_id == activity_id,
                activity_goal_associations.c.goal_id.in_(effective_goal_ids),
                activity_goal_associations.c.deleted_at.is_(None),
            )
        ).all()
        result.update(row.goal_id for row in direct_rows)

        activity = self.db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_id,
        ).first()
        group_id = getattr(activity, 'group_id', None)
        if group_id:
            group_rows = self.db_session.execute(
                select(goal_activity_group_associations.c.goal_id).where(
                    goal_activity_group_associations.c.activity_group_id == group_id,
                    goal_activity_group_associations.c.goal_id.in_(effective_goal_ids),
                    goal_activity_group_associations.c.deleted_at.is_(None),
                )
            ).all()
            result.update(row.goal_id for row in group_rows)

        return result

    @staticmethod
    def _as_utc(value):
        if value is None:
            return None
        return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)

    def _build_target_summary(self, target, serialized_instances) -> JsonDict:
        """Per-condition progress aggregates over the contributing instances."""
        now = datetime.now(timezone.utc)
        created_at = self._as_utc(target.created_at)

        def instance_values_for_metric(instance, metric_id):
            values = []
            for metric in (instance.get('metrics') or instance.get('metric_values') or []):
                mid = metric.get('metric_id') or metric.get('metric_definition_id')
                if mid == metric_id and metric.get('value') is not None:
                    values.append(metric)
            for instance_set in (instance.get('sets') or []):
                for metric in (instance_set.get('metrics') or []):
                    mid = metric.get('metric_id') or metric.get('metric_definition_id')
                    if mid == metric_id and metric.get('value') is not None:
                        values.append(metric)
            return values

        conditions = []
        for condition in (target.metric_conditions or []):
            metric_id = condition.metric_definition_id
            operator = condition.operator or '>='
            target_value = condition.target_value
            higher_is_better = operator in ('>=', '>', '==', '=')

            best_value = None
            best_instance_id = None
            met_count = 0
            first_met_at = None
            first_met_session_id = None

            for instance in serialized_instances:
                metric_values = instance_values_for_metric(instance, metric_id)
                if not metric_values:
                    continue
                numeric_values = []
                for metric in metric_values:
                    try:
                        numeric_values.append(float(metric['value']))
                    except (TypeError, ValueError):
                        continue
                if not numeric_values:
                    continue
                candidate = max(numeric_values) if higher_is_better else min(numeric_values)
                if best_value is None or (
                    candidate > best_value if higher_is_better else candidate < best_value
                ):
                    best_value = candidate
                    best_instance_id = instance.get('id')

                instance_met = any(
                    check_metric_value(target_value, value, operator) for value in numeric_values
                )
                if instance_met:
                    met_count += 1
                    if first_met_at is None:
                        first_met_at = instance.get('session_date') or instance.get('created_at')
                        first_met_session_id = instance.get('session_id')

            conditions.append({
                'metric_definition_id': metric_id,
                'metric_name': getattr(getattr(condition, 'metric', None), 'name', None),
                'unit': getattr(getattr(condition, 'metric', None), 'unit', None),
                'operator': operator,
                'target_value': target_value,
                'best_value': best_value,
                'best_instance_id': best_instance_id,
                'met_count': met_count,
                'first_met_at': first_met_at,
                'first_met_session_id': first_met_session_id,
            })

        last_instance_at = serialized_instances[-1].get('session_date') if serialized_instances else None

        return {
            'created_at': format_utc(created_at),
            'total_count': len(serialized_instances),
            'last_instance_at': last_instance_at,
            'days_since_created': (now - created_at).days if created_at else None,
            'conditions': conditions,
            'completed': bool(target.completed),
            'completed_at': format_utc(self._as_utc(target.completed_at)) if target.completed_at else None,
            'completed_session_id': target.completed_session_id,
            'completed_instance_id': target.completed_instance_id,
        }

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
