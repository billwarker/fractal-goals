from typing import Any

import models

from validators import sanitize_note_content, sanitize_string


def _normalize_optional_string(value):
    if value is None:
        return None
    if not isinstance(value, str):
        return value
    normalized = sanitize_string(value)
    return normalized or None


def normalize_id_list(values):
    if not isinstance(values, list):
        return []

    normalized = []
    seen = set()
    for value in values:
        candidate = _normalize_optional_string(value)
        if not candidate or candidate in seen:
            continue
        normalized.append(candidate)
        seen.add(candidate)
    return normalized


def normalize_activity_metrics(metrics):
    if not isinstance(metrics, list):
        return []

    normalized = []
    for metric in metrics:
        if not isinstance(metric, dict):
            continue
        name = _normalize_optional_string(metric.get('name'))
        unit = _normalize_optional_string(metric.get('unit'))
        if not name and not unit:
            continue

        item = dict(metric)
        item['name'] = name
        item['unit'] = unit
        normalized.append(item)
    return normalized


def normalize_activity_splits(splits):
    if not isinstance(splits, list):
        return []

    normalized = []
    for split in splits:
        if not isinstance(split, dict):
            continue
        name = _normalize_optional_string(split.get('name'))
        if not name:
            continue
        item = dict(split)
        item['name'] = name
        normalized.append(item)
    return normalized


def normalize_activity_payload(data, *, partial=False):
    normalized = dict(data or {})

    if partial:
        if 'name' in normalized:
            normalized['name'] = _normalize_optional_string(normalized.get('name'))
    else:
        normalized['name'] = _normalize_optional_string(normalized.get('name')) or 'Untitled Activity'

    if 'description' in normalized or not partial:
        normalized['description'] = sanitize_string(normalized.get('description') or '')

    if 'group_id' in normalized or not partial:
        normalized['group_id'] = _normalize_optional_string(normalized.get('group_id'))

    if 'metrics' in normalized or not partial:
        normalized['metrics'] = normalize_activity_metrics(normalized.get('metrics'))

    if 'splits' in normalized or not partial:
        normalized['splits'] = normalize_activity_splits(normalized.get('splits'))

    if 'goal_ids' in normalized or not partial:
        normalized['goal_ids'] = normalize_id_list(normalized.get('goal_ids'))

    return normalized


def normalize_goal_payload(data, *, partial=False):
    normalized = dict(data or {})

    if 'description' in normalized or not partial:
        normalized['description'] = sanitize_string(normalized.get('description') or '')

    if 'relevance_statement' in normalized or not partial:
        normalized['relevance_statement'] = _normalize_optional_string(normalized.get('relevance_statement'))

    if 'parent_id' in normalized or not partial:
        normalized['parent_id'] = _normalize_optional_string(normalized.get('parent_id'))

    if 'session_id' in normalized or not partial:
        normalized['session_id'] = _normalize_optional_string(normalized.get('session_id'))

    if 'activity_definition_id' in normalized or not partial:
        normalized['activity_definition_id'] = _normalize_optional_string(normalized.get('activity_definition_id'))

    if 'deadline' in normalized:
        normalized['deadline'] = _normalize_optional_string(normalized.get('deadline'))

    if 'targets' in normalized or not partial:
        targets = normalized.get('targets')
        normalized['targets'] = targets if isinstance(targets, list) else []

    return normalized


def normalize_note_payload(data, *, partial=False):
    normalized = dict(data or {})

    if 'content' in normalized or not partial:
        normalized['content'] = sanitize_note_content(normalized.get('content') or '')

    for key in ('session_id', 'activity_instance_id', 'activity_definition_id', 'goal_id', 'context_id'):
        if key in normalized or not partial:
            normalized[key] = _normalize_optional_string(normalized.get(key))

    return normalized


def normalize_session_payload(data, *, partial=False):
    normalized = dict(data or {})

    if 'name' in normalized or not partial:
        normalized['name'] = _normalize_optional_string(normalized.get('name')) or 'Untitled Session'

    if 'description' in normalized or not partial:
        normalized['description'] = sanitize_string(normalized.get('description') or '')

    for key in ('template_id', 'parent_id', 'session_start', 'session_end'):
        if key in normalized or not partial:
            normalized[key] = _normalize_optional_string(normalized.get(key))

    for key in ('parent_ids', 'goal_ids', 'immediate_goal_ids'):
        if key in normalized or not partial:
            normalized[key] = normalize_id_list(normalized.get(key))

    if 'session_data' in normalized or not partial:
        normalized['session_data'] = models._safe_load_json(normalized.get('session_data'), {})

    return normalized
