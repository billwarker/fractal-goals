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
            return jsonify({"error": "Activity instance not found"}), 404
        
        if not instance.time_start:
            return jsonify({"error": "Timer was not started"}), 400
        
        # Set stop time to now
        instance.time_stop = datetime.now()
        
        # Calculate duration in seconds
        duration = (instance.time_stop - instance.time_start).total_seconds()
        instance.duration_seconds = int(duration)
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@timers_bp.route('/<root_id>/activity-instances', methods=['GET'])
def get_activity_instances(root_id):
    """Get all activity instances for a fractal's practice sessions."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get all practice sessions for this fractal
        sessions = db_session.query(PracticeSession).filter_by(root_id=root_id).all()
        session_ids = [s.id for s in sessions]
        
        # Get all activity instances for these sessions
        instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.practice_session_id.in_(session_ids)
        ).all()
        
        return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
