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

from services.circuit_rules import MAX_CIRCUIT_ROUNDS, MAX_CIRCUIT_SLOTS

from .core import sanitize_string

PRESCRIPTION_SCHEMA_VERSION = 1
MAX_PRESCRIPTION_SETS = 50
MAX_PRESCRIPTION_METRICS = 50
MAX_PRESCRIPTION_NOTE_LENGTH = 1000
MAX_PRESCRIPTION_TAGS = 50


def _validate_note(value: Any, path: str) -> Optional[str]:
    if value in (None, ''):
        return None
    if not isinstance(value, str):
        raise ValueError(f'{path} must be a string')
    note = sanitize_string(value)
    if len(note) > MAX_PRESCRIPTION_NOTE_LENGTH:
        raise ValueError(f'{path} must be at most {MAX_PRESCRIPTION_NOTE_LENGTH} characters')
    return note or None


def _validate_tag_ids(value: Any, path: str) -> List[str]:
    """Activity tag (binding) ids to apply to the instance or set; de-duplicated, order kept."""
    if value in (None, ''):
        return []
    if not isinstance(value, list):
        raise ValueError(f'{path} must be a list')
    if len(value) > MAX_PRESCRIPTION_TAGS:
        raise ValueError(f'{path} must have at most {MAX_PRESCRIPTION_TAGS} tags')
    tag_ids: List[str] = []
    for index, tag_id in enumerate(value):
        if not isinstance(tag_id, str) or not tag_id.strip():
            raise ValueError(f'{path}[{index}] must be a tag id')
        if tag_id.strip() not in tag_ids:
            tag_ids.append(tag_id.strip())
    return tag_ids


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
    tags = _validate_tag_ids(prescription.get('tags'), f'{path}.tags')
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
            planned_set = {
                'metrics': _validate_metric_entries(raw_set.get('metrics'), f'{set_path}.metrics'),
                'notes': _validate_note(raw_set.get('notes'), f'{set_path}.notes'),
            }
            set_tags = _validate_tag_ids(raw_set.get('tags'), f'{set_path}.tags')
            if set_tags:
                planned_set['tags'] = set_tags
            sets.append(planned_set)

    if metrics and sets:
        raise ValueError(f'{path} cannot define both metrics and sets')
    if not notes and not tags and not metrics and not sets:
        return None

    normalized: Dict[str, Any] = {'schema': PRESCRIPTION_SCHEMA_VERSION}
    if notes:
        normalized['notes'] = notes
    if tags:
        normalized['tags'] = tags
    if sets:
        normalized['sets'] = sets
    elif metrics:
        normalized['metrics'] = metrics
    return normalized



def validate_circuit_prescription(prescription: Any, path: str = 'prescription') -> Optional[Dict[str, Any]]:
    """Return a normalized circuit prescription, or None when it plans nothing.

    Shape: ``{schema, notes?, rounds: [{notes?, slots: [{slot_id, metrics: [...]}]}]}`` where
    ``slot_id`` is a circuit definition slot. A round with no values still counts: it plans
    how many rounds the session starts with.
    """
    if prescription is None:
        return None
    if not isinstance(prescription, dict):
        raise ValueError(f'{path} must be an object')
    schema = prescription.get('schema', PRESCRIPTION_SCHEMA_VERSION)
    if schema != PRESCRIPTION_SCHEMA_VERSION:
        raise ValueError(f'{path}.schema must be {PRESCRIPTION_SCHEMA_VERSION}')
    notes = _validate_note(prescription.get('notes'), f'{path}.notes')
    raw_rounds = prescription.get('rounds')
    rounds: List[Dict[str, Any]] = []
    if raw_rounds is not None:
        if not isinstance(raw_rounds, list):
            raise ValueError(f'{path}.rounds must be a list')
        if len(raw_rounds) > MAX_CIRCUIT_ROUNDS:
            raise ValueError(f'{path}.rounds must have at most {MAX_CIRCUIT_ROUNDS} entries')
        for round_index, raw_round in enumerate(raw_rounds):
            round_path = f'{path}.rounds[{round_index}]'
            if not isinstance(raw_round, dict):
                raise ValueError(f'{round_path} must be an object')
            raw_slots = raw_round.get('slots') or []
            if not isinstance(raw_slots, list) or len(raw_slots) > MAX_CIRCUIT_SLOTS:
                raise ValueError(f'{round_path}.slots must be a list of at most {MAX_CIRCUIT_SLOTS} entries')
            slots = []
            seen_slots = set()
            for slot_index, raw_slot in enumerate(raw_slots):
                slot_path = f'{round_path}.slots[{slot_index}]'
                if not isinstance(raw_slot, dict):
                    raise ValueError(f'{slot_path} must be an object')
                slot_id = raw_slot.get('slot_id')
                if not isinstance(slot_id, str) or not slot_id.strip():
                    raise ValueError(f'{slot_path}.slot_id is required')
                if slot_id in seen_slots:
                    raise ValueError(f'{slot_path} repeats a slot')
                seen_slots.add(slot_id)
                metrics = _validate_metric_entries(raw_slot.get('metrics'), f'{slot_path}.metrics')
                if metrics:
                    slots.append({'slot_id': slot_id.strip(), 'metrics': metrics})
            rounds.append({
                'slots': slots,
                'notes': _validate_note(raw_round.get('notes'), f'{round_path}.notes'),
            })
    if not notes and not rounds:
        return None
    normalized: Dict[str, Any] = {'schema': PRESCRIPTION_SCHEMA_VERSION}
    if notes:
        normalized['notes'] = notes
    if rounds:
        normalized['rounds'] = rounds
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
