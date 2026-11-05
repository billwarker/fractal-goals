"""Aggregate goal analytics; only a selected goal loads bounded chart buckets."""
from datetime import datetime, timezone
from sqlalchemy import Date, cast, func, select, true
from sqlalchemy.orm import joinedload
from models import ActivityDefinition, Goal, validate_root_goal
from services.chart_grain import AUTO, GRAINS, bucket_start, resolve_grain
from services.goal_activity_heatmap import utc_datetime
from services.session_filters import resolve_timezone
from services.goal_analytics_queries import analytics_evidence
from services.goal_time_rollup import plan_rollup, rollup_bucket_rows
from services.serializers import format_utc
from services.view_serializers import serialize_goal_analytics_goal, serialize_goal_analytics_payload

# Bars per chart before a finer grain is coarsened; matches MAX_CHART_POINTS in client/src/utils/chartGrain.js.
MAX_CHART_POINTS = 500


class GoalAnalyticsService:
    def __init__(self, db_session):
        self.db_session = db_session

    def get_goal_analytics(self, root_id, current_user_id, *, range_start=None, range_end=None,
                           activity_ids=None, chart_goal_id=None, charts=False, grain=None, timezone_name=None,
                           rollup=None):
        """`rollup` ({'rank', 'focus_goal_id', 'duration_mode'}) adds the stacked Time Spent Per Goal series."""
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
        zone = resolve_timezone(timezone_name)
        if zone is None or (grain is not None and grain not in (AUTO, *GRAINS)):
            return None, 'Provide a valid IANA timezone and a grain of auto, day, week or month', 400
        goals = self.db_session.query(Goal).options(joinedload(Goal.level)).filter(
            Goal.root_id == root_id, Goal.deleted_at.is_(None),
        ).all()
        goal_ids = {goal.id for goal in goals}
        if chart_goal_id and chart_goal_id not in goal_ids:
            return None, 'Goal not found', 404
        if rollup and rollup.get('focus_goal_id') and rollup['focus_goal_id'] not in goal_ids:
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
        chart_grain = None
        time_rollup = None
        if charts or chart_goal_id:
            scope = session_time.c.goal_id == chart_goal_id if chart_goal_id else true()
            bounds = self.db_session.execute(select(
                func.min(session_time.c.session_start), func.max(session_time.c.session_start),
            ).where(scope)).one()
            if bounds[0] and bounds[1]:
                # A chosen range sets the span (so "7D" stays daily); open ends fall back to the evidence.
                first = start or utc_datetime(bounds[0])
                last = end or utc_datetime(bounds[1])
                chart_grain = resolve_grain(grain, first.astimezone(zone).date(), last.astimezone(zone).date(), MAX_CHART_POINTS)
                tz_key = getattr(zone, 'key', 'UTC')

                def local_bucket(column):
                    # Stored datetimes are naive UTC: read them as UTC, then truncate the user's local time.
                    return cast(func.date_trunc(chart_grain, func.timezone(tz_key, func.timezone('UTC', column))), Date)

                bucket = local_bucket(session_time.c.session_start)
                for row in self.db_session.execute(select(
                    session_time.c.goal_id, bucket.label('date'), func.sum(session_time.c.duration_seconds).label('duration'),
                    func.count().label('count'),
                ).where(scope, session_time.c.session_start.is_not(None)).group_by(session_time.c.goal_id, bucket).order_by(bucket)):
                    chart_rows.setdefault(row.goal_id, []).append({
                        'date': row.date.isoformat(), 'duration_seconds': row.duration,
                        'session_count': row.count, 'session_name': 'Sessions',
                    })
                if rollup:
                    time_rollup = self._time_rollup(goals, rollup, totals, breakdown, session_time, activity, local_bucket)
                    time_rollup.update(grain=chart_grain, first_bucket=bucket_start(first.astimezone(zone).date(), chart_grain).isoformat(),
                                       last_bucket=bucket_start(last.astimezone(zone).date(), chart_grain).isoformat())
                activity_bucket = local_bucket(activity.c.session_start)
                activity_scope = activity.c.goal_id == chart_goal_id if chart_goal_id else true()
                for row in self.db_session.execute(select(
                    activity.c.goal_id, activity_bucket.label('date'),
                    func.sum(activity.c.duration_seconds).label('duration'), func.count().label('count'),
                ).where(activity_scope, activity.c.duration_seconds != 0, activity.c.session_start.is_not(None))
                  .group_by(activity.c.goal_id, activity_bucket).order_by(activity_bucket)):
                    activity_chart_rows.setdefault(row.goal_id, []).append({
                        'date': row.date.isoformat(), 'duration_seconds': row.duration,
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
        payload['metadata'] = {'aggregated': True, 'chart_goal_id': chart_goal_id, 'chart_grain': chart_grain,
                               'timezone': getattr(zone, 'key', 'UTC'), 'max_chart_points': MAX_CHART_POINTS}
        if rollup:
            payload['time_rollup'] = time_rollup or {'series': [], 'levels': [], 'breadcrumb': []}
        return payload, None, 200

    def _time_rollup(self, goals, rollup, totals, breakdown, session_time, activity, local_bucket):
        by_activity = rollup.get('duration_mode', 'activity') == 'activity'
        plan = plan_rollup(goals, set(breakdown if by_activity else totals),
                           rank=rollup.get('rank'), focus_goal_id=rollup.get('focus_goal_id'))
        if plan is None:
            return {'rank': None, 'focus_goal_id': None, 'levels': [], 'breadcrumb': [], 'series': [], 'unique_totals': []}
        evidence, evidence_id = (activity, activity.c.instance_id) if by_activity else (session_time, session_time.c.session_id)
        rows, totals = rollup_bucket_rows(self.db_session, evidence, evidence_id, plan['mapping'], local_bucket(evidence.c.session_start))
        seconds = {}
        for row in rows:
            seconds.setdefault(row.series_key, []).append({'date': row.bucket.isoformat(), 'duration_seconds': float(row.seconds)})
        series = [{**item, 'buckets': seconds[item['key']]} for item in plan['series'] if item['key'] in seconds]
        return {'rank': plan['rank'], 'focus_goal_id': plan['focus_goal_id'], 'levels': plan['levels'],
                'breadcrumb': plan['breadcrumb'], 'series': series,
                'unique_totals': [{'date': row.bucket.isoformat(), 'duration_seconds': float(row.seconds)} for row in totals]}
