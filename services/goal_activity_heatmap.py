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


def aggregate_goal_days(entries, start, end, zone):
    """Return every calendar day, including empty days; each evidence id counts once."""
    start_date, end_date = start.astimezone(zone).date(), end.astimezone(zone).date()
    days = {}
    current = start_date
    while current <= end_date:
        days[current.isoformat()] = {
            'date': current.isoformat(), 'activities': 0, 'events': 0,
            'duration_seconds': 0, 'milestones': 0, 'paused': False,
        }
        current += timedelta(days=1)

    seen = set()
    pause_ranges = []
    for entry in entries:
        if entry['id'] in seen:
            continue
        seen.add(entry['id'])
        occurred = utc_datetime(entry['timestamp'])
        day = days.get(occurred.astimezone(zone).date().isoformat())
        if not day or occurred < start or occurred > end:
            continue
        day['events'] += 1
        if entry['event_type'] == 'activity.completed':
            day['activities'] += 1
            day['duration_seconds'] += max(0, entry['payload'].get('duration_seconds') or 0)
        if entry['event_type'] in {'target.achieved', 'goal.completed'}:
            day['milestones'] += 1
        if entry['event_type'] == 'goal.paused' and entry['relationship'] == 'self':
            resumed = entry['payload'].get('resumed_at')
            pause_ranges.append((occurred.astimezone(zone).date(),
                                 utc_datetime(resumed).astimezone(zone).date() if resumed else end_date + timedelta(days=1)))
    for day in days.values():
        date_value = datetime.strptime(day['date'], '%Y-%m-%d').date()
        day['paused'] = any(first <= date_value < last for first, last in pause_ranges)

    return {
        'range_start': start_date.isoformat(), 'range_end': end_date.isoformat(),
        'timezone': zone.key, 'days': list(days.values()),
        'total_activities': sum(day['activities'] for day in days.values()),
        'total_events': sum(day['events'] for day in days.values()),
        'total_duration_seconds': sum(day['duration_seconds'] for day in days.values()),
        'work_days': sum(day['activities'] > 0 for day in days.values()),
        'event_days': sum(day['events'] > 0 for day in days.values()),
    }
