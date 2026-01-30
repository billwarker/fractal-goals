"""
Completion Handlers

Event handlers for managing completion cascades:
- When a session is completed → evaluate targets for linked goals
- When targets are achieved → auto-complete goals if all targets met
- When a goal is completed → update parent goals and programs

These handlers subscribe to the event bus and react to completion-related events.
"""

import logging
from datetime import datetime, timezone
import json

from services.events import event_bus, Event, Events
import models
from models import get_session, Goal, Session, ActivityInstance
from services.serializers import serialize_activity_instance, format_utc

logger = logging.getLogger(__name__)


def _get_db_session():
    """Get a new database session."""
    engine = models.get_engine()
    return get_session(engine)


@event_bus.on(Events.SESSION_COMPLETED)
def handle_session_completed(event: Event):
    """
    When a session is completed, evaluate all targets for linked goals.
    
    Expected event.data:
        - session_id: str
        - root_id: str
    """
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    
    if not session_id or not root_id:
        logger.warning(f"SESSION_COMPLETED missing required data: {event.data}")
        return
    
    logger.info(f"Processing session completion: {session_id}")
    
    db_session = _get_db_session()
    try:
        # Get the session with its linked goals
        session = db_session.query(Session).filter_by(id=session_id).first()
        if not session:
            logger.warning(f"Session {session_id} not found")
            return
        
        # Get all goals linked to this session
        linked_goals = session.goals or []
        
        # Get all activity instances for this session
        activity_instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None
        ).all()
        
        # Build a map of activity_id -> list of instance data
        instances_by_activity = {}
        for inst in activity_instances:
            activity_id = inst.activity_definition_id
            if activity_id not in instances_by_activity:
                instances_by_activity[activity_id] = []
            instances_by_activity[activity_id].append(serialize_activity_instance(inst))
        
        # Evaluate targets for each linked goal
        # Evaluate targets for each linked goal
        for goal in linked_goals:
            _evaluate_goal_targets(db_session, goal, instances_by_activity, session_id)
            
        # Check Program Day Completion
        from services.programs import ProgramService
        ProgramService.check_program_day_completion(db_session, session_id)
        
        db_session.commit()
        
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling session completion: {e}")
    finally:
        db_session.close()


def _evaluate_goal_targets(db_session, goal: Goal, instances_by_activity: dict, session_id: str):
    """Evaluate all targets for a goal against activity instances."""
    targets = json.loads(goal.targets) if goal.targets else []
    if not targets:
        return
    
    now = datetime.now(timezone.utc)
    newly_completed = []
    
    for target in targets:
        # Skip already completed targets
        if target.get('completed'):
            continue
        
        activity_id = target.get('activity_id')
        target_metrics = target.get('metrics', [])
        
        if not activity_id or not target_metrics:
            continue
        
        # Check if any instance satisfies this target
        instances = instances_by_activity.get(activity_id, [])
        target_achieved = False
        
        for inst in instances:
            # Check sets first
            sets = inst.get('sets', [])
            if sets:
                for s in sets:
                    if _check_metrics_meet_target(target_metrics, s.get('metrics', [])):
                        target_achieved = True
                        break
                if target_achieved:
                    break
            
            # Check flat metrics
            if _check_metrics_meet_target(target_metrics, inst.get('metrics', [])):
                target_achieved = True
                break
        
        if target_achieved:
            target['completed'] = True
            target['completed_at'] = format_utc(now)
            target['completed_session_id'] = session_id
            newly_completed.append(target)
            
            # Emit target achieved event
            event_bus.emit(Event(Events.TARGET_ACHIEVED, {
                'target_id': target.get('id'),
                'target_name': target.get('name'),
                'goal_id': goal.id,
                'goal_name': goal.name,
                'session_id': session_id
            }))
    
    # Persist updated targets
    goal.targets = json.dumps(targets)
    
    # Check if all targets are now complete → auto-complete goal
    all_completed = all(t.get('completed') for t in targets) if targets else False
    if all_completed and not goal.completed:
        goal.completed = True
        goal.completed_at = now
        logger.info(f"Auto-completing goal {goal.id} - all {len(targets)} targets met")
        
        # Emit goal completed event
        event_bus.emit(Event(Events.GOAL_COMPLETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id,
            'auto_completed': True,
            'reason': 'all_targets_achieved'
        }))


@event_bus.on(Events.GOAL_COMPLETED)
def handle_goal_completed(event: Event):
    """
    When a goal is completed, update parent goals and programs.
    
    Expected event.data:
        - goal_id: str
        - root_id: str
    """
    goal_id = event.data.get('goal_id')
    root_id = event.data.get('root_id')
    
    if not goal_id:
        return
    
    logger.info(f"Processing goal completion: {goal_id}")
    
    db_session = _get_db_session()
    try:
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return
        
        # Check if parent goal has completed_via_children enabled
        if goal.parent_id:
            parent = db_session.query(Goal).filter_by(id=goal.parent_id).first()
            if parent and parent.completed_via_children:
                _check_parent_completion(db_session, parent)
        
        # Update any programs this goal is part of
        _update_program_progress(db_session, goal)
        
        db_session.commit()
        
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling goal completion: {e}")
    finally:
        db_session.close()


def _check_parent_completion(db_session, parent: Goal):
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
        logger.info(f"Auto-completing parent goal {parent.id} - all children complete")
        
        # Emit event for cascade
        event_bus.emit(Event(Events.GOAL_COMPLETED, {
            'goal_id': parent.id,
            'goal_name': parent.name,
            'root_id': parent.root_id,
            'auto_completed': True,
            'reason': 'all_children_completed'
        }))


def _update_program_progress(db_session, goal: Goal):
    """Update program completion percentage when a goal is completed."""
    from models import Program, ProgramBlock
    
    # Find programs that include this goal via block goal_ids JSON field
    blocks = db_session.query(ProgramBlock).all()
    
    program_ids = set()
    for block in blocks:
        # Parse goal_ids from JSON
        block_goal_ids = json.loads(block.goal_ids) if block.goal_ids else []
        if goal.id in block_goal_ids:
            program_ids.add(block.program_id)
    
    for program_id in program_ids:
        program = db_session.query(Program).filter_by(id=program_id).first()
        if program:
            # Recalculate program progress
            _recalculate_program_progress(db_session, program)


def _recalculate_program_progress(db_session, program):
    """Recalculate the completion percentage for a program."""
    from models import ProgramBlock
    
    # Get all goals linked to this program's blocks via JSON field
    blocks = db_session.query(ProgramBlock).filter_by(program_id=program.id).all()
    
    all_goal_ids = set()
    for block in blocks:
        block_goal_ids = json.loads(block.goal_ids) if block.goal_ids else []
        all_goal_ids.update(block_goal_ids)
    
    if not all_goal_ids:
        return
    
    # Count completed goals
    completed_count = db_session.query(Goal).filter(
        Goal.id.in_(all_goal_ids),
        Goal.completed == True,
        Goal.deleted_at == None
    ).count()
    
    total_count = len(all_goal_ids)
    
    # Update program (if it has these fields)
    if hasattr(program, 'goals_completed'):
        program.goals_completed = completed_count
    if hasattr(program, 'goals_total'):
        program.goals_total = total_count
    if hasattr(program, 'completion_percentage'):
        program.completion_percentage = (completed_count / total_count * 100) if total_count > 0 else 0
    
    logger.info(f"Program {program.id} progress: {completed_count}/{total_count} goals complete")
    
    # Emit program updated event
    event_bus.emit(Event(Events.PROGRAM_UPDATED, {
        'program_id': program.id,
        'program_name': program.name,
        'goals_completed': completed_count,
        'goals_total': total_count
    }))


def _check_metrics_meet_target(target_metrics: list, actual_metrics: list) -> bool:
    """Check if actual metrics meet or exceed all target metrics."""
    if not target_metrics:
        return False
    
    # Build a map of actual metric values
    actual_map = {}
    for m in actual_metrics:
        metric_id = m.get('metric_id') or m.get('metric_definition_id')
        if metric_id and m.get('value') is not None:
            actual_map[metric_id] = float(m['value'])
    
    # Check all target metrics are met
    for tm in target_metrics:
        metric_id = tm.get('metric_id')
        target_value = tm.get('value')
        
        if not metric_id or target_value is None:
            continue
        
        actual_value = actual_map.get(metric_id)
        if actual_value is None:
            return False
        
        if actual_value < float(target_value):
            return False
    
    return True


# ============================================================================
# INITIALIZATION
# ============================================================================

def init_completion_handlers():
    """
    Initialize completion handlers.
    Called on app startup to ensure handlers are registered.
    """
    logger.info("Completion handlers initialized")
    # Handlers are auto-registered via @event_bus.on decorators above
