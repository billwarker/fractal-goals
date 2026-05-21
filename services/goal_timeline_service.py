from sqlalchemy import select
from sqlalchemy.orm import selectinload

from models import (
    ActivityDefinition,
    ActivityGroup,
    ActivityInstance,
    Goal,
    MetricValue,
    Target,
    activity_goal_associations,
    goal_activity_group_associations,
    validate_root_goal,
)
from services.goal_type_utils import get_canonical_goal_type
from services.serializers import (
    calculate_smart_status,
    format_utc,
    serialize_activity_instance,
    serialize_target,
)
from services.service_types import JsonDict, ServiceResult


GOAL_TIMELINE_TYPES = {
    'activity',
    'target',
    'child_goal',
}


class GoalTimelineService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _validate_owned_root(self, root_id, current_user_id) -> tuple[Goal | None, tuple[str, int] | None]:
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, ("Fractal not found or access denied", 404)
        return root, None

    def _collect_goal_subtree(self, goal: Goal) -> list[Goal]:
        result = []
        stack = [goal]
        while stack:
            current = stack.pop()
            if not current or current.deleted_at:
                continue
            result.append(current)
            stack.extend(child for child in (current.children or []) if not child.deleted_at)
        return result

    def get_goal_timeline(
        self,
        root_id,
        goal_id,
        current_user_id,
        *,
        types=None,
        include_children=True,
        limit=50,
    ) -> ServiceResult[JsonDict]:
        _, error = self._validate_owned_root(root_id, current_user_id)
        if error:
            return None, *error

        goal = self.db_session.query(Goal).filter_by(id=goal_id, root_id=root_id).first()
        if not goal:
            return None, "Goal not found", 404

        limit = max(1, min(int(limit or 50), 200))
        if types is None:
            requested_types = set(GOAL_TIMELINE_TYPES)
        else:
            requested_types = set(types) & GOAL_TIMELINE_TYPES

        all_subtree_goals = self._collect_goal_subtree(goal)
        timeline_goals = all_subtree_goals if include_children else [goal]
        timeline_goal_ids = {item.id for item in timeline_goals}
        all_subtree_ids = {item.id for item in all_subtree_goals}
        goals_by_id = {item.id: item for item in all_subtree_goals}
        entries = []

        def source_relationship(source_goal_id):
            if source_goal_id == goal.id:
                return 'self'
            if source_goal_id in all_subtree_ids:
                return 'descendant'
            return 'parent_inherited'

        def append_entry(entry_id, entry_type, timestamp, title, *, category,
                         subtitle=None,
                         entity_id=None, entity_type=None, source_goal=None,
                         relationship=None, payload=None):
            if not timestamp or category not in requested_types:
                return
            entries.append({
                'id': entry_id,
                'type': category,
                'category': category,
                'event_type': entry_type,
                'timestamp': format_utc(timestamp),
                'title': title,
                'subtitle': subtitle,
                'entity_id': entity_id,
                'entity_type': entity_type,
                'source_goal_id': source_goal.id if source_goal else None,
                'source_goal_name': source_goal.name if source_goal else None,
                'relationship': relationship or (source_relationship(source_goal.id) if source_goal else 'self'),
                'payload': payload or {},
            })

        def occurred_while_goal_active(instance, source_goal):
            occurred_at = instance.time_start or instance.created_at
            if not occurred_at:
                return False
            if source_goal.created_at and occurred_at < source_goal.created_at:
                return False
            if source_goal.completed_at and occurred_at >= source_goal.completed_at:
                return False
            return True

        def serialize_timeline_goal(goal_item):
            level = getattr(goal_item, 'level', None)
            return {
                'goal_id': goal_item.id,
                'goal_name': goal_item.name,
                'type': get_canonical_goal_type(goal_item),
                'level_id': goal_item.level_id,
                'level_name': getattr(level, 'name', None) if level else None,
                'is_smart': all(calculate_smart_status(goal_item).values()),
                'level': {
                    'id': getattr(level, 'id', None),
                    'name': getattr(level, 'name', None),
                    'color': getattr(level, 'color', None),
                    'secondary_color': getattr(level, 'secondary_color', None),
                    'icon': getattr(level, 'icon', None),
                } if level else None,
            }

        effective_goal_ids = set(timeline_goal_ids)
        parent_goal = None
        if goal.inherit_parent_activities and goal.parent_id:
            parent_goal = self.db_session.query(Goal).filter(
                Goal.id == goal.parent_id,
                Goal.root_id == root_id,
                Goal.deleted_at.is_(None),
            ).first()
            if parent_goal:
                effective_goal_ids.add(parent_goal.id)

        activity_contexts = {}
        direct_activity_rows = self.db_session.execute(
            select(
                activity_goal_associations.c.activity_id,
                activity_goal_associations.c.goal_id,
                activity_goal_associations.c.created_at,
            ).where(
                activity_goal_associations.c.goal_id.in_(effective_goal_ids),
                activity_goal_associations.c.deleted_at.is_(None),
            )
        ).all()
        for activity_id, source_goal_id, associated_at in direct_activity_rows:
            source_goal = goals_by_id.get(source_goal_id) or parent_goal
            if source_goal:
                activity_contexts.setdefault(activity_id, []).append((source_goal, associated_at))

        group_rows = self.db_session.execute(
            select(
                goal_activity_group_associations.c.activity_group_id,
                goal_activity_group_associations.c.goal_id,
                goal_activity_group_associations.c.created_at,
            ).where(
                goal_activity_group_associations.c.goal_id.in_(effective_goal_ids),
                goal_activity_group_associations.c.deleted_at.is_(None),
            )
        ).all()
        group_ids = {row.activity_group_id for row in group_rows}
        activities_by_group = {}
        if group_ids:
            group_activities = self.db_session.query(ActivityDefinition).filter(
                ActivityDefinition.root_id == root_id,
                ActivityDefinition.group_id.in_(group_ids),
                ActivityDefinition.deleted_at.is_(None),
            ).all()
            for activity in group_activities:
                activities_by_group.setdefault(activity.group_id, []).append(activity)
        for group_id, source_goal_id, associated_at in group_rows:
            source_goal = goals_by_id.get(source_goal_id) or parent_goal
            if not source_goal:
                continue
            for activity in activities_by_group.get(group_id, []):
                activity_contexts.setdefault(activity.id, []).append((source_goal, associated_at))

        if 'activity' in requested_types and activity_contexts:
            instances = self.db_session.query(ActivityInstance).options(
                selectinload(ActivityInstance.definition).selectinload(ActivityDefinition.group),
                selectinload(ActivityInstance.metric_values).selectinload(MetricValue.definition),
                selectinload(ActivityInstance.metric_values).selectinload(MetricValue.split),
                selectinload(ActivityInstance.session),
            ).filter(
                ActivityInstance.root_id == root_id,
                ActivityInstance.activity_definition_id.in_(list(activity_contexts.keys())),
                ActivityInstance.completed.is_(True),
                ActivityInstance.deleted_at.is_(None),
            ).all()
            for instance in instances:
                source_goal = next(
                    (
                        candidate_goal
                        for candidate_goal, _ in activity_contexts.get(instance.activity_definition_id, [])
                        if occurred_while_goal_active(instance, candidate_goal)
                    ),
                    None,
                )
                if not source_goal:
                    continue
                serialized = serialize_activity_instance(instance)
                session = instance.session
                append_entry(
                    f"activity_completed:{instance.id}",
                    'activity.completed',
                    instance.time_stop or instance.time_start or instance.created_at,
                    f"Completed {serialized.get('name') or 'activity'}",
                    category='activity',
                    subtitle=session.name if session else None,
                    entity_id=instance.id,
                    entity_type='activity_instance',
                    source_goal=source_goal,
                    payload={
                        **serialized,
                        'session_name': session.name if session else None,
                        'session_date': format_utc((session.session_start or session.created_at) if session else None),
                    },
                )

        if 'activity' in requested_types:
            activity_ids = {row.activity_id for row in direct_activity_rows}
            activities_by_id = {}
            if activity_ids:
                activities = self.db_session.query(ActivityDefinition).filter(
                    ActivityDefinition.id.in_(activity_ids),
                    ActivityDefinition.root_id == root_id,
                    ActivityDefinition.deleted_at.is_(None),
                ).all()
                activities_by_id = {activity.id: activity for activity in activities}
            for activity_id, source_goal_id, associated_at in direct_activity_rows:
                source_goal = goals_by_id.get(source_goal_id) or parent_goal
                activity = activities_by_id.get(activity_id)
                if not source_goal or not activity:
                    continue
                append_entry(
                    f"activity_associated:{source_goal_id}:{activity_id}",
                    'activity.associated',
                    associated_at,
                    f"Associated activity: {activity.name}",
                    category='activity',
                    entity_id=activity.id,
                    entity_type='activity_definition',
                    source_goal=source_goal,
                    payload={'activity_definition_id': activity.id, 'activity_name': activity.name},
                )
            if group_ids:
                groups = self.db_session.query(ActivityGroup).filter(
                    ActivityGroup.id.in_(group_ids),
                    ActivityGroup.root_id == root_id,
                    ActivityGroup.deleted_at.is_(None),
                ).all()
                groups_by_id = {group.id: group for group in groups}
                for group_id, source_goal_id, associated_at in group_rows:
                    source_goal = goals_by_id.get(source_goal_id) or parent_goal
                    group = groups_by_id.get(group_id)
                    if not source_goal or not group:
                        continue
                    append_entry(
                        f"activity_group_associated:{source_goal_id}:{group_id}",
                        'activity_group.associated',
                        associated_at,
                        f"Associated activity group: {group.name}",
                        category='activity',
                        entity_id=group.id,
                        entity_type='activity_group',
                        source_goal=source_goal,
                        payload={'activity_group_id': group.id, 'activity_group_name': group.name},
                    )

        if 'target' in requested_types:
            targets = self.db_session.query(Target).options(
                selectinload(Target.completed_session),
                selectinload(Target.metric_conditions),
            ).filter(
                Target.root_id == root_id,
                Target.goal_id.in_(timeline_goal_ids),
                Target.deleted_at.is_(None),
            ).all()
            for target in targets:
                source_goal = goals_by_id.get(target.goal_id, goal)
                append_entry(
                    f"target_created:{target.id}",
                    'target.created',
                    target.created_at,
                    f"Created target: {target.name}",
                    category='target',
                    entity_id=target.id,
                    entity_type='target',
                    source_goal=source_goal,
                    payload=serialize_target(target),
                )
                if not target.completed or not target.completed_at:
                    continue
                append_entry(
                    f"target_achieved:{target.id}",
                    'target.achieved',
                    target.completed_at,
                    f"Achieved target: {target.name}",
                    category='target',
                    subtitle=target.completed_session.name if target.completed_session else None,
                    entity_id=target.id,
                    entity_type='target',
                    source_goal=source_goal,
                    payload=serialize_target(target),
                )

        if 'child_goal' in requested_types and include_children:
            for child in all_subtree_goals:
                if child.id == goal.id:
                    continue
                append_entry(
                    f"child_goal_created:{child.id}",
                    'goal.created',
                    child.created_at,
                    f"Created goal: {child.name}",
                    category='child_goal',
                    entity_id=child.id,
                    entity_type='goal',
                    source_goal=child,
                    relationship='descendant',
                    payload=serialize_timeline_goal(child),
                )
                if not child.completed or not child.completed_at:
                    continue
                append_entry(
                    f"child_goal_completed:{child.id}",
                    'goal.completed',
                    child.completed_at,
                    f"Completed goal: {child.name}",
                    category='child_goal',
                    entity_id=child.id,
                    entity_type='goal',
                    source_goal=child,
                    relationship='descendant',
                    payload=serialize_timeline_goal(child),
                )

        entries.sort(key=lambda item: item['timestamp'] or '', reverse=True)
        sliced = entries[:limit]
        return {
            'entries': sliced,
            'available_types': sorted(GOAL_TIMELINE_TYPES),
            'filters': sorted(requested_types),
            'pagination': {
                'limit': limit,
                'count': len(sliced),
                'total': len(entries),
                'has_more': len(entries) > limit,
            },
        }, None, 200
