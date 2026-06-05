from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError
import logging

from blueprints.api_utils import get_db_session, internal_error, parse_optional_pagination
from blueprints.auth_api import token_required
from services.admin_service import AdminService
from validators import (
    AdminInviteKeyCreateSchema,
    AdminUserCreateSchema,
    AdminUserForcePasswordChangeSchema,
    AdminUserQuotaUpdateSchema,
    AdminUserRoleUpdateSchema,
    AdminUserStatusUpdateSchema,
    AdminUserTierUpdateSchema,
    AdminUserUpdateSchema,
    validate_request,
)


logger = logging.getLogger(__name__)
admin_bp = Blueprint('admin', __name__, url_prefix='/api/admin')


def _admin_service_or_response(current_user):
    db_session = get_db_session()
    service = AdminService(db_session)
    error, status = service.require_admin(current_user)
    if error:
        return service, (jsonify({"error": error}), status)
    return service, None


@admin_bp.route('/summary', methods=['GET'])
@token_required
def get_admin_summary(current_user):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.summary()
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error fetching admin summary")
        return internal_error(logger, "Error fetching admin summary")
    finally:
        db_session.close()


@admin_bp.route('/users', methods=['GET'])
@token_required
def list_admin_users(current_user):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        limit, offset = parse_optional_pagination(request, max_limit=100)
        payload, error, status = service.list_users(
            search=(request.args.get('search') or '').strip(),
            limit=limit or 50,
            offset=offset or 0,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error listing admin users")
        return internal_error(logger, "Error listing admin users")
    finally:
        db_session.close()


@admin_bp.route('/users', methods=['POST'])
@token_required
@validate_request(AdminUserCreateSchema)
def create_admin_user(current_user, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.create_user(validated_data)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s created user_id=%s", current_user.id, payload.get("id"))
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating admin user")
        return internal_error(logger, "Error creating admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>', methods=['PATCH'])
@token_required
@validate_request(AdminUserUpdateSchema)
def update_admin_user(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.update_user(user_id, validated_data)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s updated user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user")
        return internal_error(logger, "Error updating admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>', methods=['DELETE'])
@token_required
def delete_admin_user(current_user, user_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.soft_delete_user(user_id, current_user)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s soft_deleted user_id=%s route=legacy", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error soft deleting admin user")
        return internal_error(logger, "Error soft deleting admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/soft-delete', methods=['DELETE'])
@token_required
def soft_delete_admin_user(current_user, user_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.soft_delete_user(user_id, current_user)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s soft_deleted user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error soft deleting admin user")
        return internal_error(logger, "Error soft deleting admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/hard-delete', methods=['DELETE'])
@token_required
def hard_delete_admin_user(current_user, user_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.hard_delete_user(user_id, current_user)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s hard_deleted user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error hard deleting admin user")
        return internal_error(logger, "Error hard deleting admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/temporary-password', methods=['POST'])
@token_required
def generate_admin_user_temporary_password(current_user, user_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.generate_temporary_password(user_id)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s generated_temporary_password user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error generating admin user temporary password")
        return internal_error(logger, "Error generating temporary password")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/tier', methods=['PATCH'])
@token_required
@validate_request(AdminUserTierUpdateSchema)
def update_admin_user_tier(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.update_tier(user_id, validated_data["membership_tier"])
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s updated_tier user_id=%s tier=%s", current_user.id, user_id, validated_data["membership_tier"])
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user tier")
        return internal_error(logger, "Error updating admin user tier")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/quota', methods=['PATCH'])
@token_required
@validate_request(AdminUserQuotaUpdateSchema)
def update_admin_user_quota(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.update_quota(user_id, validated_data)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s updated_quota user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user quota")
        return internal_error(logger, "Error updating admin user quota")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/status', methods=['PATCH'])
@token_required
@validate_request(AdminUserStatusUpdateSchema)
def update_admin_user_status(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.update_status(user_id, validated_data["is_active"])
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s updated_status user_id=%s is_active=%s", current_user.id, user_id, validated_data["is_active"])
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user status")
        return internal_error(logger, "Error updating admin user status")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/unlock', methods=['PATCH'])
@token_required
def unlock_admin_user(current_user, user_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.unlock_user(user_id)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s unlocked user_id=%s", current_user.id, user_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error unlocking admin user")
        return internal_error(logger, "Error unlocking admin user")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/force-password-change', methods=['PATCH'])
@token_required
@validate_request(AdminUserForcePasswordChangeSchema)
def force_admin_user_password_change(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        enabled = validated_data.get("force_password_change", True)
        payload, error, status = service.set_force_password_change(user_id, enabled)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s force_password_change user_id=%s enabled=%s", current_user.id, user_id, enabled)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user force password change")
        return internal_error(logger, "Error updating force password change")
    finally:
        db_session.close()


@admin_bp.route('/users/<user_id>/role', methods=['PATCH'])
@token_required
@validate_request(AdminUserRoleUpdateSchema)
def update_admin_user_role(current_user, user_id, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.update_role(user_id, current_user, validated_data["role"])
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s updated_role user_id=%s role=%s", current_user.id, user_id, validated_data["role"])
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating admin user role")
        return internal_error(logger, "Error updating admin user role")
    finally:
        db_session.close()


@admin_bp.route('/invite-keys', methods=['GET'])
@token_required
def list_invite_keys(current_user):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.list_invite_keys()
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        logger.exception("Error listing invite keys")
        return internal_error(logger, "Error listing invite keys")
    finally:
        db_session.close()


@admin_bp.route('/invite-keys', methods=['POST'])
@token_required
@validate_request(AdminInviteKeyCreateSchema)
def create_invite_key(current_user, validated_data):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.create_invite_key(current_user, validated_data)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s created invite_key_id=%s", current_user.id, payload.get("id"))
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating invite key")
        return internal_error(logger, "Error creating invite key")
    finally:
        db_session.close()


@admin_bp.route('/invite-keys/<invite_id>/revoke', methods=['PATCH'])
@token_required
def revoke_invite_key(current_user, invite_id):
    db_session = get_db_session()
    try:
        service, response = _admin_service_or_response(current_user)
        if response:
            return response
        payload, error, status = service.revoke_invite_key(invite_id)
        if error:
            return jsonify({"error": error}), status
        logger.info("Admin user_id=%s revoked invite_key_id=%s", current_user.id, invite_id)
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error revoking invite key")
        return internal_error(logger, "Error revoking invite key")
    finally:
        db_session.close()
