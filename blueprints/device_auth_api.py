"""Native-app sign-in. Bearer and body tokens only: no cookies, so no CSRF."""
from flask import Blueprint, jsonify

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from extensions import limiter
from services.device_auth_service import DeviceAuthService
from validators import DeviceRefreshSchema, DeviceSignInSchema, validate_request

device_auth_bp = Blueprint('device_auth', __name__, url_prefix='/api/auth')


def _respond(result):
    payload, error, status = result
    return jsonify({'error': error} if error else payload), status


@device_auth_bp.post('/token')
@validate_request(DeviceSignInSchema)
@limiter.limit('10 per minute')
def sign_in(validated_data):
    db = get_db_session()
    try:
        return _respond(DeviceAuthService(db).sign_in(validated_data))
    finally:
        db.close()


@device_auth_bp.post('/token/refresh')
@validate_request(DeviceRefreshSchema)
@limiter.limit('30 per minute')
def refresh(validated_data):
    db = get_db_session()
    try:
        return _respond(DeviceAuthService(db).refresh(validated_data['refresh_token']))
    finally:
        db.close()


@device_auth_bp.post('/token/revoke')
@validate_request(DeviceRefreshSchema)
@limiter.limit('30 per minute')
def sign_out(validated_data):
    db = get_db_session()
    try:
        DeviceAuthService(db).sign_out(validated_data['refresh_token'])
        return jsonify({'message': 'Signed out'})
    finally:
        db.close()


@device_auth_bp.get('/devices')
@token_required
def list_devices(current_user):
    db = get_db_session()
    try:
        return jsonify(DeviceAuthService(db).list_devices(current_user.id))
    finally:
        db.close()


@device_auth_bp.delete('/devices/<device_id>')
@token_required
@limiter.limit('30 per minute')
def revoke_device(current_user, device_id):
    db = get_db_session()
    try:
        return _respond(DeviceAuthService(db).revoke_device(current_user.id, device_id))
    finally:
        db.close()
