"""The Notes page feed and heatmap: one filtered query, paginated and counted in SQL."""
from datetime import date, datetime, time, timedelta, timezone
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from sqlalchemy import func

from models import Note, NoteFilter
from services.goal_note_read_model import goal_note_load_options
from services.note_display_context import attach_program_names
from services.note_filter_spec import SPEC_KEYS, NoteFilterError, apply_spec, normalize_spec
from services.serializers import serialize_note_display

MAX_SAVED_FILTERS_PER_QUERY = 10


def _timezone(name):
    try:
        return ZoneInfo(name or 'UTC')
    except (ZoneInfoNotFoundError, ValueError) as exc:
        raise NoteFilterError('Unknown timezone') from exc


def _specs(db, root_id, filters):
    """The ad-hoc spec plus every selected saved filter; the feed matches all of them."""
    keys = SPEC_KEYS | {'goal_id'}  # goal_id: a single goal, from older callers.
    specs = [normalize_spec({key: filters[key] for key in keys if filters.get(key) not in (None, '', [], False)})]
    ids = filters.get('saved_filter_ids') or []
    if len(ids) > MAX_SAVED_FILTERS_PER_QUERY:
        raise NoteFilterError(f'Select at most {MAX_SAVED_FILTERS_PER_QUERY} saved filters')
    if ids:
        rows = db.query(NoteFilter).filter(NoteFilter.root_id == root_id, NoteFilter.id.in_(ids)).all()
        if len(rows) != len(set(ids)):
            raise NoteFilterError('Saved filter not found', 'filter_not_found')
        specs.extend(normalize_spec(row.spec) for row in rows)
    return specs


def filtered_query(db, root_id, filters):
    """Live notes of one fractal narrowed by structural filters, all specs and an optional local day."""
    query = db.query(Note).filter(Note.root_id == root_id, Note.deleted_at.is_(None))
    if filters.get('context_types'):
        query = query.filter(Note.context_type.in_(filters['context_types']))
    if filters.get('context_id'):
        query = query.filter(Note.context_id == filters['context_id'])
    for spec in _specs(db, root_id, filters):
        query = apply_spec(query, spec, db)
    if filters.get('day'):
        try:
            day = date.fromisoformat(filters['day'])
        except ValueError as exc:
            raise NoteFilterError('Day must be YYYY-MM-DD') from exc
        zone = _timezone(filters.get('timezone'))
        start = datetime.combine(day, time.min, zone).astimezone(timezone.utc).replace(tzinfo=None)
        end = datetime.combine(day + timedelta(days=1), time.min, zone).astimezone(timezone.utc).replace(tzinfo=None)
        query = query.filter(Note.created_at >= start, Note.created_at < end)
    return query


def notes_page(db, root_id, filters, page=0, page_size=25):
    page, page_size = max(0, page), min(max(1, page_size), 100)
    query = filtered_query(db, root_id, filters)

    total = query.order_by(None).count()
    notes = query.options(*goal_note_load_options()).order_by(
        Note.pinned_at.desc().nullslast(), Note.created_at.desc(), Note.id.desc(),
    ).limit(page_size).offset(page * page_size).all()
    results = [serialize_note_display(note) for note in notes]
    attach_program_names(db, results)
    return {'notes': results, 'total': total, 'page': page, 'page_size': page_size,
            'has_more': (page + 1) * page_size < total}


def notes_heatmap(db, root_id, filters):
    """Matching notes per local day, from the first match to today (newest first)."""
    zone_name = filters.get('timezone') or 'UTC'
    zone = _timezone(zone_name)
    query = filtered_query(db, root_id, {**filters, 'day': None})
    local_day = func.date(func.timezone(zone_name, func.timezone('UTC', Note.created_at))).label('day')
    rows = query.with_entities(local_day, func.count(Note.id)).group_by(local_day).all()
    counts = {row[0]: int(row[1]) for row in rows}
    today = datetime.now(zone).date()
    start = min(counts) if counts else today
    end = max(today, max(counts) if counts else today)
    days, current = [], end
    while current >= start:
        days.append({'date': current.isoformat(), 'count': counts.get(current, 0)})
        current -= timedelta(days=1)
    return {'days': days, 'total': sum(counts.values()), 'max_count': max(counts.values(), default=0),
            'range_start': start.isoformat(), 'range_end': end.isoformat()}
