"""
Event System for Fractal Goals

A generalized pub/sub event system that enables loose coupling between
components. Any part of the application can emit events, and any number
of handlers can subscribe to react to those events.

Usage:
    from services.events import event_bus, Event
    
    # Register a handler
    @event_bus.on('goal.completed')
    def handle_goal_completed(event):
        logger.info("Goal %s was completed", event.data['goal_id'])
    
    # Emit an event
    event_bus.emit(Event('goal.completed', {'goal_id': '123', 'goal_name': 'My Goal'}))

Event Naming Convention:
    Use dot-notation: <entity>.<action>
    Examples:
        - session.completed
        - goal.completed  
        - target.achieved
        - activity.created
        - program.updated
"""

import logging
from datetime import datetime, timezone
from typing import Any, Callable, Dict, List, Optional
from dataclasses import dataclass, field
import uuid

logger = logging.getLogger(__name__)


@dataclass
class Event:
    """
    Represents a domain event.
    
    Attributes:
        name: Event name in dot-notation (e.g., 'goal.completed')
        data: Event payload containing relevant data
        id: Unique event ID for tracking/debugging
        timestamp: When the event was created
        source: Optional identifier of what triggered this event
    """
    name: str
    data: Dict[str, Any] = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    timestamp: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    source: Optional[str] = None
    
    def __repr__(self):
        return f"Event({self.name}, data={self.data}, id={self.id[:8]})"


class EventBus:
    """
    Central event dispatcher that manages event subscriptions and emissions.
    
    Supports:
    - Exact event name matching (e.g., 'goal.completed')
    - Wildcard matching (e.g., 'goal.*' matches all goal events)
    - Global handlers (e.g., '*' matches all events)
    """
    
    def __init__(self):
        self._handlers: Dict[str, List[Callable[[Event], None]]] = {}
        self._enabled = True
    
    def on(self, event_name: str):
        """
        Decorator to register an event handler.
        
        Usage:
            @event_bus.on('goal.completed')
            def my_handler(event):
                pass
        """
        def decorator(handler: Callable[[Event], None]):
            self.subscribe(event_name, handler)
            return handler
        return decorator
    
    def subscribe(self, event_name: str, handler: Callable[[Event], None]):
        """Register a handler for an event type."""
        if event_name not in self._handlers:
            self._handlers[event_name] = []
        self._handlers[event_name].append(handler)
        logger.debug(f"Subscribed {handler.__name__} to '{event_name}'")
    
    def unsubscribe(self, event_name: str, handler: Callable[[Event], None]):
        """Remove a handler from an event type."""
        if event_name in self._handlers:
            self._handlers[event_name] = [h for h in self._handlers[event_name] if h != handler]
    
    def emit(self, event: Event) -> List[Any]:
        """
        Emit an event to all registered handlers.
        
        Returns list of results from handlers (for debugging/testing).
        Handlers are called synchronously in registration order.
        """
        if not self._enabled:
            logger.debug(f"Event bus disabled, skipping: {event}")
            return []
        
        logger.info(f"Event: {event.name} | data={event.data}")
        
        results = []
        handlers = self._get_matching_handlers(event.name)
        
        for handler in handlers:
            try:
                result = handler(event)
                results.append(result)
            except Exception as e:
                logger.exception(f"Error in handler {handler.__name__} for event {event.name}: {e}")
        
        return results
    
    def _get_matching_handlers(self, event_name: str) -> List[Callable]:
        """Get all handlers that match the event name (including wildcards)."""
        handlers = []
        
        # Exact match
        if event_name in self._handlers:
            handlers.extend(self._handlers[event_name])
        
        # Wildcard match (e.g., 'goal.*' matches 'goal.completed')
        parts = event_name.split('.')
        if len(parts) > 1:
            wildcard = f"{parts[0]}.*"
            if wildcard in self._handlers:
                handlers.extend(self._handlers[wildcard])
        
        # Global handlers
        if '*' in self._handlers:
            handlers.extend(self._handlers['*'])
        
        return handlers
    
    def disable(self):
        """Disable event emission (useful for testing/migrations)."""
        self._enabled = False
    
    def enable(self):
        """Re-enable event emission."""
        self._enabled = True
    
    def clear(self):
        """Remove all handlers (useful for testing)."""
        self._handlers.clear()


# Global event bus instance
event_bus = EventBus()


# ============================================================================
# STANDARD EVENT NAMES
# ============================================================================

class Events:
    """Standard event name constants for type-safety and discoverability."""
    
    # Session events
    SESSION_CREATED = 'session.created'
    SESSION_UPDATED = 'session.updated'
    SESSION_COMPLETED = 'session.completed'
    SESSION_DELETED = 'session.deleted'
    
    # Goal events
    GOAL_CREATED = 'goal.created'
    GOAL_UPDATED = 'goal.updated'
    GOAL_COMPLETED = 'goal.completed'
    GOAL_UNCOMPLETED = 'goal.uncompleted'
    GOAL_DELETED = 'goal.deleted'
    
    # Target events
    TARGET_ACHIEVED = 'target.achieved'
    TARGET_REVERTED = 'target.reverted'
    TARGET_CREATED = 'target.created'
    TARGET_DELETED = 'target.deleted'
    
    # Activity Instance events
    ACTIVITY_INSTANCE_CREATED = 'activity_instance.created'
    ACTIVITY_INSTANCE_DELETED = 'activity_instance.deleted'
    ACTIVITY_INSTANCE_UPDATED = 'activity_instance.updated'
    ACTIVITY_INSTANCE_COMPLETED = 'activity_instance.completed'
    ACTIVITY_METRICS_UPDATED = 'activity_instance.metrics_updated'
    
    # Program events
    PROGRAM_CREATED = 'program.created'
    PROGRAM_UPDATED = 'program.updated'
    PROGRAM_DELETED = 'program.deleted'
    PROGRAM_COMPLETED = 'program.completed'
    PROGRAM_DAY_COMPLETED = 'program.day_completed'
    
    # Activity Definition events
    ACTIVITY_CREATED = 'activity.created'
    ACTIVITY_UPDATED = 'activity.updated'
    ACTIVITY_DELETED = 'activity.deleted'
    
    # Activity Group events
    ACTIVITY_GROUP_CREATED = 'activity_group.created'
    ACTIVITY_GROUP_UPDATED = 'activity_group.updated'
    ACTIVITY_GROUP_DELETED = 'activity_group.deleted'
    
    # Block events
    PROGRAM_BLOCK_CREATED = 'program_block.created'
    PROGRAM_BLOCK_UPDATED = 'program_block.updated'
    PROGRAM_BLOCK_COMPLETED = 'program.block_completed'

    # Program Day events
    PROGRAM_DAY_CREATED = 'program_day.created'
    PROGRAM_DAY_UPDATED = 'program_day.updated'
    PROGRAM_DAY_DELETED = 'program_day.deleted'

    # Association events
    GOAL_BLOCK_ASSOCIATED = 'goal.block_associated'

    # Session Template events
    SESSION_TEMPLATE_CREATED = 'session_template.created'
    SESSION_TEMPLATE_UPDATED = 'session_template.updated'
