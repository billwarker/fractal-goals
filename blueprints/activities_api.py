from flask import Blueprint, request, jsonify
import logging
import models
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from models import (
    get_session,
    ActivityDefinition,
)
from validators import (
    validate_request,
    ActivityGroupCreateSchema, ActivityGroupUpdateSchema,
    ActivityDefinitionCreateSchema, ActivityDefinitionUpdateSchema,
    ActivityGoalsSetSchema, GoalAssociationBatchSchema, GroupReorderSchema
)
from blueprints.auth_api import token_required
from blueprints.api_utils import parse_optional_pagination, require_owned_root, etag_json_response, internal_error
from services.serializers import (
    serialize_activity_group, serialize_activity_definition
)
from services.goal_type_utils import get_canonical_goal_type
from services.owned_entity_queries import get_owned_activity_definition
from services.activity_service import (
    ActivityService,
)

logger = logging.getLogger(__name__)

# Create blueprint
activities_bp = Blueprint('activities', __name__, url_prefix='/api')

def _format_validation_errors(exc):
    errors = []
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        errors.append({
            "field": field,
            "message": error["msg"],
            "type": error["type"],
        })
    return errors


def _translate_activity_validation_error(exc):
    for error in exc.errors():
        field = ".".join(str(loc) for loc in error["loc"])
        if field == "name":
            return "Name is required"
        if field == "metrics" and error["type"] == "list_type":
            return "Metrics must be an array"
        if field == "splits" and error["type"] == "list_type":
            return "Splits must be an array"
    return None


def _parse_activity_payload(schema_class):
    json_data = request.get_json(silent=True)
    if json_data is None:
        json_data = {}
    if not isinstance(json_data, dict):
        return None, (
            jsonify({
                "error": "Validation failed",
                "details": [{
                    "field": "",
                    "message": "Input should be a valid dictionary",
                    "type": "dict_type",
                }],
            }),
            400,
        )

    try:
        validated = schema_class(**json_data)
        return validated.model_dump(exclude_unset=True), None
    except ValidationError as exc:
        translated = _translate_activity_validation_error(exc)
        if translated:
            return None, (jsonify({"error": translated}), 400)
        return None, (
            jsonify({
                "error": "Validation failed",
                "details": _format_validation_errors(exc),
            }),
            400,
        )

# ============================================================================
# ============================================================================
# ACTIVITY GROUP ENDPOINTS
# ============================================================================

@activities_bp.route('/<root_id>/activity-groups', methods=['GET'])
@token_required
def get_activity_groups(current_user, root_id):
    """Get all activity groups for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        groups, error, status = service.list_activity_groups(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify([serialize_activity_group(group) for group in groups])
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups', methods=['POST'])
@token_required
@validate_request(ActivityGroupCreateSchema)
def create_activity_group(current_user, root_id, validated_data):
    """Create a new activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        new_group, error, status = service.create_activity_group(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_group(new_group)), 201
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/<group_id>', methods=['PUT'])
@token_required
@validate_request(ActivityGroupUpdateSchema)
def update_activity_group(current_user, root_id, group_id, validated_data):
    """Update an activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        group, error, status = service.update_activity_group(root_id, group_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_group(group)), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/<group_id>', methods=['DELETE'])
@token_required
def delete_activity_group(current_user, root_id, group_id):
    """Delete an activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.delete_activity_group(root_id, group_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/reorder', methods=['PUT'])
@token_required
@validate_request(GroupReorderSchema)
def reorder_activity_groups(current_user, root_id, validated_data):
    """Reorder activity groups."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.reorder_activity_groups(
            root_id,
            current_user.id,
            validated_data['group_ids'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error reordering activity groups")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/<group_id>/goals', methods=['POST'])
@token_required
@validate_request(ActivityGoalsSetSchema)
def set_activity_group_goals(current_user, root_id, group_id, validated_data):
    """Set goals associated with an activity group (replaces existing associations)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        group, error, status = service.set_activity_group_goals(
            root_id,
            group_id,
            current_user.id,
            validated_data['goal_ids'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_group(group)), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting activity group goals")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

# ============================================================================
# ACTIVITY DEFINITION ENDPOINTS (Fractal-Scoped)
# ============================================================================

@activities_bp.route('/<root_id>/activities', methods=['GET'])
@token_required
def get_activities(current_user, root_id):
    """Get all activity definitions for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
             return jsonify({"error": "Fractal not found or access denied"}), 404
        
        activities_q = session.query(ActivityDefinition).filter_by(root_id=root_id).filter(
            ActivityDefinition.deleted_at.is_(None)
        ).order_by(ActivityDefinition.name)
        limit, offset = parse_optional_pagination(request, max_limit=500)
        if limit is not None:
            activities_q = activities_q.offset(offset).limit(limit)
        activities = activities_q.all()
        return etag_json_response([serialize_activity_definition(a) for a in activities])
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities', methods=['POST'])
@token_required
def create_activity(current_user, root_id):
    """Create a new activity definition with metrics."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data, validation_error = _parse_activity_payload(ActivityDefinitionCreateSchema)
        if validation_error:
            return validation_error

        service = ActivityService(session)
        new_activity, error, status = service.create_activity_definition(root_id, current_user.id, data)
        if error:
            return jsonify({"error": error}), status
        
        return jsonify(serialize_activity_definition(new_activity)), status

    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating activity")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities/<activity_id>', methods=['PUT'])
@token_required
def update_activity(current_user, root_id, activity_id):
    """Update an activity definition and its metrics."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data, validation_error = _parse_activity_payload(ActivityDefinitionUpdateSchema)
        if validation_error:
            return validation_error

        service = ActivityService(session)
        activity, error, status = service.update_activity_definition(
            root_id,
            activity_id,
            current_user.id,
            data,
        )
        if error:
            return jsonify({"error": error}), status
        
        return jsonify(serialize_activity_definition(activity)), status
    
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating activity")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities/<activity_id>', methods=['DELETE'])
@token_required
def delete_activity(current_user, root_id, activity_id):
    """Delete an activity definition."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        # Check ownership via root_id
        activity = get_owned_activity_definition(session, root_id, activity_id)
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
            
        service = ActivityService(session)
        service.delete_activity(root_id, activity)
        
        return jsonify({"message": "Activity deleted"})
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting activity")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


# ============================================================================
# ACTIVITY-GOAL ASSOCIATION ENDPOINTS (for SMART goals)
# ============================================================================

@activities_bp.route('/<root_id>/activities/<activity_id>/goals', methods=['GET'])
@token_required
def get_activity_goals(current_user, root_id, activity_id):
    """Get all goals associated with an activity."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        activity = get_owned_activity_definition(session, root_id, activity_id)
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
        
        goals = [{"id": g.id, "name": g.name, "type": get_canonical_goal_type(g)} for g in activity.associated_goals]
        return jsonify(goals)
    finally:
        session.close()


@activities_bp.route('/<root_id>/activities/<activity_id>/goals', methods=['POST'])
@token_required
@validate_request(ActivityGoalsSetSchema)
def set_activity_goals(current_user, root_id, activity_id, validated_data):
    """Set goals associated with an activity (replaces existing associations)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        activity, error, status = service.set_activity_goals(
            root_id,
            activity_id,
            current_user.id,
            validated_data['goal_ids'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_activity_definition(activity)), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting activity goals")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/activities/<activity_id>/goals/<goal_id>', methods=['DELETE'])
@token_required
def remove_activity_goal(current_user, root_id, activity_id, goal_id):
    """Remove a goal association from an activity."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.remove_activity_goal(
            root_id,
            activity_id,
            goal_id,
            current_user.id,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error removing activity goal")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/activities', methods=['GET'])
@token_required
def get_goal_activities(current_user, root_id, goal_id):
    """Get all activities associated with a goal (including those from linked groups and INHERITED from children)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.get_goal_activities(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    finally:
        session.close()


# ============================================================================
# GOAL-ACTIVITY-GROUP ASSOCIATION ENDPOINTS (for "include entire group")
# ============================================================================

@activities_bp.route('/<root_id>/goals/<goal_id>/activity-groups', methods=['GET'])
@token_required
def get_goal_activity_groups(current_user, root_id, goal_id):
    """Get all activity groups linked to a goal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.get_goal_activity_groups(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/associations/batch', methods=['PUT'])
@token_required
@validate_request(GoalAssociationBatchSchema)
def set_goal_associations_batch(current_user, root_id, goal_id, validated_data):
    """Set both direct activity and activity-group associations for a goal in one request."""
    engine = models.get_engine()
    session = get_session(engine)
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
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error setting goal associations in batch")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/activity-groups/<group_id>', methods=['POST'])
@token_required
def link_goal_activity_group(current_user, root_id, goal_id, group_id):
    """Link an entire activity group to a goal (includes all current and future activities)."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        service = ActivityService(session)
        payload, error, status = service.link_goal_activity_group(
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
        logger.exception("Error linking goal activity group")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/activity-groups/<group_id>', methods=['DELETE'])
@token_required
def unlink_goal_activity_group(current_user, root_id, goal_id, group_id):
    """Unlink an activity group from a goal."""
    engine = models.get_engine()
    session = get_session(engine)
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
