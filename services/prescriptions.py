"""Semantic checks and helpers for planned values ("prescriptions").

``validators/prescriptions.py`` owns shape. This module owns everything that
needs the database: every planned metric and split must belong to the item's
activity definition in the same fractal, and values must respect the metric's
configured bounds. Session templates and dated program session plans share it.
"""
import copy
from typing import Any, Dict, Iterable, List, Optional

from sqlalchemy.orm import selectinload

from models import ActivityDefinition, ActivityTag, CircuitDefinition, CircuitSlot, MetricDefinition


def iter_activity_items(sections: Iterable[Dict[str, Any]]):
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        for item in section.get('items') or []:
            if isinstance(item, dict) and item.get('type') == 'activity':
                yield item


def iter_circuit_items(sections: Iterable[Dict[str, Any]]):
    for section in sections or []:
        if not isinstance(section, dict):
            continue
        for item in section.get('items') or []:
            if isinstance(item, dict) and item.get('type') == 'circuit':
                yield item


def item_activity_id(item: Dict[str, Any]) -> Optional[str]:
    return item.get('activity_definition_id') or item.get('activity_id') or item.get('id')


def _load_activity_definitions(db_session, root_id, activity_ids):
    if not activity_ids:
        return {}
    definitions = (
        db_session.query(ActivityDefinition)
        .options(
            selectinload(ActivityDefinition.metric_definitions).joinedload(MetricDefinition.fractal_metric),
            selectinload(ActivityDefinition.split_definitions),
            selectinload(ActivityDefinition.tags).joinedload(ActivityTag.definition),
        )
        .filter(
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.id.in_(activity_ids),
        )
        .all()
    )
    return {definition.id: definition for definition in definitions}


def _check_value(metric: MetricDefinition, value: float, path: str) -> None:
    fractal_metric = metric.fractal_metric
    if fractal_metric is None:
        return
    if fractal_metric.input_type == 'integer' and float(value) != int(value):
        raise ValueError(f'{path}: {metric.name} must be a whole number')
    if fractal_metric.min_value is not None and value < fractal_metric.min_value:
        raise ValueError(f'{path}: {metric.name} must be at least {fractal_metric.min_value:g}')
    if fractal_metric.max_value is not None and value > fractal_metric.max_value:
        raise ValueError(f'{path}: {metric.name} must be at most {fractal_metric.max_value:g}')


def _check_metric_entries(definition, entries: List[Dict[str, Any]], path: str) -> None:
    metrics = {
        metric.id: metric
        for metric in definition.metric_definitions
        if metric.deleted_at is None and metric.is_active is not False
    }
    split_ids = {split.id for split in definition.split_definitions if split.deleted_at is None}
    for index, entry in enumerate(entries):
        entry_path = f'{path}[{index}]'
        metric = metrics.get(entry['metric_id'])
        if metric is None:
            raise ValueError(f'{entry_path}: metric does not belong to {definition.name}')
        split_id = entry.get('split_id')
        if split_id is not None and split_id not in split_ids:
            raise ValueError(f'{entry_path}: split does not belong to {definition.name}')
        _check_value(metric, entry['value'], entry_path)


def _check_circuit_prescriptions(db_session, root_id, sections) -> None:
    prescribed = [item for item in iter_circuit_items(sections) if item.get('prescription')]
    if not prescribed:
        return
    circuits = {
        circuit.id: circuit
        for circuit in (
            db_session.query(CircuitDefinition)
            .options(
                selectinload(CircuitDefinition.slots)
                .joinedload(CircuitSlot.activity_definition)
                .selectinload(ActivityDefinition.metric_definitions)
                .joinedload(MetricDefinition.fractal_metric),
                selectinload(CircuitDefinition.slots)
                .joinedload(CircuitSlot.activity_definition)
                .selectinload(ActivityDefinition.split_definitions),
            )
            .filter(
                CircuitDefinition.root_id == root_id,
                CircuitDefinition.id.in_({item.get('circuit_definition_id') for item in prescribed}),
            )
            .all()
        )
    }
    for item in prescribed:
        circuit = circuits.get(item.get('circuit_definition_id'))
        if circuit is None:
            raise ValueError('Circuit plan: circuit not found')
        slots = {slot.id: slot for slot in circuit.slots}
        for round_index, planned_round in enumerate(item['prescription'].get('rounds') or []):
            for planned_slot in planned_round.get('slots') or []:
                slot = slots.get(planned_slot['slot_id'])
                path = f'{circuit.name} round {round_index + 1}'
                if slot is None:
                    raise ValueError(f'{path}: activity is not part of this circuit')
                _check_metric_entries(slot.activity_definition, planned_slot.get('metrics') or [], path)


def _check_tag_ids(definition, tag_ids, path: str) -> None:
    """Planned tags must be active tag bindings of the item's activity."""
    if not tag_ids:
        return
    available = {tag.id for tag in (definition.tags or []) if tag.deleted_at is None and not tag.catalog_archived}
    if any(tag_id not in available for tag_id in tag_ids):
        raise ValueError(f'{path}: one or more tags are unavailable for {definition.name}')


def check_section_prescriptions(db_session, root_id, sections) -> None:
    """Raise ValueError when any structurally valid prescription is semantically wrong.

    Items whose activity no longer exists keep their prescription untouched; they are
    skipped at session creation exactly like un-prescribed deleted activities.
    """
    _check_circuit_prescriptions(db_session, root_id, sections)
    prescribed = [item for item in iter_activity_items(sections) if item.get('prescription')]
    if not prescribed:
        return
    definitions = _load_activity_definitions(
        db_session,
        root_id,
        {item_activity_id(item) for item in prescribed},
    )
    for item in prescribed:
        definition = definitions.get(item_activity_id(item))
        path = f"{item.get('name') or 'activity'} plan"
        if definition is None:
            raise ValueError(f'{path}: activity not found')
        if definition.deleted_at is not None:
            continue
        prescription = item['prescription']
        if prescription.get('sets') and not definition.has_sets:
            raise ValueError(f'{path}: {definition.name} does not use sets')
        if prescription.get('metrics') and definition.has_sets:
            raise ValueError(f'{path}: {definition.name} is planned per set')
        for set_index, planned_set in enumerate(prescription.get('sets') or []):
            _check_metric_entries(definition, planned_set.get('metrics') or [], f'{path} set {set_index + 1}')
            _check_tag_ids(definition, planned_set.get('tags'), f'{path} set {set_index + 1}')
        _check_metric_entries(definition, prescription.get('metrics') or [], path)
        _check_tag_ids(definition, prescription.get('tags'), path)


def snapshot_prescription(prescription: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
    """Copy a prescription for an activity instance, detaching it from its source."""
    return copy.deepcopy(prescription) if prescription else None


def load_planned_tags(db_session, root_id, activity_definition_id, tag_ids):
    """Active tag bindings of one activity, by id, for applying planned tags at creation.

    Tags archived or removed since planning are skipped rather than failing the session.
    """
    if not tag_ids:
        return []
    rows = db_session.query(ActivityTag).filter(
        ActivityTag.root_id == root_id,
        ActivityTag.activity_definition_id == activity_definition_id,
        ActivityTag.id.in_(tag_ids),
        ActivityTag.deleted_at.is_(None),
    ).all()
    by_id = {row.id: row for row in rows if not row.catalog_archived}
    return [by_id[tag_id] for tag_id in tag_ids if tag_id in by_id]
