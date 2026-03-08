from services.serializers import (
    calculate_smart_status,
    format_utc,
    serialize_activity_instance,
    serialize_goal,
    serialize_note,
)


def serialize_fractal_summary(root, last_activity):
    level_name = root.level.name if getattr(root, 'level', None) else "Ultimate Goal"
    return {
        "id": root.id,
        "name": root.name,
        "description": root.description,
        "type": level_name.replace(" ", ""),
        "created_at": format_utc(root.created_at),
        "updated_at": format_utc(last_activity),
        "is_smart": all(calculate_smart_status(root).values()),
    }


def serialize_goal_selection_item(short_term_goal, active_children):
    return {
        "id": short_term_goal.id,
        "name": short_term_goal.name,
        "description": short_term_goal.description,
        "deadline": format_utc(short_term_goal.deadline),
        "completed": short_term_goal.completed,
        "immediateGoals": [serialize_goal(child, include_children=False) for child in active_children],
    }


def serialize_goal_target_evaluation_result(goal, *, targets_evaluated, targets_completed, newly_completed_targets, goal_completed):
    return {
        "goal": serialize_goal(goal, include_children=False),
        "targets_evaluated": targets_evaluated,
        "targets_completed": targets_completed,
        "newly_completed_targets": list(newly_completed_targets),
        "goal_completed": goal_completed,
    }


def serialize_previous_session_notes_group(session, notes):
    return {
        'session_id': session.id,
        'session_name': session.name,
        'session_date': format_utc(session.session_start or session.created_at),
        'notes': [serialize_note(note) for note in notes],
    }


def serialize_activity_history_entry(instance, notes):
    payload = serialize_activity_instance(instance)
    if instance.session:
        payload['session_name'] = instance.session.name
        payload['session_date'] = format_utc(instance.session.session_start or instance.session.created_at)
    payload['notes'] = [serialize_note(note) for note in notes]
    return payload


def serialize_note_with_session(note):
    payload = serialize_note(note)
    if note.session:
        payload['session_name'] = note.session.name
        payload['session_date'] = format_utc(note.session.session_start or note.session.created_at)
    return payload


def serialize_goal_session_analytics_row(*, session_id, session_name, duration_seconds, completed, session_start):
    return {
        "session_id": session_id,
        "session_name": session_name,
        "duration_seconds": duration_seconds,
        "completed": completed,
        "session_start": format_utc(session_start),
    }


def serialize_goal_activity_breakdown_item(*, activity_id, activity_name, instance_count, total_duration_seconds):
    return {
        "activity_id": activity_id,
        "activity_name": activity_name,
        "instance_count": instance_count,
        "total_duration_seconds": total_duration_seconds,
    }


def serialize_goal_session_duration_item(*, date, duration_seconds, session_name):
    return {
        "date": date,
        "duration_seconds": duration_seconds,
        "session_name": session_name,
    }


def serialize_goal_activity_duration_item(*, date, duration_seconds, activity_name):
    return {
        "date": date,
        "duration_seconds": duration_seconds,
        "activity_name": activity_name,
    }


def serialize_goal_analytics_goal(
    goal,
    *,
    age_days,
    total_duration_seconds,
    session_count,
    activity_breakdown,
    session_durations_by_date,
    activity_durations_by_date,
):
    return {
        "id": goal.id,
        "name": goal.name,
        "type": goal.level.name.replace(" ", "") if getattr(goal, "level", None) else "Goal",
        "description": goal.description,
        "completed": goal.completed,
        "completed_at": format_utc(goal.completed_at),
        "created_at": format_utc(goal.created_at),
        "deadline": format_utc(goal.deadline),
        "parent_id": goal.parent_id,
        "age_days": age_days,
        "total_duration_seconds": total_duration_seconds,
        "session_count": session_count,
        "activity_breakdown": list(activity_breakdown),
        "session_durations_by_date": list(session_durations_by_date),
        "activity_durations_by_date": list(activity_durations_by_date),
    }


def serialize_goal_analytics_payload(summary, goals):
    return {
        "summary": dict(summary),
        "goals": list(goals),
    }


def serialize_session_goals_view_payload(
    *,
    goal_tree,
    session_goal_ids,
    session_goal_sources,
    session_activity_ids,
    activity_goal_ids_by_activity,
    micro_goals,
):
    return {
        "goal_tree": goal_tree,
        "session_goal_ids": list(session_goal_ids),
        "session_goal_sources": dict(session_goal_sources),
        "session_activity_ids": list(session_activity_ids),
        "activity_goal_ids_by_activity": dict(activity_goal_ids_by_activity),
        "micro_goals": [serialize_goal(goal) for goal in micro_goals],
    }
