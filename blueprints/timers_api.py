from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import os
import models
from sqlalchemy.orm import joinedload
from models import (
    get_session,
    ActivityInstance, Session,
    ActivityDefinition,
    validate_root_goal
)
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, internal_error, require_owned_root
from services.events import event_bus, Event, Events
from services.serializers import serialize_activity_instance

# Create blueprint
timers_bp = Blueprint('timers', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)


# ============================================================================
# ACTIVITY INSTANCE TIME TRACKING ENDPOINTS
# ============================================================================

@timers_bp.route('/<root_id>/activity-instances', methods=['GET', 'POST'])
@token_required
def activity_instances(current_user, root_id):
    """Get all activity instances (GET) or create a new one (POST) if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        if request.method == 'POST':
            # Create new activity instance
            data = request.get_json() or {}
            instance_id = data.get('instance_id')
            # Support session_id
            session_id = data.get('session_id')
            activity_definition_id = data.get('activity_definition_id')

            
            if not instance_id:
                instance_id = str(uuid.uuid4())
            
            if not session_id or not activity_definition_id:
                return jsonify({"error": "session_id and activity_definition_id required"}), 400

            session_record = db_session.query(Session).filter_by(id=session_id, root_id=root_id, deleted_at=None).first()
            if not session_record:
                return jsonify({"error": "Session not found in this fractal"}), 404

            activity_def = db_session.query(ActivityDefinition).filter_by(
                id=activity_definition_id, root_id=root_id, deleted_at=None
            ).first()
            if not activity_def:
                return jsonify({"error": "Activity definition not found in this fractal"}), 404
            
            # Check if instance already exists
            existing = db_session.query(ActivityInstance).filter_by(id=instance_id, root_id=root_id).first()
            if existing:
                return jsonify(serialize_activity_instance(existing))
            
            # Create new instance
            instance = ActivityInstance(
                id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                root_id=root_id  # Add root_id for performance
            )

            db_session.add(instance)
            
            # Get activity name directly from definition
            activity_def = db_session.query(ActivityDefinition).filter_by(
                id=activity_definition_id, root_id=root_id, deleted_at=None
            ).first()
            activity_name = activity_def.name if activity_def else 'Unknown'
            db_session.commit()
            
            # Emit event
            event_bus.emit_async(Event(Events.ACTIVITY_INSTANCE_CREATED, {
                'instance_id': instance.id,
                'activity_definition_id': activity_definition_id,
                'activity_name': activity_name,
                'session_id': session_id,
                'root_id': root_id
            }, source='timers_api.activity_instances'))
            
            return jsonify(serialize_activity_instance(instance)), 201
        
        else:  # GET
            # Get all sessions for this fractal
            sessions = db_session.query(Session.id).filter(
                Session.root_id == root_id,
                Session.deleted_at == None
            ).all()
            session_ids = [sid for (sid,) in sessions]
            if not session_ids:
                return jsonify([])

            instances_q = db_session.query(ActivityInstance).filter(
                ActivityInstance.session_id.in_(session_ids),
                ActivityInstance.deleted_at == None
            )
            limit, offset = parse_optional_pagination(request, max_limit=1000)
            if limit is not None:
                instances_q = instances_q.offset(offset).limit(limit)
            instances = instances_q.all()
            
            return jsonify([serialize_activity_instance(inst) for inst in instances])
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error listing/creating activity instances")
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>/start', methods=['POST'])
@token_required
def start_activity_timer(current_user, root_id, instance_id):
    """Start the timer for an activity instance if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the activity instance
        instance = (
            db_session.query(ActivityInstance)
            .options(joinedload(ActivityInstance.definition))
            .filter_by(id=instance_id, root_id=root_id, deleted_at=None)
            .first()
        )
        
        if not instance:
            # Instance doesn't exist yet - create it
            data = request.get_json(silent=True) or {}
            # Support session_id
            session_id = data.get('session_id')

            activity_definition_id = data.get('activity_definition_id')
            
            if not session_id or not activity_definition_id:
                return jsonify({"error": "session_id and activity_definition_id required"}), 400

            session_record = db_session.query(Session).filter_by(id=session_id, root_id=root_id, deleted_at=None).first()
            if not session_record:
                return jsonify({"error": "Session not found in this fractal"}), 404

            activity_def = db_session.query(ActivityDefinition).filter_by(
                id=activity_definition_id, root_id=root_id, deleted_at=None
            ).first()
            if not activity_def:
                return jsonify({"error": "Activity definition not found in this fractal"}), 404
            
            instance = ActivityInstance(
                id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                root_id=root_id  # Add root_id for performance
            )
            db_session.add(instance)
        
        # Set start time to now
        start_time = datetime.utcnow()
        instance.time_start = start_time
        # Clear stop time and duration if restarting
        instance.time_stop = None
        instance.duration_seconds = None
        
        # If the session is currently paused, immediately pause this new activity
        # so it doesn't accrue time while the session is paused.
        session_record = db_session.query(Session).filter_by(id=instance.session_id, root_id=root_id, deleted_at=None).first()
        if session_record and session_record.is_paused:
            instance.is_paused = True
            instance.last_paused_at = start_time
        else:
            instance.is_paused = False
            instance.last_paused_at = None
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id, root_id=root_id, deleted_at=None
        ).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        # Emit event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': instance.session_id,
            'root_id': root_id,
            'updated_fields': ['time_start']
        }, source='timers_api.start_activity_timer'))
        
        return jsonify(serialize_activity_instance(instance))
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error starting activity timer")
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>/complete', methods=['POST'])
@token_required
def complete_activity_instance(current_user, root_id, instance_id):
    """Complete an activity instance (sets stop time and marks as completed)."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter(
            ActivityInstance.id == instance_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None
        ).first()
        if not instance:
            return jsonify({
                "error": "Activity instance not found."
            }), 404
        
        if not instance.time_start:
            # Instant completion: Set start = stop = now
            now = datetime.utcnow()
            instance.time_start = now
            instance.time_stop = now
            instance.duration_seconds = 0
            instance.completed = True
        else:
            # Normal completion
            now = datetime.utcnow()
            instance.time_stop = now
            
            if instance.is_paused and instance.last_paused_at:
                paused_duration = (now - instance.last_paused_at).total_seconds()
                instance.total_paused_seconds = (instance.total_paused_seconds or 0) + int(paused_duration)
                instance.is_paused = False
                instance.last_paused_at = None
                
            duration = (instance.time_stop - instance.time_start).total_seconds()
            final_duration = max(0, int(duration) - (instance.total_paused_seconds or 0))
            instance.duration_seconds = final_duration
            instance.completed = True
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id, root_id=root_id, deleted_at=None
        ).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        completion_event = Event(Events.ACTIVITY_INSTANCE_COMPLETED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': instance.session_id,
            'root_id': root_id,
            'duration_seconds': instance.duration_seconds,
            'completed_at': instance.time_stop.isoformat()
        }, source='timers_api.complete_activity_instance')

        async_completion = (
            request.args.get("async_completion") == "1"
            or os.getenv("ASYNC_ACTIVITY_COMPLETION", "false").lower() in ("1", "true", "yes")
        )
        if async_completion:
            event_bus.emit_async(completion_event)
        else:
            event_bus.emit(completion_event)
        
        # Build response with achievement data
        result = serialize_activity_instance(instance)
        
        # Get any targets/goals that were achieved during this completion
        if async_completion:
            result['achieved_targets'] = []
            result['completed_goals'] = []
            result['evaluation_queued'] = True
        else:
            from services.completion_handlers import get_recent_achievements
            achievements = get_recent_achievements()
            result['achieved_targets'] = achievements.get('achieved_targets', [])
            result['completed_goals'] = achievements.get('completed_goals', [])
        
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error completing activity instance")
    finally:
        db_session.close()




def parse_iso_datetime(iso_string):
    """
    Parse ISO datetime string, handling various formats including milliseconds and 'Z' timezone.
    Returns timezone-naive UTC datetime object or None if empty/None.
    Raises ValueError if parsing fails.
    """
    if not iso_string:
        return None
    
    try:
        # Strip milliseconds if present (e.g., "2026-01-02T06:04:04.000Z" -> "2026-01-02T06:04:04Z")
        if '.' in iso_string and iso_string.endswith('Z'):
            iso_string = iso_string.split('.')[0] + 'Z'
        elif '.' in iso_string and '+' in iso_string:
            # Handle format like "2026-01-02T06:04:04.000+00:00"
            iso_string = iso_string.split('.')[0] + iso_string[iso_string.rfind('+'):]
        
        # Replace 'Z' with '+00:00' for compatibility
        normalized = iso_string.replace('Z', '+00:00')
        dt = datetime.fromisoformat(normalized)
        
        # Convert to timezone-naive UTC (to match database format from datetime.utcnow())
        if dt.tzinfo is not None:
            dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
        
        return dt
    except Exception as e:
        logger.warning("Failed to parse ISO datetime '%s': %s", iso_string, str(e))
        raise ValueError(f"Invalid datetime format: {iso_string}")



@timers_bp.route('/<root_id>/activity-instances/<instance_id>', methods=['PUT'])
@token_required
def update_activity_instance(current_user, root_id, instance_id):
    """Update an activity instance manually if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        data = request.get_json() or {}
        
        # Get the activity instance
        instance = (
            db_session.query(ActivityInstance)
            .options(joinedload(ActivityInstance.definition))
            .filter_by(id=instance_id, root_id=root_id, deleted_at=None)
            .first()
        )
        
        if not instance:
            # Create if missing, but we strictly need connection IDs
            # Support session_id
            session_id = data.get('session_id')

            activity_definition_id = data.get('activity_definition_id')
            
            if not session_id or not activity_definition_id:
                # If we lack info to create, and it doesn't exist, that's an issue for manual updates
                return jsonify({"error": "Instance not found and missing creation details"}), 404

            session_record = db_session.query(Session).filter_by(id=session_id, root_id=root_id, deleted_at=None).first()
            if not session_record:
                return jsonify({"error": "Session not found in this fractal"}), 404

            activity_def = db_session.query(ActivityDefinition).filter_by(
                id=activity_definition_id, root_id=root_id, deleted_at=None
            ).first()
            if not activity_def:
                return jsonify({"error": "Activity definition not found in this fractal"}), 404
            
            instance = ActivityInstance(
                id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                root_id=root_id  # Add root_id for performance
            )
            db_session.add(instance)
        
        # Update fields if present
        if 'time_start' in data:
            ts = data['time_start']
            try:
                instance.time_start = parse_iso_datetime(ts)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400
            
        if 'time_stop' in data:
            ts = data['time_stop']
            try:
                instance.time_stop = parse_iso_datetime(ts)
            except ValueError as e:
                return jsonify({"error": str(e)}), 400

        if 'completed' in data:
            instance.completed = bool(data['completed'])

        if 'notes' in data:
             instance.notes = data['notes']

        # Handle extended data (sets, etc)
        current_data = models._safe_load_json(instance.data, {})
        data_changed = False

        if 'sets' in data:
            current_data['sets'] = data['sets']
            data_changed = True
        
        if data_changed:
            instance.data = json.dumps(current_data)
            
        # Recalculate duration
        if instance.time_start and instance.time_stop:
            duration = (instance.time_stop - instance.time_start).total_seconds()
            instance.duration_seconds = int(duration)
        elif not instance.time_start or not instance.time_stop:
             instance.duration_seconds = None
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(
            id=instance.activity_definition_id, root_id=root_id, deleted_at=None
        ).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        # Emit event
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_UPDATED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': instance.session_id,
            'root_id': root_id,
            'updated_fields': list(data.keys())
        }, source='timers_api.update_activity_instance'))
        
        return jsonify(serialize_activity_instance(instance))
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Unexpected error updating activity instance")
    finally:
        db_session.close()

@timers_bp.route('/<root_id>/timers/session/<session_id>/pause', methods=['POST'])
@token_required
def pause_session(current_user, root_id, session_id):
    """Pause the session and all currently active activity instances."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        session = db_session.query(Session).filter_by(id=session_id, root_id=root_id, deleted_at=None).first()
        if not session:
            return jsonify({"error": "Session not found"}), 404
            
        if session.is_paused:
            return jsonify({"error": "Session is already paused"}), 400
            
        now = datetime.utcnow()
        session.is_paused = True
        session.last_paused_at = now
        
        # Pause active activity instances
        active_instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.time_start != None,
            ActivityInstance.time_stop == None,
            ActivityInstance.is_paused == False,
            ActivityInstance.deleted_at == None
        ).all()
        
        for instance in active_instances:
            instance.is_paused = True
            instance.last_paused_at = now
            
        db_session.commit()
        
        event_bus.emit(Event(Events.SESSION_UPDATED, {
            'session_id': session.id,
            'root_id': root_id,
        }, source='timers_api.pause_session'))
        
        from services.serializers import serialize_session
        return jsonify(serialize_session(session))
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error pausing session")
    finally:
        db_session.close()

@timers_bp.route('/<root_id>/timers/session/<session_id>/resume', methods=['POST'])
@token_required
def resume_session(current_user, root_id, session_id):
    """Resume the session and all currently paused activity instances."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        session = db_session.query(Session).filter_by(id=session_id, root_id=root_id, deleted_at=None).first()
        if not session:
            return jsonify({"error": "Session not found"}), 404
            
        if not session.is_paused:
            return jsonify({"error": "Session is not paused"}), 400
            
        now = datetime.utcnow()
        if session.last_paused_at:
            paused_duration = (now - session.last_paused_at).total_seconds()
            session.total_paused_seconds = (session.total_paused_seconds or 0) + int(paused_duration)
        
        session.is_paused = False
        session.last_paused_at = None
        
        # Resume paused activity instances
        paused_instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.time_start != None,
            ActivityInstance.time_stop == None,
            ActivityInstance.is_paused == True,
            ActivityInstance.deleted_at == None
        ).all()
        
        for instance in paused_instances:
            if instance.last_paused_at:
                paused_duration = (now - instance.last_paused_at).total_seconds()
                instance.total_paused_seconds = (instance.total_paused_seconds or 0) + int(paused_duration)
            instance.is_paused = False
            instance.last_paused_at = None
            
        db_session.commit()
        
        event_bus.emit(Event(Events.SESSION_UPDATED, {
            'session_id': session.id,
            'root_id': root_id,
        }, source='timers_api.resume_session'))
        
        from services.serializers import serialize_session
        return jsonify(serialize_session(session))
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error resuming session")
    finally:
        db_session.close()
