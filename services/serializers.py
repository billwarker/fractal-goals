import copy
from datetime import datetime, timezone, date
import json
from models import _safe_load_json
from .goal_type_utils import get_canonical_goal_type
from .goal_domain_rules import goal_uses_child_completion
from .session_runtime import get_template_color, get_template_session_type

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

def serialize_activity_mode(mode):
    """Serialize an ActivityMode object."""
    return {
        "id": mode.id,
        "root_id": mode.root_id,
        "name": mode.name,
        "description": mode.description,
        "color": mode.color,
        "sort_order": mode.sort_order,
        "created_at": format_utc(mode.created_at),
        "updated_at": format_utc(mode.updated_at),
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
        "sort_order": metric.sort_order,
        "activity_count": getattr(metric, '_activity_count', 0),
        "created_at": format_utc(metric.created_at),
        "updated_at": format_utc(metric.updated_at),
    }

def serialize_activity_instance(instance):
    """Serialize an ActivityInstance object."""
    data_dict = _safe_load_json(instance.data, {})
    metric_values_list = [serialize_metric_value(m) for m in instance.metric_values]
    modes = [
        serialize_activity_mode(mode)
        for mode in (getattr(instance, 'modes', None) or [])
        if getattr(mode, 'deleted_at', None) is None
    ]
    
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
        "is_paused": getattr(instance, 'is_paused', False),
        "last_paused_at": format_utc(getattr(instance, 'last_paused_at', None)),
        "total_paused_seconds": getattr(instance, 'total_paused_seconds', 0),
        "completed": instance.completed,
        "notes": instance.notes,
        "sets": data_dict.get('sets', []),
        "data": data_dict,
        "modes": modes,
        "mode_ids": [mode["id"] for mode in modes],
        "metric_values": metric_values_list,
        "metrics": metric_values_list  # Frontend alias
    }


def _active_session_instances(session):
    return [
        instance
        for instance in (getattr(session, "activity_instances", None) or [])
        if getattr(instance, "deleted_at", None) is None
    ]

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
        "completed_session_id": getattr(goal, 'completed_session_id', None),
        "is_smart": all(smart_status.values()),
        "smart_status": smart_status,
        "frozen": bool(getattr(goal, 'frozen', False)),
        "frozen_at": format_utc(getattr(goal, 'frozen_at', None)),
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
            "created_at": format_utc(goal.created_at),
            "updated_at": format_utc(goal.updated_at),
            "targets": [serialize_target(t) for t in (goal.targets_rel or []) if t.deleted_at is None],
            "relevance_statement": goal.relevance_statement,
            "completed_via_children": goal.completed_via_children,
            "inherit_parent_activities": goal.inherit_parent_activities,
            "allow_manual_completion": goal.allow_manual_completion,
            "track_activities": goal.track_activities,
            "frozen": bool(getattr(goal, 'frozen', False)),
            "frozen_at": format_utc(getattr(goal, 'frozen_at', None)),
            "is_smart": all(smart_status.values()),
            "smart_status": smart_status,
            "associated_activity_ids": [a.id for a in goal.associated_activities] if goal.associated_activities else [],
            "associated_activity_group_ids": [g.id for g in goal.associated_activity_groups] if goal.associated_activity_groups else [],
            "session_id": goal.sessions[0].id if goal.sessions else None,
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
    active_instances = _active_session_instances(session)
    template_payload = _safe_load_json(getattr(getattr(session, "template", None), "template_data", None), {})
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
        "activity_instances": [serialize_activity_instance(inst) for inst in active_instances],
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
        "is_paused": getattr(session, 'is_paused', False),
        "last_paused_at": format_utc(getattr(session, 'last_paused_at', None)),
        "total_paused_seconds": getattr(session, 'total_paused_seconds', 0),
        "completed": session.completed,
    }
    
    # Merge existing attributes:
    # 1. If 'session_data' key exists in attrs, merge its contents
    # 2. Otherwise merge the attrs themselves (legacy support)
    if attrs:
        if "session_data" in attrs and isinstance(attrs["session_data"], dict):
            session_data.update(copy.deepcopy(attrs["session_data"]))
        else:
            session_data.update(copy.deepcopy(attrs))
            
        # Ensure top-level attributes dict has all keys for flexibility
        for k, v in attrs.items():
            if k not in result["attributes"]:
                result["attributes"][k] = copy.deepcopy(v)

    if isinstance(template_payload, dict):
        if not session_data.get("template_name") and getattr(getattr(session, "template", None), "name", None):
            session_data["template_name"] = session.template.name
        if not session_data.get("template_color"):
            fallback_color = get_template_color(template_payload)
            if fallback_color:
                session_data["template_color"] = fallback_color
        if not session_data.get("session_type"):
            session_data["session_type"] = get_template_session_type(template_payload)
                
    result["attributes"]["session_data"] = session_data
    result["session_type"] = get_template_session_type(session_data)
    result["template_color"] = get_template_color(session_data)

    # Hydrate section activity ordering + exercises from database ActivityInstances.
    # SessionDetail renders from section.activity_ids, so normalize legacy shapes too.
    session_sections = result["attributes"]["session_data"].get("sections")
    if isinstance(session_sections, list):
        instance_map = {inst.id: inst for inst in active_instances}
        remaining_ids = [inst.id for inst in active_instances]
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
        for inst in active_instances:
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
        result["micro_goals"] = [serialize_goal(g, include_children=False) for g in goals_source if get_type(g) == 'MicroGoal']
    else:
        result["short_term_goals"] = []
        result["immediate_goals"] = []
        result["micro_goals"] = []

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
        "is_top_set_metric": metric.is_top_set_metric,
        "is_multiplicative": is_multiplicative,
        # Extra fields from fractal metric (None when not linked)
        "is_additive": fm.is_additive if fm else None,
        "input_type": fm.input_type if fm else "number",
        "default_value": fm.default_value if fm else None,
        "higher_is_better": fm.higher_is_better if fm else None,
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
    return {
        "id": template.id, 
        "name": template.name, 
        "description": getattr(template, 'description', '') or '',
        "root_id": getattr(template, 'root_id', None),
        "template_data": template_data,
        "session_type": get_template_session_type(template_data),
        "template_color": get_template_color(template_data),
        "created_at": format_utc(getattr(template, 'created_at', None)),
        "updated_at": format_utc(getattr(template, 'updated_at', None)),
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
        "goal_ids": block_goal_ids,
        "program_goal_ids": program_goal_ids,
        "days": [serialize_program_day(d) for d in block.days]
    }

def serialize_program_day(day):
    """Serialize a ProgramDay object."""
    # note_condition_satisfied: True if any note was written during a completed session on this day
    note_condition = bool(getattr(day, 'note_condition', False))
    note_condition_satisfied = False
    if note_condition:
        session_ids = {s.id for s in (day.completed_sessions or []) if not s.deleted_at}
        if session_ids:
            note_condition_satisfied = any(
                hasattr(s, 'notes_list') and len([
                    n for n in (s.notes_list or []) if not n.deleted_at
                ]) > 0
                for s in (day.completed_sessions or [])
                if not s.deleted_at
            )

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
        "note_condition": note_condition,
        "note_condition_satisfied": note_condition_satisfied,
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
    resolved_note_type = derive_note_type(
        note.context_type,
        note.set_index,
        is_nano_goal=note.nano_goal_id is not None,
    )
    result = {
        "id": note.id,
        "context_type": note.context_type,
        "context_id": note.context_id,
        "session_id": note.session_id,
        "activity_instance_id": note.activity_instance_id,
        "activity_definition_id": note.activity_definition_id,
        "set_index": note.set_index,
        "content": note.content,
        "note_type": resolved_note_type,
        "note_type_label": note_type_label(resolved_note_type),
        "has_image": note.image_data is not None and len(note.image_data) > 0,
        "created_at": format_utc(note.created_at),
        "updated_at": format_utc(note.updated_at),
        "nano_goal_id": note.nano_goal_id,
        "is_nano_goal": note.nano_goal_id is not None,
        "nano_goal_completed": note.nano_goal.completed if getattr(note, 'nano_goal', None) else False,
        "goal_id": note.goal_id,
        "pinned_at": format_utc(note.pinned_at) if note.pinned_at else None,
        "is_pinned": note.pinned_at is not None,
    }
    if include_image:
        result["image_data"] = note.image_data
    return result


def derive_note_type(context_type, set_index=None, *, is_nano_goal=False):
    """Derive a semantic note type from the stored note context."""
    if is_nano_goal:
        return "goal_note"
    if context_type == "root":
        return "fractal_note"
    if context_type == "goal":
        return "goal_note"
    if context_type == "session":
        return "session_note"
    if context_type == "activity_definition":
        return "activity_definition_note"
    if context_type == "activity_instance":
        return "activity_set_note" if set_index is not None else "activity_instance_note"
    return "note"


def note_type_label(note_type):
    labels = {
        "fractal_note": "Fractal Note",
        "goal_note": "Goal Note",
        "session_note": "Session Note",
        "activity_instance_note": "Activity Instance Note",
        "activity_set_note": "Activity Set Note",
        "activity_definition_note": "Activity Definition Note",
        "note": "Note",
    }
    return labels.get(note_type, "Note")


def serialize_note_display(note, include_image=False):
    """Serialize a note with the display context used on note-dedicated surfaces."""
    result = serialize_note(note, include_image=include_image)

    if note.session:
        result["session_name"] = note.session.name
        result["session_date"] = format_utc(note.session.session_start or note.session.created_at)
        session_attrs = _safe_load_json(getattr(note.session, "attributes", None), {})
        session_data = session_attrs.get("session_data") if isinstance(session_attrs, dict) else {}
        if not isinstance(session_data, dict):
            session_data = {}
        template_name = session_data.get("template_name")
        if not template_name and getattr(getattr(note.session, "template", None), "name", None):
            template_name = note.session.template.name
        result["session_template_name"] = template_name or note.session.name

    if note.goal:
        result["goal_name"] = note.goal.name
        result["goal_type"] = get_canonical_goal_type(note.goal)
        result["goal_is_smart"] = bool(all(calculate_smart_status(note.goal).values()))

    if note.nano_goal:
        result["goal_name"] = note.nano_goal.name
        result["goal_type"] = get_canonical_goal_type(note.nano_goal) or "NanoGoal"
        result["goal_is_smart"] = bool(all(calculate_smart_status(note.nano_goal).values()))

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
        "layout": dashboard.layout,
        "created_at": format_utc(dashboard.created_at),
        "updated_at": format_utc(dashboard.updated_at),
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
