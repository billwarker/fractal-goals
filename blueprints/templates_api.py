from flask import Blueprint, request, jsonify
import json
import uuid
from models import (
    get_engine, get_session,
    SessionTemplate,
    validate_root_goal
)

# Create blueprint
templates_bp = Blueprint('templates', __name__, url_prefix='/api')

# Initialize database engine
engine = get_engine()

# ============================================================================
# SESSION TEMPLATE ENDPOINTS (Fractal-Scoped)
# ============================================================================

@templates_bp.route('/<root_id>/session-templates', methods=['GET'])
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


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['GET'])
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


@templates_bp.route('/<root_id>/session-templates', methods=['POST'])
def create_session_template(root_id):
    """Create a new session template."""
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


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['PUT'])
def update_session_template(root_id, template_id):
    """Update a session template."""
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


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['DELETE'])
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
