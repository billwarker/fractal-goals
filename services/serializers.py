from datetime import datetime, timezone, date
import json
from models import _safe_load_json

def format_utc(dt):
    """Format a datetime or date object to ISO string."""
    if not dt: return None
    if isinstance(dt, date) and not isinstance(dt, datetime):
        return dt.isoformat()
    if dt.tzinfo is None:
        return dt.isoformat(timespec='seconds') + 'Z'
    return dt.astimezone(timezone.utc).isoformat(timespec='seconds').replace('+00:00', 'Z')

def calculate_smart_status(goal):
    """Calculate SMART criteria status for a goal."""
    targets = _safe_load_json(goal.targets, [])
    if not isinstance(targets, list):
        targets = []
    
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
        "time_bound": goal.deadline is not None
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
    
    return {
        "id": instance.id,
        "session_id": instance.session_id,
        "practice_session_id": instance.practice_session_id,  # Legacy support
        "activity_definition_id": instance.activity_definition_id,
        "name": instance.definition.name if instance.definition else "Unknown",
        "definition_name": instance.definition.name if instance.definition else "Unknown",
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
    
    result = {
        "name": goal.name,
        "id": goal.id,
        "description": goal.description,
        "deadline": goal.deadline.isoformat() if goal.deadline else None,
        "attributes": {
            "id": goal.id,
            "type": goal.type,
            "parent_id": goal.parent_id,
            "root_id": goal.root_id,
            "owner_id": goal.owner_id,
            "description": goal.description,
            "deadline": goal.deadline.isoformat() if goal.deadline else None,
            "completed": goal.completed,
            "completed_at": format_utc(goal.completed_at),
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "targets": _safe_load_json(goal.targets, []),
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
    
    if include_children:
        result["children"] = [serialize_goal(child) for child in goal.children]
        
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

    # Hydrate "exercises" from database ActivityInstances
    if "sections" in attrs:
        # We assume session.activity_instances is populated
        instance_map = {inst.id: inst for inst in session.activity_instances}
        for section in attrs["sections"]:
            if "activity_ids" in section:
                activity_ids = section["activity_ids"]
                exercises = []
                for inst_id in activity_ids:
                    if inst_id in instance_map:
                        inst = instance_map[inst_id]
                        # Use logic from serialize_activity_instance but modified for this structure
                        ex = serialize_activity_instance(inst)
                        ex['type'] = 'activity'
                        ex['instance_id'] = inst.id
                        ex['activity_id'] = inst.activity_definition_id
                        ex['has_sets'] = len(ex.get('sets', [])) > 0
                        exercises.append(ex)
                section["exercises"] = exercises
    
    # Hydrate goals based on type
    if hasattr(session, 'goals') and session.goals:
        result["short_term_goals"] = [serialize_goal(g, include_children=False) for g in session.goals if g.type == 'ShortTermGoal']
        result["immediate_goals"] = [serialize_goal(g, include_children=False) for g in session.goals if g.type == 'ImmediateGoal']
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

def serialize_user(user):
    """Serialize a User object."""
    return {
        "id": user.id,
        "username": user.username,
        "email": user.email,
        "is_active": user.is_active,
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
        "associated_goal_ids": [g.id for g in activity.associated_goals] if activity.associated_goals else []
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
        "template_data": _safe_load_json(template.template_data, {})
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
        "start_date": format_utc(program.start_date),
        "end_date": format_utc(program.end_date),
        "weekly_schedule": schedule_from_db or _safe_load_json(program.weekly_schedule, []),
        "blocks": schedule_from_db,
        "goal_ids": _safe_load_json(program.goal_ids, []),
        "selected_goals": _safe_load_json(program.goal_ids, []),  # Keep both for safety
        "created_at": format_utc(program.created_at),
        "updated_at": format_utc(program.updated_at)
    }

def serialize_program_block(block):
    """Serialize a ProgramBlock object."""
    return {
        "id": block.id,
        "program_id": block.program_id,
        "name": block.name,
        "start_date": format_utc(block.start_date),
        "end_date": format_utc(block.end_date),
        "color": block.color,
        "goal_ids": _safe_load_json(block.goal_ids, []),
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
        "sessions": [serialize_session(s) for s in day.completed_sessions if not s.deleted_at]
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
        "updated_at": format_utc(note.updated_at)
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
