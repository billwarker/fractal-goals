"""Re-evaluate affected targets in the association writer's transaction."""
from models import TargetContributionLedger
from services.goal_target_service import GoalTargetService
from services.goal_target_helpers import as_utc
from services._completion_targets import _evaluate_goal_targets
from services._completion_context import _build_event
from services.events import Events


def recalculate_instance_goal_targets(db_session, instance, goal_ids, goals_by_id, pending_events):
    affected = set()
    for goal_id in goal_ids:
        goal = goals_by_id.get(goal_id)
        while goal and goal.id not in affected:
            affected.add(goal.id)
            goal = goals_by_id.get(goal.parent_id)
    service = GoalTargetService(db_session)
    for goal_id in sorted(affected):
        goal = goals_by_id[goal_id]
        targets = [target for target in goal.targets_rel if target.deleted_at is None and target.activity_id == instance.activity_definition_id]
        if not targets:
            continue
        evidence = {}
        previous = {}
        for target in targets:
            # Preserve manually achieved targets that have no execution provenance.
            if target.completed and not target.completed_session_id and not target.completed_instance_id:
                continue
            rows = service._collect_goal_activity_instances(
                instance.root_id, goal, goals_by_id, target.activity_id,
                as_utc(target.start_date or target.created_at), as_utc(target.end_date),
            )
            if target.activity_instance_id:
                rows = [row for row in rows if row['id'] == target.activity_instance_id]
            evidence[target.id] = {target.activity_id: rows}
            previous[target.id] = (target.completed, target.completed_at, target.completed_session_id, target.completed_instance_id)
        if not evidence:
            continue
        for target in targets:
            if target.id in previous:
                target.completed = False
                target.completed_at = target.completed_session_id = target.completed_instance_id = None
        queued = []
        _evaluate_goal_targets(db_session, goal, {}, instance.session_id, pending_events=queued, evidence_by_target=evidence)
        for target in targets:
            if target.id not in previous:
                continue
            was_completed, completed_at, session_id, instance_id = previous[target.id]
            if target.completed:
                if was_completed:
                    target.completed_at = completed_at
                    # Retain the original provenance when it still contributes.
                    valid_ids = {row['id'] for rows in evidence[target.id].values() for row in rows}
                    if instance_id in valid_ids:
                        target.completed_session_id = session_id
                        target.completed_instance_id = instance_id
            elif was_completed:
                db_session.query(TargetContributionLedger).filter_by(target_id=target.id).delete(synchronize_session=False)
                pending_events.append(_build_event(Events.TARGET_REVERTED, {
                    'root_id': instance.root_id, 'goal_id': goal.id, 'target_id': target.id,
                    'instance_id': instance.id,
                }, db_session))
        pending_events.extend(event for event in queued if event.name != Events.TARGET_ACHIEVED or not previous.get(event.data.get('target_id'), (False,))[0])
        if goal.completed and goal.completion_source == 'target' and any(not target.completed for target in goal.targets_rel if target.deleted_at is None):
            goal.completed = False
            goal.completed_at = goal.completed_session_id = goal.completion_source = None
            goal.completion_reason = 'target_reverted'
            pending_events.append(_build_event(Events.GOAL_UNCOMPLETED, {
                'root_id': instance.root_id, 'goal_id': goal.id, 'reason': 'target_reverted',
            }, db_session))


def recalculate_linked_instance_targets(db_session, instance, pending_events):
    """Reconcile one-off evidence after completion, metric corrections, or removal."""
    from services.goal_loading import load_fractal_goals_for_serialization
    direct_ids = set(getattr(instance, "associated_goal_ids", None) or [])
    if not direct_ids:
        return set()
    goals = load_fractal_goals_for_serialization(db_session, instance.root_id)
    recalculate_instance_goal_targets(db_session, instance, direct_ids, goals, pending_events)
    affected = set()
    for goal_id in direct_ids:
        goal = goals.get(goal_id)
        while goal and goal.id not in affected:
            affected.add(goal.id)
            goal = goals.get(goal.parent_id)
    return affected
