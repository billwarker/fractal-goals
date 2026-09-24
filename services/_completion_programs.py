"""Goal completion propagation to parent goals and program progress.
"""

import logging
from datetime import datetime, timezone
from services.events import Events
from models import Goal
from services._completion_context import _build_event, _queue_event

logger = logging.getLogger(__name__)


def _check_parent_completion(db_session, parent: Goal, pending_events=None):
    """Check if a parent goal should be auto-completed based on children."""
    # Get all child goals
    children = db_session.query(Goal).filter(
        Goal.parent_id == parent.id,
        Goal.deleted_at == None
    ).all()
    
    if not children:
        return
    
    # Check if all children are completed
    all_completed = all(child.completed for child in children)
    
    if all_completed and not parent.completed:
        parent.completed = True
        parent.completed_at = datetime.now(timezone.utc)
        parent.completion_source = 'children'
        parent.completion_reason = 'all_children_completed'
        parent.manually_uncompleted_at = None
        logger.info(f"Auto-completing parent goal {parent.id} - all children complete")
        
        # Emit event for cascade
        _queue_event(pending_events, _build_event(Events.GOAL_COMPLETED, {
            'goal_id': parent.id,
            'goal_name': parent.name,
            'root_id': parent.root_id,
            'auto_completed': True,
            'reason': 'all_children_completed'
        }, db_session))


def _update_program_progress(db_session, goal: Goal, pending_events=None):
    """Update program completion percentage when a goal is completed."""
    from models import Program
    
    # Scope to the same fractal to avoid scanning unrelated blocks.
    goal_root_id = goal.root_id or goal.id
    programs_in_root = db_session.query(Program).filter(Program.root_id == goal_root_id).all()
    program_ids = {
        program.id
        for program in programs_in_root
        if goal.id in {g.id for g in (program.goals or [])}
    }

    if not program_ids:
        return

    programs = db_session.query(Program).filter(Program.id.in_(program_ids)).all()
    for program in programs:
        _recalculate_program_progress(db_session, program, pending_events=pending_events)


def _recalculate_program_progress(db_session, program, pending_events=None):
    """Recalculate the completion percentage for a program."""
    all_goal_ids = {g.id for g in (program.goals or [])}
    
    if not all_goal_ids:
        program.goals_completed = 0
        program.goals_total = 0
        program.completion_percentage = 0
        return
    
    # Count completed goals
    completed_count = db_session.query(Goal).filter(
        Goal.id.in_(all_goal_ids),
        Goal.completed == True,
        Goal.deleted_at == None
    ).count()
    
    total_count = len(all_goal_ids)
    
    # Update program fields
    program.goals_completed = completed_count
    program.goals_total = total_count
    program.completion_percentage = (completed_count / total_count * 100) if total_count > 0 else 0
    
    logger.info(f"Program {program.id} progress: {completed_count}/{total_count} goals complete")
    
    # Emit program updated event
    _queue_event(pending_events, _build_event(Events.PROGRAM_UPDATED, {
        'program_id': program.id,
        'program_name': program.name,
        'root_id': program.root_id,
        'goals_completed': completed_count,
        'goals_total': total_count
    }, db_session))
