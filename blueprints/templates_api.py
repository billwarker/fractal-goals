from flask import Blueprint, request, jsonify
import logging
import models
from sqlalchemy.exc import SQLAlchemyError
from models import get_session
from validators import (
    validate_request,
    SessionTemplateCreateSchema, SessionTemplateUpdateSchema, SessionTemplateFromSessionSchema
)
from blueprints.auth_api import token_required
from blueprints.api_utils import get_db_session, parse_optional_pagination, internal_error, etag_json_response
from services.serializers import serialize_session_template
from services.template_service import TemplateService

# Create blueprint
templates_bp = Blueprint('templates', __name__, url_prefix='/api')
logger = logging.getLogger(__name__)

# ============================================================================
# SESSION TEMPLATE ENDPOINTS (Fractal-Scoped)
# ============================================================================

@templates_bp.route('/<root_id>/session-templates', methods=['GET'])
@token_required
def get_session_templates(current_user, root_id):
    """Get all session templates for a fractal if owned by user."""
    session = get_db_session()
    try:
        limit, offset = parse_optional_pagination(request, max_limit=500)
        service = TemplateService(session)
        templates, error, status = service.list_templates(
            root_id,
            current_user.id,
            limit=limit,
            offset=offset,
        )
        if error:
            return jsonify({"error": error}), status
        result = [serialize_session_template(template) for template in templates]
        return etag_json_response(result)
        
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['GET'])
@token_required
def get_session_template(current_user, root_id, template_id):
    """Get a specific session template if owned by user."""
    session = get_db_session()
    try:
        service = TemplateService(session)
        template, error, status = service.get_template(root_id, template_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(serialize_session_template(template))
        
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates', methods=['POST'])
@token_required
@validate_request(SessionTemplateCreateSchema)
def create_session_template(current_user, root_id, validated_data):
    """Create a new session template if owned by user."""
    session = get_db_session()
    try:
        service = TemplateService(session)
        new_template, error, status = service.create_template(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_session_template(new_template)), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()


@templates_bp.route('/<root_id>/sessions/<session_id>/create-template', methods=['POST'])
@token_required
@validate_request(SessionTemplateFromSessionSchema)
def create_template_from_session(current_user, root_id, session_id, validated_data):
    """Create a session template from an existing session."""
    session = get_db_session()
    try:
        service = TemplateService(session)
        template, error, status = service.create_template_from_session(
            root_id,
            session_id,
            validated_data['name'],
            current_user.id,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_session_template(template)), status

    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating session template from session")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['PUT'])
@token_required
@validate_request(SessionTemplateUpdateSchema)
def update_session_template(current_user, root_id, template_id, validated_data):
    """Patch scalar fields; replace template_data only when that key is present."""
    session = get_db_session()
    try:
        service = TemplateService(session)
        template, error, status = service.update_template(root_id, template_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_session_template(template)), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()


@templates_bp.route('/<root_id>/session-templates/<template_id>', methods=['DELETE'])
@token_required
def delete_session_template(current_user, root_id, template_id):
    """Soft-delete a session template if owned by user."""
    session = get_db_session()
    try:
        service = TemplateService(session)
        payload, error, status = service.delete_template(root_id, template_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting session template")
        return internal_error(logger, "Template API request failed")
    finally:
        session.close()
