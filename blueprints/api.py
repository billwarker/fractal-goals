"""
Flask API Blueprint - Migrated from FastAPI server.py
Provides RESTful API endpoints for goals and practice sessions.
"""

from flask import Blueprint, request, jsonify
from typing import List, Optional
from datetime import date, datetime

from models import (
    get_engine, get_session, init_db,
    Goal, PracticeSession, SessionTemplate,
    get_all_root_goals, get_goal_by_id, get_practice_session_by_id,
    get_all_practice_sessions, get_immediate_goals_for_session,
    build_goal_tree, build_practice_session_tree,
    delete_goal_recursive, delete_practice_session,
    validate_root_goal, get_root_id_for_goal,
    ActivityDefinition, MetricDefinition, ActivityInstance, MetricValue
)

# Create blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api')

# Initialize database with environment-based path
engine = get_engine()  # Uses config automatically
init_db(engine)





# ============================================================================
# FRACTAL-SCOPED ROUTES
# New architecture: All data scoped to a specific fractal (root goal)
# ============================================================================







# ============================================================================
# SESSION TEMPLATE ENDPOINTS (Fractal-Scoped)
# ============================================================================

@api_bp.route('/<root_id>/session-templates', methods=['GET'])
def get_session_templates(root_id):
    """Get all session templates for a fractal."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        templates = session.query(SessionTemplate).filter_by(root_id=root_id).all()
        result = [template.to_dict() for template in templates]
        return jsonify(result)
        
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['GET'])
def get_session_template(root_id, template_id):
    """Get a specific session template."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        return jsonify(template.to_dict())
        
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates', methods=['POST'])
def create_session_template(root_id):
    """Create a new session template."""
    import json
    import uuid
    
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Template name is required"}), 400
        
        if not data.get('template_data'):
            return jsonify({"error": "Template data is required"}), 400
        
        # Create new template
        new_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name=data['name'],
            description=data.get('description', ''),
            root_id=root_id,
            template_data=json.dumps(data['template_data'])
        )
        
        session.add(new_template)
        session.commit()
        
        return jsonify(new_template.to_dict()), 201
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['PUT'])
def update_session_template(root_id, template_id):
    """Update a session template."""
    import json
    
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            template.name = data['name']
        if 'description' in data:
            template.description = data['description']
        if 'template_data' in data:
            template.template_data = json.dumps(data['template_data'])
        
        session.commit()
        
        return jsonify(template.to_dict())
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['DELETE'])
def delete_session_template(root_id, template_id):
    """Delete a session template."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        session.delete(template)
        session.commit()
        
        return jsonify({"message": "Template deleted successfully"})
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()





# ============================================================================
# ACTIVITY INSTANCE TIME TRACKING ENDPOINTS
# ============================================================================

@api_bp.route('/<root_id>/activity-instances/<instance_id>/start', methods=['POST'])
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


@api_bp.route('/<root_id>/activity-instances/<instance_id>/stop', methods=['POST'])
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


@api_bp.route('/<root_id>/activity-instances', methods=['GET'])
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



