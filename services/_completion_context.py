"""Request-scoped completion context: deferred event emission, live progress, and achievements.

Thread-local state is reset at request boundaries by the app and test app.
"""

import threading
from services.events import event_bus, Event


def _queue_event(pending_events, event: Event):
    if pending_events is None:
        event_bus.emit(event)
        return
    pending_events.append(event)


def _emit_pending_events(pending_events):
    for event in pending_events or []:
        event_bus.emit(event)


def _event_context(db_session):
    return {'db_session': db_session} if db_session is not None else {}


def _build_event(name, data, db_session=None, source=None):
    return Event(name, data, source=source, context=_event_context(db_session))


# Thread-local storage for tracking achievements during a request
_achievement_context = threading.local()


# Thread-local storage for live progress comparisons during a request
_live_progress_context = threading.local()


def set_live_progress(instance_id: str, comparison):
    """Store a live progress comparison for the current request."""
    if not hasattr(_live_progress_context, 'comparisons'):
        _live_progress_context.comparisons = {}
    _live_progress_context.comparisons[instance_id] = comparison


def get_live_progress(instance_id: str):
    """Retrieve a live progress comparison stored during the current request."""
    if not hasattr(_live_progress_context, 'comparisons'):
        return None
    return _live_progress_context.comparisons.get(instance_id)


def clear_live_progress():
    """Clear all live progress comparisons. Should be called at the start of a request."""
    _live_progress_context.comparisons = {}


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
