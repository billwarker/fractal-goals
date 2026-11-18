import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from extensions import limiter
from services.ops_log import log_ops_event
from services.public_service import PublicService
from services.demo_access_service import DemoAccessService
from services.email_service import EmailService, EmailWebhookVerificationError
from services.telemetry_service import privacy_signal_present
from services.web_telemetry_service import WebTelemetryService
from validators import BetaSignupRequestSchema, PublicTelemetryEventsSchema, validate_request


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
        # Correctness-first fallback when the static artifact is unavailable:
        # never let an older proxy/browser response mask the current revision.
        response.headers["Cache-Control"] = "no-store"
        return response, status
    except SQLAlchemyError:
        return internal_error(logger, "Error fetching landing examples")
    finally:
        db_session.close()


@public_bp.route('/demo-session', methods=['POST'])
@limiter.limit("30 per minute")
def create_demo_session():
    """A short-lived read-only token for touring the published examples."""
    db_session = get_db_session()
    try:
        payload, error, status = DemoAccessService(db_session).issue_demo_token()
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        response.headers["Cache-Control"] = "no-store"
        return response, status
    except SQLAlchemyError:
        return internal_error(logger, "Error starting a demo session")
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


@public_bp.route('/telemetry', methods=['POST'])
@limiter.limit("30 per minute")
@validate_request(PublicTelemetryEventsSchema)
def record_public_telemetry(validated_data):
    """Anonymous landing, demo and waitlist events (services/web_telemetry_service.py)."""
    if privacy_signal_present(request.headers):
        return jsonify({"accepted": 0, "rejected": []}), 202
    db_session = get_db_session()
    try:
        payload, error, status = WebTelemetryService(db_session).record_events(
            validated_data['events'],
            validated_data.get('context'),
            client_ip=request.remote_addr or '',
            user_agent=request.headers.get('User-Agent', ''),
            host=request.host,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        return internal_error(logger, "Error recording public telemetry")
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
        log_ops_event("email.webhook_rejected", level="warning", provider="resend")
        return jsonify({"error": "Invalid webhook signature"}), 400
    except SQLAlchemyError:
        db_session.rollback()
        log_ops_event("email.webhook_error", level="error", provider="resend")
        return internal_error(logger, "Error processing Resend webhook")
    finally:
        db_session.close()
