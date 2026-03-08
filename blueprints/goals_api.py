from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import models
from sqlalchemy.orm import selectinload
from sqlalchemy import select, or_

logger = logging.getLogger(__name__)
from models import (
    get_session,
    Goal, Session, Target, GoalLevel,
    get_all_root_goals, get_goal_by_id, get_session_by_id,
    validate_root_goal, session_goals, ActivityDefinition
)
from validators import (
    validate_request,
    GoalCreateSchema, GoalUpdateSchema,
    FractalCreateSchema,
    parse_date_string
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
    serialize_activity_instance,
    calculate_smart_status,
    format_utc,
)
from extensions import limiter
from services.metrics import GoalMetricsService
from services.analytics_cache import get_analytics, set_analytics
from services.goal_analytics_service import GoalAnalyticsService
from services.goal_service import (
    GoalService,
    authorize_goal_access as _authorize_goal_access,
    resolve_level_id as _resolve_level_id,
    session_goal_insert_values as _session_goal_insert_values,
    sync_goal_targets as _sync_targets,
)
from services.session_service import SessionService
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
        
    except Exception as e:
        db_session.rollback()
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
        
    except Exception as e:
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
    except Exception:
        logger.exception("Error fetching session goals view")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_goal_endpoint(current_user, goal_id: str):
    """Delete a goal and all its children."""
    logger.debug(f"Attempting to delete goal with ID: {goal_id}")
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            if not _authorize_goal_access(db_session, current_user.id, goal):
                return jsonify({"error": "Goal not found or access denied"}), 404
            is_root = goal.parent_id is None
            goal_name = goal.name
            root_id = goal.root_id
            
            # Cascading deletion for Notes associated with Nano Goals
            from models import Note
            def get_nano_goal_ids(g):
                ids = []
                if g.level and g.level.name == 'Nano Goal':
                    ids.append(g.id)
                for child in (g.children or []):
                    ids.extend(get_nano_goal_ids(child))
                return ids
            
            nano_ids = get_nano_goal_ids(goal)
            if nano_ids:
                db_session.query(Note).filter(Note.nano_goal_id.in_(nano_ids)).delete(synchronize_session=False)

            db_session.delete(goal)
            db_session.commit()
            logger.info(f"Deleted {'root ' if is_root else ''}goal {goal_id}")
            
            # Emit goal deleted event
            event_bus.emit(Event(Events.GOAL_DELETED, {
                'goal_id': goal_id,
                'goal_name': goal_name,
                'root_id': root_id,
                'was_root': is_root
            }, source='goals_api.delete_goal'))
            
            return jsonify({"status": "success", "message": f"{'Root g' if is_root else 'G'}oal deleted"})
        
        # Not found
        logger.warning(f"Goal {goal_id} not found")
        return jsonify({"error": "Goal not found"}), 404
        
    except Exception as e:
        db_session.rollback()
        logger.error(f"Error in delete_goal_endpoint: {str(e)}")
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
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            if not _authorize_goal_access(db_session, current_user.id, goal):
                return jsonify({"error": "Goal not found or access denied"}), 404
            return jsonify(serialize_goal(goal, include_children=False))
            
        return jsonify({"error": "Goal not found"}), 404
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['PUT'])
@token_required
def update_goal_endpoint(current_user, goal_id: str):
    """Update goal details."""
    data = request.get_json()
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Parse deadline if provided
        deadline = None
        if 'deadline' in data and data['deadline']:
            try:
                d_str = data['deadline']
                if 'T' in d_str: d_str = d_str.split('T')[0]
                deadline = datetime.strptime(d_str, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid deadline format. Use YYYY-MM-DD"}), 400
        
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            if not _authorize_goal_access(db_session, current_user.id, goal):
                return jsonify({"error": "Goal not found or access denied"}), 404
                
            if 'deadline' in data:
                # Parent deadline enforcement
                if deadline and goal.parent_id:
                    parent = get_goal_by_id(db_session, goal.parent_id)
                    if parent and parent.deadline:
                        p_deadline = parent.deadline.date() if isinstance(parent.deadline, datetime) else parent.deadline
                        if deadline > p_deadline:
                            return jsonify({
                                "error": "Child deadline cannot be later than parent deadline",
                                "parent_deadline": p_deadline.isoformat()
                            }), 400
                
                # Auto-cascade if shortening
                # Ensure we compare dates
                old_deadline = goal.deadline
                if isinstance(old_deadline, datetime):
                    old_deadline = old_deadline.date()
                
                goal.deadline = deadline
                
                if deadline and (not old_deadline or deadline < old_deadline):
                    # Recursive cascade to children
                    def cascade_deadline(parent_goal, new_max):
                        for child in (parent_goal.children or []):
                            if child.deadline:
                                c_deadline = child.deadline.date() if isinstance(child.deadline, datetime) else child.deadline
                                if c_deadline > new_max:
                                    child.deadline = new_max
                                    logger.info(f"Cascaded deadline update to child goal {child.id}")
                                    cascade_deadline(child, new_max)
                    
                    cascade_deadline(goal, deadline)

            if 'name' in data and data['name'] is not None:
                goal.name = data['name']
            if 'description' in data and data['description'] is not None:
                # Nano goal description restriction (also handled by validator, but safe to guard here)
                if goal.level and goal.level.name == 'Nano Goal' and data['description'].strip():
                    return jsonify({"error": "NanoGoal cannot have a description"}), 400
                goal.description = data['description']
            if 'targets' in data:
                logger.debug(f"Received targets data: {data['targets']}")
                # Sync relational targets
                _sync_targets(db_session, goal, data['targets'] or [])
            if 'completed_via_children' in data:
                goal.completed_via_children = data['completed_via_children']
            
            db_session.commit()
            db_session.refresh(goal)
            logger.debug(f"Committed changes. Goal has {len([t for t in goal.targets_rel if t.deleted_at is None])} active targets")
            
            # Emit goal updated event
            event_bus.emit(Event(Events.GOAL_UPDATED, {
                'goal_id': goal.id,
                'goal_name': goal.name,
                'root_id': goal.root_id or goal.id, # For root goals, root_id is None, so use id
                'updated_fields': list(data.keys())
            }, source='goals_api.update_goal'))
            
            return jsonify(serialize_goal(goal, include_children=False))
        
        return jsonify({"error": "Goal not found"}), 404
        
    except Exception as e:
        logger.exception(f"Error in update_goal_endpoint: {e}")
        db_session.rollback()
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/targets', methods=['POST'])
@token_required
def add_goal_target(current_user, goal_id):
    """Add a target to a goal using relational Target model."""
    data = request.get_json()
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
    except Exception as e:
        db_session.rollback()
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
    except Exception as e:
        db_session.rollback()
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
        goal = get_goal_by_id(db_session, goal_id, load_associations=False)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404

        authorized_root_id = goal.root_id or goal.id
        root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        service = GoalMetricsService(db_session)
        metrics = service.get_metrics_for_goal(goal_id)
        
        if not metrics:
            return jsonify({"error": "Goal not found"}), 404
            
        return jsonify(metrics)
    except Exception as e:
        logger.exception(f"Error fetching goal metrics: {e}")
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
        goal = get_goal_by_id(db_session, goal_id, load_associations=False)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404

        authorized_root_id = goal.root_id or goal.id
        root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        service = GoalMetricsService(db_session)
        metrics = service.get_goal_daily_durations(goal_id)
        
        if metrics is None:
            return jsonify({"error": "Goal not found"}), 404
            
        return jsonify(metrics)
    except Exception as e:
        logger.exception(f"Error fetching goal daily durations: {e}")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/complete', methods=['PATCH'])
@goals_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
@token_required
def update_goal_completion_endpoint(current_user, goal_id: str, root_id=None):
    """Update goal completion status."""
    data = request.get_json(silent=True) or {}
    
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
        
    except Exception as e:
        db_session.rollback()
        logger.error(f"Error in update_goal_completion_endpoint: {str(e)}")
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
        
    except Exception as e:
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
        
    except Exception as e:
        db_session.rollback()
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
        
    except Exception as e:
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
        
    except Exception as e:
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
        
    except Exception as e:
        db_session.rollback()
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
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Error deleting fractal goal")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['PUT'])
@token_required
def update_fractal_goal(current_user, root_id, goal_id):
    """Update a goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = request.get_json()
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
        
    except Exception as e:
        db_session.rollback()
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
        
    except Exception as e:
        return internal_error(logger, "Error fetching goal analytics")
    finally:
        db_session.close()


# ============================================================================
# TARGET EVALUATION ENDPOINTS
# ============================================================================

@goals_bp.route('/<root_id>/goals/<goal_id>/evaluate-targets', methods=['POST'])
@token_required
def evaluate_goal_targets(current_user, root_id, goal_id):
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
        data = request.get_json() or {}
        service = GoalService(db_session, sync_targets=_sync_targets)
        payload, error, status = service.evaluate_goal_targets(
            root_id,
            goal_id,
            current_user.id,
            data.get('session_id'),
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error evaluating targets")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()
