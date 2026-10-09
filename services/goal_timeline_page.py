"""Stable pagination and mode filtering for the unified goal timeline."""
import base64
import binascii
import json


def timeline_mode_matches(entry, metric):
    if metric == 'events':
        return True
    return entry['event_type'] == 'activity.completed' and (
        metric == 'activities' or (entry['payload'].get('duration_seconds') or 0) > 0
    )


def timeline_page(entries, metric, page_size, cursor):
    """Cursor includes the ID so entries sharing a timestamp cannot disappear."""
    if metric not in {'activities', 'events', 'duration'}:
        raise ValueError('Invalid timeline mode')
    page_size = int(page_size)
    if not 1 <= page_size <= 100:
        raise ValueError('Page size must be between 1 and 100')
    boundary = None
    if cursor:
        try:
            decoded = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
            if not isinstance(decoded, list) or len(decoded) != 2 or not all(isinstance(item, str) and item for item in decoded):
                raise ValueError('Invalid cursor')
            boundary = tuple(decoded)
        except (ValueError, TypeError, binascii.Error, UnicodeDecodeError) as exc:
            raise ValueError('Invalid timeline cursor') from exc
    matches = sorted((entry for entry in entries if timeline_mode_matches(entry, metric)),
                     key=lambda entry: (entry['timestamp'], entry['id']), reverse=True)
    remaining = [entry for entry in matches if boundary is None or (entry['timestamp'], entry['id']) < boundary]
    page = remaining[:page_size]
    next_cursor = None
    if len(remaining) > page_size:
        last = page[-1]
        next_cursor = base64.urlsafe_b64encode(json.dumps([last['timestamp'], last['id']]).encode()).decode()
    return page, {'count': len(page), 'total': len(matches), 'has_more': next_cursor is not None,
                  'next_cursor': next_cursor, 'limit': page_size}
