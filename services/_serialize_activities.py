"""Serializers for activities, metrics, sets, targets, circuits, and work intervals.
"""

from models import _safe_load_json
from .goal_type_utils import get_canonical_goal_type
from .activity_progress_view_service import serialize_activity_tag
from services._serialize_common import format_utc, format_utc_precise


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
        "metrics": [serialize_metric_value(metric) for metric in sorted(
            activity_set.metric_values or [],
            key=lambda metric: (
                format_utc_precise(getattr(metric.definition, 'created_at', None)) or '',
                metric.metric_definition_id,
                metric.split_definition_id or '',
            ),
        )],
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
        "precision": metric.precision,
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
            if tag.deleted_at is None and not tag.catalog_archived
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
        "precision": fm.precision if fm else 2,
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
