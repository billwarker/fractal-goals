"""One note filter specification, shared by ad-hoc Notes page filters and saved filters.

A spec is applied entirely in SQL. Several specs applied to one query combine with AND.
"""
import re

from sqlalchemy import and_, exists, or_

from models import ActivityDefinition, MediaAsset, Note, NoteAttachment

# Four reader-facing categories, by where a note was written.
CATEGORY_CONTEXT_TYPES = {
    'general': ('root', 'activity_definition'),
    'goals': ('goal',),
    'sessions': ('session', 'activity_instance', 'circuit_run', 'circuit_round'),
    'programs': ('program',),
}
CONTEXT_CATEGORY = {context: category for category, contexts in CATEGORY_CONTEXT_TYPES.items() for context in contexts}
MAX_TEXT = 200
MAX_IDS = 50
MAX_CONDITIONS = 10
# contains: the value appears anywhere (LIKE). equals: the value appears as a whole word or phrase.
CONDITION_OPS = ('contains', 'equals')
MATCH_MODES = ('all', 'any')
SPEC_KEYS = {'text', 'conditions', 'match', 'categories', 'goal_id', 'activity_definition_ids', 'activity_group_ids', 'pinned_only'}


class NoteFilterError(ValueError):
    def __init__(self, message, code='invalid_filter'):
        super().__init__(message)
        self.code = code


def derive_note_category(context_type):
    return CONTEXT_CATEGORY.get(context_type, 'general')


def _id_list(value, field):
    if value in (None, ''):
        return []
    if isinstance(value, str):
        value = [part for part in value.split(',') if part]
    if not isinstance(value, list) or len(value) > MAX_IDS or not all(isinstance(item, str) and 0 < len(item) <= 64 for item in value):
        raise NoteFilterError(f'{field} must be a list of at most {MAX_IDS} ids')
    return sorted(set(value))


def normalize_spec(raw):
    """Validate and canonicalize a spec. Empty values are dropped so equal filters compare equal."""
    if raw is None:
        raw = {}
    if not isinstance(raw, dict):
        raise NoteFilterError('A filter must be an object')
    if raw.get('text_mode') in (None, 'keyword'):
        # Filters saved before regex search was removed carry text_mode='keyword'.
        raw = {key: value for key, value in raw.items() if key != 'text_mode'}
    unknown = set(raw) - SPEC_KEYS
    if unknown:
        raise NoteFilterError(f'Unknown filter fields: {", ".join(sorted(unknown))}')
    text_value = raw.get('text') or ''
    if not isinstance(text_value, str) or len(text_value) > MAX_TEXT:
        raise NoteFilterError(f'Search text must be at most {MAX_TEXT} characters')
    conditions = _conditions(raw.get('conditions'))
    match = raw.get('match') or 'all'
    if match not in MATCH_MODES:
        raise NoteFilterError('Match must be all or any')
    categories = raw.get('categories') or []
    if isinstance(categories, str):
        categories = [part for part in categories.split(',') if part]
    if not isinstance(categories, list) or any(category not in CATEGORY_CONTEXT_TYPES for category in categories):
        raise NoteFilterError(f'Categories must be from: {", ".join(CATEGORY_CONTEXT_TYPES)}')
    goal_id = raw.get('goal_id') or None
    if goal_id is not None and (not isinstance(goal_id, str) or len(goal_id) > 64):
        raise NoteFilterError('Invalid goal')
    pinned = raw.get('pinned_only') or False
    if not isinstance(pinned, bool):
        raise NoteFilterError('pinned_only must be true or false')
    spec = {
        'text': text_value.strip(),
        'conditions': conditions,
        'match': match if len(conditions) > 1 else None,
        'categories': sorted(set(categories)),
        'goal_id': goal_id,
        'activity_definition_ids': _id_list(raw.get('activity_definition_ids'), 'activity_definition_ids'),
        'activity_group_ids': _id_list(raw.get('activity_group_ids'), 'activity_group_ids'),
        'pinned_only': pinned,
    }
    return {key: value for key, value in spec.items() if value not in ('', [], None, False)}


def _conditions(value):
    if value in (None, []):
        return []
    if not isinstance(value, list) or len(value) > MAX_CONDITIONS:
        raise NoteFilterError(f'Use at most {MAX_CONDITIONS} conditions')
    result = []
    for item in value:
        if not isinstance(item, dict) or set(item) - {'op', 'value'} or item.get('op') not in CONDITION_OPS:
            raise NoteFilterError('Each condition needs op (contains or equals) and value')
        text_value = item.get('value')
        if not isinstance(text_value, str) or not text_value.strip() or len(text_value) > MAX_TEXT:
            raise NoteFilterError(f'Condition text must be 1–{MAX_TEXT} characters')
        result.append({'op': item['op'], 'value': text_value.strip()})
    return result


def is_empty(spec):
    return not spec


def keyword_terms(value):
    """Whitespace-separated terms; "quoted phrases" stay whole."""
    return [quoted or bare for quoted, bare in re.findall(r'"([^"]+)"|(\S+)', value) if (quoted or bare).strip()]


def _like(term):
    escaped = term.replace('\\', '\\\\').replace('%', '\\%').replace('_', '\\_')
    return f'%{escaped}%'


def _word(value):
    """A PostgreSQL ARE matching value as a whole word or phrase; value is escaped, never a pattern."""
    return '\\m' + re.sub(r'([\\.^$|?*+()\[\]{}])', r'\\\1', value) + '\\M'


def _matches(condition):
    """Note content or an attachment name satisfies one keyword condition."""
    if condition['op'] == 'equals':
        pattern = _word(condition['value'])
        def test(column):
            return column.op('~*')(pattern)
    else:
        pattern = _like(condition['value'])
        def test(column):
            return column.ilike(pattern, escape='\\')
    attachment = exists().where(NoteAttachment.note_id == Note.id, NoteAttachment.asset_id == MediaAsset.id, test(MediaAsset.name))
    return or_(test(Note.content), attachment)


def apply_spec(query, spec, db):
    """Narrow a Note query by one normalized spec."""
    if spec.get('categories'):
        contexts = [context for category in spec['categories'] for context in CATEGORY_CONTEXT_TYPES[category]]
        query = query.filter(Note.context_type.in_(contexts))
    if spec.get('goal_id'):
        query = query.filter(Note.goal_id == spec['goal_id'])
    definitions, groups = spec.get('activity_definition_ids', []), spec.get('activity_group_ids', [])
    if definitions or groups:
        conditions = []
        if definitions:
            conditions.append(Note.activity_definition_id.in_(definitions))
        if groups:
            conditions.append(Note.activity_definition_id.in_(
                db.query(ActivityDefinition.id).filter(
                    ActivityDefinition.group_id.in_(groups), ActivityDefinition.deleted_at.is_(None),
                )
            ))
        query = query.filter(or_(*conditions))
    if spec.get('pinned_only'):
        query = query.filter(Note.pinned_at.isnot(None))
    # Quick search: every word or "quoted phrase" must appear.
    for term in keyword_terms(spec.get('text', '')):
        query = query.filter(_matches({'op': 'contains', 'value': term}))
    if spec.get('conditions'):
        combine = or_ if spec.get('match') == 'any' else and_
        query = query.filter(combine(*[_matches(condition) for condition in spec['conditions']]))
    return query
