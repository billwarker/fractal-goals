import logging
from models import (
    Goal,
    Session,
    ActivityInstance,
    ActivityDefinition,
    session_goals,
    activity_goal_associations,
    goal_activity_group_associations,
)
from services.session_filters import session_duration_seconds_from_row

logger = logging.getLogger(__name__)


class GoalMetricsService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_metrics_for_goal(self, goal_id: str):
        """
        Calculate metrics for a goal, including recursive rollups from children.
        Returns:
            {
                "id": goal_id,
                "sessions_count": int,
                "sessions_duration_seconds": int,
                "activities_count": int,
                "activities_duration_seconds": int,
                "recursive": {
                    "sessions_count": int,
                    "sessions_duration_seconds": int,
                    "activities_count": int,
                    "activities_duration_seconds": int
                }
            }
        """
        goal = self.db_session.query(Goal).filter(Goal.id == goal_id).first()
        if not goal:
            return None

        subtree_ids = self._get_subtree_ids(goal)
        direct_metrics = self._calculate_scope_metrics(goal, [goal.id])
        recursive_metrics = self._calculate_scope_metrics(goal, subtree_ids)

        return {
            "id": goal.id,
            "name": goal.name,
            "direct": {
                "sessions_count": direct_metrics["sessions_count"],
                "sessions_duration_seconds": direct_metrics["sessions_duration_seconds"],
                "activities_count": direct_metrics["activities_count"],
                "activities_duration_seconds": direct_metrics["activities_duration_seconds"]
            },
            "recursive": {
                "sessions_count": recursive_metrics["sessions_count"],
                "sessions_duration_seconds": recursive_metrics["sessions_duration_seconds"],
                "activities_count": recursive_metrics["activities_count"],
                "activities_duration_seconds": recursive_metrics["activities_duration_seconds"]
            }
        }

    def _get_subtree_ids(self, goal):
        """
        Collect all IDs in the subtree with one root-scoped query.
        """
        rows = self.db_session.query(Goal.id, Goal.parent_id).filter(
            Goal.root_id == goal.root_id,
            Goal.deleted_at == None,
        ).all()
        children_by_parent = {}
        for goal_id, parent_id in rows:
            children_by_parent.setdefault(parent_id, []).append(goal_id)

        ids = []
        stack = [goal.id]
        seen = set()
        while stack:
            current_id = stack.pop()
            if current_id in seen:
                continue
            seen.add(current_id)
            ids.append(current_id)
            stack.extend(children_by_parent.get(current_id, []))

        return ids

    def _context_goal_ids(self, goal, scope_goal_ids):
        context_ids = set(scope_goal_ids)
        if goal.inherit_parent_activities and goal.parent_id:
            context_ids.add(goal.parent_id)
        return context_ids

    def _activity_contexts_for_scope(self, goal, scope_goal_ids):
        context_goal_ids = self._context_goal_ids(goal, scope_goal_ids)
        goals = self.db_session.query(Goal).filter(
            Goal.id.in_(context_goal_ids),
            Goal.deleted_at == None,
        ).all()
        goals_by_id = {item.id: item for item in goals}

        contexts = {}
        direct_rows = self.db_session.query(
            activity_goal_associations.c.activity_id,
            activity_goal_associations.c.goal_id,
        ).filter(
            activity_goal_associations.c.goal_id.in_(context_goal_ids),
            activity_goal_associations.c.deleted_at == None,
        ).all()
        for activity_id, source_goal_id in direct_rows:
            source_goal = goals_by_id.get(source_goal_id)
            if source_goal:
                contexts.setdefault(activity_id, []).append(source_goal)

        group_rows = self.db_session.query(
            goal_activity_group_associations.c.activity_group_id,
            goal_activity_group_associations.c.goal_id,
        ).filter(
            goal_activity_group_associations.c.goal_id.in_(context_goal_ids),
            goal_activity_group_associations.c.deleted_at == None,
        ).all()
        group_ids = {row.activity_group_id for row in group_rows}
        activities_by_group = {}
        if group_ids:
            group_activities = self.db_session.query(
                ActivityDefinition.id,
                ActivityDefinition.group_id,
            ).filter(
                ActivityDefinition.root_id == goal.root_id,
                ActivityDefinition.group_id.in_(group_ids),
                ActivityDefinition.deleted_at == None,
            ).all()
            for activity_id, group_id in group_activities:
                activities_by_group.setdefault(group_id, []).append(activity_id)

        for group_id, source_goal_id in group_rows:
            source_goal = goals_by_id.get(source_goal_id)
            if not source_goal:
                continue
            for activity_id in activities_by_group.get(group_id, []):
                contexts.setdefault(activity_id, []).append(source_goal)

        return contexts

    def _occurred_while_goal_active(self, instance, source_goal):
        occurred_at = instance.time_start or instance.created_at
        if not occurred_at:
            return False
        if source_goal.created_at and occurred_at < source_goal.created_at:
            return False
        if source_goal.completed_at and occurred_at >= source_goal.completed_at:
            return False
        return True

    def _activity_instances_for_scope(self, goal, scope_goal_ids):
        activity_contexts = self._activity_contexts_for_scope(goal, scope_goal_ids)
        if not activity_contexts:
            return [], set()

        instances = self.db_session.query(ActivityInstance).filter(
            ActivityInstance.root_id == goal.root_id,
            ActivityInstance.activity_definition_id.in_(list(activity_contexts.keys())),
            ActivityInstance.completed == True,
            ActivityInstance.deleted_at == None,
        ).all()

        contributing = []
        seen_ids = set()
        for instance in instances:
            source_goal = next(
                (
                    candidate_goal
                    for candidate_goal in activity_contexts.get(instance.activity_definition_id, [])
                    if self._occurred_while_goal_active(instance, candidate_goal)
                ),
                None,
            )
            if not source_goal or instance.id in seen_ids:
                continue
            contributing.append(instance)
            seen_ids.add(instance.id)

        return contributing, set(activity_contexts.keys())

    def _manual_sessions_for_scope(self, goal, scope_goal_ids):
        rows = self.db_session.query(
            Session,
            Goal,
        ).join(
            session_goals, Session.id == session_goals.c.session_id
        ).join(
            Goal, session_goals.c.goal_id == Goal.id
        ).filter(
            session_goals.c.goal_id.in_(scope_goal_ids),
            session_goals.c.deleted_at == None,
            Session.deleted_at == None,
        ).all()

        sessions = {}
        for session, source_goal in rows:
            occurred_at = session.session_start or session.created_at
            if source_goal.completed_at and occurred_at and occurred_at >= source_goal.completed_at:
                continue
            sessions[session.id] = session
        return sessions

    def _calculate_scope_metrics(self, goal, scope_goal_ids):
        instances, activity_ids = self._activity_instances_for_scope(goal, scope_goal_ids)
        sessions_by_id = self._manual_sessions_for_scope(goal, scope_goal_ids)
        instance_session_ids = {instance.session_id for instance in instances if instance.session_id}
        if instance_session_ids:
            for session in self.db_session.query(Session).filter(
                Session.id.in_(instance_session_ids),
                Session.deleted_at == None,
            ).all():
                sessions_by_id.setdefault(session.id, session)

        sessions_duration = sum(
            session_duration_seconds_from_row(
                session.total_duration_seconds,
                session.duration_minutes,
                session.session_start,
                session.session_end,
            )
            for session in sessions_by_id.values()
        )
        activities_duration = sum(int(instance.duration_seconds or 0) for instance in instances)

        return {
            "sessions_count": len(sessions_by_id),
            "sessions_duration_seconds": sessions_duration,
            "activities_count": len(activity_ids),
            "activities_duration_seconds": activities_duration,
            "instances": instances,
            "sessions": sessions_by_id,
        }

    def get_goal_daily_durations(self, goal_id: str):
        """
        Get daily duration metrics for a goal and its subtree.
        Returns:
            {
                "points": [
                    {
                        "date": "YYYY-MM-DD",
                        "session_duration": int,
                        "activity_duration": int
                    },
                    ...
                ]
            }
        """
        goal = self.db_session.query(Goal).filter(Goal.id == goal_id).first()
        if not goal:
            return None

        metrics = self._calculate_scope_metrics(goal, self._get_subtree_ids(goal))
        data_map = {}

        for session in metrics["sessions"].values():
            timestamp = session.session_start or session.created_at
            if not timestamp:
                continue
            d_str = timestamp.date().isoformat()
            data_map.setdefault(d_str, {'session_duration': 0, 'activity_duration': 0})
            data_map[d_str]['session_duration'] += session_duration_seconds_from_row(
                session.total_duration_seconds,
                session.duration_minutes,
                session.session_start,
                session.session_end,
            )

        for instance in metrics["instances"]:
            timestamp = instance.time_start or instance.created_at
            if not timestamp:
                continue
            d_str = timestamp.date().isoformat()
            data_map.setdefault(d_str, {'session_duration': 0, 'activity_duration': 0})
            data_map[d_str]['activity_duration'] += int(instance.duration_seconds or 0)

        results = []
        for d_str, counts in data_map.items():
            results.append({
                "date": d_str,
                "session_duration": counts['session_duration'],
                "activity_duration": counts['activity_duration']
            })

        results.sort(key=lambda x: x['date'])

        return {"points": results}
