import jwt
import datetime
from datetime import timezone
from functools import wraps
from flask import request, jsonify, Blueprint
import models
from models import get_engine, get_session, User
from config import config
from validators import validate_request, UserSignupSchema, UserLoginSchema
from services.serializers import serialize_user

auth_bp = Blueprint('auth', __name__, url_prefix='/api/auth')

def token_required(f):
    """Decorator to protect routes with JWT authentication."""
    @wraps(f)
    def decorated(*args, **kwargs):
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
                # We can't easily persist the user object in db_session between requests 
                # but for the duration of this call it's fine.
                # Pass user as first argument
                return f(current_user, *args, **kwargs)
            finally:
                db_session.close()
        except jwt.ExpiredSignatureError:
            return jsonify({'error': 'Token has expired'}), 401
        except jwt.InvalidTokenError:
            return jsonify({'error': 'Invalid token'}), 401
        except Exception as e:
            return jsonify({'error': f'Auth error: {str(e)}'}), 401
            
    return decorated

@auth_bp.route('/signup', methods=['POST'])
@validate_request(UserSignupSchema)
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

@auth_bp.route('/login', methods=['POST'])
@validate_request(UserLoginSchema)
def login(validated_data):
    """Authenticate user and return JWT."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        user = db_session.query(User).filter(
            (User.username == validated_data['username_or_email']) | 
            (User.email == validated_data['username_or_email'])
        ).first()
        
        if not user or not user.check_password(validated_data['password']):
            return jsonify({"error": "Invalid username or password"}), 401
            
        if not user.is_active:
            return jsonify({"error": "User account is disabled"}), 403
            
        token = jwt.encode({
            'user_id': user.id,
            'exp': datetime.datetime.now(timezone.utc) + datetime.timedelta(hours=config.JWT_EXPIRATION_HOURS)
        }, config.JWT_SECRET_KEY, algorithm="HS256")
        
        return jsonify({
            'token': token,
            'user': serialize_user(user)
        })
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

@auth_bp.route('/me', methods=['GET'])
@token_required
def get_me(current_user):
    """Get current user info."""
    return jsonify(serialize_user(current_user))
