"""Validated stable cursors for the unified goal evidence query."""
import base64
import binascii
import json
from services.goal_activity_heatmap import utc_datetime


def timeline_page_options(metric, page_size, cursor):
    if metric not in {'activities', 'events', 'duration'}:
        raise ValueError('Invalid timeline mode')
    size = int(page_size)
    if not 1 <= size <= 100:
        raise ValueError('Page size must be between 1 and 100')
    boundary = None
    if cursor:
        try:
            decoded = json.loads(base64.b64decode(cursor, altchars=b'-_', validate=True))
            if not isinstance(decoded, list) or len(decoded) != 2 or not all(isinstance(item, str) and item for item in decoded):
                raise ValueError('Invalid cursor')
            boundary = (utc_datetime(decoded[0]), decoded[1])
        except (ValueError, TypeError, binascii.Error, UnicodeDecodeError, OverflowError) as exc:
            raise ValueError('Invalid timeline cursor') from exc
    return size, boundary


def timeline_pagination(rows, total, size):
    from services.serializers import format_utc_precise
    page = rows[:size]
    cursor = None
    if len(rows) > size:
        last = page[-1]
        cursor = base64.urlsafe_b64encode(json.dumps([format_utc_precise(last.timestamp), last.id]).encode()).decode()
    return page, {'count': len(page), 'total': total, 'has_more': cursor is not None,
                  'next_cursor': cursor, 'limit': size}
