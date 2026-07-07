import logging

from flask import Blueprint, jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.feature_flag_service import FeatureFlagService


logger = logging.getLogger(__name__)
feature_flags_bp = Blueprint("feature_flags", __name__, url_prefix="/api/feature-flags")


@feature_flags_bp.route("", methods=["GET"])
@token_required
def get_feature_flags(current_user):
    db_session = get_db_session()
    try:
        payload, error, status = FeatureFlagService(db_session).get_flags()
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error fetching feature flags")
        return internal_error(logger, "Error fetching feature flags")
    finally:
        db_session.close()
