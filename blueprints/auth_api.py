from functools import wraps
from flask import request, jsonify, Blueprint, g
from sqlalchemy.exc import SQLAlchemyError
import secrets
import hmac
from validators import (
    validate_request, UserSignupSchema, UserLoginSchema, UserPreferencesUpdateSchema,
    UserPasswordUpdateSchema, UserEmailUpdateSchema, UserDeleteSchema, UserUsernameUpdateSchema,
    PasswordForgotSchema, PasswordResetSchema,
)
from services.serializers import serialize_user
from services.auth_service import AuthService
from services.user_service import UserService
from models import User, validate_root_goal
from blueprints.api_utils import get_db_session, internal_error
from extensions import limiter
from config import config
import logging

logger = logging.getLogger(__name__)

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')


def _issue_csrf_token():
    return secrets.token_urlsafe(32)


def _auth_cookie_max_age(remember_me=False):
    if not remember_me:
        return None
    return (
        config.JWT_EXPIRATION_HOURS * 60 * 60
        + config.JWT_REFRESH_WINDOW_DAYS * 24 * 60 * 60
    )


def _set_csrf_cookie(response, token=None, *, remember_me=False):
    token = token or _issue_csrf_token()
    response.set_cookie(
        config.CSRF_COOKIE_NAME,
        token,
        max_age=_auth_cookie_max_age(remember_me),
        httponly=False,
        secure=config.AUTH_COOKIE_SECURE,
        samesite=config.AUTH_COOKIE_SAMESITE,
        path='/',
    )
    return token


def _clear_csrf_cookie(response):
    response.delete_cookie(
        config.CSRF_COOKIE_NAME,
        path='/',
        secure=config.AUTH_COOKIE_SECURE,
        samesite=config.AUTH_COOKIE_SAMESITE,
    )
    return response


def _set_auth_cookie(response, token, *, remember_me=False):
    response.set_cookie(
        config.AUTH_COOKIE_NAME,
        token,
        max_age=_auth_cookie_max_age(remember_me),
        httponly=True,
        secure=config.AUTH_COOKIE_SECURE,
        samesite=config.AUTH_COOKIE_SAMESITE,
        path='/',
    )
    _set_csrf_cookie(response, remember_me=remember_me)
    return response


def _clear_auth_cookie(response):
    response.delete_cookie(
        config.AUTH_COOKIE_NAME,
        path='/',
        secure=config.AUTH_COOKIE_SECURE,
        samesite=config.AUTH_COOKIE_SAMESITE,
    )
    _clear_csrf_cookie(response)
    return response


def _get_request_token():
    auth_header = request.headers.get('Authorization')
    if auth_header and auth_header.startswith('Bearer '):
        return auth_header.split(" ", 1)[1], 'bearer'
    cookie_token = request.cookies.get(config.AUTH_COOKIE_NAME)
    if cookie_token:
        return cookie_token, 'cookie'
    return None, None


def _is_mutating_request():
    return request.method in ('POST', 'PUT', 'PATCH', 'DELETE')


def _validate_csrf_for_cookie_auth():
    cookie_token = request.cookies.get(config.CSRF_COOKIE_NAME)
    header_token = request.headers.get(config.CSRF_HEADER_NAME)
    if not cookie_token or not header_token:
        return False
    return hmac.compare_digest(cookie_token, header_token)

def token_required(f):
    """Decorator to protect routes with JWT authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
        # Let CORS preflight requests pass through auth checks.
        # The real request (GET/POST/...) will still require a valid token.
        if request.method == 'OPTIONS':
            return ('', 204)

        token, token_source = _get_request_token()
        
        if not token:
            return jsonify({'error': 'Token is missing'}), 401

        if token_source == 'cookie' and _is_mutating_request() and not _validate_csrf_for_cookie_auth():
            return jsonify({'error': 'CSRF token missing or invalid'}), 403

        db_session = get_db_session()
        try:
            service = AuthService(db_session)
            current_user, error, status = service.get_current_user_for_token(token)
            if error:
                return jsonify({'error': error}), status
            root_id = kwargs.get('root_id')
            admin_user_id = request.args.get('admin_user_id')
            admin_mode = request.args.get('admin_mode')
            is_user_wide_analytics_route = request.path.startswith('/api/analytics')
            if (root_id or is_user_wide_analytics_route) and admin_user_id and admin_mode:
                if not getattr(current_user, 'is_admin', False):
                    return jsonify({'error': 'Admin access required'}), 403
                if admin_mode not in ('read_only', 'read_write'):
                    return jsonify({'error': 'Invalid admin_mode'}), 400
                analytics_read_post = (
                    is_user_wide_analytics_route
                    and request.path == '/api/analytics/query/run'
                    and request.method == 'POST'
                )
                if admin_mode == 'read_only' and request.method not in ('GET', 'HEAD', 'OPTIONS') and not analytics_read_post:
                    return jsonify({'error': 'Admin read-only mode does not permit writes'}), 403
                if root_id:
                    root = validate_root_goal(db_session, root_id, owner_id=admin_user_id)
                    if not root:
                        return jsonify({'error': 'Fractal not found'}), 404
                else:
                    target_user = db_session.query(User).filter(
                        User.id == admin_user_id,
                        User.is_active.is_(True),
                    ).first()
                    if not target_user:
                        return jsonify({'error': 'User not found'}), 404
                g.admin_actor_user_id = current_user.id
                g.admin_target_user_id = admin_user_id
                g.admin_mode = admin_mode
                current_user.id = admin_user_id
            g.current_user = current_user
            return f(current_user, *args, **kwargs)
        except SQLAlchemyError:
            logger.exception("Database error in token_required decorator")
            return jsonify({'error': 'Internal server error during authentication'}), 500
            
    return decorated

@auth_bp.route('/signup', methods=['POST'])
@validate_request(UserSignupSchema)
@limiter.limit("5 per minute")  # Strict limit for account creation
def signup(validated_data):
    """Register a new user."""
    db_session = get_db_session()
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
    token, token_source = _get_request_token()
            
    if not token:
        return jsonify({'error': 'Token is missing'}), 401

    if token_source == 'cookie' and not _validate_csrf_for_cookie_auth():
        return jsonify({'error': 'CSRF token missing or invalid'}), 403
    
    db_session = get_db_session()
    try:
        service = AuthService(db_session)
        payload, error, status = service.refresh_token(token)
        if error:
            return jsonify({'error': error}), status
        response = jsonify(payload)
        _set_auth_cookie(response, payload['token'], remember_me=bool(payload.get('remember_me')))
        return response, status
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
    db_session = get_db_session()
    try:
        service = AuthService(db_session)
        payload, error, status = service.login(validated_data)
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        _set_auth_cookie(response, payload['token'], remember_me=bool(payload.get('remember_me')))
        return response, status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error during login")
        return internal_error(logger, "Error during login")
    finally:
        db_session.close()


@auth_bp.route('/password/forgot', methods=['POST'])
@validate_request(PasswordForgotSchema)
@limiter.limit("5 per minute")
def forgot_password(validated_data):
    """Request a password reset email without revealing whether the account exists."""
    db_session = get_db_session()
    try:
        service = AuthService(db_session)
        payload, error, status = service.forgot_password(validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error requesting password reset")
        return internal_error(logger, "Error requesting password reset")
    finally:
        db_session.close()


@auth_bp.route('/password/reset', methods=['POST'])
@validate_request(PasswordResetSchema)
@limiter.limit("5 per minute")
def reset_password(validated_data):
    """Complete a password reset using a single-use token."""
    db_session = get_db_session()
    try:
        service = AuthService(db_session)
        payload, error, status = service.reset_password(validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error resetting password")
        return internal_error(logger, "Error resetting password")
    finally:
        db_session.close()

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_me(current_user):
    """Get current user info."""
    return jsonify(serialize_user(current_user))


@auth_bp.route('/csrf', methods=['GET'])
@token_required
def get_csrf_token(current_user):
    """Issue a readable CSRF cookie for browser clients using HttpOnly auth cookies."""
    token = _issue_csrf_token()
    response = jsonify({
        'csrf_cookie_name': config.CSRF_COOKIE_NAME,
        'csrf_header_name': config.CSRF_HEADER_NAME,
        'csrf_token': token,
    })
    _set_csrf_cookie(response, token)
    response.headers[config.CSRF_HEADER_NAME] = token
    return response, 200


@auth_bp.route('/account/usage', methods=['GET'])
@token_required
def get_account_usage(current_user):
    """Get current membership tier and quota usage."""
    db_session = get_db_session()
    try:
        root_ids = []
        for raw_value in request.args.getlist('root_ids'):
            root_ids.extend([value.strip() for value in raw_value.split(',') if value.strip()])
        legacy_root_id = request.args.get('root_id')
        if legacy_root_id:
            root_ids.append(legacy_root_id.strip())

        service = UserService(db_session)
        payload, error, status = service.get_account_usage(current_user.id, root_ids=root_ids)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error fetching account usage")
        return internal_error(logger, "Error fetching account usage")
    finally:
        db_session.close()


@auth_bp.route('/logout', methods=['POST'])
def logout():
    """Clear the browser auth cookie."""
    token, token_source = _get_request_token()
    if token and token_source == 'cookie' and not _validate_csrf_for_cookie_auth():
        return jsonify({'error': 'CSRF token missing or invalid'}), 403
    response = jsonify({"message": "Logged out successfully"})
    _clear_auth_cookie(response)
    return response, 200

@auth_bp.route('/preferences', methods=['PATCH'])
@token_required
@validate_request(UserPreferencesUpdateSchema)
def update_preferences(current_user, validated_data):
    """Update user preferences."""
    db_session = get_db_session()
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
    db_session = get_db_session()
    try:
        service = UserService(db_session)
        payload, error, status = service.update_password(current_user.id, validated_data)
        if error:
            return jsonify({'error': error}), status
        response = jsonify(payload)
        _clear_auth_cookie(response)
        return response, status
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
    db_session = get_db_session()
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
    db_session = get_db_session()
    try:
        service = UserService(db_session)
        payload, error, status = service.delete_account(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        response = jsonify(payload)
        _clear_auth_cookie(response)
        return response, status
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
    db_session = get_db_session()
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
