"""Structural validation for planned values ("prescriptions") on template items.

A prescription is the optional ``prescription`` object on an activity item in
session-template sections and dated program session plans. It holds the values
and notes the user intends to hit; it is never actual session evidence.

This module checks shape only. Ownership and definition checks (metric ids
belong to the item's activity, value ranges) are service-owned in
``services/prescriptions.py`` because they need the database.
"""
import math
import uuid
from typing import Any, Dict, List, Optional

from .core import sanitize_string

PRESCRIPTION_SCHEMA_VERSION = 1
MAX_PRESCRIPTION_SETS = 50
MAX_PRESCRIPTION_METRICS = 50
MAX_PRESCRIPTION_NOTE_LENGTH = 1000


def _validate_note(value: Any, path: str) -> Optional[str]:
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        raise ValueError(f'{path} must be a string')
    note = sanitize_string(value)
    if len(note) > MAX_PRESCRIPTION_NOTE_LENGTH:
        raise ValueError(f'{path} must be at most {MAX_PRESCRIPTION_NOTE_LENGTH} characters')
    return note or None


def _validate_metric_entries(entries: Any, path: str) -> List[Dict[str, Any]]:
    if entries is None:
        return []
    if not isinstance(entries, list):
        raise ValueError(f'{path} must be a list')
    if len(entries) > MAX_PRESCRIPTION_METRICS:
        raise ValueError(f'{path} must have at most {MAX_PRESCRIPTION_METRICS} entries')
    normalized = []
    seen = set()
    for index, entry in enumerate(entries):
        entry_path = f'{path}[{index}]'
        if not isinstance(entry, dict):
            raise ValueError(f'{entry_path} must be an object')
        metric_id = entry.get('metric_id')
        if not isinstance(metric_id, str) or not metric_id.strip():
            raise ValueError(f'{entry_path}.metric_id is required')
        split_id = entry.get('split_id')
        if split_id in ('', None):
            split_id = None
        elif not isinstance(split_id, str):
            raise ValueError(f'{entry_path}.split_id must be a string')
        value = entry.get('value')
        if value in ('', None):
            # An empty cell carries no plan; drop it rather than store a null target.
            continue
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValueError(f'{entry_path}.value must be a finite number')
        key = (metric_id.strip(), split_id)
        if key in seen:
            raise ValueError(f'{entry_path} duplicates a metric/split pair')
        seen.add(key)
        normalized.append({'metric_id': key[0], 'split_id': split_id, 'value': value})
    return normalized


def validate_prescription(prescription: Any, path: str = 'prescription') -> Optional[Dict[str, Any]]:
    """Return a normalized prescription, or None when it plans nothing."""
    if prescription is None:
        return None
    if not isinstance(prescription, dict):
        raise ValueError(f'{path} must be an object')

    schema = prescription.get('schema', PRESCRIPTION_SCHEMA_VERSION)
    if schema != PRESCRIPTION_SCHEMA_VERSION:
        raise ValueError(f'{path}.schema must be {PRESCRIPTION_SCHEMA_VERSION}')

    notes = _validate_note(prescription.get('notes'), f'{path}.notes')
    metrics = _validate_metric_entries(prescription.get('metrics'), f'{path}.metrics')

    raw_sets = prescription.get('sets')
    sets: List[Dict[str, Any]] = []
    if raw_sets is not None:
        if not isinstance(raw_sets, list):
            raise ValueError(f'{path}.sets must be a list')
        if len(raw_sets) > MAX_PRESCRIPTION_SETS:
            raise ValueError(f'{path}.sets must have at most {MAX_PRESCRIPTION_SETS} entries')
        for index, raw_set in enumerate(raw_sets):
            set_path = f'{path}.sets[{index}]'
            if not isinstance(raw_set, dict):
                raise ValueError(f'{set_path} must be an object')
            sets.append({
                'metrics': _validate_metric_entries(raw_set.get('metrics'), f'{set_path}.metrics'),
                'notes': _validate_note(raw_set.get('notes'), f'{set_path}.notes'),
            })

    if metrics and sets:
        raise ValueError(f'{path} cannot define both metrics and sets')
    if not notes and not metrics and not sets:
        return None

    normalized: Dict[str, Any] = {'schema': PRESCRIPTION_SCHEMA_VERSION}
    if notes:
        normalized['notes'] = notes
    if sets:
        normalized['sets'] = sets
    elif metrics:
        normalized['metrics'] = metrics
    return normalized


def normalize_item_key(item: Dict[str, Any]) -> str:
    """Give a template item its stable identity, assigning one when missing.

    ``id`` is deliberately not used: legacy items use it as the activity id.
    """
    item_key = item.get('item_key')
    if isinstance(item_key, str) and item_key.strip():
        item['item_key'] = item_key.strip()
    else:
        item['item_key'] = str(uuid.uuid4())
    return item['item_key']
