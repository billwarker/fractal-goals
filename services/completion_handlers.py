"""
Completion Handlers

Event handlers for managing completion cascades:
- When a session is completed → evaluate targets for linked goals
- When targets are achieved → auto-complete goals if all targets met
- When a goal is completed → update parent goals and programs

These handlers subscribe to the event bus and react to completion-related events.
"""

import logging

from services.events import event_bus, Event, Events
from services.progress_service import ProgressService
from services.goal_domain_rules import (
    goal_uses_child_completion,
)
import models
from models import (
    get_session,
    Goal,
    Session,
    ActivityInstance,
)
from services._completion_context import _emit_pending_events, set_live_progress
from services._completion_context import (  # noqa: F401 - re-exported for existing imports
    clear_achievement_context,
    clear_live_progress,
    get_live_progress,
    get_recent_achievements,
)
from services._completion_programs import _check_parent_completion, _update_program_progress
from services._completion_targets import (
    _evaluate_goal_targets,
    _revert_achievements_for_instance,
    _run_evaluation_for_instance,
    _serialize_instance_for_target_evaluation,
)

logger = logging.getLogger(__name__)


def _resolve_db_session(event: Event):
    db_session = (event.context or {}).get('db_session')
    owns_session = db_session is None
    if owns_session:
        db_session = _get_db_session()
    return db_session, owns_session


def _close_if_owned(db_session, owns_session: bool):
    if owns_session and db_session is not None:
        db_session.close()


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

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
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
            instances_by_activity[activity_id].append(_serialize_instance_for_target_evaluation(inst))

        # Evaluate targets for each linked goal
        # Evaluate targets for each linked goal
        for goal in linked_goals:
            _evaluate_goal_targets(
                db_session,
                goal,
                instances_by_activity,
                session_id,
                pending_events=pending_events,
            )

        db_session.commit()
        _emit_pending_events(pending_events)

    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling session completion: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


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

    if not instance_id or 'completed' not in updated_fields:
        return

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return

        # If instance was explicitly marked incomplete, revert its achievements.
        if not instance.completed:
            _revert_achievements_for_instance(db_session, instance_id, pending_events=pending_events)
            db_session.commit()
        # If instance was JUST marked complete, evaluate targets
        elif instance.completed:
            logger.info(f"[ACTIVITY_UPDATED] Instance {instance_id} marked complete. Evaluating targets.")

            # Use same logic as handle_activity_instance_completed but wrapperized
            _run_evaluation_for_instance(
                db_session,
                instance,
                session_id,
                root_id,
                pending_events=pending_events,
            )
            db_session.commit()
        _emit_pending_events(pending_events)

    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance update: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


@event_bus.on(Events.ACTIVITY_METRICS_UPDATED)
def handle_activity_metrics_updated(event: Event):
    """
    When metrics/sets change on a completed instance, recompute threshold-driven
    targets/goals. Incomplete instances should not persist target state from
    metric edits alone.
    """
    instance_id = event.data.get('instance_id')
    root_id = event.data.get('root_id')
    session_id = event.data.get('session_id')
    if not all([instance_id, root_id, session_id]):
        return

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance or not instance.completed:
            return

        _revert_achievements_for_instance(db_session, instance_id, pending_events=pending_events)
        _run_evaluation_for_instance(
            db_session,
            instance,
            session_id,
            root_id,
            pending_events=pending_events,
        )
        comparison = None
        try:
            comparison = ProgressService(db_session).get_progress_for_instance(instance_id)
        except Exception as progress_err:  # Live progress is best-effort; the metric update must still commit.
            logger.warning("Error calculating dynamic progress for instance %s: %s", instance_id, progress_err)

        db_session.commit()
        _emit_pending_events(pending_events)
        set_live_progress(instance_id, comparison)
    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity metrics update: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


@event_bus.on(Events.ACTIVITY_INSTANCE_COMPLETED)
def handle_activity_instance_completed(event: Event):
    """
    When an activity instance is completed, evaluate THRESHOLD targets for linked goals.
    """
    instance_id = event.data.get('instance_id')
    root_id = event.data.get('root_id')

    if not all([instance_id, root_id]): # Removed session_id from this check
        return

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return

        _run_evaluation_for_instance(
            db_session,
            instance,
            instance.session_id,
            root_id,
            pending_events=pending_events,
        )
        db_session.commit()
        _emit_pending_events(pending_events)
    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance completion: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


@event_bus.on(Events.ACTIVITY_INSTANCE_DELETED)
def handle_activity_instance_deleted(event: Event):
    """
    When an activity instance is deleted, revert targets achieved by it.
    """
    instance_id = event.data.get('instance_id')
    if not instance_id:
        return

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        _revert_achievements_for_instance(db_session, instance_id, pending_events=pending_events)
        db_session.commit()
        _emit_pending_events(pending_events)
    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling activity instance deletion: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


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

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return

        # Check if parent goal has completed_via_children enabled (per-goal or level default)
        if goal.parent_id:
            parent = db_session.query(Goal).filter_by(id=goal.parent_id).first()
            if parent:
                if goal_uses_child_completion(parent):
                    _check_parent_completion(db_session, parent, pending_events=pending_events)

        # Update any programs this goal is part of
        _update_program_progress(db_session, goal, pending_events=pending_events)

        db_session.commit()
        _emit_pending_events(pending_events)

    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error handling goal completion: {e}")
    finally:
        _close_if_owned(db_session, owns_session)


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
