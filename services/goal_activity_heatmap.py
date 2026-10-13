"""Daily goal evidence, projected from canonical timeline entries in the user's timezone."""

from datetime import datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError


def utc_datetime(value):
    if isinstance(value, str):
        value = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return value.replace(tzinfo=timezone.utc) if value.tzinfo is None else value


def parse_heatmap_options(timezone_name, day):
    try:
        zone = ZoneInfo(timezone_name)
        selected_day = datetime.strptime(day, '%Y-%m-%d').date() if day else None
        if selected_day is not None and selected_day.isoformat() != day:
            raise ValueError('Invalid date')
    except (ZoneInfoNotFoundError, ValueError, TypeError):
        return None, None, 'Provide a valid IANA timezone and date (YYYY-MM-DD)'
    return zone, selected_day, None


def local_day_bounds(day, zone):
    """UTC boundaries of a local day, including 23/25-hour daylight-saving days."""
    return (
        datetime.combine(day, time.min, tzinfo=zone).astimezone(timezone.utc),
        datetime.combine(day + timedelta(days=1), time.min, tzinfo=zone).astimezone(timezone.utc),
    )


def aggregate_goal_days(rows, start, end, zone, pause_intervals=()):
    """Fill empty lifetime days around SQL aggregates without hydrating history."""
    start_date, end_date = start.astimezone(zone).date(), end.astimezone(zone).date()
    by_day = {row.date: row for row in rows}
    pause_ranges = [
        (utc_datetime(interval.paused_at).astimezone(zone).date(),
         utc_datetime(interval.resumed_at).astimezone(zone).date() if interval.resumed_at else end_date + timedelta(days=1))
        for interval in pause_intervals if start <= utc_datetime(interval.paused_at) <= end
    ]
    days = []
    current = start_date
    while current <= end_date:
        row = by_day.get(current)
        days.append({
            'date': current.isoformat(), 'activities': row.activities if row else 0,
            'events': row.events if row else 0, 'duration_seconds': row.duration_seconds if row else 0,
            'milestones': row.milestones if row else 0,
            'paused': any(first <= current < last for first, last in pause_ranges),
        })
        current += timedelta(days=1)
    return {
        'range_start': start_date.isoformat(), 'range_end': end_date.isoformat(),
        'timezone': zone.key, 'days': days,
        'total_activities': sum(day['activities'] for day in days),
        'total_events': sum(day['events'] for day in days),
        'total_duration_seconds': sum(day['duration_seconds'] for day in days),
        'work_days': sum(day['activities'] > 0 for day in days),
        'event_days': sum(day['events'] > 0 for day in days),
    }
