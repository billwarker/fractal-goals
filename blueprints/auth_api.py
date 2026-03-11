from functools import wraps
from flask import request, jsonify, Blueprint
import models
from models import get_session
from sqlalchemy.exc import SQLAlchemyError
from validators import (
    validate_request, UserSignupSchema, UserLoginSchema, UserPreferencesUpdateSchema,
    UserPasswordUpdateSchema, UserEmailUpdateSchema, UserDeleteSchema, UserUsernameUpdateSchema
)
from services.serializers import serialize_user
from services.auth_service import AuthService
from services.user_service import UserService
from blueprints.api_utils import internal_error
from extensions import limiter
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def token_required(f):
    """Decorator to protect routes with JWT authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Let CORS preflight requests pass through auth checks.
        # The real request (GET/POST/...) will still require a valid token.
        if request.method == 'OPTIONS':
            return ('', 204)

        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            if auth_header.startswith('Bearer '):
                token = auth_header.split(" ")[1]
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401
        
        engine = models.get_engine()
        db_session = get_session(engine)
        try:
            service = AuthService(db_session)
            current_user, error, status = service.get_current_user_for_token(token)
            if error:
                return jsonify({'error': error}), status
            return f(current_user, *args, **kwargs)
        except SQLAlchemyError:
            logger.exception("Database error in token_required decorator")
            return jsonify({'error': 'Internal server error during authentication'}), 500
        finally:
            db_session.close()
            
    return decorated

@auth_bp.route('/signup', methods=['POST'])
@validate_request(UserSignupSchema)
@limiter.limit("5 per minute")  # Strict limit for account creation
def signup(validated_data):
    """Register a new user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = AuthService(db_session)
        payload, error, status = service.signup(validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error during signup")
        return internal_error(logger, "Error during signup")
    finally:
        db_session.close()

@auth_bp.route('/refresh', methods=['POST'])
def refresh_token():
    """Silent token refresh endpoint."""
    token = None
    if 'Authorization' in request.headers:
        auth_header = request.headers['Authorization']
        if auth_header.startswith('Bearer '):
            token = auth_header.split(" ")[1]
            
    if not token:
        return jsonify({'error': 'Token is missing'}), 401
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = AuthService(db_session)
        payload, error, status = service.refresh_token(token)
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error in refresh_token")
        return jsonify({'error': 'Failed to refresh token'}), 500
    except (TypeError, ValueError):
        logger.exception("Error in refresh_token")
        return jsonify({'error': 'Failed to refresh token'}), 500
    finally:
        db_session.close()


@auth_bp.route('/login', methods=['POST'])
@validate_request(UserLoginSchema)
@limiter.limit("10 per minute")  # Strict limit for login attempts
def login(validated_data):
    """Authenticate user and return JWT."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = AuthService(db_session)
        payload, error, status = service.login(validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error during login")
        return internal_error(logger, "Error during login")
    finally:
        db_session.close()

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_me(current_user):
    """Get current user info."""
    return jsonify(serialize_user(current_user))

@auth_bp.route('/preferences', methods=['PATCH'])
@token_required
@validate_request(UserPreferencesUpdateSchema)
def update_preferences(current_user, validated_data):
    """Update user preferences."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = UserService(db_session)
        payload, error, status = service.update_preferences(current_user.id, validated_data)
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating preferences")
        return internal_error(logger, "Error updating preferences")
    finally:
        db_session.close()

@auth_bp.route('/account/password', methods=['PUT'])
@token_required
@validate_request(UserPasswordUpdateSchema)
@limiter.limit("5 per minute")  # Strict limit for password changes
def update_password(current_user, validated_data):
    """Update user password."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = UserService(db_session)
        payload, error, status = service.update_password(current_user.id, validated_data)
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating password")
        return internal_error(logger, "Error updating password")
    finally:
        db_session.close()

@auth_bp.route('/account/email', methods=['PUT'])
@token_required
@validate_request(UserEmailUpdateSchema)
@limiter.limit("5 per minute")  # Strict limit for email changes
def update_email(current_user, validated_data):
    """Update user email."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = UserService(db_session)
        payload, error, status = service.update_email(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating email")
        return internal_error(logger, "Error updating email")
    finally:
        db_session.close()

@auth_bp.route('/account', methods=['DELETE'])
@token_required
@validate_request(UserDeleteSchema)
@limiter.limit("3 per minute")  # Very strict limit for account deletion
def delete_account(current_user, validated_data):
    """Delete user account."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = UserService(db_session)
        payload, error, status = service.delete_account(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting account")
        return internal_error(logger, "Error deleting account")
    finally:
        db_session.close()

@auth_bp.route('/account/username', methods=['PUT'])
@token_required
@validate_request(UserUsernameUpdateSchema)
@limiter.limit("5 per minute")
def update_username(current_user, validated_data):
    """Update user username."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = UserService(db_session)
        payload, error, status = service.update_username(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating username")
        return internal_error(logger, "Error updating username")
    finally:
        db_session.close()
