from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import models
from pydantic import ValidationError
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import selectinload
from sqlalchemy import select, or_

logger = logging.getLogger(__name__)
from models import (
    get_session,
    Goal, Session,
    get_goal_by_id,
    session_goals,
)
from validators import (
    validate_request,
    GoalCreateSchema, GoalUpdateSchema,
    GoalCompletionUpdateSchema,
    GoalTargetCreateSchema, GoalTargetEvaluationSchema,
    GoalAssociationBatchSchema,
    FractalCreateSchema,
)
from blueprints.auth_api import token_required
from blueprints.api_utils import (
    require_owned_root,
    get_goal_in_root,
    internal_error,
    parse_optional_pagination,
    etag_json_response,
)
from services import event_bus, Event, Events
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
from services.goal_type_utils import get_canonical_goal_type

# Create blueprint
goals_bp = Blueprint('goals', __name__, url_prefix='/api')


# ============================================================================
# GLOBAL GOAL ENDPOINTS
# ============================================================================

@goals_bp.route('/goals', methods=['GET'])
@token_required
def get_goals(current_user):
    """Get all root goals with their complete trees."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        roots_q = db_session.query(Goal).filter(
            Goal.parent_id == None,
            Goal.deleted_at == None,
            Goal.owner_id == current_user.id
        ).order_by(Goal.created_at.desc())
        limit, offset = parse_optional_pagination(request, max_limit=200)
        if limit is not None:
            roots_q = roots_q.offset(offset).limit(limit)
        roots = roots_q.all()
        if not roots:
            return jsonify({"error": "No goals found"}), 404
        # Build complete trees for each root
        result = [serialize_goal(root) for root in roots]
        return etag_json_response(result)
    finally:
        db_session.close()




@goals_bp.route('/goals', methods=['POST'])
@validate_request(GoalCreateSchema)
@limiter.limit("30 per minute")
@token_required
def create_goal(current_user, validated_data):
    """Create a new goal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        new_goal, error, status = service.create_global_goal(current_user.id, validated_data)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        
        logger.debug(f"Created goal {new_goal.id}")
        
        # Emit goal created event
        event_bus.emit(Event(Events.GOAL_CREATED, {
            'goal_id': new_goal.id,
            'goal_type': validated_data.get('type', 'Goal'),
            'parent_id': new_goal.parent_id,
            'root_id': new_goal.root_id
        }, source='goals_api.create_goal'))
        
        # Return the goal with its tree
        result = serialize_goal(new_goal)
        return jsonify(result), 201
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating goal")
        return internal_error(logger, "Error creating goal")
    finally:
        db_session.close()


@goals_bp.route('/fractal/<root_id>/sessions/<session_id>/micro-goals', methods=['GET'])
@token_required
def get_session_micro_goals(current_user, root_id, session_id):
    """Get all micro goals linked to a session, including their nano children."""
    from sqlalchemy import select, or_
    from sqlalchemy.orm import selectinload
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Verify ownership of fractal
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        session_obj = db_session.query(Session).filter(
            Session.id == session_id,
            Session.root_id == root_id,
            Session.deleted_at == None
        ).first()
        if not session_obj:
            return jsonify({"error": "Session not found in this fractal"}), 404
        
        # Query micro goals linked to session
        # Junction table query
        stmt = (
            select(Goal)
            .join(session_goals, Goal.id == session_goals.c.goal_id)
            .outerjoin(models.GoalLevel, Goal.level_id == models.GoalLevel.id)
            .where(session_goals.c.session_id == session_id)
            .where(Goal.root_id == root_id)
            .where(
                or_(
                    models.GoalLevel.name == 'Micro Goal',
                    session_goals.c.goal_type == 'MicroGoal'
                )
            )
            .options(selectinload(Goal.children)) # Load NanoGoals
        )
        
        micro_goals = db_session.execute(stmt).scalars().all()
        
        result = [serialize_goal(g) for g in micro_goals]
        return jsonify(result)
        
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching session micro goals")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/fractal/<root_id>/sessions/<session_id>/goals-view', methods=['GET'])
@token_required
def get_session_goals_view(current_user, root_id, session_id):
    """Return the canonical goals payload used by the session detail sidepane."""
    from services.goal_tree_service import GoalTreeService

    engine = models.get_engine()
    db_session = get_session(engine)
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
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.delete_global_goal(goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        is_root = payload["is_root"]
        goal_name = payload["goal_name"]
        root_id = payload["root_id"]

        logger.info(f"Deleted {'root ' if is_root else ''}goal {goal_id}")

        event_bus.emit(Event(Events.GOAL_DELETED, {
            'goal_id': goal_id,
            'goal_name': goal_name,
            'root_id': root_id,
            'was_root': is_root
        }, source='goals_api.delete_goal'))

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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    
    engine = models.get_engine()
    db_session = get_session(engine)
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

        event_bus.emit(Event(Events.GOAL_UPDATED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id,
            'updated_fields': list(data.keys())
        }, source='goals_api.update_goal'))

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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.add_goal_target(goal_id, current_user.id, data)
        if error:
            return jsonify({"error": error}), status
        goal = payload["goal"]
        new_target = payload["target"]
        
        # Emit target created event
        event_bus.emit(Event(Events.TARGET_CREATED, {
            'target_id': new_target.id,
            'target_name': new_target.name,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id
        }, source='goals_api.add_target'))
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.remove_goal_target(goal_id, target_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        goal = payload["goal"]
        target = payload["target"]
        
        # Emit target deleted event
        event_bus.emit(Event(Events.TARGET_DELETED, {
            'target_id': target_id,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id
        }, source='goals_api.remove_target'))
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
def update_goal_completion_endpoint(current_user, goal_id: str, root_id=None):
    """Update goal completion status."""
    data = request.get_json(silent=True) or {}
    if data and not isinstance(data, dict):
        return jsonify({
            "error": "Validation failed",
            "details": [{
                "field": "",
                "message": "Input should be a valid dictionary",
                "type": "dict_type",
            }],
        }), 400
    try:
        data = GoalCompletionUpdateSchema(**data).model_dump(exclude_unset=True)
    except ValidationError as exc:
        errors = []
        for error in exc.errors():
            field = ".".join(str(loc) for loc in error["loc"])
            errors.append({
                "field": field,
                "message": error["msg"],
                "type": error["type"],
            })
        return jsonify({"error": "Validation failed", "details": errors}), 400
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.update_goal_completion(goal_id, current_user.id, data, root_id=root_id)
        if error:
            if isinstance(error, dict):
                return jsonify(error), status
            return jsonify({"error": error}), status
        
        # Emit completion event
        if goal.completed:
            event_bus.emit(Event(Events.GOAL_COMPLETED, {
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id or goal.id,
                'auto_completed': False,
                'reason': 'manual'
            }, source='goals_api.update_completion'))
        else:
            event_bus.emit(Event(Events.GOAL_UNCOMPLETED, {
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id or goal.id
            }, source='goals_api.update_completion'))
        
        result = serialize_goal(goal)
        return jsonify(result), status
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        new_goal, error, status = service.create_fractal_goal(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        
        # Emit goal created event
        event_bus.emit(Event(Events.GOAL_CREATED, {
            'goal_id': new_goal.id,
            'goal_name': new_goal.name,
            'goal_type': validated_data.get('type', 'Goal'),
            'parent_id': new_goal.parent_id,
            'root_id': new_goal.root_id
        }, source='goals_api.create_fractal_goal'))
        
        # Return the created goal
        return jsonify(serialize_goal(new_goal, include_children=False)), 201
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.delete_fractal_goal(root_id, goal_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        
        # Emit goal deleted event
        event_bus.emit(Event(Events.GOAL_DELETED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id
        }, source='goals_api.delete_fractal_goal'))
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = validated_data
        service = GoalService(db_session, sync_targets=_sync_targets)
        goal, error, status = service.update_fractal_goal(root_id, goal_id, current_user.id, data)
        if error:
            return jsonify({"error": error}), status
        
        # Emit goal updated event
        event_bus.emit(Event(Events.GOAL_UPDATED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id, # For root goals, root_id is None, so use id
            'updated_fields': list(data.keys())
        }, source='goals_api.update_fractal_goal'))
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
    engine = models.get_engine()
    db_session = get_session(engine)
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
