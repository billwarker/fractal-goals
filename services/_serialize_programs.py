"""Serializers for programs, program blocks, and program days.
"""

from datetime import date
from models import _safe_load_json
from services._serialize_common import format_utc
from services._serialize_sessions import (
    serialize_program_day_session_light,
    serialize_session_template,
)


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
        link.session_template_id: {"is_required": bool(link.is_required), "order": link.order or 0}
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
        "completion_min_templates": getattr(day, 'completion_min_templates', None),
        "sessions": [serialize_program_day_session_light(s) for s in day.completed_sessions if not s.deleted_at],
        "scheduled_dates": [format_utc(row.date) for row in (day.occurrence_schedules or [])],
    }
