"""Section helpers for session plans: typed template sections and template-change merges.

Pure functions over template and plan ``sections`` payloads, shared by the plan service
and session creation. Items are identified by ``item_key``; legacy activity lists get
positional keys so planned values stay attached until the template is re-saved.
"""
import copy

import models


LEGACY_ITEM_KEYS = ('activities', 'exercises', 'activity_ids')


def _legacy_item(entry, section_index, item_index):
    """A typed item for one entry of a legacy ``activities``/``exercises`` list.

    Legacy lists hold bare activity ids or dicts that may already be typed (including
    circuits). They have no ``item_key``, so a positional key keeps planned values
    attached across reads and pulls until the template is re-saved with typed items.
    """
    key = {'item_key': f'legacy-{section_index}-{item_index}'}
    if isinstance(entry, str):
        return {'type': 'activity', 'activity_definition_id': entry, **key}
    if entry.get('type') == 'circuit' or entry.get('circuit_definition_id'):
        return {'type': 'circuit', 'circuit_definition_id': entry.get('circuit_definition_id'), **key,
                **({'name': entry['name']} if entry.get('name') else {})}
    return {
        'type': 'activity',
        'activity_definition_id': entry.get('activity_definition_id') or entry.get('activity_id') or entry.get('id'),
        'name': entry.get('name'),
        **key,
    }


def typed_template_sections(template):
    """The template's sections with legacy activity lists converted to typed items."""
    payload = models._safe_load_json(template.template_data, {})
    sections = []
    raw_sections = (payload.get('sections') if isinstance(payload, dict) else None) or []
    for section_index, section in enumerate(raw_sections):
        if not isinstance(section, dict):
            continue
        typed = copy.deepcopy(section)
        if 'items' not in typed:
            legacy = next((typed[key] for key in LEGACY_ITEM_KEYS if key in typed), None) or []
            for key in LEGACY_ITEM_KEYS:
                typed.pop(key, None)
            typed['items'] = [
                _legacy_item(entry, section_index, item_index)
                for item_index, entry in enumerate(legacy)
                if isinstance(entry, (str, dict))
            ]
        sections.append(typed)
    return sections


def section_names(sections):
    return [section.get('name') for section in sections or []]


def stored_plan_sections(plan):
    """A deep copy of a stored plan's sections."""
    payload = models._safe_load_json(plan.plan_data, {})
    return copy.deepcopy(payload.get('sections') or []) if isinstance(payload, dict) else []


def merge_template_changes(plan_sections, template_sections):
    """Rebuild a plan from its template's current sections, keeping the plan's own work.

    Planned values survive for items whose ``item_key`` is still in the template, and
    items added in the plan (``added_in_plan``) stay in their section when it still exists.
    """
    plan_items_by_key = {}
    added_by_section = {}
    for section in plan_sections or []:
        for item in section.get('items') or []:
            if item.get('added_in_plan'):
                added_by_section.setdefault(section.get('name'), []).append(item)
            elif item.get('item_key'):
                plan_items_by_key[item['item_key']] = item

    merged = []
    for section in copy.deepcopy(template_sections):
        items = []
        for item in section.get('items') or []:
            planned = plan_items_by_key.get(item.get('item_key'))
            if planned and planned.get('prescription'):
                item['prescription'] = copy.deepcopy(planned['prescription'])
            items.append(item)
        items.extend(copy.deepcopy(added_by_section.get(section.get('name'), [])))
        section['items'] = items
        merged.append(section)
    return merged
