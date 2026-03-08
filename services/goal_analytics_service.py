from datetime import datetime, timezone

from sqlalchemy.orm import joinedload

from models import ActivityInstance, ActivityDefinition, Goal, Session, validate_root_goal
from services.serializers import format_utc


class GoalAnalyticsService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_goal_analytics(self, root_id, current_user_id):
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        all_goals = self.db_session.query(Goal).filter(
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).all()

        now = datetime.now(timezone.utc)
        completed_goals = [goal for goal in all_goals if goal.completed]
        total_completed = len(completed_goals)

        goal_ages = []
        for goal in all_goals:
            if not goal.created_at:
                continue
            created = goal.created_at.replace(tzinfo=timezone.utc) if goal.created_at.tzinfo is None else goal.created_at
            goal_ages.append((now - created).days)
        avg_goal_age = sum(goal_ages) / len(goal_ages) if goal_ages else 0

        completion_times = []
        for goal in completed_goals:
            if not goal.completed_at or not goal.created_at:
                continue
            created = goal.created_at.replace(tzinfo=timezone.utc) if goal.created_at.tzinfo is None else goal.created_at
            completed = goal.completed_at.replace(tzinfo=timezone.utc) if goal.completed_at.tzinfo is None else goal.completed_at
            completion_times.append((completed - created).days)
        avg_time_to_completion = sum(completion_times) / len(completion_times) if completion_times else 0

        all_sessions = self.db_session.query(Session).options(
            joinedload(Session.goals)
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).all()

        goal_session_map = {}
        for session in all_sessions:
            session_duration = session.total_duration_seconds or 0
            if session_duration == 0 and session.session_start and session.session_end:
                start = session.session_start.replace(tzinfo=timezone.utc) if session.session_start.tzinfo is None else session.session_start
                end = session.session_end.replace(tzinfo=timezone.utc) if session.session_end.tzinfo is None else session.session_end
                session_duration = int((end - start).total_seconds())

            for goal in session.goals:
                goal_session_map.setdefault(goal.id, []).append({
                    "session_id": session.id,
                    "session_name": session.name,
                    "duration_seconds": session_duration,
                    "completed": session.completed,
                    "session_start": format_utc(session.session_start),
                })

        all_activity_instances = self.db_session.query(ActivityInstance).options(
            joinedload(ActivityInstance.definition)
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
        ).all()

        session_activity_map = {}
        for instance in all_activity_instances:
            session_activity_map.setdefault(instance.session_id, []).append(instance)

        total_duration_completed = 0
        completed_goals_with_sessions = 0
        for goal in completed_goals:
            if goal.id not in goal_session_map:
                continue
            goal_duration = sum(session["duration_seconds"] for session in goal_session_map[goal.id])
            if goal_duration <= 0:
                continue
            total_duration_completed += goal_duration
            completed_goals_with_sessions += 1
        avg_duration_to_completion = (
            total_duration_completed / completed_goals_with_sessions
            if completed_goals_with_sessions > 0 else 0
        )

        goals_data = []
        for goal in all_goals:
            sessions_for_goal = goal_session_map.get(goal.id, [])
            total_duration = sum(session["duration_seconds"] for session in sessions_for_goal)
            session_count = len(sessions_for_goal)

            activity_breakdown = {}
            goal_activity_instances = []
            for session in sessions_for_goal:
                goal_activity_instances.extend(session_activity_map.get(session["session_id"], []))

            for instance in goal_activity_instances:
                activity_name = instance.definition.name if instance.definition else "Unknown"
                activity_id = instance.activity_definition_id
                if activity_id not in activity_breakdown:
                    activity_breakdown[activity_id] = {
                        "activity_id": activity_id,
                        "activity_name": activity_name,
                        "instance_count": 0,
                        "total_duration_seconds": 0,
                    }
                activity_breakdown[activity_id]["instance_count"] += 1
                if instance.duration_seconds:
                    activity_breakdown[activity_id]["total_duration_seconds"] += instance.duration_seconds

            goal_age_days = 0
            if goal.created_at:
                created = goal.created_at.replace(tzinfo=timezone.utc) if goal.created_at.tzinfo is None else goal.created_at
                goal_age_days = (now - created).days

            session_durations_by_date = []
            for session in sessions_for_goal:
                if session["session_start"]:
                    session_durations_by_date.append({
                        "date": session["session_start"],
                        "duration_seconds": session["duration_seconds"],
                        "session_name": session["session_name"],
                    })
            session_durations_by_date.sort(key=lambda item: item["date"])

            activity_durations_by_date = []
            for instance in goal_activity_instances:
                session = next(
                    (session_item for session_item in sessions_for_goal if session_item["session_id"] == instance.session_id),
                    None,
                )
                if session and session["session_start"] and instance.duration_seconds:
                    activity_durations_by_date.append({
                        "date": session["session_start"],
                        "duration_seconds": instance.duration_seconds,
                        "activity_name": instance.definition.name if instance.definition else "Unknown",
                    })
            activity_durations_by_date.sort(key=lambda item: item["date"])

            goals_data.append({
                "id": goal.id,
                "name": goal.name,
                "type": goal.level.name.replace(" ", "") if getattr(goal, "level", None) else "Goal",
                "description": goal.description,
                "completed": goal.completed,
                "completed_at": format_utc(goal.completed_at),
                "created_at": format_utc(goal.created_at),
                "deadline": format_utc(goal.deadline),
                "parent_id": goal.parent_id,
                "age_days": goal_age_days,
                "total_duration_seconds": total_duration,
                "session_count": session_count,
                "activity_breakdown": list(activity_breakdown.values()),
                "session_durations_by_date": session_durations_by_date,
                "activity_durations_by_date": activity_durations_by_date,
            })

        payload = {
            "summary": {
                "total_goals": len(all_goals),
                "completed_goals": total_completed,
                "completion_rate": (total_completed / len(all_goals) * 100) if all_goals else 0,
                "avg_goal_age_days": round(avg_goal_age, 1),
                "avg_time_to_completion_days": round(avg_time_to_completion, 1),
                "avg_duration_to_completion_seconds": round(avg_duration_to_completion, 0),
            },
            "goals": goals_data,
        }
        return payload, None, 200
