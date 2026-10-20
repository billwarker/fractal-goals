from flask import Blueprint, request, jsonify
import logging
import models
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger(__name__)
from models import (
    get_session,
)
from validators import (
    validate_request,
    GoalCreateSchema, GoalUpdateSchema,
    GoalCompletionUpdateSchema,
    GoalConvertLevelSchema,
    GoalPauseSchema,
    GoalMoveSchema,
    FractalCreateSchema,
)
from blueprints.auth_api import token_required
from blueprints.goal_history_api import register_goal_history_routes
from blueprints.goal_conditions_api import error_response, goal_response, register_goal_condition_routes
from blueprints.goal_reviews_api import register_goal_review_routes
from blueprints.goal_sequences_api import register_goal_sequence_routes
from blueprints.api_utils import (
    get_db_session,
    internal_error,
    parse_optional_pagination,
    require_owned_root,
)
from services.serializers import (
    serialize_goal,
)
from extensions import limiter
from services.goal_analytics_service import GoalAnalyticsService
from services.goal_deadline_rules import warnings_for_goal
from services.goal_service import (
    GoalService,
)

# Create blueprint
goals_bp = Blueprint('goals', __name__, url_prefix='/api')


# ============================================================================
# GLOBAL GOAL ENDPOINTS
# ============================================================================

@goals_bp.route('/goals', methods=['GET'])
@token_required
def get_goals(current_user):
    """Get all root goals with their complete trees."""
    db_session = get_db_session()
    try:
        limit, offset = parse_optional_pagination(request, max_limit=200)
        service = GoalService(db_session)
        payload, error, status = service.list_global_goals(current_user.id, limit, offset or 0)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    finally:
        db_session.close()




@goals_bp.route('/goals', methods=['POST'])
@validate_request(GoalCreateSchema)
@limiter.limit("30 per minute")
@token_required
def create_goal(current_user, validated_data):
    """Create a new goal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        new_goal, error, status = service.create_global_goal(current_user.id, validated_data)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        
        logger.debug(f"Created goal {new_goal.id}")

        # Return the goal with its tree
        result = serialize_goal(new_goal)
        result['deadline_warnings'] = warnings_for_goal(new_goal)
        return jsonify(result), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating goal")
        return internal_error(logger, "Error creating goal")
    finally:
        db_session.close()


@goals_bp.route('/fractal/<root_id>/sessions/<session_id>/goals-view', methods=['GET'])
@token_required
def get_session_goals_view(current_user, root_id, session_id):
    """Return the canonical goals payload used by the session detail sidepane."""
    from services.goal_tree_service import GoalTreeService

    db_session = get_db_session()
    try:
        service = GoalTreeService(db_session)
        payload, error_dict, status_code = service.get_session_goals_view_payload(current_user, root_id, session_id)
        if error_dict:
            return jsonify(error_dict), status_code
        return jsonify(payload)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching session goals view")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_goal_endpoint(current_user, goal_id: str):
    """Soft-delete a goal and all its children."""
    logger.debug(f"Attempting to delete goal with ID: {goal_id}")
    
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        payload, error, status = service.delete_global_goal(goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        is_root = payload["is_root"]

        logger.info(f"Deleted {'root ' if is_root else ''}goal {goal_id}")

        return jsonify({"status": "success", "message": f"{'Root g' if is_root else 'G'}oal deleted"}), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in delete_goal_endpoint")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['GET'])
@token_required
def get_goal_endpoint(current_user, goal_id: str):
    """Get a goal by ID."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.get_global_goal(goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal, include_children=False))
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['PUT'])
@token_required
@validate_request(GoalUpdateSchema)
def update_goal_endpoint(current_user, goal_id: str, validated_data):
    """Update goal details."""
    data = validated_data
    
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.update_global_goal(goal_id, current_user.id, data)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status

        return jsonify({
            **serialize_goal(goal, include_children=False),
            'deadline_warnings': warnings_for_goal(goal),
        }), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in update_goal_endpoint")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/metrics', methods=['GET'])
@token_required
def get_goal_metrics(current_user, goal_id: str):
    """Get calculated metrics for a goal (direct and recursive)."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        payload, error, status = service.get_goal_metrics(goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal metrics")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/metrics/daily-durations', methods=['GET'])
@token_required
def get_goal_daily_durations(current_user, goal_id: str):
    """Get daily duration metrics for a goal (recursive)."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        payload, error, status = service.get_goal_daily_durations(goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal daily durations")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/complete', methods=['PATCH'])
@goals_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
@token_required
@validate_request(GoalCompletionUpdateSchema, allow_empty_json=True)
def update_goal_completion_endpoint(current_user, goal_id: str, root_id=None, validated_data=None):
    """Update goal completion status."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.update_goal_completion(
            goal_id,
            current_user.id,
            validated_data or {},
            root_id=root_id,
        )
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(service.load_goal_subtree(goal))), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in update_goal_completion_endpoint")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


# ============================================================================
# FRACTAL-SCOPED ROUTES
# ============================================================================

@goals_bp.route('/fractals', methods=['GET'])
@token_required
def get_all_fractals(current_user):
    """Get all fractals (root goals) for the selection page, filtered by user."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        fractals, _, _ = service.list_fractals(current_user.id)
        return jsonify(fractals)
    finally:
        db_session.close()


@goals_bp.route('/fractals', methods=['POST'])
@token_required
@validate_request(FractalCreateSchema)
@limiter.limit("5 per minute")
def create_fractal(current_user, validated_data):
    """Create a new fractal (root goal) owned by current user."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        new_fractal, error, status = service.create_fractal(current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(new_fractal, include_children=False)), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating fractal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/fractals/<root_id>', methods=['DELETE'])
@token_required
def delete_fractal(current_user, root_id):
    """Delete an entire fractal if owned by user."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        result, error, status = service.delete_fractal(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result)
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting fractal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals', methods=['GET'])
@token_required
def get_fractal_goals(current_user, root_id):
    """Get the complete goal tree for a specific fractal if owned by user."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        root, error, status = service.get_fractal_tree(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(root)), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching fractal tree")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/selection', methods=['GET'])
@token_required
def get_active_goals_for_selection(current_user, root_id):
    """
    Get active ShortTermGoals and their active ImmediateGoals for session creation.
    Excludes completed goals.
    """
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        result, error, status = service.get_active_goals_for_selection(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(result), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching selection goals")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals', methods=['POST'])
@token_required
@validate_request(GoalCreateSchema)
def create_fractal_goal(current_user, root_id, validated_data):
    """Create a new goal within a fractal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        new_goal, error, status = service.create_fractal_goal(root_id, current_user.id, validated_data)
        if error:
            return error_response(error, status)
        return goal_response(db_session, new_goal, 201, check_pending=True)
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating fractal goal")
        return internal_error(logger, "Error creating fractal goal")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['GET'])
@token_required
def get_fractal_goal(current_user, root_id, goal_id):
    """Get a specific goal by ID within a fractal."""
    db_session = get_db_session()
    try:
        include_children = request.args.get('include_children', 'true').lower() not in ('false', '0', 'no')
        service = GoalService(db_session)
        goal, error, status = service.get_fractal_goal(
            root_id,
            goal_id,
            current_user.id,
            include_children=include_children,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal, include_children=include_children)), status
        
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_fractal_goal(current_user, root_id, goal_id):
    """Delete a goal within a fractal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        begin_next = request.args.get('begin_next', 'true').lower() not in ('false', '0', 'no')
        goal, error, status = service.delete_fractal_goal(root_id, goal_id, current_user.id, begin_next=begin_next)
        if error:
            return jsonify({"error": error}), status

        return jsonify({"status": "success", "message": "Goal deleted"}), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting fractal goal")
        return internal_error(logger, "Error deleting fractal goal")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['PUT'])
@token_required
@validate_request(GoalUpdateSchema)
def update_fractal_goal(current_user, root_id, goal_id, validated_data):
    """Update a goal within a fractal."""
    db_session = get_db_session()
    try:
        data = validated_data
        service = GoalService(db_session)
        goal, error, status = service.update_fractal_goal(root_id, goal_id, current_user.id, data)
        if error:
            return error_response(error, status)
        check_pending = bool({'completion_condition', 'condition', 'started_at', 'deadline'} & set(data))
        return goal_response(db_session, goal, status, check_pending=check_pending)
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating fractal goal")
        return internal_error(logger, "Error updating fractal goal")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/analytics', methods=['GET'])
@token_required
def get_goal_analytics(current_user, root_id):
    """
    Get goal analytics data for the fractal.
    
    Returns:
    - High-level statistics (completed count, avg age, avg time to completion, avg duration)
    - Per-goal analytics with session associations
    
    Optimized to use batched queries and avoid N+1 query patterns.
    """
    db_session = get_db_session()
    try:
        if any(request.args.get(key) not in (None, 'true', 'false') for key in ('charts', 'activity_filter')):
            return jsonify({"error": "Analytics flags must be true or false"}), 400

        service = GoalAnalyticsService(db_session)
        payload, error, status = service.get_goal_analytics(
            root_id, current_user.id, range_start=request.args.get('range_start'),
            range_end=request.args.get('range_end'),
            activity_ids=request.args.getlist('activity_ids') if 'activity_ids' in request.args or request.args.get('activity_filter') == 'true' else None,
            chart_goal_id=request.args.get('chart_goal_id'), charts=request.args.get('charts') == 'true',
        )
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal analytics")
        return internal_error(logger, "Error fetching goal analytics")
    finally:
        db_session.close()


# ============================================================================
# GOAL OPTIONS ENDPOINTS
# ============================================================================

@goals_bp.route('/<root_id>/goals/<goal_id>/copy', methods=['POST'])
@token_required
def copy_goal_endpoint(current_user, root_id: str, goal_id: str):
    """Create a copy of an existing goal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.copy_goal(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(service.load_goal_subtree(goal))), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error copying goal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/pause', methods=['PATCH'])
@token_required
@validate_request(GoalPauseSchema, allow_empty_json=True)
def pause_goal_endpoint(current_user, root_id: str, goal_id: str, validated_data):
    """Toggle paused state on a goal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.toggle_pause(
            root_id,
            goal_id,
            current_user.id,
            validated_data['paused'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(service.load_goal_subtree(goal))), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error pausing goal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/eligible-parents', methods=['GET'])
@token_required
def get_eligible_move_parents(current_user, root_id: str, goal_id: str):
    """Get all valid move target parents for a goal."""
    db_session = get_db_session()
    try:
        search = request.args.get('search', '').strip() or None
        service = GoalService(db_session)
        result, error, status = service.get_eligible_move_parents(
            root_id, goal_id, current_user.id, search=search
        )
        if error:
            return jsonify({'error': error}), status
        return jsonify({'eligible_parents': result}), 200
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/move', methods=['PATCH'])
@token_required
@validate_request(GoalMoveSchema)
def move_goal_endpoint(current_user, root_id: str, goal_id: str, validated_data):
    """Move a goal to a new parent."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        _, root_error = service._validate_owned_root(root_id, current_user.id)
        if root_error:
            error, status = root_error
            return jsonify({"error": error}), status

        goal = db_session.query(models.Goal).filter_by(
            id=goal_id,
            root_id=root_id,
            deleted_at=None,
        ).first()
        current_parent = (
            db_session.query(models.Goal).filter_by(
                id=goal.parent_id,
                root_id=root_id,
                deleted_at=None,
            ).first()
            if goal and goal.parent_id
            else None
        )
        new_parent = db_session.query(models.Goal).filter_by(
            id=validated_data['new_parent_id'],
            root_id=root_id,
            deleted_at=None,
        ).first()
        if current_parent and new_parent and not service._goals_share_same_tier(new_parent, current_parent):
            return jsonify({
                "error": "Can only move a goal under a parent on the same tier as its current parent"
            }), 400

        goal, error, status = service.move_goal(
            root_id,
            goal_id,
            current_user.id,
            validated_data['new_parent_id'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(service.load_goal_subtree(goal))), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error moving goal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/convert-level', methods=['PATCH'])
@token_required
@validate_request(GoalConvertLevelSchema)
def convert_goal_level_endpoint(current_user, root_id: str, goal_id: str, validated_data):
    """Convert a goal to a different level."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session)
        goal, error, status = service.convert_goal_level(
            root_id,
            goal_id,
            current_user.id,
            validated_data['level_id'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(service.load_goal_subtree(goal))), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error converting goal level")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


# History routes share this blueprint while keeping the mutation module bounded.
register_goal_history_routes(goals_bp)
register_goal_condition_routes(goals_bp)
register_goal_sequence_routes(goals_bp)
register_goal_review_routes(goals_bp)
