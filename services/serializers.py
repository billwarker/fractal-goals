from datetime import datetime, timezone, date
import json
from models import _safe_load_json
from .goal_type_utils import get_canonical_goal_type

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

def calculate_smart_status(goal):
    """Calculate SMART criteria status for a goal."""
    # Source of truth: relational targets.
    targets = [t for t in (goal.targets_rel or []) if t.deleted_at is None]
    
    # Achievable: has associated activities OR has associated activity groups OR completed via children
    if goal.track_activities:
        has_activities = len(goal.associated_activities) > 0 if goal.associated_activities else False
        has_groups = len(goal.associated_activity_groups) > 0 if goal.associated_activity_groups else False
        is_achievable = has_activities or has_groups or goal.completed_via_children
        is_measurable = len(targets) > 0 or goal.completed_via_children
    else:
        is_achievable = True
        is_measurable = True
    
    return {
        "specific": bool(goal.description and goal.description.strip()),
        "measurable": is_measurable,
        "achievable": is_achievable,
        "relevant": bool(goal.relevance_statement and goal.relevance_statement.strip()),
        "time_bound": goal.deadline is not None or get_canonical_goal_type(goal) in ['MicroGoal', 'NanoGoal']
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

def serialize_activity_instance(instance):
    """Serialize an ActivityInstance object."""
    data_dict = _safe_load_json(instance.data, {})
    metric_values_list = [serialize_metric_value(m) for m in instance.metric_values]
    
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
        "time_stop": format_utc(instance.time_stop),
        "duration_seconds": instance.duration_seconds,
        "completed": instance.completed,
        "notes": instance.notes,
        "sets": data_dict.get('sets', []),
        "data": data_dict,
        "metric_values": metric_values_list,
        "metrics": metric_values_list  # Frontend alias
    }

def serialize_goal(goal, include_children=True):
    """Serialize a Goal object."""
    smart_status = calculate_smart_status(goal)
    
    goal_type = get_canonical_goal_type(goal)
    goal_level_name = getattr(goal.level, 'name', None) if getattr(goal, 'level', None) else None
    
    result = {
        "name": goal.name,
        "id": goal.id,
        "type": goal_type,  # Hoist type to top level for frontend convenience
        "level_id": goal.level_id,
        "level_name": goal_level_name,
        "completed": goal.completed,
        "completed_at": format_utc(goal.completed_at),
        "is_smart": all(smart_status.values()),
        "smart_status": smart_status,
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
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "targets": [serialize_target(t) for t in (goal.targets_rel or []) if t.deleted_at is None],
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": goal.completed_via_children,
            "allow_manual_completion": goal.allow_manual_completion,
            "track_activities": goal.track_activities,
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "associated_activity_ids": [a.id for a in goal.associated_activities] if goal.associated_activities else [],
            "associated_activity_group_ids": [g.id for g in goal.associated_activity_groups] if goal.associated_activity_groups else [],
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

def serialize_session(session, include_image_data=False):
    """Serialize a Session object."""
    result = {
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
            "template_id": session.template_id,
            "completed": session.completed,
            "completed_at": format_utc(session.completed_at),
            "created_at": format_utc(session.created_at),
            "updated_at": format_utc(session.updated_at),
        },
        "activity_instances": [serialize_activity_instance(inst) for inst in session.activity_instances],
        "notes": [serialize_note(n, include_image=include_image_data) for n in session.notes_list if not n.deleted_at] if hasattr(session, 'notes_list') else []
    }
    
    # Parse session data from attributes
    attrs = _safe_load_json(session.attributes, {})
    
    # Initialize legacy session_data structure with canonical fields from DB
    session_data = {
        "session_start": format_utc(session.session_start),
        "session_end": format_utc(session.session_end),
        "duration_minutes": session.duration_minutes,
        "total_duration_seconds": session.total_duration_seconds,
        "completed": session.completed,
    }
    
    # Merge existing attributes:
    # 1. If 'session_data' key exists in attrs, merge its contents
    # 2. Otherwise merge the attrs themselves (legacy support)
    if attrs:
        if "session_data" in attrs and isinstance(attrs["session_data"], dict):
            session_data.update(attrs["session_data"])
        else:
            session_data.update(attrs)
            
        # Ensure top-level attributes dict has all keys for flexibility
        for k, v in attrs.items():
            if k not in result["attributes"]:
                result["attributes"][k] = v
                
    result["attributes"]["session_data"] = session_data

    # Hydrate section activity ordering + exercises from database ActivityInstances.
    # SessionDetail renders from section.activity_ids, so normalize legacy shapes too.
    session_sections = result["attributes"]["session_data"].get("sections")
    if isinstance(session_sections, list):
        instance_map = {inst.id: inst for inst in session.activity_instances}
        remaining_ids = [inst.id for inst in session.activity_instances]
        used_ids = set()

        def _extract_def_id(item):
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

        # Build definition -> instance ids map in creation order.
        ids_by_def = {}
        for inst in session.activity_instances:
            ids_by_def.setdefault(inst.activity_definition_id, []).append(inst.id)

        for section in session_sections:
            if not isinstance(section, dict):
                continue

            activity_ids = section.get("activity_ids") if isinstance(section.get("activity_ids"), list) else []
            normalized_ids = [iid for iid in activity_ids if iid in instance_map and iid not in used_ids]

            if not normalized_ids:
                raw_items = section.get("exercises") or section.get("activities") or []

                # Prefer explicit instance ids when provided.
                for item in raw_items:
                    if not isinstance(item, dict):
                        continue
                    iid = item.get("instance_id")
                    if iid in instance_map and iid not in used_ids and iid not in normalized_ids:
                        normalized_ids.append(iid)

                # Otherwise map template activity definitions to first unused instances.
                if not normalized_ids:
                    for item in raw_items:
                        def_id = _extract_def_id(item)
                        if not def_id:
                            continue
                        for iid in ids_by_def.get(def_id, []):
                            if iid not in used_ids and iid not in normalized_ids:
                                normalized_ids.append(iid)
                                break

                # Last-resort: if only one section, include all remaining instances.
                if not normalized_ids and len(session_sections) == 1:
                    normalized_ids = [iid for iid in remaining_ids if iid not in used_ids]

            section["activity_ids"] = normalized_ids
            for iid in normalized_ids:
                used_ids.add(iid)

            exercises = []
            for inst_id in normalized_ids:
                if inst_id in instance_map:
                    inst = instance_map[inst_id]
                    ex = serialize_activity_instance(inst)
                    ex['type'] = 'activity'
                    ex['instance_id'] = inst.id
                    ex['activity_id'] = inst.activity_definition_id
                    ex['has_sets'] = len(ex.get('sets', []) or []) > 0
                    ex['has_metrics'] = (len(ex.get('metrics', []) or []) > 0) or (len(ex.get('metric_values', []) or []) > 0)
                    exercises.append(ex)
            section["exercises"] = exercises
    
    # Hydrate goals based on type
    goals_source = getattr(session, '_derived_goals', None)
    if goals_source is None:
        goals_source = session.goals if hasattr(session, 'goals') else []

    if goals_source:
        def get_type(g):
            return get_canonical_goal_type(g)
            
        result["short_term_goals"] = [serialize_goal(g, include_children=False) for g in goals_source if get_type(g) == 'ShortTermGoal']
        result["immediate_goals"] = [serialize_goal(g, include_children=False) for g in goals_source if get_type(g) == 'ImmediateGoal']
    else:
        result["short_term_goals"] = []
        result["immediate_goals"] = []

    # Add Program Info if associated
    if hasattr(session, 'program_day') and session.program_day:
        day = session.program_day
        block = day.block if hasattr(day, 'block') else None
        if block:
            program = block.program if hasattr(block, 'program') else None
            if program:
                result["program_info"] = {
                    "program_id": program.id,
                    "program_name": program.name,
                    "block_id": block.id,
                    "block_name": block.name,
                    "day_id": day.id,
                    "day_name": day.name
                }
    
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
        "preferences": _safe_load_json(user.preferences, {}),
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
        "created_at": format_utc(activity.created_at),
        "metric_definitions": [serialize_metric_definition(m) for m in activity.metric_definitions],
        "split_definitions": [serialize_split_definition(s) for s in activity.split_definitions],
        "associated_goal_ids": [g.id for g in activity.associated_goals] if activity.associated_goals else [],
        "associated_goals": [{"id": g.id, "name": g.name, "type": get_canonical_goal_type(g)} for g in activity.associated_goals] if activity.associated_goals else []
    }

def serialize_metric_definition(metric):
    """Serialize a MetricDefinition object."""
    return {
        "id": metric.id, 
        "name": metric.name, 
        "unit": metric.unit, 
        "is_active": metric.is_active,
        "is_top_set_metric": metric.is_top_set_metric,
        "is_multiplicative": metric.is_multiplicative
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
    return {
        "id": template.id, 
        "name": template.name, 
        "template_data": _safe_load_json(template.template_data, {}),
        "created_at": format_utc(getattr(template, 'created_at', None)),
        "goals": [serialize_goal(g, include_children=False) for g in template.goals] if hasattr(template, 'goals') else []
    }

def serialize_program(program):
    """Serialize a Program object."""
    # Build weekly_schedule from relational blocks (Source of Truth)
    schedule_from_db = [serialize_program_block(b) for b in (program.blocks or [])]

    return {
        "id": program.id,
        "root_id": program.root_id,
        "name": program.name,
        "description": program.description,
        "is_active": program.is_active,
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
        "goal_ids": block_goal_ids or program_goal_ids,
        "days": [serialize_program_day(d) for d in block.days]
    }

def serialize_program_day(day):
    """Serialize a ProgramDay object."""
    return {
        "id": day.id,
        "block_id": day.block_id,
        "day_number": day.day_number,
        "name": day.name,
        "notes": day.notes,
        "date": format_utc(day.date),
        "day_of_week": day.day_of_week or [],
        "templates": [serialize_session_template(t) for t in day.templates],
        "is_completed": day.is_completed,
        "sessions": [serialize_program_day_session_light(s) for s in day.completed_sessions if not s.deleted_at],
        "day_sessions": [{
            "id": ds.id,
            "session_template_id": ds.session_template_id,
            "session_id": ds.session_id,
            "execution_status": ds.execution_status,
            "created_at": format_utc(ds.created_at)
        } for ds in (day.day_sessions or [])]
    }

def serialize_note(note, include_image=False):
    """Serialize a Note object."""
    result = {
        "id": note.id,
        "context_type": note.context_type,
        "context_id": note.context_id,
        "session_id": note.session_id,
        "activity_instance_id": note.activity_instance_id,
        "activity_definition_id": note.activity_definition_id,
        "set_index": note.set_index,
        "content": note.content,
        "has_image": note.image_data is not None and len(note.image_data) > 0,
        "created_at": format_utc(note.created_at),
        "updated_at": format_utc(note.updated_at),
        "nano_goal_id": note.nano_goal_id,
        "is_nano_goal": note.nano_goal_id is not None
    }
    if include_image:
        result["image_data"] = note.image_data
    return result

def serialize_visualization_annotation(annotation):
    """Serialize a VisualizationAnnotation object."""
    return {
        "id": annotation.id,
        "root_id": annotation.root_id,
        "visualization_type": annotation.visualization_type,
        "visualization_context": annotation.visualization_context,
        "selected_points": _safe_load_json(annotation.selected_points, []),
        "selection_bounds": _safe_load_json(getattr(annotation, 'selection_bounds', None), None),
        "content": annotation.content,
        "created_at": format_utc(annotation.created_at)
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
