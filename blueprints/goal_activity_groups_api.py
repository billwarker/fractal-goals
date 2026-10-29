"""HTTP boundary for a goal's activity sources: its one activity group, the batch association
editor, and definitions credited through one-off instance links."""
import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import error_body, get_db_session, internal_error
from blueprints.auth_api import token_required
from services.activity_service import ActivityService
from validators import GoalAssociationBatchSchema, validate_request

logger = logging.getLogger(__name__)

goal_activity_groups_bp = Blueprint('goal_activity_groups', __name__)


@goal_activity_groups_bp.route('/<root_id>/goals/<goal_id>/instance-linked-activities', methods=['GET'])
@token_required
def get_goal_instance_linked_activities(current_user, root_id, goal_id):
    """Definitions whose instances were linked one-off to the goal or a descendant (bounded)."""
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.get_goal_instance_linked_activities(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    finally:
        session.close()


@goal_activity_groups_bp.route('/<root_id>/goals/<goal_id>/activity-groups', methods=['GET'])
@token_required
def get_goal_activity_groups(current_user, root_id, goal_id):
    """Get all activity groups linked to a goal."""
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.get_goal_activity_groups(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    finally:
        session.close()


@goal_activity_groups_bp.route('/<root_id>/goals/<goal_id>/associations/batch', methods=['PUT'])
@token_required
@validate_request(GoalAssociationBatchSchema)
def set_goal_associations_batch(current_user, root_id, goal_id, validated_data):
    """Set both direct activity and activity-group associations for a goal in one request."""
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.set_goal_associations_batch(
            root_id,
            goal_id,
            current_user.id,
            validated_data["activity_ids"],
            validated_data["group_ids"],
        )
        if error:
            return jsonify(error_body(error)), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting goal associations in batch")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@goal_activity_groups_bp.route('/<root_id>/goals/<goal_id>/activity-groups/<group_id>', methods=['POST'])
@token_required
def link_goal_activity_group(current_user, root_id, goal_id, group_id):
    """Make an activity group the goal's group (includes all current and future activities).

    A goal has one activity group. Another existing group returns 409
    `goal_activity_group_taken` with `current_group` unless `replace` is true (body or query).
    """
    body = request.get_json(silent=True) or {}
    replace = body.get('replace') is True or request.args.get('replace', '').lower() == 'true'
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.link_goal_activity_group(
            root_id,
            goal_id,
            group_id,
            current_user.id,
            replace=replace,
        )
        if error:
            return jsonify(error_body(error)), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error linking goal activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@goal_activity_groups_bp.route('/<root_id>/goals/<goal_id>/activity-groups/<group_id>', methods=['DELETE'])
@token_required
def unlink_goal_activity_group(current_user, root_id, goal_id, group_id):
    """Unlink an activity group from a goal."""
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.unlink_goal_activity_group(
            root_id,
            goal_id,
            group_id,
            current_user.id,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error unlinking goal activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()
