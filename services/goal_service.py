from datetime import datetime, timezone
import logging
import uuid

from sqlalchemy import inspect
from sqlalchemy.orm import selectinload

from models import (
    ActivityInstance,
    ActivityDefinition,
    ActivityGroup,
    Goal,
    GoalLevel,
    MetricDefinition,
    Note,
    Session,
    SessionTemplate,
    SplitDefinition,
    Target,
    TargetMetricCondition,
    VisualizationAnnotation,
    get_goal_by_id,
    get_session_by_id,
    session_goals,
    validate_root_goal,
)
from services.goal_target_rules import check_metrics_meet_target
from services.payload_normalizers import normalize_goal_payload
from services.service_types import JsonDict, JsonList, ServiceResult
from services.serializers import (
    calculate_smart_status,
    serialize_activity_instance,
    serialize_target,
)
from services.view_serializers import (
    serialize_fractal_summary,
    serialize_goal_selection_item,
    serialize_goal_target_evaluation_result,
)
from validators import parse_date_string

logger = logging.getLogger(__name__)

_TYPE_TO_LEVEL_NAME = {
    'UltimateGoal': 'Ultimate Goal',
    'LongTermGoal': 'Long Term Goal',
    'MidTermGoal': 'Mid Term Goal',
    'ShortTermGoal': 'Short Term Goal',
    'ImmediateGoal': 'Immediate Goal',
    'MicroGoal': 'Micro Goal',
    'NanoGoal': 'Nano Goal',
}


def resolve_level_id(db_session, type_value) -> str | None:
    level_name = _TYPE_TO_LEVEL_NAME.get(
        type_value,
        type_value.replace('Goal', ' Goal') if isinstance(type_value, str) else None,
    )
    if not level_name:
        return None

    level = db_session.query(GoalLevel).filter_by(name=level_name, owner_id=None).first()
    if not level:
        level = db_session.query(GoalLevel).filter_by(name=level_name).first()
    return level.id if level else None


def session_goals_supports_source(db_session) -> bool:
    cols = inspect(db_session.bind).get_columns('session_goals')
    return any(column.get('name') == 'association_source' for column in cols)


def session_goal_insert_values(db_session, session_id, goal_id, goal_type, association_source) -> JsonDict:
    values = {
        'session_id': session_id,
        'goal_id': goal_id,
        'goal_type': goal_type,
    }
    if session_goals_supports_source(db_session):
        values['association_source'] = association_source
    return values


def authorize_goal_access(db_session, current_user_id, goal, root_id_hint=None) -> str | None:
    if not goal:
        return None

    authorized_root_id = root_id_hint or goal.root_id or goal.id
    root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user_id)
    if not root:
        return None
    if goal.root_id and goal.root_id != authorized_root_id:
        return None
    return authorized_root_id


def sync_goal_targets(db_session, goal, incoming_targets) -> None:
    def _parse_date(value):
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

    def _parse_int(value):
        if value is None or value == '':
            return None
        try:
            return int(value)
        except Exception:
            return None

    def _clean_metrics(value):
        if not isinstance(value, list):
            return []

        cleaned = []
        for metric in value:
            metric_id = metric.get('metric_id') or metric.get('metric_definition_id')
            if not metric_id:
                continue

            raw_target = metric.get('value', metric.get('target_value', 0))
            try:
                target_value = float(raw_target)
                import math
                if not math.isfinite(target_value):
                    target_value = 0.0
            except Exception:
                target_value = 0.0

            cleaned.append({
                'metric_definition_id': metric_id,
                'target_value': target_value,
                'operator': metric.get('operator', '>='),
            })
        return cleaned

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
        start_date = _parse_date(target_data.get('start_date'))
        end_date = _parse_date(target_data.get('end_date'))
        frequency_days = _parse_int(target_data.get('frequency_days'))
        frequency_count = _parse_int(target_data.get('frequency_count'))
        metrics = _clean_metrics(target_data.get('metrics'))

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
        except (TypeError, ValueError):
            target_value = 0.0

        normalized.append({
            'metric_definition_id': metric_id,
            'operator': metric.get('operator', '>='),
            'target_value': target_value,
        })

    return normalized


class GoalService:
    def __init__(self, db_session, *, sync_targets):
        self.db_session = db_session
        self.sync_targets = sync_targets

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _collect_goal_subtree(self, goal: Goal) -> list[Goal]:
        root_scope_id = goal.root_id or goal.id
        active_goals = self.db_session.query(Goal).filter(
            Goal.root_id == root_scope_id,
            Goal.deleted_at.is_(None),
        ).all()
        goals_by_id = {item.id: item for item in active_goals}
        children_by_parent: dict[str | None, list[Goal]] = {}
        for item in active_goals:
            children_by_parent.setdefault(item.parent_id, []).append(item)

        subtree: list[Goal] = []
        stack = [goal.id]
        seen: set[str] = set()
        while stack:
            current_id = stack.pop()
            if current_id in seen:
                continue
            seen.add(current_id)

            current = goals_by_id.get(current_id)
            if not current:
                continue

            subtree.append(current)
            stack.extend(child.id for child in children_by_parent.get(current.id, []))

        return subtree

    def _soft_delete_goal_subtree(self, goal: Goal, deleted_at: datetime) -> list[Goal]:
        subtree = self._collect_goal_subtree(goal)
        subtree_ids = [item.id for item in subtree]

        for item in subtree:
            item.deleted_at = deleted_at

        for target in self.db_session.query(Target).filter(
            Target.goal_id.in_(subtree_ids),
            Target.deleted_at.is_(None),
        ).all():
            target.deleted_at = deleted_at

        for note in self.db_session.query(Note).filter(
            Note.nano_goal_id.in_(subtree_ids),
            Note.deleted_at.is_(None),
        ).all():
            note.deleted_at = deleted_at

        return subtree

    def _soft_delete_root_entities(self, root_id: str, deleted_at: datetime) -> None:
        for model in (
            Session,
            ActivityInstance,
            ActivityDefinition,
            ActivityGroup,
            MetricDefinition,
            SplitDefinition,
            SessionTemplate,
            Target,
            Note,
            VisualizationAnnotation,
        ):
            query = self.db_session.query(model).filter(model.root_id == root_id)
            if hasattr(model, "deleted_at"):
                query = query.filter(model.deleted_at.is_(None))

            for row in query.all():
                row.deleted_at = deleted_at
                if isinstance(row, MetricDefinition):
                    row.is_active = False

    def _authorize_goal_access(self, current_user_id, goal, root_id_hint=None) -> str | None:
        return authorize_goal_access(self.db_session, current_user_id, goal, root_id_hint)

    def _parse_deadline(self, deadline_value) -> tuple[datetime | None, str | None]:
        if not deadline_value:
            return None, None

        if isinstance(deadline_value, str) and 'T' in deadline_value:
            deadline_value = deadline_value.split('T')[0]

        try:
            return parse_date_string(deadline_value), None
        except ValueError:
            return None, "Invalid deadline format. Use YYYY-MM-DD"

    def _validate_description_required(self, level_obj, description) -> str | None:
        if level_obj and getattr(level_obj, 'description_required', False):
            if not description or not description.strip():
                return f"A description is required for {level_obj.name}s."
        return None

    def _validate_parent_capacity(self, parent_goal, *, error_prefix) -> str | None:
        if not parent_goal or not parent_goal.level:
            return None

        parent_max = parent_goal.level.max_children
        if parent_max is None:
            return None

        current_children = self.db_session.query(Goal).filter_by(
            parent_id=parent_goal.id,
            deleted_at=None,
        ).count()
        if current_children >= parent_max:
            return f"{error_prefix} '{parent_goal.level.name}' allows a maximum of {parent_max} children."
        return None

    def _find_max_updated(self, goal, current_max):
        if goal.updated_at and (not current_max or goal.updated_at > current_max):
            current_max = goal.updated_at
        for child in goal.children:
            current_max = self._find_max_updated(child, current_max)
        return current_max

    def list_fractals(self, current_user_id) -> ServiceResult[JsonList]:
        roots = self.db_session.query(Goal).options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
            selectinload(Goal.children),
        ).filter(
            Goal.parent_id.is_(None),
            Goal.owner_id == current_user_id,
            Goal.deleted_at.is_(None),
        ).all()

        fractals = []
        for root in roots:
            last_activity = self._find_max_updated(root, root.updated_at)
            fractals.append(serialize_fractal_summary(root, last_activity))
        return fractals, None, 200

    def create_fractal(self, current_user_id, data) -> ServiceResult[Goal]:
        level = self.db_session.query(GoalLevel).filter_by(name="Ultimate Goal").first()
        if not level:
            level = GoalLevel(name="Ultimate Goal", rank=0)
            self.db_session.add(level)
            self.db_session.flush()

        new_fractal = Goal(
            level_id=level.id,
            name=data['name'],
            description=data.get('description', ''),
            relevance_statement=data.get('relevance_statement'),
            parent_id=None,
            owner_id=current_user_id,
        )
        self.db_session.add(new_fractal)
        self.db_session.commit()
        self.db_session.refresh(new_fractal)
        return new_fractal, None, 201

    def delete_fractal(self, root_id, current_user_id) -> ServiceResult[JsonDict]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        deleted_at = datetime.now(timezone.utc)
        self._soft_delete_root_entities(root_id, deleted_at)
        self._soft_delete_goal_subtree(root, deleted_at)
        self.db_session.commit()
        return {"status": "success", "message": "Fractal deleted"}, None, 200

    def get_fractal_tree(self, root_id, current_user_id) -> ServiceResult[Goal]:
        root = self.db_session.query(Goal).options(
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter(
            Goal.id == root_id,
            Goal.parent_id.is_(None),
            Goal.owner_id == current_user_id,
            Goal.deleted_at.is_(None),
        ).first()

        if not root:
            root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
            if not root:
                return None, "Fractal not found or access denied", 404

        return root, None, 200

    def get_active_goals_for_selection(self, root_id, current_user_id) -> ServiceResult[JsonList]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        st_goals = self.db_session.query(Goal).join(GoalLevel, Goal.level_id == GoalLevel.id).options(
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
        ).filter(
            Goal.root_id == root_id,
            GoalLevel.name == 'Short Term Goal',
            Goal.completed.is_(False),
            Goal.deleted_at.is_(None),
        ).all()

        result = []
        for short_term_goal in st_goals:
            active_children = []
            for child in short_term_goal.children:
                is_immediate_goal = getattr(child, 'level', None) and child.level.name == 'Immediate Goal'
                if is_immediate_goal and not child.completed and not child.deleted_at:
                    active_children.append(child)

            result.append(serialize_goal_selection_item(short_term_goal, active_children))

        return result, None, 200

    def create_global_goal(self, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data)
        parent = None
        parent_id = data.get('parent_id')
        if parent_id:
            parent = get_goal_by_id(self.db_session, parent_id)
            if not parent:
                return None, f"Parent not found: {parent_id}", 404
            if not self._authorize_goal_access(current_user_id, parent):
                return None, "Parent not found or access denied", 404

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

        with self.db_session.begin_nested():
            new_goal = Goal(
                level_id=level_id,
                name=data['name'],
                description=data.get('description', ''),
                deadline=deadline,
                completed=False,
                completed_via_children=data.get('completed_via_children', False),
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

            if getattr(new_goal, 'level', None) and new_goal.level.name == 'Nano Goal' and new_goal.parent_id:
                if parent and parent.associated_activities:
                    for activity in parent.associated_activities:
                        new_goal.associated_activities.append(activity)

            if data.get('targets'):
                self.sync_targets(self.db_session, new_goal, data['targets'])
                new_goal.targets = None

            is_micro = getattr(new_goal, 'level', None) and new_goal.level.name == 'Micro Goal'
            if data.get('session_id') and (data.get('type') == 'MicroGoal' or is_micro):
                self.db_session.execute(session_goals.insert().values(
                    **session_goal_insert_values(
                        self.db_session,
                        data['session_id'],
                        new_goal.id,
                        'MicroGoal',
                        'micro_goal',
                    )
                ))

        self.db_session.commit()
        self.db_session.refresh(new_goal)
        return new_goal, None, 201

    def create_fractal_goal(self, root_id, current_user_id, data) -> ServiceResult[Goal]:
        data = normalize_goal_payload(data)
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        deadline, deadline_error = self._parse_deadline(data.get('deadline'))
        if deadline_error:
            return None, deadline_error, 400

        level_id = resolve_level_id(self.db_session, data.get('type'))
        level_obj = self.db_session.query(GoalLevel).filter_by(id=level_id).first() if level_id else None

        description_error = self._validate_description_required(level_obj, data.get('description'))
        if description_error:
            return None, description_error, 400

        parent_id = data.get('parent_id')
        if parent_id:
            parent_goal = self.db_session.query(Goal).filter_by(id=parent_id, root_id=root_id).first()
            if not parent_goal:
                return None, "Parent goal not found in this fractal.", 400
            parent_capacity_error = self._validate_parent_capacity(
                parent_goal,
                error_prefix="Cannot create goal: Parent level",
            )
            if parent_capacity_error:
                return None, parent_capacity_error, 400

        completed_via_children = data.get('completed_via_children', False)
        if not completed_via_children and level_obj and getattr(level_obj, 'auto_complete_when_children_done', False):
            completed_via_children = True

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

            if data.get('session_id') and data.get('type') == 'MicroGoal':
                self.db_session.execute(session_goals.insert().values(
                    **session_goal_insert_values(
                        self.db_session,
                        data['session_id'],
                        new_goal.id,
                        'MicroGoal',
                        'micro_goal',
                    )
                ))

        self.db_session.commit()
        self.db_session.refresh(new_goal)
        return new_goal, None, 201

    def get_fractal_goal(self, root_id, goal_id, current_user_id) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal or goal.root_id != root_id:
            return None, "Goal not found", 404
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

        next_description = data['description'] if 'description' in data else goal.description
        level_error = self._validate_description_required(getattr(goal, 'level', None), next_description)
        if level_error:
            return None, level_error, 400

        if 'name' in data:
            goal.name = data['name']
        if 'description' in data:
            goal.description = data['description']

        if 'deadline' in data:
            deadline, deadline_error = self._parse_deadline(data['deadline'])
            if deadline_error:
                return None, deadline_error, 400
            goal.deadline = deadline

        # Target updates are replace-by-presence: omit to preserve, include to replace.
        if 'targets' in data:
            self.sync_targets(self.db_session, goal, data['targets'] or [])
            goal.targets = None

        if 'parent_id' in data:
            new_parent_id = data['parent_id']
            if new_parent_id and new_parent_id != goal.parent_id:
                new_parent = self.db_session.query(Goal).filter_by(id=new_parent_id, root_id=root_id).first()
                if not new_parent:
                    return None, "New parent goal not found in this fractal.", 400
                parent_capacity_error = self._validate_parent_capacity(
                    new_parent,
                    error_prefix="Cannot move goal: New parent level",
                )
                if parent_capacity_error:
                    return None, parent_capacity_error, 400
            goal.parent_id = new_parent_id

        if 'relevance_statement' in data:
            goal.relevance_statement = data['relevance_statement']
        if 'completed_via_children' in data:
            goal.completed_via_children = data['completed_via_children']
        if 'allow_manual_completion' in data:
            goal.allow_manual_completion = data['allow_manual_completion']
        if 'track_activities' in data:
            goal.track_activities = data['track_activities']

        self.db_session.commit()
        self.db_session.refresh(goal)
        return goal, None, 200

    def delete_fractal_goal(self, root_id, goal_id, current_user_id) -> ServiceResult[Goal]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = get_goal_by_id(self.db_session, goal_id)
        if not goal:
            return None, "Goal not found", 404
        if goal.root_id != root_id:
            return None, "Goal not found in this fractal", 404

        deleted_at = datetime.now(timezone.utc)
        self._soft_delete_goal_subtree(goal, deleted_at)
        self.db_session.commit()
        return goal, None, 200

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
        return {"goal": goal, "target": target}, None, 200

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

        goal.completed = data['completed'] if 'completed' in data else not goal.completed

        if goal.completed:
            level = getattr(goal, 'level', None)
            if level and level.allow_manual_completion is False:
                return None, "Manual completion is not allowed for this goal level", 403
            if level and getattr(level, 'requires_smart', False):
                smart_status = calculate_smart_status(goal)
                if not all(smart_status.values()):
                    return None, {
                        "error": f"SMART criteria not met. Missing: {', '.join([key for key, value in smart_status.items() if not value])}",
                        "smart_status": smart_status,
                    }, 400

        goal.completed_at = datetime.now(timezone.utc) if goal.completed else None
        self.db_session.commit()
        self.db_session.refresh(goal)
        return goal, None, 200

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

        if targets_completed == targets_total and targets_total > 0 and not goal.completed:
            goal.completed = True
            goal.completed_at = now
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
