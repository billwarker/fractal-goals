from flask import Blueprint, jsonify
import logging
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.dashboard_service import DashboardService
from validators import DashboardCreateSchema, DashboardUpdateSchema, validate_request

dashboards_bp = Blueprint('dashboards_api', __name__)
logger = logging.getLogger(__name__)


@dashboards_bp.route('/api/roots/<root_id>/dashboards', methods=['GET'])
@token_required
def get_dashboards(current_user, root_id):
    db_session = get_db_session()
    service = DashboardService(db_session)
    try:
        payload, error, status = service.list_dashboards(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching saved analytics")
        return internal_error(logger, "Error fetching saved analytics")
    finally:
        db_session.close()


@dashboards_bp.route('/api/roots/<root_id>/dashboards', methods=['POST'])
@token_required
@validate_request(DashboardCreateSchema)
def create_dashboard(current_user, root_id, validated_data):
    db_session = get_db_session()
    service = DashboardService(db_session)
    try:
        payload, error, status = service.create_dashboard(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating saved analytics")
        return internal_error(logger, "Error creating saved analytics")
    finally:
        db_session.close()


@dashboards_bp.route('/api/roots/<root_id>/dashboards/<dashboard_id>', methods=['PUT'])
@token_required
@validate_request(DashboardUpdateSchema)
def update_dashboard(current_user, root_id, dashboard_id, validated_data):
    db_session = get_db_session()
    service = DashboardService(db_session)
    try:
        payload, error, status = service.update_dashboard(root_id, dashboard_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating saved analytics")
        return internal_error(logger, "Error updating saved analytics")
    finally:
        db_session.close()


@dashboards_bp.route('/api/roots/<root_id>/dashboards/<dashboard_id>', methods=['DELETE'])
@token_required
def delete_dashboard(current_user, root_id, dashboard_id):
    db_session = get_db_session()
    service = DashboardService(db_session)
    try:
        payload, error, status = service.delete_dashboard(root_id, dashboard_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting saved analytics")
        return internal_error(logger, "Error deleting saved analytics")
    finally:
        db_session.close()


def _run(action, message):
    db_session = get_db_session()
    try:
        payload, error, status = action(DashboardService(db_session))
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception(message)
        return internal_error(logger, message)
    finally:
        db_session.close()


@dashboards_bp.route('/api/roots/<root_id>/dashboards/<dashboard_id>/opened', methods=['POST'])
@token_required
def mark_dashboard_opened(current_user, root_id, dashboard_id):
    return _run(lambda service: service.mark_opened(root_id, dashboard_id, current_user.id), "Error recording analytics opened")


@dashboards_bp.route('/api/roots/<root_id>/dashboards/<dashboard_id>/duplicate', methods=['POST'])
@token_required
def duplicate_dashboard(current_user, root_id, dashboard_id):
    return _run(lambda service: service.duplicate_dashboard(root_id, dashboard_id, current_user.id), "Error duplicating saved analytics")
