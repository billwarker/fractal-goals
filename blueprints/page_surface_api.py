from flask import Blueprint, jsonify, request
import logging
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.page_surface_service import PageSurfaceService
from validators import PageSurfaceCreateSchema, PageSurfaceUpdateSchema, validate_request

page_surface_bp = Blueprint('page_surface_api', __name__)
logger = logging.getLogger(__name__)


@page_surface_bp.route('/api/roots/<root_id>/page-surfaces', methods=['GET'])
@token_required
def get_page_surfaces(current_user, root_id):
    page = request.args.get('page', 'goals')
    db_session = get_db_session()
    service = PageSurfaceService(db_session)
    try:
        payload, error, status = service.list_layouts(root_id, current_user.id, page)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching page surfaces")
        return internal_error(logger, "Error fetching page surfaces")
    finally:
        db_session.close()


@page_surface_bp.route('/api/roots/<root_id>/page-surfaces', methods=['POST'])
@token_required
@validate_request(PageSurfaceCreateSchema)
def create_page_surface(current_user, root_id, validated_data):
    db_session = get_db_session()
    service = PageSurfaceService(db_session)
    try:
        payload, error, status = service.create_layout(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating page surface")
        return internal_error(logger, "Error creating page surface")
    finally:
        db_session.close()


@page_surface_bp.route('/api/roots/<root_id>/page-surfaces/<layout_id>', methods=['PUT'])
@token_required
@validate_request(PageSurfaceUpdateSchema)
def update_page_surface(current_user, root_id, layout_id, validated_data):
    db_session = get_db_session()
    service = PageSurfaceService(db_session)
    try:
        payload, error, status = service.update_layout(root_id, layout_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating page surface")
        return internal_error(logger, "Error updating page surface")
    finally:
        db_session.close()


@page_surface_bp.route('/api/roots/<root_id>/page-surfaces/<layout_id>/default', methods=['POST'])
@token_required
def set_default_page_surface(current_user, root_id, layout_id):
    db_session = get_db_session()
    service = PageSurfaceService(db_session)
    try:
        payload, error, status = service.set_default_layout(root_id, layout_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error setting default page surface")
        return internal_error(logger, "Error setting default page surface")
    finally:
        db_session.close()


@page_surface_bp.route('/api/roots/<root_id>/page-surfaces/<layout_id>', methods=['DELETE'])
@token_required
def delete_page_surface(current_user, root_id, layout_id):
    db_session = get_db_session()
    service = PageSurfaceService(db_session)
    try:
        payload, error, status = service.delete_layout(root_id, layout_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting page surface")
        return internal_error(logger, "Error deleting page surface")
    finally:
        db_session.close()
