"""
Services Package

This package contains centralized business logic services that operate
independently of the API layer.

Key components:
- events: Pub/sub event system for loose coupling
- completion_handlers: Handlers for completion cascades

Usage:
    from services import event_bus, Event, Events
    from services import init_services
    
    # Initialize on app startup
    init_services()
    
    # Emit events
    event_bus.emit(Event(Events.SESSION_COMPLETED, {'session_id': '...'}))
"""

from services.events import event_bus, Event, Events, EventBus
from services.completion_handlers import init_completion_handlers
from services.event_logger import setup_event_logging
from services.analytics_cache import setup_analytics_cache_invalidation


def init_services():
    """
    Initialize all services.
    Call this on application startup.
    """
    init_completion_handlers()
    setup_event_logging()
    setup_analytics_cache_invalidation()
    # Add future service initializations here


__all__ = [
    'event_bus',
    'Event', 
    'Events',
    'EventBus',
    'init_services'
]
