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
        # Skip already completed
        if target.get('completed'):
            continue
            
        target_type = target.get('type', 'threshold')
        target_achieved = False
        
        if target_type == 'threshold':
            # Classic logic: Check if CURRENT session meets criteria
            target_achieved = _evaluate_threshold_target(target, instances_by_activity)
        elif target_type in ('sum', 'frequency'):
            # Complex logic: Check if aggregated history meets criteria
            target_achieved = _evaluate_complex_target(db_session, target, goal, session_id)
            
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
                'session_id': session_id,
                'target_type': target_type
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


def _evaluate_threshold_target(target, instances_by_activity):
    """Evaluate a single-session threshold target."""
    activity_id = target.get('activity_id')
    target_metrics = target.get('metrics', [])
    
    if not activity_id or not target_metrics:
        return False
    
    instances = instances_by_activity.get(activity_id, [])
    for inst in instances:
        # Check sets first
        sets = inst.get('sets', [])
        if sets:
            for s in sets:
                if _check_metrics_meet_target(target_metrics, s.get('metrics', [])):
                    return True
        
        # Check flat metrics
        if _check_metrics_meet_target(target_metrics, inst.get('metrics', [])):
            return True
            
    return False


def _evaluate_complex_target(db_session, target, goal, current_session_id):
    """Evaluate accumulation (sum) or frequency targets over a time range."""
    start_date, end_date = _get_target_date_range(db_session, target)
    
    activity_id = target.get('activity_id')
    if not activity_id:
        return False
        
    # Query relevant activity instances
    from models import ActivityInstance
    query = db_session.query(ActivityInstance).filter(
        ActivityInstance.activity_definition_id == activity_id,
        ActivityInstance.deleted_at == None
    )
    
    if start_date:
        query = query.filter(ActivityInstance.created_at >= start_date)
    if end_date:
        query = query.filter(ActivityInstance.created_at <= end_date)
        
    instances = query.all()
    
    if target.get('type') == 'sum':
        result, value, total_target = _evaluate_sum_target(target, instances)
        target['current_value'] = value
        target['target_value'] = total_target
        target['progress'] = min(100, int((value / total_target * 100))) if total_target > 0 else 0
        return result
    elif target.get('type') == 'frequency':
        result, count = _evaluate_frequency_target(target, instances)
        target['current_value'] = count
        target['target_value'] = int(target.get('frequency_count', 0))
        target['progress'] = min(100, int((count / target['target_value'] * 100))) if target['target_value'] > 0 else 0
        return result
        
    return False


def _get_target_date_range(db_session, target):
    """Resolve start/end dates based on time_scope."""
    time_scope = target.get('time_scope', 'all_time')
    
    if time_scope == 'custom':
        start = target.get('start_date')
        end = target.get('end_date')
        return (
            datetime.fromisoformat(start) if start else None,
            datetime.fromisoformat(end) if end else None
        )
        
    elif time_scope == 'program_block':
        block_id = target.get('linked_block_id')
        if block_id:
            from models import ProgramBlock
            block = db_session.query(ProgramBlock).filter_by(id=block_id).first()
            if block:
                # Convert dates to datetimes
                start = datetime.combine(block.start_date, datetime.min.time()) if block.start_date else None
                end = datetime.combine(block.end_date, datetime.max.time()) if block.end_date else None
                return start, end
                
    return None, None


def _evaluate_sum_target(target, instances):
    """Sum metric values across all instances and check against target."""
    target_metrics = target.get('metrics', [])
    if not target_metrics:
        return False, 0, 0
        
    # Aggegrate actuals
    # Note: 'Sum' targets usually imply a PRIMARY metric to sum.
    # If multiple metrics exist, we sum them all?? Or is it an AND condition?
    # For 'Sum', we usually have one metric like 'Run 100km'.
    # If there are multiple, let's assume ALL must be met.
    # We will return the progress of the *first* metric or average?
    # Let's track the 'lowest' progress to be conservative.
    
    totals = {}
    for inst in instances:
        # Flatten metrics from sets and instance
        all_metrics = []
        if inst.data and isinstance(inst.data, dict) and 'sets' in inst.data:
             # Add metrics from sets
             sets = inst.data.get('sets', [])
             for s in sets:
                 all_metrics.extend(s.get('metrics', []))
        
        # Add instance level metrics (serialized or DB objects?)
        if inst.metric_values:
            for mv in inst.metric_values:
                all_metrics.append({'metric_id': mv.metric_definition_id, 'value': mv.value})
        
        # Sum them up
        for m in all_metrics:
            mid = m.get('metric_id')
            val = m.get('value')
            if mid and val is not None:
                totals[mid] = totals.get(mid, 0.0) + float(val)

    # Check against targets
    all_met = True
    primary_current = 0
    primary_target = 0
    
    for idx, tm in enumerate(target_metrics):
        mid = tm.get('metric_id')
        t_val = float(tm.get('value', 0))
        op = tm.get('operator', '>=')
        
        actual = totals.get(mid, 0.0)
        
        if idx == 0:
            primary_current = actual
            primary_target = t_val
            
        if not _check_metric_value(t_val, actual, op):
            all_met = False
    
    return all_met, primary_current, primary_target


def _evaluate_frequency_target(target, instances):
    """Check if enough distinct sessions/days contain the activity."""
    required_count = int(target.get('frequency_count', 0))
    if required_count <= 0:
        return False, 0
        
    # Get distinct session IDs
    session_ids = set()
    for inst in instances:
        if inst.session_id:
            session_ids.add(inst.session_id)
            
    count = len(session_ids)
    return count >= required_count, count


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


def _check_metric_value(target_value, actual_value, operator='>='):
    """Check if actual value meets target value based on operator."""
    try:
        t_val = float(target_value)
        a_val = float(actual_value)
    except (ValueError, TypeError):
        return False
        
    if operator == '>=':
        return a_val >= t_val
    elif operator == '<=':
        return a_val <= t_val
    elif operator == '==' or operator == '=':
        return abs(a_val - t_val) < 0.001  # Float equality with epsilon
    elif operator == '>':
        return a_val > t_val
    elif operator == '<':
        return a_val < t_val
    
    return False

def _check_metrics_meet_target(target_metrics: list, actual_metrics: list) -> bool:
    """Check if actual metrics meet or exceed all target metrics."""
    if not target_metrics:
        return False
    
    # Build a map of actual metric values
    actual_map = {}
    for m in actual_metrics:
        metric_id = m.get('metric_id') or m.get('metric_definition_id')
        if metric_id and m.get('value') is not None:
            actual_map[metric_id] = m['value']
    
    # Check all target metrics are met
    for tm in target_metrics:
        metric_id = tm.get('metric_id')
        target_value = tm.get('value')
        operator = tm.get('operator', '>=')  # Default to >=
        
        if not metric_id or target_value is None:
            continue
        
        actual_value = actual_map.get(metric_id)
        if actual_value is None:
            return False
        
        if not _check_metric_value(target_value, actual_value, operator):
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
