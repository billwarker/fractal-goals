"""
API Blueprint for Visualization Annotations.

Provides CRUD operations for annotations on analytics visualizations.
"""
from flask import Blueprint, request, jsonify
import logging
from sqlalchemy.exc import SQLAlchemyError
import models
from models import get_session
from blueprints.auth_api import token_required
from blueprints.api_utils import internal_error
from services.annotation_service import AnnotationService
from validators import validate_request, AnnotationCreateSchema, AnnotationUpdateSchema

annotations_bp = Blueprint('annotations_api', __name__)
logger = logging.getLogger(__name__)


@annotations_bp.route('/api/roots/<root_id>/annotations', methods=['GET'])
@token_required
def get_annotations(current_user, root_id):
    """Get all annotations for a fractal root if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = AnnotationService(db_session)
    try:
        payload, error, status = service.get_annotations(
            root_id,
            current_user.id,
            visualization_type=request.args.get('visualization_type'),
            visualization_context=request.args.get('visualization_context'),
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting annotations")
        return internal_error(logger, "Error getting annotations")
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations', methods=['POST'])
@token_required
@validate_request(AnnotationCreateSchema)
def create_annotation(current_user, root_id, validated_data):
    """Create a new visualization annotation if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = AnnotationService(db_session)
    try:
        payload, error, status = service.create_annotation(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating annotation")
        return internal_error(logger, "Error creating annotation")
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['GET'])
@token_required
def get_annotation(current_user, root_id, annotation_id):
    """Get a single annotation by ID if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = AnnotationService(db_session)
    try:
        payload, error, status = service.get_annotation(root_id, annotation_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error getting annotation")
        return internal_error(logger, "Error getting annotation")
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['PUT'])
@token_required
@validate_request(AnnotationUpdateSchema)
def update_annotation(current_user, root_id, annotation_id, validated_data):
    """Update an existing annotation if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = AnnotationService(db_session)
    try:
        payload, error, status = service.update_annotation(root_id, annotation_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating annotation")
        return internal_error(logger, "Error updating annotation")
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['DELETE'])
@token_required
def delete_annotation(current_user, root_id, annotation_id):
    """Soft delete an annotation if owned by user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    service = AnnotationService(db_session)
    try:
        payload, error, status = service.delete_annotation(root_id, annotation_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting annotation")
        return internal_error(logger, "Error deleting annotation")
    finally:
        db_session.close()
