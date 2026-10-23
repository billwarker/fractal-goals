from flask import Blueprint, request, jsonify
import logging
from pydantic import ValidationError
from sqlalchemy.orm import selectinload
from sqlalchemy.exc import SQLAlchemyError
from models import (
    ActivityDefinition,
    MetricDefinition,
)
from validators import (
    validate_request,
    ActivityGroupCreateSchema, ActivityGroupUpdateSchema,
    ActivityDefinitionCreateSchema, ActivityDefinitionUpdateSchema,
    ActivityGoalsSetSchema,
    GoalAssociationBatchSchema, GroupReorderSchema,
    FractalMetricCreateSchema, FractalMetricUpdateSchema,
    ActivityTagAssignmentSchema,
    ActivityTagCatalogCreateSchema, ActivityTagCatalogUpdateSchema,
    ActivityTagVersionSchema, ActivityTagHardDeleteSchema, ActivityTagMergeSchema,
    ActivityTagOrderSchema, ActivityTagFamilyCreateSchema, ActivityTagFamilyUpdateSchema,
    ActivityTagFamilyDeleteSchema, ActivityTagFamilyOrderSchema, ProgressChartSchema, ProgressComparisonSchema,
)
from blueprints.auth_api import token_required
from blueprints.idempotency import idempotent
from blueprints.api_utils import get_db_session, parse_optional_pagination, require_owned_root, internal_error, service_response as _service_response
from services.serializers import (
    serialize_activity_group, serialize_activity_definition,
    serialize_fractal_metric,
)
from services.goal_type_utils import get_canonical_goal_type
from services.owned_entity_queries import get_owned_activity_definition
from services.owned_entity_queries import get_owned_activity_instance
from services.activity_service import (
    ActivityService,
)
from services.progress_service import ProgressService
from services.progress_chart_settings import ProgressChartSettingsService
from blueprints.activity_instance_goals_api import instance_goals_bp
from services.activity_tag_assignment_service import ActivityTagAssignmentService
from services.activity_tag_catalog_service import ActivityTagCatalogService
from services.activity_tag_family_service import ActivityTagFamilyService

logger = logging.getLogger(__name__)

# Create blueprint
activities_bp = Blueprint('activities', __name__, url_prefix='/api')
activities_bp.register_blueprint(instance_goals_bp)

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
# ACTIVITY TAGS, TAG FAMILIES, AND PROGRESS COMPARISON
# ============================================================================

@activities_bp.route('/<root_id>/activity-tags', methods=['GET'])
@token_required
def list_activity_tag_catalog(current_user, root_id):
    session = get_db_session()
    try:
        include_archived = request.args.get('include_archived', 'true').lower() != 'false'
        return _service_response(*ActivityTagCatalogService(session).list_catalog(
            root_id, current_user.id, include_archived=include_archived,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags', methods=['POST'])
@token_required
@validate_request(ActivityTagCatalogCreateSchema)
def create_activity_tag_catalog_item(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).create(
            root_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/<definition_id>', methods=['PUT'])
@token_required
@validate_request(ActivityTagCatalogUpdateSchema)
def update_activity_tag_catalog_item(current_user, root_id, definition_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).update(
            root_id, definition_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/<definition_id>/archive', methods=['POST'])
@token_required
@validate_request(ActivityTagVersionSchema)
def archive_activity_tag_catalog_item(current_user, root_id, definition_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).archive(
            root_id, definition_id, current_user.id, validated_data['version'],
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/<definition_id>/restore', methods=['POST'])
@token_required
@validate_request(ActivityTagVersionSchema)
def restore_activity_tag_catalog_item(current_user, root_id, definition_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).restore(
            root_id, definition_id, current_user.id, validated_data['version'],
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/<definition_id>/impact', methods=['GET'])
@token_required
def activity_tag_catalog_impact(current_user, root_id, definition_id):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).impact(
            root_id, definition_id, current_user.id,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/<definition_id>/hard-delete', methods=['POST'])
@token_required
@validate_request(ActivityTagHardDeleteSchema)
def hard_delete_activity_tag_catalog_item(current_user, root_id, definition_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).hard_delete(
            root_id, definition_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/merge', methods=['POST'])
@token_required
@validate_request(ActivityTagMergeSchema)
def merge_activity_tag_catalog_items(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).merge(
            root_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/merge-preview', methods=['POST'])
@token_required
@validate_request(ActivityTagMergeSchema)
def preview_activity_tag_catalog_merge(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).preview_merge(
            root_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-instances/<instance_id>/tags', methods=['PUT'])
@token_required
@idempotent
@validate_request(ActivityTagAssignmentSchema)
def replace_activity_instance_tags(current_user, root_id, instance_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagAssignmentService(session).replace_instance_tags(
            root_id, instance_id, current_user.id, validated_data['tag_ids'], version=validated_data.get('version')
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-sets/<set_id>/tags', methods=['PUT'])
@token_required
@idempotent
@validate_request(ActivityTagAssignmentSchema)
def replace_activity_set_tags(current_user, root_id, set_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagAssignmentService(session).replace_set_tags(
            root_id, set_id, current_user.id, validated_data['tag_ids'], version=validated_data.get('version')
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-instances/<instance_id>/progress-comparison', methods=['PUT'])
@token_required
@idempotent
@validate_request(ProgressComparisonSchema)
def set_activity_instance_progress_comparison(current_user, root_id, instance_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagAssignmentService(session).set_progress_comparison(
            root_id, instance_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-instances/<instance_id>/progress-chart', methods=['PUT'])
@token_required
@idempotent
@validate_request(ProgressChartSchema)
def set_activity_instance_progress_chart(current_user, root_id, instance_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ProgressChartSettingsService(session).save(
            root_id, instance_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


def _progress_scope_args():
    """Previewed comparison criteria from the query string; None leaves the saved value."""
    mode = request.args.get('mode') or None
    if mode not in (None, 'same_tags', 'tags', 'all'):
        raise ValueError("mode must be same_tags, tags, or all")

    def flag(name):
        raw = request.args.get(name)
        if raw is None or raw == '':
            return None
        if raw.lower() not in ('true', 'false', '1', '0'):
            raise ValueError(f"{name} must be true or false")
        return raw.lower() in ('true', '1')

    return {
        'instance_id': request.args.get('instance_id') or None,
        'mode': mode,
        'tag_ids': [tag_id for tag_id in request.args.getlist('tag_ids') if tag_id],
        'same_template': flag('same_template'),
        'same_program_day': flag('same_program_day'),
    }


def _owned_activity_or_error(session, root_id, activity_id, current_user):
    if not require_owned_root(session, root_id, current_user.id):
        return jsonify({"error": "Fractal not found or access denied"}), 404
    if not get_owned_activity_definition(session, root_id, activity_id):
        return jsonify({"error": "Activity not found"}), 404
    return None


@activities_bp.route('/<root_id>/activities/<activity_id>/progress-timeline', methods=['GET'])
@token_required
def get_activity_progress_timeline(current_user, root_id, activity_id):
    """Past instances in one comparison context; query params preview an unsaved one."""
    session = get_db_session()
    try:
        failure = _owned_activity_or_error(session, root_id, activity_id, current_user)
        if failure:
            return failure
        limit = min(max(request.args.get('limit', 20, type=int), 1), 100)
        offset = max(request.args.get('offset', 0, type=int), 0)
        try:
            payload = ProgressService(session).get_progress_timeline(
                activity_id, root_id, limit=limit, offset=offset, **_progress_scope_args(),
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(payload)
    finally:
        session.close()


@activities_bp.route('/<root_id>/activities/<activity_id>/progress-series', methods=['GET'])
@token_required
def get_activity_progress_series(current_user, root_id, activity_id):
    """Scoped instances for the Progress pane's compact chart, and what it plots."""
    session = get_db_session()
    try:
        failure = _owned_activity_or_error(session, root_id, activity_id, current_user)
        if failure:
            return failure
        limit = min(max(request.args.get('limit', 60, type=int), 1), 200)
        try:
            payload = ProgressService(session).get_progress_series(
                activity_id, root_id, limit=limit, **_progress_scope_args(),
            )
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        return jsonify(payload)
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tags/order', methods=['PUT'])
@token_required
@validate_request(ActivityTagOrderSchema)
def reorder_activity_tags(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagCatalogService(session).reorder(
            root_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tag-families', methods=['POST'])
@token_required
@validate_request(ActivityTagFamilyCreateSchema)
def create_activity_tag_family(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagFamilyService(session).create(
            root_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tag-families/order', methods=['PUT'])
@token_required
@validate_request(ActivityTagFamilyOrderSchema)
def reorder_activity_tag_families(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagFamilyService(session).reorder(
            root_id, current_user.id, validated_data['family_ids'],
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tag-families/<family_id>', methods=['PUT'])
@token_required
@validate_request(ActivityTagFamilyUpdateSchema)
def update_activity_tag_family(current_user, root_id, family_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityTagFamilyService(session).update(
            root_id, family_id, current_user.id, validated_data,
        ))
    finally:
        session.close()


@activities_bp.route('/<root_id>/activity-tag-families/<family_id>', methods=['DELETE'])
@token_required
def delete_activity_tag_family(current_user, root_id, family_id):
    session = get_db_session()
    try:
        try:
            body = ActivityTagFamilyDeleteSchema(**(request.get_json(silent=True) or {}))
        except ValidationError as exc:
            return jsonify({"error": "Validation failed", "details": _format_validation_errors(exc)}), 400
        return _service_response(*ActivityTagFamilyService(session).delete(
            root_id, family_id, current_user.id, body.version,
        ))
    finally:
        session.close()


# ============================================================================
# ============================================================================
# FRACTAL METRIC ENDPOINTS
# ============================================================================

@activities_bp.route('/<root_id>/fractal-metrics', methods=['GET'])
@token_required
def get_fractal_metrics(current_user, root_id):
    session = get_db_session()
    try:
        service = ActivityService(session)
        metrics, error, status = service.list_fractal_metrics(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify([serialize_fractal_metric(m) for m in metrics])
    finally:
        session.close()


@activities_bp.route('/<root_id>/fractal-metrics', methods=['POST'])
@token_required
@validate_request(FractalMetricCreateSchema)
def create_fractal_metric(current_user, root_id, validated_data):
    session = get_db_session()
    try:
        service = ActivityService(session)
        metric, error, status = service.create_fractal_metric(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_fractal_metric(metric)), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error creating fractal metric")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/fractal-metrics/<metric_id>', methods=['PUT'])
@token_required
@validate_request(FractalMetricUpdateSchema)
def update_fractal_metric(current_user, root_id, metric_id, validated_data):
    session = get_db_session()
    try:
        service = ActivityService(session)
        metric, error, status = service.update_fractal_metric(root_id, metric_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_fractal_metric(metric)), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error updating fractal metric")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/fractal-metrics/<metric_id>', methods=['DELETE'])
@token_required
def delete_fractal_metric(current_user, root_id, metric_id):
    session = get_db_session()
    try:
        service = ActivityService(session)
        payload, error, status = service.delete_fractal_metric(root_id, metric_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error deleting fractal metric")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


# ============================================================================
# ACTIVITY GROUP ENDPOINTS
# ============================================================================

@activities_bp.route('/<root_id>/activity-groups', methods=['GET'])
@token_required
def get_activity_groups(current_user, root_id):
    """Get all activity groups for a fractal."""
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        activities_q = session.query(ActivityDefinition).options(
            selectinload(ActivityDefinition.metric_definitions).selectinload(MetricDefinition.fractal_metric),
            selectinload(ActivityDefinition.split_definitions),
            selectinload(ActivityDefinition.associated_goals),
        ).filter_by(root_id=root_id).filter(
            ActivityDefinition.deleted_at.is_(None)
        ).order_by(ActivityDefinition.name)
        limit, offset = parse_optional_pagination(request, max_limit=500)
        if limit is not None:
            activities_q = activities_q.offset(offset).limit(limit)
        activities = activities_q.all()
        return jsonify([serialize_activity_definition(a) for a in activities])
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities', methods=['POST'])
@token_required
def create_activity(current_user, root_id):
    """Create a new activity definition with metrics."""
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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
    session = get_db_session()
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


@activities_bp.route('/<root_id>/activity-instances/<instance_id>/progress', methods=['GET'])
@token_required
def get_activity_instance_progress(current_user, root_id, instance_id):
    """Get the progress comparison for a specific activity instance."""
    session = get_db_session()
    try:
        root = require_owned_root(session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        instance = get_owned_activity_instance(session, root_id, instance_id)
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404

        service = ProgressService(session)
        result = service.get_progress_for_instance(instance.id)
        return jsonify(result)
    except SQLAlchemyError:
        session.rollback()
        logger.exception("Error getting activity instance progress")
        return internal_error(logger, "Activity API request failed")
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/activity-groups/<group_id>', methods=['DELETE'])
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
