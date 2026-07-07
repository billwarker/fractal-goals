import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from extensions import limiter
from services.public_service import PublicService
from services.email_service import EmailService, EmailWebhookVerificationError
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
    finally:
        db_session.close()


@public_bp.route('/webhooks/resend', methods=['POST'])
@limiter.limit("120 per minute")
def handle_resend_webhook():
    db_session = get_db_session()
    try:
        payload = EmailService(db_session).process_resend_webhook(
            body=request.get_data(cache=False),
            headers={key.lower(): value for key, value in request.headers.items()},
        )
        return jsonify(payload), 200
    except EmailWebhookVerificationError as exc:
        db_session.rollback()
        logger.warning("Rejected Resend webhook: %s", exc)
        return jsonify({"error": "Invalid webhook signature"}), 400
    except SQLAlchemyError:
        db_session.rollback()
        return internal_error(logger, "Error processing Resend webhook")
    finally:
        db_session.close()
