from flask import Blueprint, request, jsonify
from datetime import datetime
from models import (
    get_engine, get_session,
    ActivityInstance, PracticeSession,
    validate_root_goal
)

# Create blueprint
timers_bp = Blueprint('timers', __name__, url_prefix='/api')

# Initialize database engine
engine = get_engine()

# ============================================================================
# ACTIVITY INSTANCE TIME TRACKING ENDPOINTS
# ============================================================================

@timers_bp.route('/<root_id>/activity-instances', methods=['GET', 'POST'])
def activity_instances(root_id):
    """Get all activity instances (GET) or create a new one (POST)."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        if request.method == 'POST':
            # Create new activity instance
            data = request.get_json() or {}
            instance_id = data.get('instance_id')
            practice_session_id = data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not instance_id or not practice_session_id or not activity_definition_id:
                return jsonify({"error": "instance_id, practice_session_id, and activity_definition_id required"}), 400
            
            # Check if instance already exists
            existing = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
            if existing:
                return jsonify(existing.to_dict())
            
            # Create new instance
            instance = ActivityInstance(
                id=instance_id,
                practice_session_id=practice_session_id,
                activity_definition_id=activity_definition_id
            )
            db_session.add(instance)
            db_session.commit()
            
            return jsonify(instance.to_dict()), 201
        
        else:  # GET
            # Get all practice sessions for this fractal
            sessions = db_session.query(PracticeSession).filter_by(root_id=root_id).all()
            session_ids = [s.id for s in sessions]
            
            # Get all activity instances for these sessions
            instances = db_session.query(ActivityInstance).filter(
                ActivityInstance.practice_session_id.in_(session_ids)
            ).all()
            
            return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

@timers_bp.route('/<root_id>/activity-instances/<instance_id>/start', methods=['POST'])
def start_activity_timer(root_id, instance_id):
    """Start the timer for an activity instance."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            # Instance doesn't exist yet - create it
            data = request.get_json() or {}
            practice_session_id = data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not practice_session_id or not activity_definition_id:
                return jsonify({"error": "practice_session_id and activity_definition_id required"}), 400
            
            instance = ActivityInstance(
                id=instance_id,
                practice_session_id=practice_session_id,
                activity_definition_id=activity_definition_id
            )
            db_session.add(instance)
        
        # Set start time to now
        instance.time_start = datetime.now()
        # Clear stop time and duration if restarting
        instance.time_stop = None
        instance.duration_seconds = None
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances/<instance_id>/stop', methods=['POST'])
def stop_activity_timer(root_id, instance_id):
    """Stop the timer for an activity instance and calculate duration."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            # Instance doesn't exist - create it with current time as both start and stop
            # This handles the case where the page was refreshed or the instance creation is still pending
            data = request.get_json() or {}
            practice_session_id = data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not practice_session_id or not activity_definition_id:
                return jsonify({"error": "Activity instance not found and missing creation details (practice_session_id, activity_definition_id)"}), 404
            
            # Create instance with current time as both start and stop (0 duration)
            now = datetime.now()
            instance = ActivityInstance(
                id=instance_id,
                practice_session_id=practice_session_id,
                activity_definition_id=activity_definition_id,
                time_start=now,
                time_stop=now,
                duration_seconds=0
            )
            db_session.add(instance)
            db_session.commit()
            
            return jsonify(instance.to_dict())
        
        if not instance.time_start:
            # Timer was never started - set both start and stop to now (0 duration)
            now = datetime.now()
            instance.time_start = now
            instance.time_stop = now
            instance.duration_seconds = 0
        else:
            # Normal case - timer was started, now stopping it
            instance.time_stop = datetime.now()
            duration = (instance.time_stop - instance.time_start).total_seconds()
            instance.duration_seconds = int(duration)
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()



@timers_bp.route('/<root_id>/activity-instances/<instance_id>', methods=['PUT'])
def update_activity_instance(root_id, instance_id):
    """Update an activity instance manually (e.g. editing times)."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json() or {}
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        
        if not instance:
            # Create if missing, but we strictly need connection IDs
            practice_session_id = data.get('practice_session_id')
            activity_definition_id = data.get('activity_definition_id')
            
            if not practice_session_id or not activity_definition_id:
                # If we lack info to create, and it doesn't exist, that's an issue for manual updates
                # unless we want to fail
                return jsonify({"error": "Instance not found and missing creation details"}), 404
            
            instance = ActivityInstance(
                id=instance_id,
                practice_session_id=practice_session_id,
                activity_definition_id=activity_definition_id
            )
            db_session.add(instance)
        
        # Update fields if present
        if 'time_start' in data:
            ts = data['time_start']
            # Handle empty string or None as clearing the time
            instance.time_start = datetime.fromisoformat(ts.replace('Z', '+00:00')) if ts else None
            
        if 'time_stop' in data:
            ts = data['time_stop']
            instance.time_stop = datetime.fromisoformat(ts.replace('Z', '+00:00')) if ts else None
            
        # Recalculate duration
        if instance.time_start and instance.time_stop:
            duration = (instance.time_stop - instance.time_start).total_seconds()
            instance.duration_seconds = int(duration)
        elif not instance.time_start or not instance.time_stop:
             instance.duration_seconds = None
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
