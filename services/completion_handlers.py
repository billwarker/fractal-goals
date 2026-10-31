"""
Completion Handlers

Event handlers for managing completion cascades:
- When activity evidence changes (an instance is completed, edited, deleted, or its session is
  completed or deleted) → re-evaluate every goal whose activity threshold watches that activity
- When a goal is completed → complete a parent that completes via its children, and update programs

These handlers subscribe to the event bus and react to completion-related events.
"""

import logging

from services.events import event_bus, Event, Events
from services.progress_service import ProgressService
from services.goal_domain_rules import goal_completes_via_children
from services.goal_condition_service import (
    activities_with_condition_tag,
    activities_with_conditions,
    reconcile_activity_conditions,
)
import models
from models import (
    get_session,
    Goal,
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


def _reconcile_activities(db_session, root_id, activity_ids, pending_events, *, trigger):
    watched = activities_with_conditions(db_session, root_id, {activity_id for activity_id in activity_ids if activity_id})
    if not watched:
        return
    from services.goal_loading import load_fractal_goals_for_serialization
    goals_by_id = load_fractal_goals_for_serialization(db_session, root_id)
    for activity_id in sorted(watched):
        reconcile_activity_conditions(
            db_session, root_id, activity_id, pending_events, trigger=trigger, goals_by_id=goals_by_id,
        )


def _session_activity_ids(db_session, session_id):
    return {
        activity_id for (activity_id,) in db_session.query(ActivityInstance.activity_definition_id).filter(
            ActivityInstance.session_id == session_id,
        ).distinct()
    }


def _handle_evidence_change(event: Event, *, root_id, activity_ids, trigger, after=None):
    if not root_id or not activity_ids:
        return
    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        _reconcile_activities(db_session, root_id, activity_ids, pending_events, trigger=trigger)
        if after is not None:
            after(db_session)
        db_session.commit()
        _emit_pending_events(pending_events)
    # Handler boundary: roll back and log; a failed cascade must not fail the emitter.
    except Exception as e:
        db_session.rollback()
        logger.exception(f"Error reconciling goal conditions ({trigger}): {e}")
    finally:
        _close_if_owned(db_session, owns_session)


@event_bus.on(Events.SESSION_COMPLETED)
def handle_session_completed(event: Event):
    """Re-evaluate conditions watching any activity performed in the completed session."""
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    if not session_id or not root_id:
        logger.warning(f"SESSION_COMPLETED missing required data: {event.data}")
        return
    db_session, owns_session = _resolve_db_session(event)
    try:
        activity_ids = _session_activity_ids(db_session, session_id)
    finally:
        _close_if_owned(db_session, owns_session)
    _handle_evidence_change(event, root_id=root_id, activity_ids=activity_ids, trigger='session_completed')


@event_bus.on(Events.SESSION_DELETED)
def handle_session_deleted(event: Event):
    """A deleted session's instances stop counting; revert anything they alone satisfied."""
    session_id = event.data.get('session_id')
    root_id = event.data.get('root_id')
    if not session_id or not root_id:
        return
    db_session, owns_session = _resolve_db_session(event)
    try:
        activity_ids = _session_activity_ids(db_session, session_id)
    finally:
        _close_if_owned(db_session, owns_session)
    _handle_evidence_change(event, root_id=root_id, activity_ids=activity_ids, trigger='session_deleted')


def _instance_activity(event: Event):
    """(root_id, activity_id) for the instance an event names, read from the payload when present."""
    root_id = event.data.get('root_id')
    activity_id = event.data.get('activity_definition_id')
    if root_id and activity_id:
        return root_id, activity_id
    instance_id = event.data.get('instance_id')
    if not instance_id:
        return None, None
    db_session, owns_session = _resolve_db_session(event)
    try:
        instance = db_session.get(ActivityInstance, instance_id)
        if instance is None:
            return root_id, activity_id
        return root_id or instance.root_id, instance.activity_definition_id
    finally:
        _close_if_owned(db_session, owns_session)


@event_bus.on(Events.ACTIVITY_INSTANCE_UPDATED)
def handle_activity_instance_updated(event: Event):
    """Completion or result edits change evidence; re-evaluate the activity's conditions."""
    updated_fields = set(event.data.get('updated_fields', []))
    if not ({'completed', 'metric_values', 'metrics', 'sets'} & updated_fields):
        return
    root_id, activity_id = _instance_activity(event)
    _handle_evidence_change(event, root_id=root_id, activity_ids={activity_id}, trigger='activity_instance_updated')


@event_bus.on(Events.ACTIVITY_METRICS_UPDATED)
def handle_activity_metrics_updated(event: Event):
    """Recompute conditions after result edits on a completed instance, and live progress."""
    instance_id = event.data.get('instance_id')
    if not instance_id:
        return
    root_id, activity_id = _instance_activity(event)

    def record_live_progress(db_session):
        instance = db_session.get(ActivityInstance, instance_id)
        if instance is None or not instance.completed:
            return
        comparison = None
        try:
            comparison = ProgressService(db_session).get_progress_for_instance(instance_id)
        except Exception as progress_err:  # Live progress is best-effort; the metric update must still commit.
            logger.warning("Error calculating dynamic progress for instance %s: %s", instance_id, progress_err)
        set_live_progress(instance_id, comparison)

    _handle_evidence_change(
        event, root_id=root_id, activity_ids={activity_id}, trigger='activity_metrics_updated',
        after=record_live_progress,
    )


@event_bus.on(Events.ACTIVITY_INSTANCE_COMPLETED)
def handle_activity_instance_completed(event: Event):
    """A completed instance is new evidence for the activity's conditions."""
    root_id, activity_id = _instance_activity(event)
    _handle_evidence_change(event, root_id=root_id, activity_ids={activity_id}, trigger='activity_instance_completed')


@event_bus.on(Events.ACTIVITY_INSTANCE_DELETED)
def handle_activity_instance_deleted(event: Event):
    """A deleted instance stops counting; revert anything it alone satisfied."""
    root_id, activity_id = _instance_activity(event)
    _handle_evidence_change(event, root_id=root_id, activity_ids={activity_id}, trigger='activity_instance_deleted')


@event_bus.on(Events.ACTIVITY_TAG_ASSIGNMENTS_UPDATED)
def handle_activity_tag_assignments_updated(event: Event):
    """Tagged thresholds count only tagged sets, so retagging changes evidence."""
    root_id, activity_id = _instance_activity(event)
    _handle_evidence_change(event, root_id=root_id, activity_ids={activity_id}, trigger='activity_tags_updated')


@event_bus.on(Events.ACTIVITY_TAG_MERGED)
def handle_activity_tag_merged(event: Event):
    """Sets that carried a merged-away tag now carry the target; re-check thresholds on it."""
    root_id = event.data.get('root_id')
    tag_id = event.data.get('activity_tag_definition_id')
    if not root_id or not tag_id:
        return
    db_session, owns_session = _resolve_db_session(event)
    try:
        activity_ids = activities_with_condition_tag(db_session, root_id, tag_id)
    finally:
        _close_if_owned(db_session, owns_session)
    _handle_evidence_change(event, root_id=root_id, activity_ids=activity_ids, trigger='activity_tag_merged')


@event_bus.on(Events.GOAL_COMPLETED)
def handle_goal_completed(event: Event):
    """
    When a goal is completed, update parent goals and programs.

    Expected event.data:
        - goal_id: str
        - root_id: str
    """
    goal_id = event.data.get('goal_id')

    if not goal_id:
        return

    logger.info(f"Processing goal completion: {goal_id}")

    db_session, owns_session = _resolve_db_session(event)
    pending_events = []
    try:
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return

        # A parent that completes via its children completes once every child has.
        if goal.parent_id:
            parent = db_session.query(Goal).filter_by(id=goal.parent_id).first()
            if parent and goal_completes_via_children(parent):
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
