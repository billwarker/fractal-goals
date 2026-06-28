from flask import Blueprint, jsonify
import logging
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.analytics_engine import AnalyticsEngineService
from validators import (
    AnalyticsQueryProfileCreateSchema,
    AnalyticsQueryProfileUpdateSchema,
    AnalyticsQueryRunSchema,
    validate_request,
)


analytics_bp = Blueprint('analytics_api', __name__)
logger = logging.getLogger(__name__)


@analytics_bp.route('/api/analytics/catalog', methods=['GET'])
@token_required
def get_analytics_catalog(current_user):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.get_catalog(current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching analytics catalog")
        return internal_error(logger, "Error fetching analytics catalog")
    finally:
        db_session.close()


@analytics_bp.route('/api/analytics/query/run', methods=['POST'])
@token_required
@validate_request(AnalyticsQueryRunSchema)
def run_analytics_query(current_user, validated_data):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.run_query(current_user.id, validated_data["query_spec"])
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error running analytics query")
        return internal_error(logger, "Error running analytics query")
    finally:
        db_session.close()


@analytics_bp.route('/api/analytics/query-profiles', methods=['GET'])
@token_required
def list_analytics_query_profiles(current_user):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.list_profiles(current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching analytics query profiles")
        return internal_error(logger, "Error fetching analytics query profiles")
    finally:
        db_session.close()


@analytics_bp.route('/api/analytics/query-profiles', methods=['POST'])
@token_required
@validate_request(AnalyticsQueryProfileCreateSchema)
def create_analytics_query_profile(current_user, validated_data):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.create_profile(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating analytics query profile")
        return internal_error(logger, "Error creating analytics query profile")
    finally:
        db_session.close()


@analytics_bp.route('/api/analytics/query-profiles/<profile_id>', methods=['PATCH'])
@token_required
@validate_request(AnalyticsQueryProfileUpdateSchema)
def update_analytics_query_profile(current_user, profile_id, validated_data):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.update_profile(profile_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating analytics query profile")
        return internal_error(logger, "Error updating analytics query profile")
    finally:
        db_session.close()


@analytics_bp.route('/api/analytics/query-profiles/<profile_id>', methods=['DELETE'])
@token_required
def delete_analytics_query_profile(current_user, profile_id):
    db_session = get_db_session()
    service = AnalyticsEngineService(db_session)
    try:
        payload, error, status = service.delete_profile(profile_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting analytics query profile")
        return internal_error(logger, "Error deleting analytics query profile")
    finally:
        db_session.close()
