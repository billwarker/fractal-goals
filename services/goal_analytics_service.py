"""Aggregate goal analytics; only a selected goal loads bounded chart buckets."""
from datetime import datetime, timezone
from math import ceil
from sqlalchemy import func, select, true
from sqlalchemy.orm import joinedload
from models import ActivityDefinition, Goal, validate_root_goal
from services.goal_activity_heatmap import utc_datetime
from services.goal_analytics_queries import analytics_evidence
from services.serializers import format_utc
from services.view_serializers import serialize_goal_analytics_goal, serialize_goal_analytics_payload

MAX_CHART_POINTS = 366


class GoalAnalyticsService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_goal_analytics(self, root_id, current_user_id, *, range_start=None, range_end=None,
                           activity_ids=None, chart_goal_id=None, charts=False):
        root = validate_root_goal(self.db_session, root_id, owner_id=current_user_id)
        if not root:
            return None, 'Fractal not found or access denied', 404
        try:
            start = utc_datetime(range_start) if range_start else None
            end = utc_datetime(range_end) if range_end else None
            if start and end and end < start:
                raise ValueError('Reversed range')
            if len(activity_ids or []) > 200:
                raise ValueError('Too many activities')
        except (ValueError, TypeError, OverflowError):
            return None, 'Provide valid analytics dates and at most 200 activities', 400
        goals = self.db_session.query(Goal).options(joinedload(Goal.level)).filter(
            Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).all()
        if chart_goal_id and chart_goal_id not in {goal.id for goal in goals}:
            return None, 'Goal not found', 404
        sessions, instances = analytics_evidence(root_id)
        activity = select(instances)
        if activity_ids is not None:
            activity = activity.where(instances.c.activity_definition_id.in_(activity_ids))
        if start:
            activity = activity.where(instances.c.session_start >= start)
        if end:
            activity = activity.where(instances.c.session_start <= end)
        activity = activity.cte('analytics_filtered_activities')
        session_time = select(sessions)
        if activity_ids is not None:
            session_time = select(activity.c.goal_id, activity.c.session_id,
                                  func.sum(func.coalesce(activity.c.duration_seconds, 0)).label('duration_seconds'),
                                  activity.c.session_start).group_by(activity.c.goal_id, activity.c.session_id, activity.c.session_start)
        else:
            if start:
                session_time = session_time.where(sessions.c.session_start >= start)
            if end:
                session_time = session_time.where(sessions.c.session_start <= end)
        session_time = session_time.cte('analytics_filtered_sessions')
        totals = {row.goal_id: row for row in self.db_session.execute(select(
            session_time.c.goal_id, func.count().label('session_count'),
            func.sum(session_time.c.duration_seconds).label('duration'),
            func.max(session_time.c.session_start).label('last_date'),
        ).group_by(session_time.c.goal_id))}
        breakdown = {}
        for row in self.db_session.execute(select(
            activity.c.goal_id, activity.c.activity_definition_id, ActivityDefinition.name,
            func.count().label('instance_count'), func.sum(func.coalesce(activity.c.duration_seconds, 0)).label('duration'),
            func.max(activity.c.session_start).label('last_date'),
        ).outerjoin(ActivityDefinition, ActivityDefinition.id == activity.c.activity_definition_id).group_by(
            activity.c.goal_id, activity.c.activity_definition_id, ActivityDefinition.name,
        )):
            breakdown.setdefault(row.goal_id, []).append({
                'activity_id': row.activity_definition_id, 'activity_name': row.name or 'Unknown',
                'instance_count': row.instance_count, 'total_duration_seconds': row.duration,
                'last_date': format_utc(row.last_date),
            })
        chart_rows = {}
        activity_chart_rows = {}
        bucket_days = 1
        if charts or chart_goal_id:
            scope = session_time.c.goal_id == chart_goal_id if chart_goal_id else true()
            bounds = self.db_session.execute(select(
                func.min(session_time.c.session_start), func.max(session_time.c.session_start),
            ).where(scope)).one()
            if bounds[0] and bounds[1]:
                span = (bounds[1] - bounds[0]).total_seconds()
                point_budget = MAX_CHART_POINTS if chart_goal_id else 120
                bucket_days = max(1, ceil((span / 86400 + 1) / (point_budget - 1)))
                width = bucket_days * 86400
                bucket = func.to_timestamp(func.floor(func.extract('epoch', session_time.c.session_start) / width) * width)
                for row in self.db_session.execute(select(
                    session_time.c.goal_id, bucket.label('date'), func.sum(session_time.c.duration_seconds).label('duration'),
                    func.count().label('count'),
                ).where(scope, session_time.c.session_start.is_not(None)).group_by(session_time.c.goal_id, bucket).order_by(bucket)):
                    chart_rows.setdefault(row.goal_id, []).append({
                        'date': format_utc(row.date), 'duration_seconds': row.duration,
                        'session_count': row.count, 'session_name': 'Sessions',
                    })
                activity_bucket = func.to_timestamp(func.floor(func.extract('epoch', activity.c.session_start) / width) * width)
                activity_scope = activity.c.goal_id == chart_goal_id if chart_goal_id else true()
                for row in self.db_session.execute(select(
                    activity.c.goal_id, activity_bucket.label('date'),
                    func.sum(activity.c.duration_seconds).label('duration'), func.count().label('count'),
                ).where(activity_scope, activity.c.duration_seconds != 0, activity.c.session_start.is_not(None))
                  .group_by(activity.c.goal_id, activity_bucket).order_by(activity_bucket)):
                    activity_chart_rows.setdefault(row.goal_id, []).append({
                        'date': format_utc(row.date), 'duration_seconds': row.duration,
                        'instance_count': row.count, 'activity_name': 'Activities',
                    })
        now = datetime.now(timezone.utc)
        payload_goals = []
        ages, completion_times, completion_durations = [], [], []
        for goal in goals:
            age = (now - utc_datetime(goal.created_at)).days if goal.created_at else 0
            if goal.created_at:
                ages.append(age)
            if goal.completed and goal.completed_at and goal.created_at:
                completion_times.append((utc_datetime(goal.completed_at) - utc_datetime(goal.created_at)).days)
            total = totals.get(goal.id)
            duration = total.duration if total else 0
            if goal.completed and duration > 0:
                completion_durations.append(duration)
            items = breakdown.get(goal.id, [])
            result = serialize_goal_analytics_goal(
                goal, age_days=age, total_duration_seconds=duration, session_count=total.session_count if total else 0,
                activity_breakdown=items, session_durations_by_date=chart_rows.get(goal.id, []),
                activity_durations_by_date=activity_chart_rows.get(goal.id, []),
            )
            result['activity_duration_seconds'] = sum(item['total_duration_seconds'] for item in items)
            result['last_evidence_at'] = max([(format_utc(total.last_date) or '') if total else '', *[item['last_date'] or '' for item in items]], default='') or None
            payload_goals.append(result)
        completed = sum(bool(goal.completed) for goal in goals)
        def average(values):
            return sum(values) / len(values) if values else 0
        payload = serialize_goal_analytics_payload({
            'total_goals': len(goals), 'completed_goals': completed,
            'completion_rate': completed / len(goals) * 100 if goals else 0,
            'avg_goal_age_days': round(average(ages), 1),
            'avg_time_to_completion_days': round(average(completion_times), 1),
            'avg_duration_to_completion_seconds': round(average(completion_durations)),
        }, payload_goals)
        payload['metadata'] = {'aggregated': True, 'chart_goal_id': chart_goal_id,
                               'chart_bucket_days': bucket_days, 'max_chart_points': MAX_CHART_POINTS if chart_goal_id else 120}
        return payload, None, 200
