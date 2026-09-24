"""Serializers for sessions, session templates, and their analytics projections.

Session section structure is hydrated from canonical activity instances.
"""

import copy
from datetime import datetime
from models import _safe_load_json
from .session_runtime import (
    get_session_template_color,
    get_session_template_name,
    get_template_color,
    get_template_session_type,
)
from services._serialize_common import format_utc
from services._serialize_activities import serialize_activity_instance, serialize_circuit_run
from services._serialize_goals import serialize_goal
from services._serialize_notes_misc import serialize_note


def _active_session_instances(session):
    return [
        instance
        for instance in (getattr(session, "activity_instances", None) or [])
        if getattr(instance, "deleted_at", None) is None
    ]


def _serialize_session_sections_for_analytics(session):
    attrs = _safe_load_json(getattr(session, "attributes", None), {})
    session_data = attrs.get("session_data") if isinstance(attrs.get("session_data"), dict) else attrs
    sections = session_data.get("sections") if isinstance(session_data, dict) else None
    if not isinstance(sections, list):
        return []

    serialized_sections = []
    circuit_run_map = {run.id: run for run in (getattr(session, "circuit_runs", None) or [])}
    for index, section in enumerate(sections):
        if not isinstance(section, dict):
            continue
        raw_items = section.get("items") or section.get("exercises") or section.get("activities") or []
        activity_ids = section.get("activity_ids") if isinstance(section.get("activity_ids"), list) else []
        instance_ids = []

        for activity_id in activity_ids:
            if activity_id:
                instance_ids.append(activity_id)

        if isinstance(raw_items, list):
            for item in raw_items:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "circuit":
                    run = circuit_run_map.get(item.get("circuit_run_id"))
                    for circuit_round in (run.rounds if run else []):
                        for member in circuit_round.members:
                            instance_id = member.activity_instance_id or member.run_slot.activity_instance_id
                            if instance_id and instance_id not in instance_ids:
                                instance_ids.append(instance_id)
                    continue
                instance_id = item.get("activity_instance_id") or item.get("instance_id") or item.get("id")
                if instance_id and instance_id not in instance_ids:
                    instance_ids.append(instance_id)

        serialized_sections.append({
            "id": section.get("template_section_id") or section.get("id") or f"section-{index + 1}",
            "name": section.get("name") or f"Section {index + 1}",
            "activity_ids": instance_ids,
            "estimated_duration_minutes": section.get("estimated_duration_minutes") or section.get("duration_minutes"),
        })

    return serialized_sections


def _positive_int(value):
    try:
        numeric = int(value)
    except (TypeError, ValueError):
        return None
    return numeric if numeric > 0 else None


def _session_duration_seconds_for_analytics(session):
    attrs = _safe_load_json(getattr(session, "attributes", None), {})
    session_data = attrs.get("session_data") if isinstance(attrs.get("session_data"), dict) else attrs

    persisted_duration = _positive_int(getattr(session, "total_duration_seconds", None))
    if persisted_duration is not None:
        return persisted_duration

    if isinstance(session_data, dict):
        attribute_duration = _positive_int(session_data.get("total_duration_seconds") or attrs.get("total_duration_seconds"))
        if attribute_duration is not None:
            return attribute_duration

    start_at = getattr(session, "session_start", None)
    end_at = getattr(session, "session_end", None)
    if isinstance(session_data, dict):
        start_at = start_at or session_data.get("session_start") or attrs.get("session_start")
        end_at = end_at or session_data.get("session_end") or attrs.get("session_end")

    if start_at and end_at:
        start = start_at if isinstance(start_at, datetime) else datetime.fromisoformat(str(start_at).replace("Z", "+00:00"))
        end = end_at if isinstance(end_at, datetime) else datetime.fromisoformat(str(end_at).replace("Z", "+00:00"))
        paused_seconds = _positive_int(getattr(session, "total_paused_seconds", None)) or 0
        if isinstance(session_data, dict):
            paused_seconds = _positive_int(session_data.get("total_paused_seconds") or attrs.get("total_paused_seconds")) or paused_seconds
        return max(0, int((end - start).total_seconds()) - paused_seconds)

    duration_minutes = _positive_int(getattr(session, "duration_minutes", None))
    if duration_minutes is not None:
        return duration_minutes * 60

    return 0


def serialize_session_for_analytics(session):
    """Serialize the subset of session fields needed by analytics views."""
    return {
        "id": session.id,
        "name": session.name,
        "session_start": format_utc(session.session_start),
        "session_end": format_utc(session.session_end),
        "created_at": format_utc(session.created_at),
        "completed": bool(session.completed),
        "total_duration_seconds": _session_duration_seconds_for_analytics(session),
        "sections": _serialize_session_sections_for_analytics(session),
    }


def _canonical_session_data(session):
    return {
        "session_start": format_utc(session.session_start),
        "session_end": format_utc(session.session_end),
        "duration_minutes": session.duration_minutes,
        "total_duration_seconds": session.total_duration_seconds,
        "is_paused": getattr(session, 'is_paused', False),
        "last_paused_at": format_utc(getattr(session, 'last_paused_at', None)),
        "total_paused_seconds": getattr(session, 'total_paused_seconds', 0),
        "completed": session.completed,
    }


def _merge_session_attributes(session, result_attributes):
    """Return canonical session_data plus compatibility fields from older attrs shapes."""
    attrs = _safe_load_json(session.attributes, {})
    session_data = _canonical_session_data(session)

    if attrs:
        legacy_session_data = attrs.get("session_data")
        session_data.update(copy.deepcopy(
            legacy_session_data if isinstance(legacy_session_data, dict) else attrs
        ))

        for key, value in attrs.items():
            if key not in result_attributes:
                result_attributes[key] = copy.deepcopy(value)

    # Relational columns win over any legacy embedded payload.
    session_data.update(_canonical_session_data(session))
    return session_data


def _apply_template_metadata(session, session_data, template_payload):
    if not isinstance(template_payload, dict):
        return
    template_name = get_session_template_name(session)
    if template_name:
        session_data["template_name"] = template_name
    template_color = get_session_template_color(session)
    if template_color:
        session_data["template_color"] = template_color
    if not session_data.get("session_type"):
        session_data["session_type"] = get_template_session_type(template_payload)


def _serialize_session_program_info(session, session_data):
    context = session_data.get("program_context") if isinstance(session_data, dict) else None
    context = context if isinstance(context, dict) else {}
    day = getattr(session, "program_day", None)
    block = getattr(day, "block", None) if day else None
    program = getattr(block, "program", None) if block else None

    if not (program or block or day or context):
        return None

    program_info = {
        "program_id": getattr(program, "id", None) or getattr(session, "program_id", None) or context.get("program_id"),
        "program_name": getattr(program, "name", None) or context.get("program_name"),
        "program_color": getattr(program, "color", None) or context.get("program_color"),
        "block_id": getattr(block, "id", None) or getattr(session, "program_block_id", None) or context.get("block_id"),
        "block_name": getattr(block, "name", None) or context.get("block_name"),
        "block_color": getattr(block, "color", None) or context.get("block_color"),
        "day_id": getattr(day, "id", None) or context.get("day_id"),
        "day_name": getattr(day, "name", None) or context.get("day_name"),
        "day_number": getattr(day, "day_number", None) or context.get("day_number"),
        "day_date": format_utc(getattr(day, "date", None)) or context.get("day_date"),
    }
    return program_info if any(program_info.values()) else None


def _extract_legacy_activity_definition_id(item):
    if isinstance(item, str):
        return item
    if not isinstance(item, dict):
        return None
    for key in ("activity_id", "activity_definition_id", "activityId", "activityDefinitionId", "definition_id", "id"):
        val = item.get(key)
        if isinstance(val, str) and val:
            return val
    nested = item.get("activity")
    if isinstance(nested, dict):
        for key in ("id", "activity_id", "activity_definition_id"):
            val = nested.get(key)
            if isinstance(val, str) and val:
                return val
    return None


def _build_section_activity_ids(section, raw_items, instance_map, ids_by_def, used_ids, remaining_ids, section_count):
    activity_ids = section.get("activity_ids") if isinstance(section.get("activity_ids"), list) else []
    normalized_ids = [iid for iid in activity_ids if iid in instance_map and iid not in used_ids]
    legacy_items_by_instance_id = {}

    if normalized_ids:
        return normalized_ids, {
            item.get("instance_id"): item
            for item in raw_items
            if isinstance(item, dict) and item.get("instance_id")
        }

    for item in raw_items:
        if not isinstance(item, dict):
            continue
        iid = item.get("instance_id")
        if iid in instance_map and iid not in used_ids and iid not in normalized_ids:
            normalized_ids.append(iid)
            legacy_items_by_instance_id[iid] = item

    if not normalized_ids:
        for item in raw_items:
            def_id = _extract_legacy_activity_definition_id(item)
            if not def_id:
                continue
            for iid in ids_by_def.get(def_id, []):
                if iid not in used_ids and iid not in normalized_ids:
                    normalized_ids.append(iid)
                    legacy_items_by_instance_id[iid] = item
                    break

    if not normalized_ids and section_count == 1:
        normalized_ids = [iid for iid in remaining_ids if iid not in used_ids]

    return normalized_ids, legacy_items_by_instance_id


def _hydrate_session_sections_from_instances(
    session_sections,
    active_instances,
    serialized_activity_instances,
    circuit_runs=None,
):
    """Normalize legacy section shapes and hydrate section exercises from canonical instances."""
    if not isinstance(session_sections, list):
        return

    instance_map = {inst.id: inst for inst in active_instances}
    serialized_instance_map = {
        inst_payload["id"]: inst_payload
        for inst_payload in serialized_activity_instances
        if isinstance(inst_payload, dict) and inst_payload.get("id")
    }
    remaining_ids = [inst.id for inst in active_instances]
    used_ids = set()
    ids_by_def = {}
    for inst in active_instances:
        ids_by_def.setdefault(inst.activity_definition_id, []).append(inst.id)

    for section in session_sections:
        if not isinstance(section, dict):
            continue

        typed_items = section.get("items") if isinstance(section.get("items"), list) else None
        raw_items = section.get("exercises") or section.get("activities") or []
        if typed_items is not None:
            section["activity_ids"] = [
                item.get("activity_instance_id")
                for item in typed_items
                if isinstance(item, dict)
                and item.get("type") == "activity"
                and item.get("activity_instance_id")
            ]
        normalized_ids, legacy_items_by_instance_id = _build_section_activity_ids(
            section,
            raw_items,
            instance_map,
            ids_by_def,
            used_ids,
            remaining_ids,
            len(session_sections),
        )

        section["activity_ids"] = normalized_ids
        used_ids.update(normalized_ids)

        exercises = []
        for inst_id in normalized_ids:
            if inst_id not in instance_map:
                continue
            inst = instance_map[inst_id]
            ex = serialize_activity_instance(inst)
            ex['type'] = 'activity'
            ex['instance_id'] = inst.id
            ex['activity_id'] = inst.activity_definition_id
            ex['has_sets'] = len(ex.get('sets', []) or []) > 0
            ex['has_metrics'] = (len(ex.get('metrics', []) or []) > 0) or (len(ex.get('metric_values', []) or []) > 0)
            exercises.append(ex)
        section["exercises"] = exercises
        if typed_items is not None:
            exercise_by_id = {item.get("instance_id"): item for item in exercises}
            run_map = {run.id: run for run in (circuit_runs or [])}
            hydrated_items = []
            for item in typed_items:
                if not isinstance(item, dict):
                    continue
                if item.get("type") == "activity":
                    exercise = exercise_by_id.get(item.get("activity_instance_id"))
                    if exercise:
                        hydrated_items.append({
                            "type": "activity",
                            "activity_instance_id": item.get("activity_instance_id"),
                            "activity": exercise,
                        })
                elif item.get("type") == "circuit":
                    run = run_map.get(item.get("circuit_run_id"))
                    if run:
                        hydrated_items.append({
                            "type": "circuit",
                            "circuit_run_id": run.id,
                            "circuit": serialize_circuit_run(run),
                        })
            section["items"] = hydrated_items


def serialize_session(session):
    """Serialize a Session object."""
    active_instances = _active_session_instances(session)
    template_payload = _safe_load_json(getattr(getattr(session, "template", None), "template_data", None), {})
    session_template_stats = getattr(session, "_template_stats", None) or {}
    activity_duration_stats = getattr(session, "_activity_duration_stats", None) or {}
    serialized_activity_instances = [serialize_activity_instance(inst) for inst in active_instances]
    result = {
        "id": session.id,
        "name": session.name,
        "description": session.description,
        "root_id": session.root_id,
        "session_start": format_utc(session.session_start),
        "session_end": format_utc(session.session_end),
        "duration_minutes": session.duration_minutes,
        "total_duration_seconds": session.total_duration_seconds,
        "is_paused": getattr(session, 'is_paused', False),
        "last_paused_at": format_utc(getattr(session, 'last_paused_at', None)),
        "total_paused_seconds": getattr(session, 'total_paused_seconds', 0),
        "template_id": session.template_id,
        "program_day_id": session.program_day_id,
        "program_id": getattr(session, 'program_id', None),
        "program_block_id": getattr(session, 'program_block_id', None),
        "completed": session.completed,
        "completed_at": format_utc(session.completed_at),
        "created_at": format_utc(session.created_at),
        "updated_at": format_utc(session.updated_at),
        "attributes": {
            "id": session.id,
            "type": "Session",
            "session_start": format_utc(session.session_start),
            "session_end": format_utc(session.session_end),
            "duration_minutes": session.duration_minutes,
            "total_duration_seconds": session.total_duration_seconds,
            "is_paused": getattr(session, 'is_paused', False),
            "last_paused_at": format_utc(getattr(session, 'last_paused_at', None)),
            "total_paused_seconds": getattr(session, 'total_paused_seconds', 0),
            "template_id": session.template_id,
            "completed": session.completed,
            "completed_at": format_utc(session.completed_at),
            "created_at": format_utc(session.created_at),
            "updated_at": format_utc(session.updated_at),
        },
        "stats": {
            "template": session_template_stats,
            "activity_durations": activity_duration_stats,
        },
        "activity_instances": serialized_activity_instances,
        "notes": [serialize_note(n) for n in session.notes_list if not n.deleted_at] if hasattr(session, 'notes_list') else []
    }
    
    session_data = _merge_session_attributes(session, result["attributes"])
    _apply_template_metadata(session, session_data, template_payload)

    result["attributes"]["session_data"] = session_data
    result["session_type"] = get_template_session_type(session_data)
    result["template_color"] = get_template_color(session_data)

    _hydrate_session_sections_from_instances(
        result["attributes"]["session_data"].get("sections"),
        active_instances,
        serialized_activity_instances,
        getattr(session, "circuit_runs", None) or [],
    )
    
    # Hydrate canonical session goals across every goal level.
    goals_source = getattr(session, '_derived_goals', None)
    if goals_source is None:
        goals_source = session.goals if hasattr(session, 'goals') else []

    seen_goal_ids = set()
    session_goals_payload = []
    for goal in goals_source or []:
        if not goal or getattr(goal, 'deleted_at', None):
            continue
        goal_id = getattr(goal, 'id', None)
        if goal_id in seen_goal_ids:
            continue
        seen_goal_ids.add(goal_id)
        session_goals_payload.append(serialize_goal(goal, include_children=False))
    result["session_goals"] = session_goals_payload

    completed_goals_source = getattr(session, '_completed_goals', None) or []
    seen_completed_goal_ids = set()
    completed_goals_payload = []
    for goal in completed_goals_source:
        if not goal or getattr(goal, 'deleted_at', None):
            continue
        goal_id = getattr(goal, 'id', None)
        if goal_id in seen_completed_goal_ids:
            continue
        seen_completed_goal_ids.add(goal_id)
        completed_goals_payload.append(serialize_goal(goal, include_children=False))
    result["completed_goals"] = completed_goals_payload

    program_info = _serialize_session_program_info(session, session_data)
    if program_info:
        result["program_info"] = program_info
    
    return result


def serialize_program_day_session_light(session):
    """
    Lightweight serializer for sessions embedded inside a ProgramDay.
    Only includes primitive fields and avoids N+1 query hydration overhead
    (no activity instances, no goals, no notes).
    """
    return {
        "id": session.id,
        "name": session.name,
        "description": session.description,
        "root_id": session.root_id,
        "session_start": format_utc(session.session_start),
        "session_end": format_utc(session.session_end),
        "duration_minutes": session.duration_minutes,
        "total_duration_seconds": session.total_duration_seconds,
        "template_id": session.template_id,
        "program_day_id": session.program_day_id,
        "program_id": getattr(session, 'program_id', None),
        "program_block_id": getattr(session, 'program_block_id', None),
        "completed": session.completed,
        "completed_at": format_utc(session.completed_at),
        "created_at": format_utc(session.created_at),
        "updated_at": format_utc(session.updated_at)
    }


def serialize_session_template(template):
    """Serialize a SessionTemplate object."""
    template_data = _safe_load_json(template.template_data, {})
    stats = getattr(template, "_duration_stats", None)
    archived_at = getattr(template, 'archived_at', None)
    is_used_in_active_program = bool(getattr(template, '_is_used_in_active_program', False))
    return {
        "id": template.id, 
        "name": template.name, 
        "description": getattr(template, 'description', '') or '',
        "root_id": getattr(template, 'root_id', None),
        "template_data": template_data,
        "session_type": get_template_session_type(template_data),
        "template_color": get_template_color(template_data),
        "archived_at": format_utc(archived_at),
        "is_archived": bool(archived_at),
        "is_used_in_active_program": is_used_in_active_program,
        "is_effectively_active": not bool(archived_at) or is_used_in_active_program,
        "created_at": format_utc(getattr(template, 'created_at', None)),
        "updated_at": format_utc(getattr(template, 'updated_at', None)),
        "stats": stats or {},
        "goals": [serialize_goal(g, include_children=False) for g in template.goals] if hasattr(template, 'goals') else []
    }
