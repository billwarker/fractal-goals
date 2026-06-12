import logging

from flask import Blueprint, jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from extensions import limiter
from services.public_service import PublicService
from validators import BetaSignupRequestSchema, validate_request


logger = logging.getLogger(__name__)

public_bp = Blueprint('public', __name__, url_prefix='/api/public')


@public_bp.route('/landing-examples', methods=['GET'])
@limiter.limit("120 per minute")
def get_landing_examples():
    db_session = get_db_session()
    service = PublicService(db_session)

    try:
        payload, error, status = service.get_landing_examples()
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        # The cache only changes on manual admin publish, so short shared/browser
        # caching is safe and lets repeat landing visits render instantly.
        response.headers["Cache-Control"] = "public, max-age=300, stale-while-revalidate=86400"
        return response, status
    except SQLAlchemyError:
        return internal_error(logger, "Error fetching landing examples")
    finally:
        db_session.close()


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
