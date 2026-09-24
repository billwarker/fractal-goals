"""Target evaluation for completion cascades.

Threshold, sum, frequency, and complex targets; contribution ledger writes;
and reverting achievements when their evidence is removed.
"""

import logging
from datetime import datetime, timezone
from services.events import Events
from services.activity_instance_data import load_instance_sets, resolve_metric_id
from services.goal_target_rules import (
    check_metric_value as _check_metric_value,
    check_metrics_meet_target as _check_metrics_meet_target,
)
from services.goal_domain_rules import all_active_targets_completed
from models import Goal, Session, ActivityInstance, Target, TargetContributionLedger
from services._completion_context import (
    _build_event,
    _queue_event,
    _track_goal_completion,
    _track_target_achievement,
    clear_achievement_context,
)

logger = logging.getLogger(__name__)


def _target_metrics_from_conditions(target: Target):
    metrics = []
    for condition in (target.metric_conditions or []):
        metrics.append({
            'metric_id': condition.metric_definition_id,
            'operator': condition.operator,
            'value': condition.target_value,
        })
    return metrics


def _collect_actual_metric_values_from_instance_dict(instance_dict: dict):
    actual_map = {}
    for m in (instance_dict.get('metrics') or []):
        metric_id = resolve_metric_id(m)
        if metric_id and m.get('value') is not None:
            actual_map[metric_id] = float(m.get('value'))
    for s in (instance_dict.get('sets') or []):
        for m in (s.get('metrics') or []):
            metric_id = resolve_metric_id(m)
            if metric_id and m.get('value') is not None:
                actual_map[metric_id] = max(actual_map.get(metric_id, 0.0), float(m.get('value')))
    return actual_map


def _serialize_instance_for_target_evaluation(instance: ActivityInstance):
    metrics = [
        {
            'metric_id': metric.metric_definition_id,
            'metric_definition_id': metric.metric_definition_id,
            'value': metric.value,
        }
        for metric in (instance.metric_values or [])
        if metric.value is not None
    ]
    return {
        'id': instance.id,
        'completed': bool(instance.completed),
        'metrics': metrics,
        'sets': load_instance_sets(instance),
    }


def _record_target_contributions(db_session, target: Target, instance_id: str, actual_metric_map: dict):
    if not instance_id:
        return
    db_session.query(TargetContributionLedger).filter(
        TargetContributionLedger.target_id == target.id,
        TargetContributionLedger.activity_instance_id == instance_id
    ).delete(synchronize_session=False)
    for condition in (target.metric_conditions or []):
        actual_value = actual_metric_map.get(condition.metric_definition_id)
        if actual_value is None:
            continue
        db_session.add(TargetContributionLedger(
            target_id=target.id,
            activity_instance_id=instance_id,
            metric_condition_id=condition.id,
            contributed_value=int(round(actual_value))
        ))


def _evaluate_threshold_targets_for_activity(
    db_session, goal: Goal, instances_by_activity: dict, 
    session_id: str, activity_id: str, completed_at: datetime, pending_events=None
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
        
        # Only evaluate if target references this activity
        if target_activity != activity_id:
            logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - activity mismatch")
            continue

        # If target is bound to a specific instance, only evaluate against that instance
        instances = instances_by_activity.get(activity_id, [])
        target_instance_id = getattr(target, 'activity_instance_id', None)
        if target_instance_id:
            instances = [inst for inst in instances if inst.get('id') == target_instance_id]
            if not instances:
                logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - instance mismatch")
                continue

        # --- Completion targets: achieved when any completed instance matches ---
        if target_type == 'completion':
            if any(inst.get('completed', False) for inst in instances):
                logger.info(f"[TARGET_EVAL] COMPLETION TARGET ACHIEVED: '{target_name}'")
                target.completed = True
                target.completed_at = completed_at
                target.completed_session_id = session_id
                target.completed_instance_id = instances[0].get('id') if instances else None
                newly_completed.append(target)
                _track_target_achievement({
                    'id': target.id,
                    'name': target.name,
                    'goal_id': goal.id,
                    'goal_name': goal.name
                })
                _queue_event(pending_events, _build_event(Events.TARGET_ACHIEVED, {
                    'target_id': target.id,
                    'target_name': target.name,
                    'goal_id': goal.id,
                    'goal_name': goal.name,
                    'root_id': goal.root_id,
                    'session_id': session_id,
                    'target_type': 'completion',
                    'triggered_by': 'activity_instance_completed'
                }, db_session))
                logger.info(f"Completion target '{target.name}' achieved for goal '{goal.name}'")
            continue
        
        # Only evaluate threshold targets from here
        if target_type != 'threshold':
            logger.info(f"[TARGET_EVAL] Skipping '{target_name}' - not threshold type")
            continue
        
        # Evaluate threshold target - convert Target object to dict for evaluation
        target_dict = {
            'id': target.id,
            'name': target.name,
            'type': target.type,
            'activity_id': target.activity_id,
            'metrics': _target_metrics_from_conditions(target),
        }
        
        logger.info(f"[TARGET_EVAL] Evaluating '{target_name}' against instances...")
        matching_instance = _find_threshold_target_achieving_instance(target_dict, instances_by_activity)
        if matching_instance:
            logger.info(f"[TARGET_EVAL] TARGET ACHIEVED: '{target_name}'")
            
            # Update the Target model directly
            target.completed = True
            target.completed_at = completed_at
            target.completed_session_id = session_id
            target.completed_instance_id = matching_instance.get('id')
            if matching_instance:
                metric_map = _collect_actual_metric_values_from_instance_dict(matching_instance)
                _record_target_contributions(db_session, target, target.completed_instance_id, metric_map)
            
            newly_completed.append(target)
            
            # Track for API response
            _track_target_achievement({
                'id': target.id,
                'name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name
            })
            
            # Emit target achieved event
            _queue_event(pending_events, _build_event(Events.TARGET_ACHIEVED, {
                'target_id': target.id,
                'target_name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,  # Required for event logging
                'session_id': session_id,
                'target_type': target_type,
                'triggered_by': 'activity_instance_completed'
            }, db_session))
            
            logger.info(f"Target '{target.name}' achieved for goal '{goal.name}'")
    
    if not newly_completed:
        return
    
    # No need to persist JSON - Target model updates are tracked by SQLAlchemy
    
    # Check if all targets are now complete → auto-complete goal
    if all_active_targets_completed(goal) and not goal.completed:
        goal.completed = True
        goal.completed_at = completed_at
        goal.completed_session_id = session_id
        goal.completion_source = 'target'
        goal.completion_reason = 'all_targets_achieved'
        goal.manually_uncompleted_at = None
        logger.info(f"Auto-completing goal {goal.id} - all active targets met")
        
        # Track for API response
        _track_goal_completion({
            'id': goal.id,
            'name': goal.name
        })
        
        # Emit goal completed event
        _queue_event(pending_events, _build_event(Events.GOAL_COMPLETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id,
            'auto_completed': True,
            'reason': 'all_targets_achieved',
            'triggered_by': 'activity_instance_completed'
        }, db_session))


def _evaluate_goal_targets(db_session, goal: Goal, instances_by_activity: dict, session_id: str, pending_events=None):
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
        matching_instance = None
        matching_instances = []
        
        # Convert Target object to dict for evaluation
        target_dict = {
            'id': target.id,
            'name': target.name,
            'type': target.type,
            'activity_id': target.activity_id,
            'activity_instance_id': getattr(target, 'activity_instance_id', None),
            'metrics': _target_metrics_from_conditions(target),
            'time_scope': target.time_scope,
            'start_date': target.start_date,
            'end_date': target.end_date,
            'linked_block_id': target.linked_block_id,
            'frequency_days': target.frequency_days,
            'frequency_count': target.frequency_count,
        }
        
        if target_type == 'completion':
            # Completion target: achieved if any completed instance matches the activity
            activity_id = target.activity_id
            if activity_id:
                instances = instances_by_activity.get(activity_id, [])
                target_instance_id = getattr(target, 'activity_instance_id', None)
                if target_instance_id:
                    instances = [inst for inst in instances if inst.get('id') == target_instance_id]
                matching_instances = [inst for inst in instances if inst.get('completed', False)]
                target_achieved = bool(matching_instances)
        elif target_type == 'threshold':
            # Classic logic: Check if CURRENT session meets criteria
            matching_instance = _find_threshold_target_achieving_instance(target_dict, instances_by_activity)
            target_achieved = matching_instance is not None
        elif target_type in ('sum', 'frequency'):
            # Complex logic: Check if aggregated history meets criteria
            target_achieved = _evaluate_complex_target(db_session, target_dict, goal, session_id)
            
        if target_achieved:
            target.completed = True
            target.completed_at = now
            target.completed_session_id = session_id
            if target_type == 'completion':
                target.completed_instance_id = matching_instances[0].get('id') if matching_instances else None
            elif target_type == 'threshold':
                target.completed_instance_id = matching_instance.get('id') if matching_instance else None
            newly_completed.append(target)
            
            # Emit target achieved event
            _queue_event(pending_events, _build_event(Events.TARGET_ACHIEVED, {
                'target_id': target.id,
                'target_name': target.name,
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id,
                'session_id': session_id,
                'target_type': target_type
            }, db_session))
    
    # No need to persist JSON - Target model updates are tracked by SQLAlchemy
    
    # Check if all targets are now complete → auto-complete goal
    if all_active_targets_completed(goal) and not goal.completed:
        goal.completed = True
        goal.completed_at = now
        goal.completed_session_id = session_id
        goal.completion_source = 'target'
        goal.completion_reason = 'all_targets_achieved'
        goal.manually_uncompleted_at = None
        logger.info(f"Auto-completing goal {goal.id} - all active targets met")
        
        # Emit goal completed event
        _queue_event(pending_events, _build_event(Events.GOAL_COMPLETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id,
            'auto_completed': True,
            'reason': 'all_targets_achieved'
        }, db_session))


def _run_evaluation_for_instance(db_session, instance, session_id, root_id, pending_events=None):
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
    instance_data = _serialize_instance_for_target_evaluation(instance)
    instances_by_activity = {activity_id: [instance_data]}
    
    for goal in linked_goals:
        _evaluate_threshold_targets_for_activity(
            db_session, goal, instances_by_activity, session_id, 
            activity_id, completed_at, pending_events=pending_events
        )


def _revert_achievements_for_instance(db_session, instance_id: str, pending_events=None):
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
        _queue_event(pending_events, _build_event(Events.TARGET_REVERTED, {
            'target_id': target.id,
            'target_name': target.name,
            'goal_id': target.goal_id,
            'root_id': target.root_id,
            'instance_id': instance_id
        }, db_session))
        
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
                goal.completed_session_id = None
                goal.completion_source = None
                goal.completion_reason = 'target_reverted'
                
                _queue_event(pending_events, _build_event(Events.GOAL_UNCOMPLETED, {
                    'goal_id': goal.id,
                    'goal_name': goal.name,
                    'root_id': goal.root_id,
                    'reason': 'target_reverted'
                }, db_session))


def _find_threshold_target_achieving_instance(target, instances_by_activity):
    """Return the first activity instance that satisfies a threshold target."""
    activity_id = target.get('activity_id')
    target_metrics = target.get('metrics', [])
    
    if not activity_id or not target_metrics:
        return None
    instances = instances_by_activity.get(activity_id, [])
    target_instance_id = target.get('activity_instance_id')
    if target_instance_id:
        instances = [inst for inst in instances if inst.get('id') == target_instance_id]
    for inst in instances:
        # Check sets first
        sets = inst.get('sets', [])
        if sets:
            for s in sets:
                if _check_metrics_meet_target(target_metrics, s.get('metrics', [])):
                    return inst
        
        # Check flat metrics
        if _check_metrics_meet_target(target_metrics, inst.get('metrics', [])):
            return inst
            
    return None


def _evaluate_threshold_target(target, instances_by_activity):
    """Evaluate a single-session threshold target."""
    return _find_threshold_target_achieving_instance(target, instances_by_activity) is not None


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
        for activity_set in inst.sets or []:
            for metric in activity_set.metric_values or []:
                all_metrics.append({'metric_id': metric.metric_definition_id, 'value': metric.value})
        
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
