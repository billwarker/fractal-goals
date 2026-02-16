import logging
import sqlalchemy as sa
from sqlalchemy import func
from models import get_session, Goal, Session, ActivityInstance, ActivityDefinition, session_goals, activity_goal_associations

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
        # 1. Get the goal and its subtree
        # We need to traverse efficiently.
        # Since we don't have a closure table, we can use a recursive CTE or just recursion in Python if the tree is not huge.
        # For simplicity and DB-agnosticism (though we use PG), let's use the ORM recursion if we assume tree isn't massive (7 levels deep is fine).
        # OR, we can fetch all descendant IDs first.

        goal = self.db_session.query(Goal).filter(Goal.id == goal_id).first()
        if not goal:
            return None

        # Helper to get descendants IDs
        # Using a recursive CTE is better for performance than Python recursion multiple queries
        # But `Goal` model has `children` relationship.
        
        # Let's collect all goal IDs in the subtree first
        subtree_ids = self._get_subtree_ids(goal)
        
        # 2. Calculate Aggregate Metrics for the entire subtree
        # Note: This simply sums up everything in the subtree.
        # It DOES NOT de-duplicate if a session is linked to multiple goals in the same subtree.
        # Typically, user wants duplication (rollup) or unique?
        # "Parents will roll-up the count from their children" usually implies Sum(Children).
        # We will do simple sum for now.
        
        # A. Sessions
        # Count of sessions linked to any goal in subtree
        # Sessions are linked via `session_goals` table
        
        sessions_query = self.db_session.query(
            func.count(Session.id),
            func.sum(Session.total_duration_seconds)
        ).join(
            session_goals, Session.id == session_goals.c.session_id
        ).join(
            Goal, session_goals.c.goal_id == Goal.id
        ).filter(
            session_goals.c.goal_id.in_(subtree_ids),
            Session.deleted_at == None,
            func.coalesce(Session.session_start, Session.created_at) < func.coalesce(Goal.completed_at, sa.text("'9999-12-31'"))
        ).first()
        
        rec_sessions_count = sessions_query[0] or 0
        rec_sessions_duration = sessions_query[1] or 0
        
        # B. Activities
        # Count of associated activity definitions
        # Joined via activity_goal_associations
        activities_count_query = self.db_session.query(
            func.count(activity_goal_associations.c.activity_id)
        ).filter(
            activity_goal_associations.c.goal_id.in_(subtree_ids)
        ).scalar() or 0
        
        rec_activities_count = activities_count_query
        
        # C. Activity Duration
        # Duration of ActivityInstances where the definition is associated with a goal in the subtree
        # Filter: Only count instances that occurred AFTER the associated goal was created
        
        # Subquery to find valid activity instance IDs (deduplicated)
        # An instance is valid if its definition is associated with ANY goal in the subtree
        # AND the instance started after that specific goal was created
        valid_instances_query = self.db_session.query(
            ActivityInstance.id
        ).join(
            activity_goal_associations,
            ActivityInstance.activity_definition_id == activity_goal_associations.c.activity_id
        ).join(
            Goal,
            activity_goal_associations.c.goal_id == Goal.id
        ).filter(
            Goal.id.in_(subtree_ids),
            ActivityInstance.deleted_at == None,
            func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at) >= Goal.created_at,
            func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at) < func.coalesce(Goal.completed_at, sa.text("'9999-12-31'"))
        )
        
        rec_activities_duration = self.db_session.query(
            func.sum(ActivityInstance.duration_seconds)
        ).filter(
            ActivityInstance.id.in_(valid_instances_query)
        ).scalar() or 0

        # 3. Calculate Direct Metrics (Self only)
        # Reuse logic but filter only for goal_id
        self_sessions_query = self.db_session.query(
            func.count(Session.id),
            func.sum(Session.total_duration_seconds)
        ).join(
            session_goals, Session.id == session_goals.c.session_id
        ).join(
            Goal, session_goals.c.goal_id == Goal.id
        ).filter(
            session_goals.c.goal_id == goal_id,
            Session.deleted_at == None,
            func.coalesce(Session.session_start, Session.created_at) < func.coalesce(Goal.completed_at, sa.text("'9999-12-31'"))
        ).first()
        
        self_sessions_count = self_sessions_query[0] or 0
        self_sessions_duration = self_sessions_query[1] or 0
        
        self_activities_count = self.db_session.query(
            func.count(activity_goal_associations.c.activity_id)
        ).filter(
            activity_goal_associations.c.goal_id == goal_id
        ).scalar() or 0
        
        # Self activity duration
        # Filter: Only count instances that occurred AFTER this goal was created
        self_assoc_activity_ids = self.db_session.query(
            activity_goal_associations.c.activity_id
        ).filter(
            activity_goal_associations.c.goal_id == goal_id
        ).distinct()
        
        self_activities_duration = self.db_session.query(
            func.sum(ActivityInstance.duration_seconds)
        ).filter(
            ActivityInstance.activity_definition_id.in_(self_assoc_activity_ids),
            ActivityInstance.deleted_at == None,
            func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at) >= goal.created_at,
            func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at) < func.coalesce(goal.completed_at, sa.text("'9999-12-31'"))
        ).scalar() or 0

        return {
            "id": goal.id,
            "name": goal.name,
            "direct": {
                "sessions_count": self_sessions_count,
                "sessions_duration_seconds": self_sessions_duration,
                "activities_count": self_activities_count,
                "activities_duration_seconds": self_activities_duration
            },
            "recursive": {
                "sessions_count": rec_sessions_count,
                "sessions_duration_seconds": rec_sessions_duration,
                "activities_count": rec_activities_count,
                "activities_duration_seconds": rec_activities_duration
            }
        }

    def _get_subtree_ids(self, goal):
        """
        Recursively collect all IDs in the subtree.
        """
        ids = [goal.id]
        # Since we don't have a loaded tree, we must query or rely on lazy loading
        # If goals are lazy loaded, this triggers queries.
        # But 'children' relationship is often lazy=select or selectin.
        # Let's assume recursion is safe for 7 levels.
        # Optimization: Fetch all goals with root_id = goal.root_id and reconstruct or query?
        # For now, simplistic recursion.
        
        for child in goal.children:
            ids.extend(self._get_subtree_ids(child))
            
        return ids

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

        subtree_ids = self._get_subtree_ids(goal)
        
        # 1. Session Durations by Day (Recursive)
        # Group by date of session_start (fallback to created_at)
        session_date_col = func.date(func.coalesce(Session.session_start, Session.created_at))
        
        sessions_query = self.db_session.query(
            session_date_col.label('date'),
            func.sum(Session.total_duration_seconds).label('duration')
        ).join(
            session_goals, Session.id == session_goals.c.session_id
        ).join(
            Goal, session_goals.c.goal_id == Goal.id
        ).filter(
            session_goals.c.goal_id.in_(subtree_ids),
            Session.deleted_at == None,
            func.coalesce(Session.session_start, Session.created_at) < func.coalesce(Goal.completed_at, sa.text("'9999-12-31'"))
        ).group_by(
            session_date_col
        ).all()
        
        # 2. Activity Durations by Day (Recursive)
        # Group by date of time_start (fallback to created_at)
        activity_date_col = func.date(func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at))
        
        # Find all activities associated with the subtree
        activities_query = self.db_session.query(
            activity_date_col.label('date'),
            func.sum(ActivityInstance.duration_seconds).label('duration')
        ).join(
            activity_goal_associations,
            ActivityInstance.activity_definition_id == activity_goal_associations.c.activity_id
        ).join(
            Goal,
            activity_goal_associations.c.goal_id == Goal.id
        ).filter(
            Goal.id.in_(subtree_ids),
            ActivityInstance.deleted_at == None,
            func.coalesce(ActivityInstance.time_start, ActivityInstance.created_at) < func.coalesce(Goal.completed_at, sa.text("'9999-12-31'"))
        ).group_by(
            activity_date_col
        ).all()
        
        # Merge results map
        # date_str -> { session: 0, activity: 0 }
        data_map = {}
        
        for date_val, duration in sessions_query:
            if not date_val: continue
            d_str = str(date_val)
            if d_str not in data_map:
                data_map[d_str] = {'session_duration': 0, 'activity_duration': 0}
            data_map[d_str]['session_duration'] = int(duration or 0)
            
        for date_val, duration in activities_query:
            if not date_val: continue
            d_str = str(date_val)
            if d_str not in data_map:
                data_map[d_str] = {'session_duration': 0, 'activity_duration': 0}
            data_map[d_str]['activity_duration'] = int(duration or 0)
            
        # Convert to list and sort
        results = []
        for d_str, counts in data_map.items():
            results.append({
                "date": d_str,
                "session_duration": counts['session_duration'],
                "activity_duration": counts['activity_duration']
            })
            
        results.sort(key=lambda x: x['date'])
        
        return {"points": results}

