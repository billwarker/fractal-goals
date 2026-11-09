"""Validation of a note's target: one rule per context type, shared by create paths."""
from models import ActivityDefinition, ActivityInstance, CircuitRound, CircuitRun, Goal, Program, Session
from services.note_program_dates import validate_program_date_note
from services.service_types import JsonDict


def validate_note_context(
    db_session,
    *,
    root_id,
    context_type,
    context_id,
    session_id,
    activity_instance_id,
    activity_definition_id,
    goal_id,
    calendar_date=None,
) -> tuple[JsonDict | None, tuple[str, int] | None]:
    """Check a note's target belongs to this fractal and its links fit its context type."""
    activity = None
    if activity_definition_id:
        activity = db_session.query(ActivityDefinition).filter(
            ActivityDefinition.id == activity_definition_id,
            ActivityDefinition.root_id == root_id,
            ActivityDefinition.deleted_at.is_(None),
        ).first()
        if not activity:
            return None, ("Activity definition not found in this fractal", 400)

    if context_type == 'root':
        if context_id != root_id:
            return None, ("root notes must use the fractal root id as context_id", 400)
        if session_id or activity_instance_id or goal_id or activity_definition_id:
            return None, ("root notes cannot be linked to a goal, session, or activity", 400)
        return {'activity_definition': activity}, None

    if context_type == 'goal':
        if not goal_id or context_id != goal_id:
            return None, ("goal notes require matching context_id and goal_id", 400)
        linked_goal = db_session.query(Goal).filter(
            Goal.id == goal_id,
            Goal.root_id == root_id,
            Goal.deleted_at.is_(None),
        ).first()
        if not linked_goal:
            return None, ("Goal not found in this fractal", 400)
        if session_id or activity_instance_id:
            return None, ("goal notes cannot be linked directly to a session or activity instance", 400)
        return {'goal': linked_goal, 'activity_definition': activity}, None

    if context_type == 'session':
        if not session_id or context_id != session_id:
            return None, ("session notes require matching context_id and session_id", 400)
        session_obj = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at.is_(None),
        ).first()
        if not session_obj:
            return None, ("Session not found in this fractal", 400)
        if activity_instance_id:
            return None, ("session notes cannot include activity_instance_id", 400)
        return {'session': session_obj, 'activity_definition': activity}, None

    if context_type == 'program':
        if not context_id:
            return None, ("program notes require a context_id", 400)
        program = db_session.query(Program).filter(
            Program.id == context_id,
            Program.root_id == root_id,
        ).first()
        if not program:
            return None, ("Program not found in this fractal", 400)
        if session_id or activity_instance_id or goal_id or activity_definition_id:
            return None, ("program notes cannot be linked to a goal, session, or activity", 400)
        return {'program': program}, None

    if context_type == 'program_date':
        if session_id or activity_instance_id or goal_id or activity_definition_id:
            return None, ("program date notes cannot be linked to a goal, session, or activity", 400)
        return validate_program_date_note(db_session, root_id, context_id, calendar_date)

    if context_type == 'activity_instance':
        if not activity_instance_id or context_id != activity_instance_id:
            return None, ("activity instance notes require matching context_id and activity_instance_id", 400)
        instance = db_session.query(ActivityInstance).filter(
            ActivityInstance.id == activity_instance_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
        ).first()
        if not instance:
            return None, ("Activity instance not found in this fractal", 400)
        if session_id and instance.session_id != session_id:
            return None, ("Activity instance does not belong to the provided session", 400)
        if activity and instance.activity_definition_id and instance.activity_definition_id != activity.id:
            return None, ("activity_definition_id does not match the activity instance", 400)
        return {'session': None, 'activity_definition': activity, 'activity_instance': instance}, None

    if context_type == 'activity_definition':
        if not activity_definition_id or context_id != activity_definition_id:
            return None, ("activity definition notes require matching context_id and activity_definition_id", 400)
        if session_id or activity_instance_id or goal_id:
            return None, ("activity definition notes cannot also target a session, instance, or goal", 400)
        return {'activity_definition': activity}, None

    if context_type == 'circuit_run':
        if not session_id or not context_id:
            return None, ("circuit run notes require a context_id and session_id", 400)
        if activity_instance_id or activity_definition_id or goal_id:
            return None, ("circuit run notes cannot also target an activity or goal", 400)
        circuit_run = db_session.query(CircuitRun).filter(
            CircuitRun.id == context_id,
            CircuitRun.root_id == root_id,
            CircuitRun.session_id == session_id,
        ).first()
        if not circuit_run:
            return None, ("Circuit run not found in the provided session", 400)
        return {'circuit_run': circuit_run}, None

    if context_type == 'circuit_round':
        if not session_id or not context_id:
            return None, ("circuit round notes require a context_id and session_id", 400)
        if activity_instance_id or activity_definition_id or goal_id:
            return None, ("circuit round notes cannot also target an activity or goal", 400)
        circuit_round = db_session.query(CircuitRound).join(CircuitRun).filter(
            CircuitRound.id == context_id,
            CircuitRun.root_id == root_id,
            CircuitRun.session_id == session_id,
        ).first()
        if not circuit_round:
            return None, ("Circuit round not found in the provided session", 400)
        return {'circuit_round': circuit_round}, None

    return None, ("Unsupported note context_type", 400)
