import logging
import models
from models import EventLog, get_session
from services.events import event_bus, Event, Events

logger = logging.getLogger(__name__)

def _get_db_session():
    """Get a new database session."""
    engine = models.get_engine()
    return get_session(engine)

def setup_event_logging():
    """
    Subscribe to all events and log them to the database.
    """
    @event_bus.on('*')
    def log_event_to_db(event: Event):
        # We need to filter out some internal events if necessary, 
        # or just log everything. The user said "all activities that would generate an event".
        


        # Define the worker function
        def worker(evt: Event):
            root_id = evt.data.get('root_id')
            if not root_id:
                logger.debug(f"Event {evt.name} missing root_id, skipping database log")
                return

            try:
                description = _get_event_description(evt)
                entity_type, entity_id = _get_entity_info(evt)
                
                db_session = _get_db_session()
                try:
                    log_entry = EventLog(
                        root_id=root_id,
                        event_type=evt.name,
                        entity_type=entity_type,
                        entity_id=entity_id,
                        description=description,
                        payload=evt.data,
                        source=evt.source or 'system',
                        timestamp=evt.timestamp
                    )
                    db_session.add(log_entry)
                    db_session.commit()
                except Exception as e:
                    db_session.rollback()
                    logger.error(f"Failed to log event {evt.name} to database: {e}")
                finally:
                    db_session.close()
            except Exception as e:
                logger.error(f"Error preparing log for {evt.name}: {e}")

        # Start thread
        import threading
        t = threading.Thread(target=worker, args=(event,))
        t.daemon = True # Don't block app exit
        t.start()

def _get_entity_info(event: Event):
    """Extract entity type and ID from event name and data."""
    parts = event.name.split('.')
    entity_type = parts[0] if len(parts) > 0 else 'unknown'
    
    # Common ID field names - ordered by specificity
    id_fields = [
        f"{entity_type}_id", 
        'instance_id',
        'activity_id',
        'day_id',
        'block_id',
        'template_id',
        'target_id',
        'goal_id', 
        'session_id', 
        'program_id',
        'group_id',
        'id'
    ]
    
    entity_id = None
    for field in id_fields:
        if field in event.data:
            entity_id = event.data[field]
            break
            
    return entity_type, entity_id

def _get_event_description(event: Event):
    """Generate a human-readable description for the event."""
    name = (
        event.data.get('activity_name') or 
        event.data.get('name') or 
        event.data.get('goal_name') or 
        event.data.get('session_name') or
        event.data.get('program_name') or
        event.data.get('day_name') or
        event.data.get('block_name')
    )
    
    # helper for goal updates
    goal_update_suffix = ""
    if event.name == Events.GOAL_UPDATED and 'updated_fields' in event.data:
        fields = event.data['updated_fields']
        if 'deadline' in fields:
            goal_update_suffix = " (Deadline updated)"
    
    descriptions = {
        Events.SESSION_CREATED: f"Created session: {name}" if name else "Created a new session",
        Events.SESSION_UPDATED: f"Updated session: {name}" if name else "Updated session",
        Events.SESSION_COMPLETED: f"Completed session: {name}" if name else "Completed session",
        Events.SESSION_DELETED: f"Deleted session: {name}" if name else "Deleted session",
        
        Events.GOAL_CREATED: f"Created goal: {name}" if name else "Created a new goal",
        Events.GOAL_UPDATED: f"Updated goal: {name}{goal_update_suffix}" if name else "Updated goal",
        Events.GOAL_COMPLETED: f"Completed goal: {name}" if name else "Goal completed",
        Events.GOAL_UNCOMPLETED: f"Uncompleted goal: {name}" if name else "Goal uncompleted",
        Events.GOAL_DELETED: f"Deleted goal: {name}" if name else "Deleted goal",
        Events.GOAL_BLOCK_ASSOCIATED: f"Associated goal '{event.data.get('goal_name', 'Unknown')}' to block '{event.data.get('block_name', 'Unknown')}'",
        
        Events.TARGET_ACHIEVED: f"Target achieved: {event.data.get('target_name', 'Unknown')}",
        Events.TARGET_CREATED: f"Created target: {event.data.get('target_name', 'Unknown')}",
        Events.TARGET_DELETED: f"Deleted target: {event.data.get('target_name', 'Unknown')}",
        
        Events.ACTIVITY_INSTANCE_CREATED: f"Started activity: {event.data.get('activity_name', 'Unknown')}",
        Events.ACTIVITY_INSTANCE_DELETED: f"Removed activity: {event.data.get('activity_name', 'Unknown')}",
        Events.ACTIVITY_INSTANCE_UPDATED: f"Updated activity: {event.data.get('activity_name', 'Unknown')}",
        Events.ACTIVITY_METRICS_UPDATED: f"Updated metrics for: {event.data.get('activity_name', 'Unknown')}",
        
        Events.PROGRAM_CREATED: f"Created program: {name}" if name else "Created program",
        Events.PROGRAM_UPDATED: f"Updated program: {name}" if name else "Updated program",
        Events.PROGRAM_DELETED: f"Deleted program: {name}" if name else "Deleted program",
        Events.PROGRAM_COMPLETED: f"Completed program: {name}" if name else "Program completed",
        Events.PROGRAM_DAY_COMPLETED: f"Completed program day: {event.data.get('day_name', 'Unknown')}",
        
        Events.PROGRAM_BLOCK_CREATED: f"Created block: {event.data.get('block_name', 'Unknown')}",
        Events.PROGRAM_BLOCK_UPDATED: f"Updated block: {event.data.get('block_name', 'Unknown')}",
        Events.PROGRAM_BLOCK_COMPLETED: f"Completed block: {event.data.get('block_name', 'Unknown')}",
        
        Events.PROGRAM_DAY_CREATED: f"Created program day: {event.data.get('day_name', 'Unknown')}",
        Events.PROGRAM_DAY_UPDATED: f"Updated program day: {event.data.get('day_name', 'Unknown')}",
        Events.PROGRAM_DAY_DELETED: f"Deleted program day: {event.data.get('day_name', 'Unknown')}",
        
        Events.ACTIVITY_CREATED: f"Created activity: {name}" if name else "Created activity",
        Events.ACTIVITY_UPDATED: f"Updated activity: {name}" if name else "Updated activity",
        Events.ACTIVITY_DELETED: f"Deleted activity: {name}" if name else "Deleted activity",
        
        Events.ACTIVITY_GROUP_CREATED: f"Created activity group: {name}" if name else "Created activity group",
        Events.ACTIVITY_GROUP_UPDATED: f"Updated activity group: {name}" if name else "Updated activity group",
        Events.ACTIVITY_GROUP_DELETED: f"Deleted activity group: {name}" if name else "Deleted activity group",

        Events.SESSION_TEMPLATE_CREATED: f"Created session template: {name}" if name else "Created session template",
        Events.SESSION_TEMPLATE_UPDATED: f"Updated session template: {name}" if name else "Updated session template",
    }
    
    return descriptions.get(event.name, f"Event {event.name} occurred")
