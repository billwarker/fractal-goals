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
    GoalFreezeSchema,
    GoalMoveSchema,
    GoalTargetCreateSchema, GoalTargetEvaluationSchema,
    FractalCreateSchema,
)
from blueprints.auth_api import token_required
from blueprints.api_utils import (
    get_db_session,
    internal_error,
    parse_optional_pagination,
    etag_json_response,
)
from services.serializers import (
    serialize_goal,
    serialize_target,
)
from extensions import limiter
from services.analytics_cache import get_analytics, set_analytics
from services.goal_analytics_service import GoalAnalyticsService
from services.goal_service import (
    GoalService,
    sync_goal_targets as _sync_targets,
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.list_global_goals(current_user.id, limit, offset or 0)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(payload, status=status)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        new_goal, error, status = service.create_global_goal(current_user.id, validated_data)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        
        logger.debug(f"Created goal {new_goal.id}")

        # Return the goal with its tree
        result = serialize_goal(new_goal)
        return jsonify(result), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating goal")
        return internal_error(logger, "Error creating goal")
    except Exception:
        db_session.rollback()
        logger.exception("Unexpected error creating goal")
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


@goals_bp.route('/fractal/<root_id>/sessions/<session_id>/micro-goals', methods=['GET'])
@token_required
def get_session_micro_goals(current_user, root_id, session_id):
    """Return MicroGoal entries linked to a specific session."""
    from services.goal_tree_service import GoalTreeService

    db_session = get_db_session()
    try:
        service = GoalTreeService(db_session)
        payload, error_dict, status_code = service.get_session_micro_goals(current_user, root_id, session_id)
        if error_dict:
            return jsonify(error_dict), status_code
        return jsonify(payload)
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching session micro goals")
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.update_global_goal(goal_id, current_user.id, data)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status

        logger.debug(
            "Committed changes. Goal has %s active targets",
            len([t for t in goal.targets_rel if t.deleted_at is None])
        )

        return jsonify(serialize_goal(goal, include_children=False)), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error in update_goal_endpoint")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/targets', methods=['POST'])
@token_required
@validate_request(GoalTargetCreateSchema)
def add_goal_target(current_user, goal_id, validated_data):
    """Add a target to a goal using relational Target model."""
    data = validated_data
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.add_goal_target(goal_id, current_user.id, data)
        if error:
            return jsonify({"error": error}), status
        goal = payload["goal"]
        new_target = payload["target"]

        # Return all current targets
        all_targets = [serialize_target(t) for t in goal.targets_rel if t.deleted_at is None]
        return jsonify({"targets": all_targets, "id": new_target.id}), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error adding goal target")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/targets/<target_id>', methods=['DELETE'])
@token_required
def remove_goal_target(current_user, goal_id, target_id):
    """Remove a target from a goal (soft delete)."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.remove_goal_target(goal_id, target_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        goal = payload["goal"]

        # Return remaining targets
        remaining_targets = [serialize_target(t) for t in goal.targets_rel if t.deleted_at is None]
        return jsonify({"targets": remaining_targets}), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error removing goal target")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/metrics', methods=['GET'])
@token_required
def get_goal_metrics(current_user, goal_id: str):
    """Get calculated metrics for a goal (direct and recursive)."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        return jsonify(serialize_goal(goal)), status
        
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        root, error, status = service.get_fractal_tree(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(serialize_goal(root), status=status)
        
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        result, error, status = service.get_active_goals_for_selection(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return etag_json_response(result, status=status)
        
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        new_goal, error, status = service.create_fractal_goal(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status

        # Return the created goal
        return jsonify(serialize_goal(new_goal, include_children=False)), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating fractal goal")
        return internal_error(logger, "Error creating fractal goal")
    except Exception:
        db_session.rollback()
        logger.exception("Unexpected error creating fractal goal")
        return internal_error(logger, "Error creating fractal goal")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['GET'])
@token_required
def get_fractal_goal(current_user, root_id, goal_id):
    """Get a specific goal by ID within a fractal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.get_fractal_goal(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal)), status
        
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_fractal_goal(current_user, root_id, goal_id):
    """Delete a goal within a fractal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.delete_fractal_goal(root_id, goal_id, current_user.id)
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.update_fractal_goal(root_id, goal_id, current_user.id, data)
        if error:
            return jsonify({"error": error}), status

        return jsonify(serialize_goal(goal, include_children=False)), status
        
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
        cached = get_analytics(root_id)
        if cached is not None:
            return etag_json_response(cached)
        service = GoalAnalyticsService(db_session)
        payload, error, status = service.get_goal_analytics(root_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        set_analytics(root_id, payload)
        return etag_json_response(payload, status=status)
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal analytics")
        return internal_error(logger, "Error fetching goal analytics")
    finally:
        db_session.close()


# ============================================================================
# TARGET EVALUATION ENDPOINTS
# ============================================================================

@goals_bp.route('/<root_id>/goals/<goal_id>/evaluate-targets', methods=['POST'])
@token_required
@validate_request(GoalTargetEvaluationSchema)
def evaluate_goal_targets(current_user, root_id, goal_id, validated_data):
    """
    Evaluate targets for a goal against a session's activity instances.
    
    This is called when a session is completed. It:
    1. Fetches the session's activity instances with their metrics
    2. Evaluates each target against the activity instances
    3. Persists target completion status (completed, completed_at, completed_session_id)
    4. Auto-completes the goal if ALL targets are met
    
    Request body:
    {
        "session_id": "uuid of the session"
    }
    
    Returns:
    {
        "goal": {...},  // Updated goal data
        "targets_evaluated": int,
        "targets_completed": int,
        "newly_completed_targets": [...],  // Targets that were just completed
        "goal_completed": bool  // Whether the goal was auto-completed
    }
    """
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.evaluate_goal_targets(
            root_id,
            goal_id,
            current_user.id,
            validated_data['session_id'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error evaluating targets")
        return internal_error(logger, "Goals API request failed")
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.copy_goal(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal)), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error copying goal")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/freeze', methods=['PATCH'])
@token_required
@validate_request(GoalFreezeSchema, allow_empty_json=True)
def freeze_goal_endpoint(current_user, root_id: str, goal_id: str, validated_data):
    """Toggle frozen state on a goal."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.toggle_freeze(
            root_id,
            goal_id,
            current_user.id,
            validated_data['frozen'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal)), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error freezing goal")
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        result, error, status = service.get_eligible_move_parents(
            root_id, goal_id, current_user.id, search=search
        )
        if error:
            return jsonify({'error': error}), status
        return jsonify({'eligible_parents': result}), 200
    except Exception:
        logger.exception("Error fetching eligible move parents")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>/move', methods=['PATCH'])
@token_required
@validate_request(GoalMoveSchema)
def move_goal_endpoint(current_user, root_id: str, goal_id: str, validated_data):
    """Move a goal to a new parent."""
    db_session = get_db_session()
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
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
        return jsonify(serialize_goal(goal)), status
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
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.convert_goal_level(
            root_id,
            goal_id,
            current_user.id,
            validated_data['level_id'],
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(serialize_goal(goal)), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error converting goal level")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()
