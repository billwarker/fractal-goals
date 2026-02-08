from flask import Blueprint, request, jsonify
from datetime import datetime
import json
import uuid
import models
from sqlalchemy.orm import joinedload
from models import (
    get_session,
    ActivityInstance, Session,
    ActivityDefinition,
    validate_root_goal
)
from blueprints.auth_api import token_required
from services.events import event_bus, Event, Events
from services.serializers import serialize_activity_instance

# Create blueprint
timers_bp = Blueprint('timers', __name__, url_prefix='/api')


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
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        if request.method == 'POST':
            # Create new activity instance
            data = request.get_json() or {}
            instance_id = data.get('instance_id')
            # Support both new session_id and legacy practice_session_id
            session_id = data.get('session_id') or data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not instance_id:
                instance_id = str(uuid.uuid4())
            
            if not session_id or not activity_definition_id:
                return jsonify({"error": "session_id and activity_definition_id required"}), 400
            
            # Check if instance already exists
            existing = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
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
            activity_def = db_session.query(ActivityDefinition).filter_by(id=activity_definition_id).first()
            activity_name = activity_def.name if activity_def else 'Unknown'
            db_session.commit()
            
            # Emit event
            event_bus.emit(Event(Events.ACTIVITY_INSTANCE_CREATED, {
                'instance_id': instance.id,
                'activity_definition_id': activity_definition_id,
                'activity_name': activity_name,
                'session_id': session_id,
                'root_id': root_id
            }, source='timers_api.activity_instances'))
            
            return jsonify(serialize_activity_instance(instance)), 201
        
        else:  # GET
            # Get all sessions for this fractal
            sessions = db_session.query(Session).filter(Session.root_id == root_id, Session.deleted_at == None).all()
            session_ids = [s.id for s in sessions]
            
            # Get all activity instances for these sessions
            instances = db_session.query(ActivityInstance).filter(
                ActivityInstance.session_id.in_(session_ids),
                ActivityInstance.deleted_at == None
            ).all()
            
            return jsonify([serialize_activity_instance(inst) for inst in instances])
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the activity instance
        from sqlalchemy.orm import joinedload
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter_by(id=instance_id).first()
        print(f"[START TIMER] Instance found: {instance is not None}")
        
        if not instance:
            # Instance doesn't exist yet - create it
            data = request.get_json(silent=True) or {}
            # Support both new session_id and legacy practice_session_id
            session_id = data.get('session_id') or data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            print(f"[START TIMER] Creating new instance - session: {session_id}, activity: {activity_definition_id}")
            
            if not session_id or not activity_definition_id:
                return jsonify({"error": "session_id and activity_definition_id required"}), 400
            
            instance = ActivityInstance(
                id=instance_id,
                session_id=session_id,
                activity_definition_id=activity_definition_id,
                root_id=root_id  # Add root_id for performance
            )
            db_session.add(instance)
            print(f"[START TIMER] Instance added to session")
        
        # Set start time to now
        start_time = datetime.utcnow()
        instance.time_start = start_time
        # Clear stop time and duration if restarting
        instance.time_stop = None
        instance.duration_seconds = None
        
        print(f"[START TIMER] Set time_start to: {start_time}")
        print(f"[START TIMER] Instance time_start before commit: {instance.time_start}")
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
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
        
        print(f"[START TIMER] Committed successfully")
        print(f"[START TIMER] Instance time_start after commit: {instance.time_start}")
        
        result = serialize_activity_instance(instance)
        print(f"[START TIMER] Returning: {result}")
        
        return jsonify(result)
        
    except Exception as e:
        print(f"[START TIMER ERROR] {str(e)}")
        import traceback
        traceback.print_exc()
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the activity instance
        from sqlalchemy.orm import joinedload
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter(ActivityInstance.id == instance_id, ActivityInstance.deleted_at == None).first()
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
            instance.time_stop = datetime.utcnow()
            duration = (instance.time_stop - instance.time_start).total_seconds()
            instance.duration_seconds = int(duration)
            instance.completed = True
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
        activity_name = activity_def.name if activity_def else 'Unknown'
        db_session.commit()
        
        # Emit completion event - this triggers target evaluation synchronously
        event_bus.emit(Event(Events.ACTIVITY_INSTANCE_COMPLETED, {
            'instance_id': instance.id,
            'activity_definition_id': instance.activity_definition_id,
            'activity_name': activity_name,
            'session_id': instance.session_id,
            'root_id': root_id,
            'duration_seconds': instance.duration_seconds,
            'completed_at': instance.time_stop.isoformat()
        }, source='timers_api.complete_activity_instance'))
        
        # Build response with achievement data
        result = serialize_activity_instance(instance)
        
        # Get any targets/goals that were achieved during this completion
        from services.completion_handlers import get_recent_achievements
        achievements = get_recent_achievements()
        result['achieved_targets'] = achievements.get('achieved_targets', [])
        result['completed_goals'] = achievements.get('completed_goals', [])
        
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
            dt = dt.replace(tzinfo=None)
        
        return dt
    except Exception as e:
        print(f"[DATETIME PARSE ERROR] Failed to parse '{iso_string}': {str(e)}")
        raise ValueError(f"Invalid datetime format: {iso_string}")



@timers_bp.route('/<root_id>/activity-instances/<instance_id>', methods=['PUT'])
@token_required
def update_activity_instance(current_user, root_id, instance_id):
    """Update an activity instance manually if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        data = request.get_json() or {}
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).options(joinedload(ActivityInstance.definition)).filter_by(id=instance_id).first()
        
        if not instance:
            # Create if missing, but we strictly need connection IDs
            # Support both new session_id and legacy practice_session_id
            session_id = data.get('session_id') or data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not session_id or not activity_definition_id:
                # If we lack info to create, and it doesn't exist, that's an issue for manual updates
                return jsonify({"error": "Instance not found and missing creation details"}), 404
            
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
            print(f"[UPDATE INSTANCE] Parsing time_start: {ts}")
            try:
                instance.time_start = parse_iso_datetime(ts)
                print(f"[UPDATE INSTANCE] Parsed time_start: {instance.time_start}")
            except ValueError as e:
                print(f"[UPDATE INSTANCE ERROR] {str(e)}")
                return jsonify({"error": str(e)}), 400
            
        if 'time_stop' in data:
            ts = data['time_stop']
            print(f"[UPDATE INSTANCE] Parsing time_stop: {ts}")
            try:
                instance.time_stop = parse_iso_datetime(ts)
                print(f"[UPDATE INSTANCE] Parsed time_stop: {instance.time_stop}")
            except ValueError as e:
                print(f"[UPDATE INSTANCE ERROR] {str(e)}")
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
            print(f"[UPDATE INSTANCE] Calculated duration: {instance.duration_seconds}s")
        elif not instance.time_start or not instance.time_stop:
             instance.duration_seconds = None
        
        # Get activity name directly from definition
        activity_def = db_session.query(ActivityDefinition).filter_by(id=instance.activity_definition_id).first()
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
        
        print(f"[UPDATE INSTANCE] Successfully updated instance")
        
        return jsonify(serialize_activity_instance(instance))
        
    except Exception as e:
        print(f"[UPDATE INSTANCE ERROR] Unexpected error: {str(e)}")
        import traceback
        traceback.print_exc()
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
