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
from models import get_session, Goal, Session, ActivityInstance, Target
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


# Thread-local storage for tracking achievements during a request
import threading
_achievement_context = threading.local()


def get_recent_achievements():
    """Get achievements tracked during the current request. Called by API endpoints."""
    return {
        'achieved_targets': getattr(_achievement_context, 'achieved_targets', []),
        'completed_goals': getattr(_achievement_context, 'completed_goals', [])
    }


def clear_achievement_context():
    """Clear achievement tracking. Should be called at start of request."""
    _achievement_context.achieved_targets = []
    _achievement_context.completed_goals = []


def _track_target_achievement(target_data: dict):
    """Track a target achievement for the current request."""
    if not hasattr(_achievement_context, 'achieved_targets'):
        _achievement_context.achieved_targets = []
    _achievement_context.achieved_targets.append(target_data)


def _track_goal_completion(goal_data: dict):
    """Track a goal completion for the current request."""
    if not hasattr(_achievement_context, 'completed_goals'):
        _achievement_context.completed_goals = []
    _achievement_context.completed_goals.append(goal_data)


@event_bus.on(Events.ACTIVITY_INSTANCE_COMPLETED)
def handle_activity_instance_completed(event: Event):
    """
    When an activity instance is completed, evaluate THRESHOLD targets for linked goals.
    
    Only evaluates threshold targets (single-session criteria).
    Sum/frequency targets are evaluated on session completion.
    
    Expected event.data:
        - instance_id: str
        - session_id: str
        - root_id: str
        - activity_definition_id: str
        - completed_at: str (ISO datetime)
    """
    instance_id = event.data.get('instance_id')
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    activity_id = event.data.get('activity_definition_id')
    completed_at_str = event.data.get('completed_at')
    
    logger.info(f"[ACTIVITY_COMPLETED] Starting handler for instance {instance_id}")
    logger.info(f"[ACTIVITY_COMPLETED] Event data: session={session_id}, activity={activity_id}")
    
    if not all([instance_id, session_id, root_id, activity_id]):
        logger.warning(f"ACTIVITY_INSTANCE_COMPLETED missing required data: {event.data}")
        return
    
    logger.info(f"Processing activity instance completion: {instance_id} for activity {activity_id}")
    
    # Clear achievement context at start
    clear_achievement_context()
    
    db_session = _get_db_session()
    try:
        # Get the session
        session = db_session.query(Session).filter_by(id=session_id).first()
        if not session:
            logger.warning(f"Session {session_id} not found")
            return
        
        # Get the completed activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            logger.warning(f"Activity instance {instance_id} not found")
            return
        
        # Find goals to evaluate in two ways:
        # 1. Goals directly linked to the session (via session_goals)
        # 2. Goals linked to the activity (via activity_goal_associations)
        goals_to_check = set()
        
        # Session-linked goals
        session_goals = session.goals or []
        for g in session_goals:
            goals_to_check.add(g.id)
        logger.info(f"[ACTIVITY_COMPLETED] Session has {len(session_goals)} directly linked goals")
        
        # Activity-linked goals (via activity_goal_associations)
        from sqlalchemy import text
        activity_goal_result = db_session.execute(text('''
            SELECT goal_id FROM activity_goal_associations 
            WHERE activity_id = :activity_id
        '''), {'activity_id': activity_id})
        activity_goal_ids = [row[0] for row in activity_goal_result.fetchall()]
        
        for gid in activity_goal_ids:
            goals_to_check.add(gid)
        logger.info(f"[ACTIVITY_COMPLETED] Activity has {len(activity_goal_ids)} associated goals")
        
        if not goals_to_check:
            logger.debug(f"No goals to evaluate for activity {activity_id}")
            return
        
        # Fetch all unique goals
        linked_goals = db_session.query(Goal).filter(Goal.id.in_(goals_to_check)).all()
        logger.info(f"[ACTIVITY_COMPLETED] Total {len(linked_goals)} unique goals to evaluate")
        
        # Build instance data for target evaluation (single instance)
        instance_data = serialize_activity_instance(instance)
        instances_by_activity = {activity_id: [instance_data]}
        logger.info(f"[ACTIVITY_COMPLETED] Instance metrics: {instance_data.get('metrics', [])}")
        
        # Parse completed_at time for target timestamp
        completed_at = None
        if completed_at_str:
            try:
                completed_at = datetime.fromisoformat(completed_at_str.replace('Z', '+00:00'))
            except (ValueError, AttributeError):
                completed_at = datetime.now(timezone.utc)
        else:
            completed_at = datetime.now(timezone.utc)
        
        # Evaluate THRESHOLD targets only for each linked goal
        for goal in linked_goals:
            logger.info(f"[ACTIVITY_COMPLETED] Evaluating goal: {goal.name} (id={goal.id})")
            _evaluate_threshold_targets_for_activity(
                db_session, goal, instances_by_activity, session_id, 
                activity_id, completed_at
            )
        
        db_session.commit()
        logger.info(f"[ACTIVITY_COMPLETED] Committed changes")
        
        # Log achievement context
        achievements = get_recent_achievements()
        logger.info(f"[ACTIVITY_COMPLETED] Achievements: {achievements}")
        
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance completion: {e}")
    finally:
        db_session.close()


def _evaluate_threshold_targets_for_activity(
    db_session, goal: Goal, instances_by_activity: dict, 
    session_id: str, activity_id: str, completed_at: datetime
):
    """
    Evaluate only THRESHOLD targets for a specific activity.
    
    This is called when an activity instance is completed, before the session
    is marked complete. Only evaluates threshold targets that reference the
    completed activity.
    
    Now uses the relational Target model instead of JSON.
    """
    # Get relational targets for this goal
    targets = [t for t in goal.targets_rel if t.deleted_at is None]
    logger.info(f"[TARGET_EVAL] Goal {goal.name} has {len(targets)} relational targets")
    
    if not targets:
        return
    
    newly_completed = []
    
    for target in targets:
        target_name = target.name
        target_activity = target.activity_id
        target_type = target.type or 'threshold'
        
        logger.info(f"[TARGET_EVAL] Checking target '{target_name}': type={target_type}, activity_id={target_activity}, completed={target.completed}")
        logger.info(f"[TARGET_EVAL] Comparing target.activity_id={target_activity} vs completed activity_id={activity_id}")
        
        # Skip already completed
        if target.completed:
            logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - already completed")
            continue
        
        # Only evaluate threshold targets
        if target_type != 'threshold':
            logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - not threshold type")
            continue
        
        # Only evaluate if target references this activity
        if target_activity != activity_id:
            logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - activity mismatch")
            continue
        
        # Evaluate threshold target - convert Target object to dict for evaluation
        target_dict = {
            'id': target.id,
            'name': target.name,
            'type': target.type,
            'activity_id': target.activity_id,
            'metrics': target.metrics if isinstance(target.metrics, list) else [],
        }
        
        logger.info(f"[TARGET_EVAL] Evaluating '{target_name}' against instances...")
        if _evaluate_threshold_target(target_dict, instances_by_activity):
            logger.info(f"[TARGET_EVAL] TARGET ACHIEVED: '{target_name}'")
            
            # Update the Target model directly
            target.completed = True
            target.completed_at = completed_at
            target.completed_session_id = session_id
            instance_list = instances_by_activity.get(activity_id, [])
            target.completed_instance_id = instance_list[0].get('id') if instance_list else None
            
            newly_completed.append(target)
            
            # Track for API response
            _track_target_achievement({
                'id': target.id,
                'name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name
            })
            
            # Emit target achieved event
            event_bus.emit(Event(Events.TARGET_ACHIEVED, {
                'target_id': target.id,
                'target_name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,  # Required for event logging
                'session_id': session_id,
                'target_type': target_type,
                'triggered_by': 'activity_instance_completed'
            }))
            
            logger.info(f"Target '{target.name}' achieved for goal '{goal.name}'")
    
    if not newly_completed:
        return
    
    # No need to persist JSON - Target model updates are tracked by SQLAlchemy
    
    # Check if all targets are now complete → auto-complete goal
    all_targets = [t for t in goal.targets_rel if t.deleted_at is None]
    all_completed = all(t.completed for t in all_targets) if all_targets else False
    
    if all_completed and not goal.completed:
        goal.completed = True
        goal.completed_at = completed_at
        logger.info(f"Auto-completing goal {goal.id} - all {len(all_targets)} targets met")
        
        # Track for API response
        _track_goal_completion({
            'id': goal.id,
            'name': goal.name
        })
        
        # Emit goal completed event
        event_bus.emit(Event(Events.GOAL_COMPLETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id,
            'auto_completed': True,
            'reason': 'all_targets_achieved',
            'triggered_by': 'activity_instance_completed'
        }))


def _evaluate_goal_targets(db_session, goal: Goal, instances_by_activity: dict, session_id: str):
    """
    Evaluate all targets for a goal against activity instances.
    
    Now uses the relational Target model instead of JSON.
    """
    targets = [t for t in goal.targets_rel if t.deleted_at is None]
    if not targets:
        return
    
    now = datetime.now(timezone.utc)
    newly_completed = []
    
    for target in targets:
        # Skip already completed
        if target.completed:
            continue
            
        target_type = target.type or 'threshold'
        target_achieved = False
        
        # Convert Target object to dict for evaluation
        target_dict = {
            'id': target.id,
            'name': target.name,
            'type': target.type,
            'activity_id': target.activity_id,
            'metrics': target.metrics if isinstance(target.metrics, list) else [],
            'time_scope': target.time_scope,
            'start_date': target.start_date,
            'end_date': target.end_date,
            'linked_block_id': target.linked_block_id,
            'frequency_days': target.frequency_days,
            'frequency_count': target.frequency_count,
        }
        
        if target_type == 'threshold':
            # Classic logic: Check if CURRENT session meets criteria
            target_achieved = _evaluate_threshold_target(target_dict, instances_by_activity)
        elif target_type in ('sum', 'frequency'):
            # Complex logic: Check if aggregated history meets criteria
            target_achieved = _evaluate_complex_target(db_session, target_dict, goal, session_id)
            
        if target_achieved:
            target.completed = True
            target.completed_at = now
            target.completed_session_id = session_id
            newly_completed.append(target)
            
            # Emit target achieved event
            event_bus.emit(Event(Events.TARGET_ACHIEVED, {
                'target_id': target.id,
                'target_name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,
                'session_id': session_id,
                'target_type': target_type
            }))
    
    # No need to persist JSON - Target model updates are tracked by SQLAlchemy
    
    # Check if all targets are now complete → auto-complete goal
    all_targets = [t for t in goal.targets_rel if t.deleted_at is None]
    all_completed = all(t.completed for t in all_targets) if all_targets else False
    
    if all_completed and not goal.completed:
        goal.completed = True
        goal.completed_at = now
        logger.info(f"Auto-completing goal {goal.id} - all {len(all_targets)} targets met")
        
        # Emit goal completed event
        event_bus.emit(Event(Events.GOAL_COMPLETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id,
            'auto_completed': True,
            'reason': 'all_targets_achieved'
        }))

@event_bus.on(Events.ACTIVITY_INSTANCE_UPDATED)
def handle_activity_instance_updated(event: Event):
    """
    When an activity instance is updated, check if it was marked as incomplete or complete.
    If incomplete → revert any targets achieved by this specific instance.
    If complete → evaluate threshold targets.
    """
    instance_id = event.data.get('instance_id')
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    updated_fields = event.data.get('updated_fields', [])
    
    if not instance_id:
        return
        
    db_session = _get_db_session()
    try:
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return
            
        # If instance is now incomplete, revert its achievements
        if not instance.completed:
            _revert_achievements_for_instance(db_session, instance_id)
            db_session.commit()
        # If instance was JUST marked complete, evaluate targets
        elif 'completed' in updated_fields and instance.completed:
            logger.info(f"[ACTIVITY_UPDATED] Instance {instance_id} marked complete. Evaluating targets.")
            
            # Use same logic as handle_activity_instance_completed but wrapperized
            _run_evaluation_for_instance(db_session, instance, session_id, root_id)
            db_session.commit()
            
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance update: {e}")
    finally:
        db_session.close()

def _run_evaluation_for_instance(db_session, instance, session_id, root_id):
    """Refactored core evaluation logic to be reused between event handlers."""
    activity_id = instance.activity_definition_id
    completed_at = instance.time_stop or datetime.now(timezone.utc)
    
    # 1. Clear achievement context
    clear_achievement_context()
    
    # 2. Get the session
    session = db_session.query(Session).filter_by(id=session_id).first()
    if not session:
        return

    # 3. Find goals to check
    goals_to_check = set()
    session_goals = session.goals or []
    for g in session_goals:
        goals_to_check.add(g.id)
        
    from sqlalchemy import text
    activity_goal_result = db_session.execute(text('''
        SELECT goal_id FROM activity_goal_associations 
        WHERE activity_id = :activity_id
    '''), {'activity_id': activity_id})
    for row in activity_goal_result.fetchall():
        goals_to_check.add(row[0])
        
    if not goals_to_check:
        return
        
    linked_goals = db_session.query(Goal).filter(Goal.id.in_(goals_to_check)).all()
    
    # 4. Evaluate THRESHOLD targets
    instance_data = serialize_activity_instance(instance)
    instances_by_activity = {activity_id: [instance_data]}
    
    for goal in linked_goals:
        _evaluate_threshold_targets_for_activity(
            db_session, goal, instances_by_activity, session_id, 
            activity_id, completed_at
        )

@event_bus.on(Events.ACTIVITY_INSTANCE_COMPLETED)
def handle_activity_instance_completed(event: Event):
    """
    When an activity instance is completed, evaluate THRESHOLD targets for linked goals.
    """
    instance_id = event.data.get('instance_id')
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    
    if not all([instance_id, session_id, root_id]):
        return
    
    db_session = _get_db_session()
    try:
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return
            
        _run_evaluation_for_instance(db_session, instance, session_id, root_id)
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance completion: {e}")
    finally:
        db_session.close()


@event_bus.on(Events.ACTIVITY_INSTANCE_DELETED)
def handle_activity_instance_deleted(event: Event):
    """
    When an activity instance is deleted, revert any targets achieved by it.
    """
    instance_id = event.data.get('instance_id')
    if not instance_id:
        return
        
    db_session = _get_db_session()
    try:
        _revert_achievements_for_instance(db_session, instance_id)
        db_session.commit()
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance deletion: {e}")
    finally:
        db_session.close()

def _revert_achievements_for_instance(db_session, instance_id: str):
    """Internal helper to find and revert targets tied to an instance."""
    targets = db_session.query(Target).filter_by(
        completed_instance_id=instance_id,
        completed=True
    ).all()
    
    for target in targets:
        logger.info(f"[REVERSION] Reverting target '{target.name}' (id={target.id}) achieved by instance {instance_id}")
        
        target.completed = False
        target.completed_at = None
        target.completed_session_id = None
        target.completed_instance_id = None
        
        # Emit reversion event
        event_bus.emit(Event(Events.TARGET_REVERTED, {
            'target_id': target.id,
            'target_name': target.name,
            'goal_id': target.goal_id,
            'root_id': target.root_id,
            'instance_id': instance_id
        }))
        
        # If the goal was completed, we might need to revert that too if it was auto-completed
        # However, goal completion is more complex (could have been manual or met by other targets).
        # For now, we only revert the target. Reverting goal completion might be destructive 
        # if the user manually marked it complete.
        # But if it was 'all_targets_achieved', we should probably un-complete it.
        goal = target.goal
        if goal and goal.completed:
            # Check if any other targets are still incomplete
            # (We just marked THIS one incomplete, so at least one is definitely incomplete now)
            all_targets = [t for t in goal.targets_rel if t.deleted_at is None]
            if not all(t.completed for t in all_targets):
                logger.info(f"[REVERSION] Goal '{goal.name}' no longer has all targets met. Un-completing.")
                goal.completed = False
                goal.completed_at = None
                
                event_bus.emit(Event(Events.GOAL_UNCOMPLETED, {
                    'goal_id': goal.id,
                    'goal_name': goal.name,
                    'root_id': goal.root_id,
                    'reason': 'target_reverted'
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
