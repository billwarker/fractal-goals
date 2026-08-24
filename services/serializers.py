import copy
from datetime import datetime, timezone, date

from account_tiers import DEFAULT_ACCOUNT_TIER
from models import _safe_load_json
from .account_flags import must_change_password as _must_change_password
from .goal_type_utils import get_canonical_goal_type
from .goal_domain_rules import goal_uses_child_completion
from .session_runtime import (
    get_session_template_color,
    get_session_template_name,
    get_template_color,
    get_template_session_type,
)
from .activity_progress_view_service import serialize_activity_tag

def format_utc(dt):
    """Format a datetime or date object to ISO string with UTC indicator."""
    if not dt: return None
    # If it's just a date object, return YYYY-MM-DD
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.isoformat()
    # If it's a naive datetime, assume UTC and append Z
    if dt.tzinfo is None:
        return dt.isoformat(timespec='seconds') + 'Z'
    # If aware, ensure UTC and use Z suffix
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')


def format_utc_precise(dt):
    """Preserve sub-second ledger boundaries used by historical corrections."""
    if not dt:
        return None
    normalized = dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt.astimezone(timezone.utc)
    return normalized.isoformat(timespec='microseconds').replace('+00:00', 'Z')

def calculate_smart_status(goal):
    """Calculate SMART criteria status for a goal."""
    # Source of truth: relational targets.
    targets = [t for t in (goal.targets_rel or []) if t.deleted_at is None]
    
    # Achievable: has associated activities OR has associated activity groups OR completed via children
    if goal.track_activities:
        has_activities = len(goal.associated_activities) > 0 if goal.associated_activities else False
        has_groups = len(goal.associated_activity_groups) > 0 if goal.associated_activity_groups else False
        uses_child_completion = goal_uses_child_completion(goal)
        is_achievable = has_activities or has_groups or uses_child_completion
        is_measurable = len(targets) > 0 or uses_child_completion
    else:
        is_achievable = True
        is_measurable = True
    
    return {
        "specific": bool(goal.description and goal.description.strip()),
        "measurable": is_measurable,
        "achievable": is_achievable,
        "relevant": bool(goal.relevance_statement and goal.relevance_statement.strip()),
        "time_bound": goal.deadline is not None
    }

def serialize_target(target):
    """Serialize a Target object."""
    metrics_json = []
    if getattr(target, 'metric_conditions', None):
        for condition in target.metric_conditions:
            metrics_json.append({
                "metric_id": condition.metric_definition_id,
                "metric_definition_id": condition.metric_definition_id,
                "operator": condition.operator,
                "value": condition.target_value,
                "target_value": condition.target_value
            })
            
    return {
        "id": target.id,
        "goal_id": target.goal_id,
        "root_id": target.root_id,
        "activity_id": target.activity_id,
        "activity_instance_id": getattr(target, 'activity_instance_id', None),
        "activity_group_id": getattr(target, 'activity_group_id', None),
        "template_id": getattr(target, 'template_id', None),
        "name": target.name,
        "type": target.type or "threshold",
        "metrics": metrics_json,
        "time_scope": target.time_scope or "all_time",
        "start_date": format_utc(target.start_date),
        "end_date": format_utc(target.end_date),
        "linked_block_id": target.linked_block_id,
        "frequency_days": target.frequency_days,
        "frequency_count": target.frequency_count,
        "completed": target.completed or False,
        "completed_at": format_utc(target.completed_at),
        "completed_session_id": getattr(target, 'completed_session_id', None),
        "completed_instance_id": getattr(target, 'completed_instance_id', None),
        "created_at": format_utc(target.created_at),
        "updated_at": format_utc(target.updated_at)
    }

def serialize_metric_value(metric):
    """Serialize a MetricValue object."""
    return {
        "id": metric.id,
        "name": metric.definition.name if metric.definition else "",
        "metric_definition_id": metric.metric_definition_id,
        "metric_id": metric.metric_definition_id, # Frontend alias
        "value": metric.value,
        "unit": metric.definition.unit if metric.definition else "",
        "split_id": metric.split_definition_id,
        "split_name": metric.split.name if metric.split else None
    }


def serialize_activity_set(activity_set):
    direct_tags = list(getattr(activity_set, 'tags', None) or [])
    inherited_tags = list(getattr(getattr(activity_set, 'activity_instance', None), 'tags', None) or [])
    effective_by_id = {tag.id: tag for tag in [*inherited_tags, *direct_tags]}
    return {
        "id": activity_set.id,
        "sort_order": activity_set.sort_order,
        "status": activity_set.status,
        "completed": activity_set.status == "completed",
        "duration_seconds": activity_set.duration_seconds,
        "notes": activity_set.notes,
        "metrics": [serialize_metric_value(metric) for metric in (activity_set.metric_values or [])],
        "created_at": format_utc(activity_set.created_at),
        "updated_at": format_utc(activity_set.updated_at),
        "tag_assignment_version": activity_set.tag_assignment_version,
        "tags": [serialize_activity_tag(tag) for tag in direct_tags],
        "inherited_tags": [serialize_activity_tag(tag) for tag in inherited_tags],
        "effective_tags": [serialize_activity_tag(tag) for tag in effective_by_id.values()],
    }

def serialize_fractal_metric(metric):
    """Serialize a FractalMetricDefinition object."""
    return {
        "id": metric.id,
        "root_id": metric.root_id,
        "name": metric.name,
        "unit": metric.unit,
        "is_multiplicative": metric.is_multiplicative,
        "is_additive": metric.is_additive,
        "input_type": metric.input_type,
        "default_value": metric.default_value,
        "higher_is_better": metric.higher_is_better,
        "predefined_values": metric.predefined_values,
        "min_value": metric.min_value,
        "max_value": metric.max_value,
        "description": metric.description,
        "default_progress_aggregation": metric.default_progress_aggregation,
        "sort_order": metric.sort_order,
        "activity_count": getattr(metric, '_activity_count', 0),
        "created_at": format_utc(metric.created_at),
        "updated_at": format_utc(metric.updated_at),
    }

def serialize_activity_instance(instance, *, has_open_work_interval=False):
    """Serialize an ActivityInstance object."""
    data_dict = _safe_load_json(instance.data, {})
    metric_values_list = [
        serialize_metric_value(m)
        for m in instance.metric_values
        if getattr(m, "activity_set_id", None) is None
    ]
    normalized_sets = [serialize_activity_set(row) for row in (getattr(instance, "sets", None) or [])]

    # Build full group path (e.g., "Pull > Horizontal")
    group_path = None
    if instance.definition and instance.definition.group:
        path_parts = []
        current_group = instance.definition.group
        while current_group:
            path_parts.insert(0, current_group.name)
            current_group = current_group.parent if hasattr(current_group, 'parent') else None
        group_path = " > ".join(path_parts) if path_parts else None
    
    return {
        "id": instance.id,
        "session_id": instance.session_id,
        "activity_definition_id": instance.activity_definition_id,

        "name": instance.definition.name if instance.definition else "Unknown",
        "definition_name": instance.definition.name if instance.definition else "Unknown",
        "group_name": group_path,  # Now includes full path
        "created_at": format_utc(instance.created_at),
        "time_start": format_utc(instance.time_start),
        # The open interval is the canonical source of live accrual. This also
        # presents legacy pause/resume rows correctly if they retained a stale
        # historical stop boundary.
        "time_stop": None if has_open_work_interval else format_utc(instance.time_stop),
        "duration_seconds": instance.duration_seconds,
        "target_duration_seconds": getattr(instance, 'target_duration_seconds', None),
        "is_paused": getattr(instance, 'is_paused', False),
        "last_paused_at": format_utc(getattr(instance, 'last_paused_at', None)),
        "total_paused_seconds": getattr(instance, 'total_paused_seconds', 0),
        "completed": instance.completed,
        "notes": instance.notes,
        "has_sets": bool(getattr(instance.definition, "has_sets", False) or normalized_sets),
        "has_metrics": bool(getattr(instance.definition, "has_metrics", False) or metric_values_list),
        "sets": normalized_sets,
        "data": data_dict,
        "metric_values": metric_values_list,
        "metrics": metric_values_list,  # Frontend alias
        "tags": [serialize_activity_tag(tag) for tag in (getattr(instance, 'tags', None) or [])],
        "tag_assignment_version": instance.tag_assignment_version,
        "progress_comparison": getattr(instance, '_dynamic_progress', None),
    }


def serialize_activity_instance_for_analytics(instance, *, session_name=None, session_date=None):
    """Serialize the subset of activity-instance fields needed by analytics views."""
    data_dict = _safe_load_json(instance.data, {})
    metric_values_list = [
        serialize_metric_value(m)
        for m in instance.metric_values
        if getattr(m, "activity_set_id", None) is None
    ]
    normalized_sets = [serialize_activity_set(row) for row in (getattr(instance, "sets", None) or [])]

    return {
        "id": instance.id,
        "session_id": instance.session_id,
        "activity_definition_id": instance.activity_definition_id,
        "session_name": session_name,
        "session_date": format_utc(session_date) if session_date else None,
        "created_at": format_utc(instance.created_at),
        "time_start": format_utc(instance.time_start),
        "time_stop": format_utc(instance.time_stop),
        "duration_seconds": instance.duration_seconds,
        "completed": instance.completed,
        "has_sets": bool(getattr(instance.definition, "has_sets", False) or normalized_sets),
        "sets": normalized_sets,
        "metric_values": metric_values_list,
        "metrics": metric_values_list,
        "tags": [serialize_activity_tag(tag) for tag in (getattr(instance, 'tags', None) or [])],
        "progress_comparison": getattr(instance, '_dynamic_progress', None),
    }


def serialize_circuit_definition(definition, instantiation_summary=None):
    summary = instantiation_summary or {}
    return {
        "id": definition.id,
        "root_id": definition.root_id,
        "group_id": definition.group_id,
        "name": definition.name,
        "description": definition.description or "",
        "version": definition.version,
        "archived": definition.deleted_at is not None,
        "deleted_at": format_utc(definition.deleted_at),
        "created_at": format_utc(definition.created_at),
        "updated_at": format_utc(definition.updated_at),
        "instantiation_summary": {
            "instance_count": int(summary.get("instance_count") or 0),
            "last_used_at": summary.get("last_used_at"),
            "average_duration_seconds": summary.get("average_duration_seconds"),
        },
        "slots": [
            {
                "id": slot.id,
                "activity_definition_id": slot.activity_definition_id,
                "sort_order": slot.sort_order,
                "activity": serialize_activity_definition(slot.activity_definition)
                if slot.activity_definition else None,
            }
            for slot in (definition.slots or [])
        ],
    }


def serialize_work_interval(interval):
    return {
        "id": interval.id,
        "activity_instance_id": interval.activity_instance_id,
        "activity_set_id": interval.activity_set_id,
        "started_at": format_utc_precise(interval.started_at),
        "ended_at": format_utc_precise(interval.ended_at),
        "duration_seconds": interval.duration_seconds,
    }


def serialize_circuit_run(run):
    def serialize_scope_tag(tag):
        return {
            "id": tag.id,
            "name": tag.name,
            "color": tag.color,
            "sort_order": tag.sort_order,
        }

    slots = sorted(run.slots or [], key=lambda slot: slot.sort_order)
    rounds = sorted(run.rounds or [], key=lambda item: item.round_number)
    return {
        "id": run.id,
        "root_id": run.root_id,
        "session_id": run.session_id,
        "circuit_definition_id": run.circuit_definition_id,
        "source_version": run.source_version,
        "name": run.name,
        "description": run.description or "",
        "round_count": len(rounds),
        "status": run.status,
        "time_start": format_utc(run.time_start),
        "time_stop": format_utc(run.time_stop),
        "duration_seconds": run.duration_seconds,
        "is_paused": run.is_paused,
        "last_paused_at": format_utc(run.last_paused_at),
        "total_paused_seconds": run.total_paused_seconds,
        "completed_at": format_utc(run.completed_at),
        "created_at": format_utc(run.created_at),
        "updated_at": format_utc(run.updated_at),
        "tags": [
            serialize_scope_tag(tag)
            for tag in sorted(
                (tag for tag in (run.scope_tags or []) if tag.circuit_round_id is None),
                key=lambda tag: (tag.sort_order, tag.name.casefold()),
            )
        ],
        "slots": [
            {
                "id": slot.id,
                "source_slot_id": slot.source_slot_id,
                "activity_definition_id": slot.activity_definition_id,
                "activity_instance_id": slot.activity_instance_id,
                "sort_order": slot.sort_order,
                "activity_name": slot.activity_name,
                "has_sets": slot.has_sets,
                "has_metrics": slot.has_metrics,
                "activity_schema": slot.activity_schema or {},
            }
            for slot in slots
        ],
        "rounds": [
            {
                "id": circuit_round.id,
                "round_number": circuit_round.round_number,
                "tags": [
                    serialize_scope_tag(tag)
                    for tag in sorted(
                        (circuit_round.scope_tags or []),
                        key=lambda tag: (tag.sort_order, tag.name.casefold()),
                    )
                ],
                "members": [
                    {
                        "id": member.id,
                        "circuit_run_slot_id": member.circuit_run_slot_id,
                        "activity_instance_id": member.activity_instance_id,
                        "activity_set_id": member.activity_set_id,
                        "sort_order": member.sort_order,
                        "metrics": [
                            serialize_metric_value(metric)
                            for metric in (
                                member.activity_set.metric_values
                                if member.activity_set_id and member.activity_set
                                else [
                                    metric
                                    for metric in (member.activity_instance.metric_values or [])
                                    if metric.activity_set_id is None
                                ] if member.activity_instance else []
                            )
                        ],
                    }
                    for member in sorted(circuit_round.members or [], key=lambda member: member.sort_order)
                ],
            }
            for circuit_round in rounds
        ],
    }


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


def serialize_goal(goal, include_children=True):
    """Serialize a Goal object."""
    smart_status = calculate_smart_status(goal)
    
    goal_type = get_canonical_goal_type(goal)
    goal_level_name = getattr(goal.level, 'name', None) if getattr(goal, 'level', None) else None
    active_targets = [t for t in (goal.targets_rel or []) if t.deleted_at is None]
    completed_target_count = sum(1 for target in active_targets if target.completed)
    all_targets_satisfied = bool(active_targets) and completed_target_count == len(active_targets)
    completion_state = {
        "completed": bool(goal.completed),
        "completed_at": format_utc(goal.completed_at),
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "source": getattr(goal, 'completion_source', None),
        "reason": getattr(goal, 'completion_reason', None),
        "manually_uncompleted_at": format_utc(getattr(goal, 'manually_uncompleted_at', None)),
        "all_targets_satisfied": all_targets_satisfied,
        "completed_targets": completed_target_count,
        "total_targets": len(active_targets),
    }
    
    result = {
        "name": goal.name,
        "id": goal.id,
        "type": goal_type,  # Hoist type to top level for frontend convenience
        "level_id": goal.level_id,
        "level_name": goal_level_name,
        "completed": goal.completed,
        "completed_at": format_utc(goal.completed_at),
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "completion_state": completion_state,
        "is_smart": all(smart_status.values()),
        "smart_status": smart_status,
        "paused": bool(getattr(goal, 'paused', False)),
        "paused_at": format_utc(getattr(goal, 'paused_at', None)),
        "description": goal.description,
        "deadline": format_utc(goal.deadline),
        "attributes": {
            "id": goal.id,
            "type": goal_type,
            "level_id": goal.level_id,
            "parent_id": goal.parent_id,
            "root_id": goal.root_id,
            "owner_id": getattr(goal, 'owner_id', None),
            "description": goal.description,
            "deadline": format_utc(goal.deadline),
            "completed": goal.completed,
            "completed_at": format_utc(goal.completed_at),
            "completed_session_id": getattr(goal, 'completed_session_id', None),
            "completion_state": completion_state,
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "targets": [serialize_target(t) for t in (goal.targets_rel or []) if t.deleted_at is None],
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": goal.completed_via_children,
            "inherit_parent_activities": goal.inherit_parent_activities,
            "allow_manual_completion": goal.allow_manual_completion,
            "track_activities": goal.track_activities,
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "paused": bool(getattr(goal, 'paused', False)),
            "paused_at": format_utc(getattr(goal, 'paused_at', None)),
            "associated_activity_ids": [a.id for a in goal.associated_activities] if goal.associated_activities else [],
            "associated_activity_group_ids": [g.id for g in goal.associated_activity_groups] if goal.associated_activity_groups else [],
            "progress_settings": getattr(goal, 'progress_settings', None),
        },
        "children": []
    }
    
    # Attach level characteristics if level is loaded
    level = getattr(goal, 'level', None)
    if level:
        result["level_characteristics"] = {
            "can_have_targets": getattr(level, 'can_have_targets', True),
            "deadline_min_value": level.deadline_min_value,
            "deadline_min_unit": level.deadline_min_unit,
            "deadline_max_value": level.deadline_max_value,
            "deadline_max_unit": level.deadline_max_unit,
            "max_children": level.max_children,
            "auto_complete_when_children_done": getattr(level, 'auto_complete_when_children_done', False),
            "description_required": getattr(level, 'description_required', False),
            "default_deadline_offset_value": level.default_deadline_offset_value,
            "default_deadline_offset_unit": level.default_deadline_offset_unit,
            "sort_children_by": level.sort_children_by,
            "allow_manual_completion": level.allow_manual_completion,
            "requires_smart": getattr(level, 'requires_smart', False),
        }
    
    if include_children:
        result["children"] = [serialize_goal(child) for child in goal.children if child.deleted_at is None]
        
    return result

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

def serialize_user(user):
    """Serialize a User object."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
        "role": getattr(user, "role", "user") or "user",
        "is_admin": bool(getattr(user, "is_admin", False)),
        "preferences": _safe_load_json(user.preferences, {}),
        "must_change_password": _must_change_password(user),
        "membership_tier": getattr(user, "membership_tier", DEFAULT_ACCOUNT_TIER) or DEFAULT_ACCOUNT_TIER,
        "subscription_status": getattr(user, "subscription_status", "none") or "none",
        "paid_amount_cad_cents": getattr(user, "paid_amount_cad_cents", None),
        "storage_limit_bytes": getattr(user, "storage_limit_bytes", None),
        "last_login_at": format_utc(getattr(user, "last_login_at", None)),
        "created_at": format_utc(user.created_at)
    }

def serialize_activity_group(group):
    """Serialize an ActivityGroup object."""
    return {
        "id": group.id,
        "root_id": group.root_id,
        "name": group.name,
        "description": group.description,
        "sort_order": group.sort_order,
        "parent_id": group.parent_id,
        "created_at": format_utc(group.created_at),
        "associated_goal_ids": [g.id for g in group.associated_goals] if group.associated_goals else []
    }

def serialize_activity_definition(activity):
    """Serialize an ActivityDefinition object."""
    return {
        "id": activity.id,
        "name": activity.name,
        "description": activity.description,
        "group_id": activity.group_id,
        "has_sets": activity.has_sets,
        "has_metrics": activity.has_metrics,
        "metrics_multiplicative": activity.metrics_multiplicative,
        "has_splits": activity.has_splits,
        "track_progress": activity.track_progress,
        "progress_aggregation": activity.progress_aggregation,
        "delta_display_mode": activity.delta_display_mode,
        "active_progress_view_id": getattr(activity, 'active_progress_view_id', None),
        "tags": [
            serialize_activity_tag(tag)
            for tag in (getattr(activity, 'tags', None) or [])
            if tag.deleted_at is None
        ],
        "created_at": format_utc(activity.created_at),
        "metric_definitions": [serialize_metric_definition(m) for m in activity.metric_definitions if not m.deleted_at],
        "split_definitions": [serialize_split_definition(s) for s in activity.split_definitions if not s.deleted_at],
        "associated_goal_ids": [g.id for g in activity.associated_goals] if activity.associated_goals else [],
        "associated_goals": [{"id": g.id, "name": g.name, "type": get_canonical_goal_type(g)} for g in activity.associated_goals] if activity.associated_goals else []
    }

def serialize_metric_definition(metric):
    """Serialize a MetricDefinition object, joining through to the fractal metric when available."""
    fm = getattr(metric, 'fractal_metric', None)
    # Derive name/unit/is_multiplicative from fractal metric if linked, else fall back to own columns
    name = fm.name if fm else metric.name
    unit = fm.unit if fm else metric.unit
    is_multiplicative = fm.is_multiplicative if fm else metric.is_multiplicative
    return {
        "id": metric.id,
        "fractal_metric_id": metric.fractal_metric_id,
        "name": name,
        "unit": unit,
        "is_active": metric.is_active,
        "is_best_set_metric": metric.is_best_set_metric,
        "is_multiplicative": is_multiplicative,
        "track_progress": metric.track_progress,
        "progress_aggregation": metric.progress_aggregation,
        # Extra fields from fractal metric (None when not linked)
        "is_additive": fm.is_additive if fm else None,
        "input_type": fm.input_type if fm else "number",
        "default_value": fm.default_value if fm else None,
        "higher_is_better": fm.higher_is_better if fm else None,
        "default_progress_aggregation": fm.default_progress_aggregation if fm else None,
        "predefined_values": fm.predefined_values if fm else None,
        "min_value": fm.min_value if fm else None,
        "max_value": fm.max_value if fm else None,
    }

def serialize_split_definition(split):
    """Serialize a SplitDefinition object."""
    return {
        "id": split.id,
        "name": split.name,
        "order": split.order
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

def serialize_program(program, *, scope=None, as_of=None):
    """Serialize a Program object."""
    # Build weekly_schedule from relational blocks (Source of Truth)
    schedule_from_db = [serialize_program_block(b) for b in (program.blocks or [])]
    today = as_of or date.today()
    start_date = getattr(program, 'start_date', None)
    end_date = getattr(program, 'end_date', None)
    start_day = start_date.date() if hasattr(start_date, 'date') else start_date
    end_day = end_date.date() if hasattr(end_date, 'date') else end_date
    is_active = bool(start_day and end_day and start_day <= today <= end_day)

    return {
        "id": program.id,
        "root_id": program.root_id,
        "name": program.name,
        "description": program.description,
        "color": getattr(program, 'color', None),
        "is_active": is_active,
        "is_completed": program.is_completed,
        "goals_completed": program.goals_completed,
        "goals_total": program.goals_total,
        "completion_percentage": program.completion_percentage,
        "start_date": format_utc(program.start_date),
        "end_date": format_utc(program.end_date),
        "weekly_schedule": schedule_from_db or _safe_load_json(program.weekly_schedule, []),
        "blocks": schedule_from_db,
        "goal_ids": [g.id for g in (program.goals or [])],
        "selected_goals": [g.id for g in (program.goals or [])],  # Keep both for safety
        "scope_seed_goal_ids": sorted(getattr(scope, "seed_goal_ids", ()) or ()),
        "scope_goal_ids": sorted(getattr(scope, "goal_ids", ()) or ()),
        "created_at": format_utc(program.created_at),
        "updated_at": format_utc(program.updated_at)
    }

def serialize_program_block(block):
    """Serialize a ProgramBlock object."""
    block_goal_ids = [g.id for g in (block.goals or [])]
    program_goal_ids = [g.id for g in (block.program.goals or [])] if getattr(block, 'program', None) else []
    return {
        "id": block.id,
        "program_id": block.program_id,
        "name": block.name,
        "start_date": format_utc(block.start_date),
        "end_date": format_utc(block.end_date),
        "color": block.color,
        "is_completed": block.is_completed,
        "goal_ids": block_goal_ids,
        "program_goal_ids": program_goal_ids,
        "days": [serialize_program_day(d) for d in block.days]
    }

def serialize_program_day(day):
    """Serialize a ProgramDay object."""
    template_rules = {
        link.session_template_id: {
            "is_required": bool(link.is_required),
            "order": link.order or 0,
        }
        for link in (getattr(day, 'template_links', None) or [])
    }
    serialized_templates = []
    for index, template in enumerate(day.templates or []):
        template_payload = serialize_session_template(template)
        template_rule = template_rules.get(template.id, {})
        template_payload["is_required"] = template_rule.get("is_required", True)
        template_payload["order"] = template_rule.get("order", index)
        serialized_templates.append(template_payload)

    return {
        "id": day.id,
        "block_id": day.block_id,
        "day_number": day.day_number,
        "name": day.name,
        "notes": day.notes,
        "date": format_utc(day.date),
        "day_of_week": day.day_of_week or [],
        "templates": serialized_templates,
        "goal_ids": [g.id for g in (day.goals or [])],
        "is_completed": day.is_completed,
        "completion_min_templates": getattr(day, 'completion_min_templates', None),
        "sessions": [serialize_program_day_session_light(s) for s in day.completed_sessions if not s.deleted_at],
        "day_sessions": [{
            "id": ds.id,
            "session_template_id": ds.session_template_id,
            "session_id": ds.session_id,
            "execution_status": ds.execution_status,
            "created_at": format_utc(ds.created_at)
        } for ds in (day.day_sessions or [])]
    }

def serialize_note(note):
    """Serialize a Note object."""
    note_kind = getattr(note, "note_kind", None)
    activity_set = getattr(note, "activity_set", None)
    set_index = activity_set.sort_order if activity_set is not None else None
    resolved_note_type = derive_note_type(
        note.context_type,
        set_index,
        note_kind=note_kind,
        activity_set_id=getattr(note, "activity_set_id", None),
    )
    result = {
        "id": note.id,
        "context_type": note.context_type,
        "context_id": note.context_id,
        "session_id": note.session_id,
        "activity_instance_id": note.activity_instance_id,
        "activity_definition_id": note.activity_definition_id,
        "set_index": set_index,
        "activity_set_id": getattr(note, "activity_set_id", None),
        "content": note.content,
        "note_kind": note_kind,
        "note_type": resolved_note_type,
        "note_type_label": note_type_label(resolved_note_type),
        "created_at": format_utc(note.created_at),
        "updated_at": format_utc(note.updated_at),
        "goal_id": note.goal_id,
        "pinned_at": format_utc(note.pinned_at) if note.pinned_at else None,
        "is_pinned": note.pinned_at is not None,
    }
    return result


def derive_note_type(context_type, set_index=None, note_kind=None, activity_set_id=None):
    """Derive a semantic note type from the stored note context."""
    if context_type == "goal" and note_kind == "goal_completion":
        return "goal_completion_note"
    if context_type == "root":
        return "fractal_note"
    if context_type == "goal":
        return "goal_note"
    if context_type == "session":
        return "session_note"
    if context_type == "program":
        return "program_note"
    if context_type == "activity_definition":
        return "activity_definition_note"
    if context_type == "activity_instance":
        return "activity_set_note" if set_index is not None or activity_set_id else "activity_instance_note"
    if context_type == "circuit_run":
        return "circuit_run_note"
    if context_type == "circuit_round":
        return "circuit_round_note"
    return "note"


def note_type_label(note_type):
    labels = {
        "fractal_note": "Fractal Note",
        "goal_note": "Goal Note",
        "session_note": "Session Note",
        "program_note": "Program Note",
        "activity_instance_note": "Activity Instance Note",
        "activity_set_note": "Activity Set Note",
        "activity_definition_note": "Activity Definition Note",
        "circuit_run_note": "Activity Circuit Note",
        "circuit_round_note": "Circuit Round Note",
        "goal_completion_note": "Goal Completion Note",
        "note": "Note",
    }
    return labels.get(note_type, "Note")


def serialize_note_display(note):
    """Serialize a note with the display context used on note-dedicated surfaces."""
    result = serialize_note(note)

    if note.session:
        result["session_name"] = note.session.name
        result["session_date"] = format_utc(note.session.session_start or note.session.created_at)
        session_attrs = _safe_load_json(getattr(note.session, "attributes", None), {})
        session_data = session_attrs.get("session_data") if isinstance(session_attrs, dict) else {}
        if not isinstance(session_data, dict):
            session_data = {}
        template_name = get_session_template_name(note.session)
        result["session_template_name"] = template_name or note.session.name
        template_color = get_session_template_color(note.session)
        if template_color:
            result["session_template_color"] = template_color

    display_goal = note.goal
    if display_goal:
        result["goal_name"] = display_goal.name
        result["goal_type"] = get_canonical_goal_type(display_goal)
        result["goal_is_smart"] = bool(all(calculate_smart_status(display_goal).values()))

    if note.activity_definition:
        result["activity_definition_name"] = note.activity_definition.name

    return result

def serialize_analytics_dashboard(dashboard):
    """Serialize an AnalyticsDashboard object."""
    return {
        "id": dashboard.id,
        "root_id": dashboard.root_id,
        "user_id": dashboard.user_id,
        "name": dashboard.name,
        "kind": dashboard.kind or "dashboard",
        "layout": dashboard.layout,
        "created_at": format_utc(dashboard.created_at),
        "updated_at": format_utc(dashboard.updated_at),
    }

def serialize_page_surface_layout(layout):
    """Serialize a PageSurfaceLayout object."""
    return {
        "id": layout.id,
        "root_id": layout.root_id,
        "user_id": layout.user_id,
        "page": layout.page,
        "name": layout.name,
        "is_default": bool(layout.is_default),
        "desktop_config": layout.desktop_config,
        "mobile_config": layout.mobile_config,
        "created_at": format_utc(layout.created_at),
        "updated_at": format_utc(layout.updated_at),
    }

def serialize_event_log(log):
    """Serialize an EventLog object."""
    return {
        "id": log.id,
        "event_type": log.event_type,
        "entity_type": log.entity_type,
        "entity_id": log.entity_id,
        "description": log.description,
        "payload": log.payload,
        "source": log.source,
        "timestamp": format_utc(log.timestamp)
    }
