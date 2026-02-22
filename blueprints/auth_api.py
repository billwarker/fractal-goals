import jwt
import datetime
from datetime import timezone
from functools import wraps
from flask import request, jsonify, Blueprint
import models
from models import get_engine, get_session, User
from config import config
from validators import (
    validate_request, UserSignupSchema, UserLoginSchema, UserPreferencesUpdateSchema,
    UserPasswordUpdateSchema, UserEmailUpdateSchema, UserDeleteSchema, UserUsernameUpdateSchema
)
from services.serializers import serialize_user
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
        
        try:
            data = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=["HS256"])
            engine = models.get_engine()
            db_session = get_session(engine)
            try:
                current_user = db_session.query(User).filter_by(id=data['user_id']).first()
                if not current_user:
                    return jsonify({'error': 'User not found'}), 401
                
                # Detach the user from the session so it remains usable
                db_session.expunge(current_user)
            finally:
                db_session.close()
                
            return f(current_user, *args, **kwargs)
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            logger.exception("Unexpected error in token_required decorator")
            return jsonify({'error': 'Internal server error during authentication'}), 500
            
    return decorated

@auth_bp.route('/signup', methods=['POST'])
@validate_request(UserSignupSchema)
@limiter.limit("5 per minute")  # Strict limit for account creation
def signup(validated_data):
    """Register a new user."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Check if user exists
        existing_user = db_session.query(User).filter(
            (User.username == validated_data['username']) | 
            (User.email == validated_data['email'])
        ).first()
        
        if existing_user:
            return jsonify({"error": "Username or email already exists"}), 400
            
        new_user = User(
            username=validated_data['username'],
            email=validated_data['email']
        )
        new_user.set_password(validated_data['password'])
        
        db_session.add(new_user)
        db_session.commit()
        db_session.refresh(new_user)
        
        return jsonify(serialize_user(new_user)), 201
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
    
    try:
        # Decode without verifying expiration to check the payload
        data = jwt.decode(token, config.JWT_SECRET_KEY, algorithms=["HS256"], options={"verify_exp": False})
        
        # Check if the token is *too* old (outside refresh window)
        exp_timestamp = data.get('exp', 0)
        exp_time = datetime.datetime.fromtimestamp(exp_timestamp, tz=timezone.utc)
        refresh_window = datetime.timedelta(days=getattr(config, 'JWT_REFRESH_WINDOW_DAYS', 7))
        
        if datetime.datetime.now(timezone.utc) > (exp_time + refresh_window):
            return jsonify({'error': 'Refresh window expired. Please log in again.'}), 401
            
        engine = models.get_engine()
        db_session = get_session(engine)
        try:
            user = db_session.query(User).filter_by(id=data['user_id']).first()
            
            if not user or not user.is_active:
                return jsonify({'error': 'User invalid or disabled'}), 401
                
            # Issue new token
            new_token = jwt.encode({
                'user_id': user.id,
                'exp': datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=config.JWT_EXPIRATION_HOURS)
            }, config.JWT_SECRET_KEY, algorithm="HS256")
            
            return jsonify({
                'token': new_token,
                'user': serialize_user(user)
            })
        finally:
            db_session.close()
        
    except jwt.InvalidTokenError:
        return jsonify({'error': 'Invalid token'}), 401
    except Exception as e:
        logger.exception("Error in refresh_token")
        return jsonify({'error': 'Failed to refresh token'}), 500


@auth_bp.route('/login', methods=['POST'])
@validate_request(UserLoginSchema)
@limiter.limit("10 per minute")  # Strict limit for login attempts
def login(validated_data):
    """Authenticate user and return JWT."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        user = db_session.query(User).filter(
            (User.username == validated_data['username_or_email']) | 
            (User.email == validated_data['username_or_email'])
        ).first()
        
        if not user:
            return jsonify({"error": "Invalid username or password"}), 401
            
        if not user.is_active:
            return jsonify({"error": "User account is disabled"}), 403
            
        # Check lockout
        if user.locked_until:
            now = datetime.datetime.now(timezone.utc)
            locked_until = user.locked_until
            if locked_until.tzinfo is None:
                locked_until = locked_until.replace(tzinfo=timezone.utc)
                
            if locked_until > now:
                minutes_left = int((locked_until - now).total_seconds() / 60) + 1
                return jsonify({"error": f"Account temporarily locked. Try again in {minutes_left} minutes."}), 403
            
        if not user.check_password(validated_data['password']):
            user.failed_login_count = (user.failed_login_count or 0) + 1
            if user.failed_login_count >= 5:
                user.locked_until = datetime.datetime.now(timezone.utc) + datetime.timedelta(minutes=15)
            db_session.commit()
            return jsonify({"error": "Invalid username or password"}), 401
            
        # Success: reset lockdown & update last login
        user.failed_login_count = 0
        user.locked_until = None
        user.last_login_at = datetime.datetime.now(timezone.utc)
        db_session.commit()
            
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=config.JWT_EXPIRATION_HOURS)
        }, config.JWT_SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            'token': token,
            'user': serialize_user(user)
        })
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        # Re-query user to attach to this session
        user = db_session.query(User).get(current_user.id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        # Update preferences
        current_prefs = models._safe_load_json(user.preferences, {})
        new_prefs = validated_data['preferences']
        
        # Deep merge or replace? For now, let's just merge top-level keys
        if isinstance(new_prefs, dict):
            updated_prefs = dict(current_prefs)
            updated_prefs.update(new_prefs)
            user.preferences = updated_prefs
            
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(user, 'preferences')
        
        db_session.commit()
        return jsonify(serialize_user(user))
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        user = db_session.query(User).get(current_user.id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.check_password(validated_data['current_password']):
            return jsonify({"error": "Invalid current password"}), 401
            
        user.set_password(validated_data['new_password'])
        db_session.commit()
        return jsonify({"message": "Password updated successfully"})
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        user = db_session.query(User).get(current_user.id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.check_password(validated_data['password']):
            return jsonify({"error": "Invalid password"}), 401

        # Check for existing email
        existing = db_session.query(User).filter(User.email == validated_data['email']).first()
        if existing and existing.id != user.id:
            return jsonify({"error": "Email already in use"}), 400
            
        user.email = validated_data['email']
        db_session.commit()
        return jsonify(serialize_user(user))
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        user = db_session.query(User).get(current_user.id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.check_password(validated_data['password']):
            return jsonify({"error": "Invalid password"}), 401
            
        # Anonymize PII and deactivate account
        
        # Anonymize
        import uuid
        user.username = f"deleted_{uuid.uuid4()}"
        user.email = f"deleted_{uuid.uuid4()}@fractalgoals.com"
        user.is_active = False
        
        from werkzeug.security import generate_password_hash
        user.password_hash = generate_password_hash(str(uuid.uuid4()))
        
        db_session.commit()
        return jsonify({"message": "Account deleted successfully"})
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
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
        user = db_session.query(User).get(current_user.id)
        if not user:
            return jsonify({'error': 'User not found'}), 404
            
        if not user.check_password(validated_data['password']):
            return jsonify({"error": "Incorrect password"}), 401
            
        # Check uniqueness
        existing = db_session.query(User).filter(User.username == validated_data['username'], User.id != user.id).first()
        if existing:
            return jsonify({"error": "Username already exists"}), 400
            
        user.username = validated_data['username']
        db_session.commit()
        
        return jsonify(serialize_user(user))
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

