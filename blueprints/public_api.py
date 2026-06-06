import logging

from flask import Blueprint, jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from extensions import limiter
from services.public_service import PublicService
from validators import BetaSignupRequestSchema, validate_request


logger = logging.getLogger(__name__)

public_bp = Blueprint('public', __name__, url_prefix='/api/public')


@public_bp.route('/beta-signups', methods=['POST'])
@limiter.limit("12 per hour")
@validate_request(BetaSignupRequestSchema)
def create_beta_signup(validated_data):
    db_session = get_db_session()
    service = PublicService(db_session)

    try:
        payload, error, status = service.create_beta_signup_request(validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        return internal_error(logger, "Error creating beta signup request")
