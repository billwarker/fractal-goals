from flask import Blueprint, request, jsonify
import json
import uuid
import logging
import models
from models import (
    get_session,
    SessionTemplate,
    validate_root_goal
)
from validators import (
    validate_request,
    SessionTemplateCreateSchema, SessionTemplateUpdateSchema
)
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, internal_error, require_owned_root
from services.events import event_bus, Event, Events
from services.serializers import serialize_session_template

# Create blueprint
templates_bp = Blueprint('templates', __name__, url_prefix='/api')

# ============================================================================
# SESSION TEMPLATE ENDPOINTS (Fractal-Scoped)
# ============================================================================

@templates_bp.route('/<root_id>/session-templates', methods=['GET'])
@token_required
def get_session_templates(current_user, root_id):
    """Get all session templates for a fractal if owned by user."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        templates_q = session.query(SessionTemplate).filter_by(root_id=root_id)
        limit, offset = parse_optional_pagination(request, max_limit=500)
        if limit is not None:
            templates_q = templates_q.offset(offset).limit(limit)
        templates = templates_q.all()
        result = [serialize_session_template(template) for template in templates]
        return jsonify(result)
        
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['GET'])
@token_required
def get_session_template(current_user, root_id, template_id):
    """Get a specific session template if owned by user."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        return jsonify(serialize_session_template(template))
        
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates', methods=['POST'])
@token_required
@validate_request(SessionTemplateCreateSchema)
def create_session_template(current_user, root_id, validated_data):
    """Create a new session template if owned by user."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # template_data is optional now - validation ensures name is present
        template_data = validated_data.get('template_data')
        
        # Create new template
        new_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            root_id=root_id,
            template_data=json.dumps(template_data) if template_data else None
        )
        
        session.add(new_template)
        session.commit()
        
        event_bus.emit(Event(Events.SESSION_TEMPLATE_CREATED, {
            'template_id': new_template.id,
            'name': new_template.name,
            'root_id': root_id
        }, source='templates_api.create_session_template'))
        
        return jsonify(serialize_session_template(new_template)), 201
        
    except Exception as e:
        session.rollback()
        logger.exception("Error creating session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['PUT'])
@token_required
@validate_request(SessionTemplateUpdateSchema)
def update_session_template(current_user, root_id, template_id, validated_data):
    """Update a session template if owned by user."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        # Update fields
        if 'name' in validated_data:
            template.name = validated_data['name']
        if 'description' in validated_data:
            template.description = validated_data['description']
        if 'template_data' in validated_data:
            template.template_data = json.dumps(validated_data['template_data'])
        
        session.commit()
        
        event_bus.emit(Event(Events.SESSION_TEMPLATE_UPDATED, {
            'template_id': template.id,
            'name': template.name,
            'root_id': root_id,
            'updated_fields': list(validated_data.keys())
        }, source='templates_api.update_session_template'))
        
        return jsonify(serialize_session_template(template))
        
    except Exception as e:
        session.rollback()
        logger.exception("Error updating session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['DELETE'])
@token_required
def delete_session_template(current_user, root_id, template_id):
    """Delete a session template if owned by user."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        session.delete(template)
        session.commit()
        
        return jsonify({"message": "Template deleted successfully"})
        
    except Exception as e:
        session.rollback()
        logger.exception("Error deleting session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()
