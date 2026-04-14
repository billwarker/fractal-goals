import copy
import uuid

import models

from services.session_runtime import (
    SESSION_TYPE_QUICK,
    get_template_color,
    get_template_session_type,
)


SECTION_STRUCTURE_KEYS = {'activities', 'exercises', 'activity_ids'}


def extract_activity_definition_id(raw_item) -> str | None:
    if isinstance(raw_item, str):
        return raw_item
    if not isinstance(raw_item, dict):
        return None

    for key in (
        'activity_id',
        'activity_definition_id',
        'activityId',
        'activityDefinitionId',
        'definition_id',
        'id',
    ):
        value = raw_item.get(key)
        if isinstance(value, str) and value.strip():
            return value

    nested = raw_item.get('activity')
    if isinstance(nested, dict):
        for key in ('id', 'activity_id', 'activity_definition_id'):
            value = nested.get(key)
            if isinstance(value, str) and value.strip():
                return value

    return None


def _active_instances(session):
    return [
        instance
        for instance in (getattr(session, 'activity_instances', None) or [])
        if getattr(instance, 'deleted_at', None) is None
    ]


def _session_runtime_data(session):
    attrs = models._safe_load_json(getattr(session, 'attributes', None), {})
    if not isinstance(attrs, dict):
        return {}
    session_data = attrs.get('session_data')
    if isinstance(session_data, dict):
        return copy.deepcopy(session_data)
    return copy.deepcopy(attrs)


def _template_runtime_data(session):
    return models._safe_load_json(getattr(getattr(session, 'template', None), 'template_data', None), {})


def _resolve_session_type(runtime_data, template_data):
    if isinstance(runtime_data, dict) and runtime_data.get('session_type'):
        return get_template_session_type(runtime_data)
    return get_template_session_type(template_data)


def _resolve_template_color(runtime_data, template_data):
    return get_template_color(runtime_data) or get_template_color(template_data)


def _normalize_duration(value):
    if value in (None, ''):
        return None
    try:
        normalized = int(value)
    except (TypeError, ValueError):
        return None
    return normalized if normalized >= 0 else None


def _copy_section_metadata(section):
    if not isinstance(section, dict):
        return {'name': 'Section'}

    payload = {
        key: copy.deepcopy(value)
        for key, value in section.items()
        if key not in SECTION_STRUCTURE_KEYS
    }
    payload['name'] = payload.get('name') or 'Section'
    return payload


def _build_template_activity_item(instance):
    return {
        'activity_id': instance.activity_definition_id,
        'name': instance.definition.name if getattr(instance, 'definition', None) else 'Activity',
        'type': 'activity',
    }


def _build_duplicate_activity_item(instance):
    return {
        **_build_template_activity_item(instance),
        'instance_id': str(uuid.uuid4()),
        'completed': False,
        'notes': '',
    }


def _ordered_section_instances(runtime_data, active_instances):
    raw_sections = runtime_data.get('sections')
    if not isinstance(raw_sections, list):
        raw_sections = []

    instance_map = {instance.id: instance for instance in active_instances if getattr(instance, 'id', None)}
    ids_by_def = {}
    for instance in active_instances:
        ids_by_def.setdefault(instance.activity_definition_id, []).append(instance.id)

    used_ids = set()
    ordered_sections = []

    for raw_section in raw_sections:
        if not isinstance(raw_section, dict):
            continue

        section = copy.deepcopy(raw_section)
        explicit_ids = section.get('activity_ids') if isinstance(section.get('activity_ids'), list) else []
        normalized_ids = [instance_id for instance_id in explicit_ids if instance_id in instance_map and instance_id not in used_ids]

        raw_items = section.get('exercises') or section.get('activities') or []

        if not normalized_ids:
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                instance_id = item.get('instance_id')
                if instance_id in instance_map and instance_id not in used_ids and instance_id not in normalized_ids:
                    normalized_ids.append(instance_id)

        if not normalized_ids:
            for item in raw_items:
                activity_definition_id = extract_activity_definition_id(item)
                if not activity_definition_id:
                    continue
                for instance_id in ids_by_def.get(activity_definition_id, []):
                    if instance_id in used_ids or instance_id in normalized_ids:
                        continue
                    normalized_ids.append(instance_id)
                    break

        if not normalized_ids and len(raw_sections) == 1:
            normalized_ids = [instance.id for instance in active_instances if instance.id not in used_ids]

        for instance_id in normalized_ids:
            used_ids.add(instance_id)

        ordered_sections.append((
            section,
            [instance_map[instance_id] for instance_id in normalized_ids if instance_id in instance_map],
        ))

    remaining_instances = [instance for instance in active_instances if instance.id not in used_ids]
    if remaining_instances:
        ordered_sections.append((
            {
                'name': 'Main',
                'estimated_duration_minutes': runtime_data.get('total_duration_minutes'),
            },
            remaining_instances,
        ))

    return ordered_sections


def build_template_data_from_session(session):
    runtime_data = _session_runtime_data(session)
    template_runtime_data = _template_runtime_data(session)
    session_type = _resolve_session_type(runtime_data, template_runtime_data)
    template_color = _resolve_template_color(runtime_data, template_runtime_data)
    active_instances = _active_instances(session)

    if session_type == SESSION_TYPE_QUICK:
        payload = {
            'session_type': SESSION_TYPE_QUICK,
            'activities': [_build_template_activity_item(instance) for instance in active_instances],
        }
    else:
        sections = []
        total_duration_minutes = 0

        for section, instances in _ordered_section_instances(runtime_data, active_instances):
            normalized_duration = _normalize_duration(
                section.get('duration_minutes', section.get('estimated_duration_minutes'))
            )
            if normalized_duration is not None:
                total_duration_minutes += normalized_duration

            section_payload = _copy_section_metadata(section)
            section_payload.pop('estimated_duration_minutes', None)
            if normalized_duration is not None:
                section_payload['duration_minutes'] = normalized_duration
            section_payload['activities'] = [_build_template_activity_item(instance) for instance in instances]
            sections.append(section_payload)

        payload = {
            'session_type': 'normal',
            'sections': sections,
        }
        fallback_total_duration = _normalize_duration(runtime_data.get('total_duration_minutes'))
        if total_duration_minutes > 0:
            payload['total_duration_minutes'] = total_duration_minutes
        elif fallback_total_duration is not None:
            payload['total_duration_minutes'] = fallback_total_duration

    if template_color:
        payload['template_color'] = template_color

    return payload


def build_duplicate_session_data(session):
    runtime_data = _session_runtime_data(session)
    template_runtime_data = _template_runtime_data(session)
    session_type = _resolve_session_type(runtime_data, template_runtime_data)
    template_color = _resolve_template_color(runtime_data, template_runtime_data)
    active_instances = _active_instances(session)

    payload = {
        'session_type': session_type,
    }

    template_name = runtime_data.get('template_name') or getattr(getattr(session, 'template', None), 'name', None)
    if template_name:
        payload['template_name'] = template_name

    if template_color:
        payload['template_color'] = template_color

    if session_type == SESSION_TYPE_QUICK:
        payload['activities'] = [_build_template_activity_item(instance) for instance in active_instances]
        return payload

    sections = []
    total_duration_minutes = 0

    for section, instances in _ordered_section_instances(runtime_data, active_instances):
        normalized_duration = _normalize_duration(
            section.get('estimated_duration_minutes', section.get('duration_minutes'))
        )
        if normalized_duration is not None:
            total_duration_minutes += normalized_duration

        section_payload = _copy_section_metadata(section)
        if normalized_duration is not None:
            section_payload['estimated_duration_minutes'] = normalized_duration
        section_payload['exercises'] = [_build_duplicate_activity_item(instance) for instance in instances]
        sections.append(section_payload)

    payload['sections'] = sections
    fallback_total_duration = _normalize_duration(runtime_data.get('total_duration_minutes'))
    if total_duration_minutes > 0:
        payload['total_duration_minutes'] = total_duration_minutes
    elif fallback_total_duration is not None:
        payload['total_duration_minutes'] = fallback_total_duration

    return payload
