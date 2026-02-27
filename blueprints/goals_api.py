from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import models
from sqlalchemy.orm import selectinload
from sqlalchemy import inspect

logger = logging.getLogger(__name__)
from models import (
    get_session,
    Goal, Session, Target, GoalLevel, TargetMetricCondition,
    get_all_root_goals, get_goal_by_id, get_session_by_id,
    validate_root_goal, session_goals
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

# Create blueprint
goals_bp = Blueprint('goals', __name__, url_prefix='/api')

_SESSION_GOALS_HAS_SOURCE = None
_TYPE_TO_LEVEL_NAME = {
    'UltimateGoal': 'Ultimate Goal',
    'LongTermGoal': 'Long Term Goal',
    'MidTermGoal': 'Mid Term Goal',
    'ShortTermGoal': 'Short Term Goal',
    'ImmediateGoal': 'Immediate Goal',
    'MicroGoal': 'Micro Goal',
    'NanoGoal': 'Nano Goal',
}

def _resolve_level_id(db_session, type_value):
    level_name = _TYPE_TO_LEVEL_NAME.get(type_value, type_value.replace('Goal', ' Goal') if isinstance(type_value, str) else None)
    if not level_name:
        return None
    # Scope to system defaults (owner_id=None) to prevent cross-user collisions
    level = db_session.query(GoalLevel).filter_by(name=level_name, owner_id=None).first()
    if not level:
        # Fallback: any level with that name
        level = db_session.query(GoalLevel).filter_by(name=level_name).first()
    return level.id if level else None


def _session_goals_supports_source(db_session):
    global _SESSION_GOALS_HAS_SOURCE
    if _SESSION_GOALS_HAS_SOURCE is None:
        cols = inspect(db_session.bind).get_columns('session_goals')
        _SESSION_GOALS_HAS_SOURCE = any(c.get('name') == 'association_source' for c in cols)
    return _SESSION_GOALS_HAS_SOURCE


def _session_goal_insert_values(db_session, session_id, goal_id, goal_type, association_source):
    values = {
        'session_id': session_id,
        'goal_id': goal_id,
        'goal_type': goal_type,
    }
    if _session_goals_supports_source(db_session):
        values['association_source'] = association_source
    return values


def _authorize_goal_access(db_session, current_user_id: str, goal, root_id_hint: str = None):
    """Validate that a goal belongs to the current user via its owned root."""
    if not goal:
        return None

    authorized_root_id = root_id_hint or goal.root_id or goal.id
    root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user_id)
    if not root:
        return None

    if goal.root_id and goal.root_id != authorized_root_id:
        return None

    return authorized_root_id


def _sync_targets(db_session, goal, incoming_targets: list):
    """
    Sync relational Target records with incoming target data.
    - Creates new targets that don't exist
    - Updates existing targets
    - Soft-deletes targets that are no longer present
    """
    from datetime import datetime, timezone
    
    # Helper sanitizers
    def _parse_date(val):
        if not val: return None
        if isinstance(val, str):
            if not val.strip(): return None
            try:
                # Handle ISO format (e.g. 2026-02-15T00:00:00Z)
                if 'T' in val: val = val.split('T')[0]
                return datetime.strptime(val, '%Y-%m-%d')
            except ValueError:
                logger.warning(f"Invalid target date format: {val}")
                return None
        return val

    def _parse_int(val):
        if val is None or val == '': return None
        try: return int(val)
        except: return None

    def _clean_metrics(val):
        if not isinstance(val, list): return []
        cleaned = []
        for m in val:
            metric_id = m.get('metric_id') or m.get('metric_definition_id')
            if not metric_id:
                continue
            v_raw = m.get('value', m.get('target_value', 0))
            try:
                v = float(v_raw)
                import math
                if not math.isfinite(v): v = 0.0
            except: v = 0.0
            
            cleaned.append({
                'metric_definition_id': metric_id,
                'target_value': v,
                'operator': m.get('operator', '>=')
            })
        return cleaned

    try:
        # Get current active targets for this goal
        current_targets = {t.id: t for t in goal.targets_rel if t.deleted_at is None}
        incoming_ids = {t.get('id') for t in incoming_targets if t.get('id')}
        
        # Soft-delete targets that were removed
        for target_id, target in current_targets.items():
            if target_id not in incoming_ids:
                target.deleted_at = datetime.now(timezone.utc)
                logger.debug(f"Soft-deleted target {target_id}")
        
        # Create or update targets
        for target_data in incoming_targets:
            target_id = target_data.get('id')
            
            # Sanitize inputs
            activity_id = target_data.get('activity_id') or None
            linked_block_id = target_data.get('linked_block_id') or None
            start_date = _parse_date(target_data.get('start_date'))
            end_date = _parse_date(target_data.get('end_date'))
            freq_days = _parse_int(target_data.get('frequency_days'))
            freq_count = _parse_int(target_data.get('frequency_count'))
            metrics = _clean_metrics(target_data.get('metrics'))
            
            if target_id and target_id in current_targets:
                # Update existing target
                target = current_targets[target_id]
                target.name = target_data.get('name', target.name)
                target.activity_id = activity_id
                target.type = target_data.get('type', target.type)
                target.time_scope = target_data.get('time_scope', target.time_scope)
                target.start_date = start_date
                target.end_date = end_date
                target.linked_block_id = linked_block_id
                target.frequency_days = freq_days
                target.frequency_count = freq_count
                existing_conditions = {c.metric_definition_id: c for c in (target.metric_conditions or [])}
                incoming_metric_ids = {m['metric_definition_id'] for m in metrics}
                for condition in list(target.metric_conditions or []):
                    if condition.metric_definition_id not in incoming_metric_ids:
                        db_session.delete(condition)
                for metric in metrics:
                    condition = existing_conditions.get(metric['metric_definition_id'])
                    if condition:
                        condition.operator = metric['operator']
                        condition.target_value = metric['target_value']
                    else:
                        db_session.add(TargetMetricCondition(
                            target_id=target.id,
                            metric_definition_id=metric['metric_definition_id'],
                            operator=metric['operator'],
                            target_value=metric['target_value']
                        ))
                logger.debug(f"Updated target {target_id}")
            else:
                # Create new target
                new_target = Target(
                    id=target_id or str(uuid.uuid4()),
                    goal_id=goal.id,
                    root_id=goal.root_id or goal.id,
                    activity_id=activity_id,
                    name=target_data.get('name', 'Measure'),
                    type=target_data.get('type', 'threshold'),
                    time_scope=target_data.get('time_scope', 'all_time'),
                    start_date=start_date,
                    end_date=end_date,
                    linked_block_id=linked_block_id,
                    frequency_days=freq_days,
                    frequency_count=freq_count,
                    completed=target_data.get('completed', False)
                )
                db_session.add(new_target)
                db_session.flush()
                for metric in metrics:
                    db_session.add(TargetMetricCondition(
                        target_id=new_target.id,
                        metric_definition_id=metric['metric_definition_id'],
                        operator=metric['operator'],
                        target_value=metric['target_value']
                    ))
                logger.debug(f"Created new target {new_target.id} with activity_id={activity_id}")
                
    except Exception as e:
        logger.exception(f"Error in _sync_targets: {e}")
        # Re-raise so the endpoint can rollback
        raise e


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
        parent = None
        parent_id = validated_data.get('parent_id')
        
        if parent_id:
            logger.debug(f"Looking for parent with ID: {parent_id}")
            parent = get_goal_by_id(db_session, parent_id)
            if not parent:
                return jsonify({"error": f"Parent not found: {parent_id}"}), 404
            if not _authorize_goal_access(db_session, current_user.id, parent):
                return jsonify({"error": "Parent not found or access denied"}), 404
        
        # Parse deadline if provided (already validated by schema)
        deadline = None
        if validated_data.get('deadline'):
            deadline = parse_date_string(validated_data['deadline'])

        level_id = _resolve_level_id(db_session, validated_data.get('type'))
        
        # Create the goal (type already validated by schema)
        new_goal = Goal(
            level_id=level_id,
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            deadline=deadline,
            completed=False,
            completed_via_children=validated_data.get('completed_via_children', False),
            relevance_statement=validated_data.get('relevance_statement'),
            parent_id=parent_id,
            owner_id=parent.owner_id if parent else current_user.id
        )
        
        # Set root_id
        if parent:
            # Traverse up to find root
            current = parent
            while current.parent_id:
                current = get_goal_by_id(db_session, current.parent_id)
            new_goal.root_id = current.id
        
        db_session.add(new_goal)
        db_session.flush()
        if not parent:
            new_goal.root_id = new_goal.id

        # Handle targets if provided
        if validated_data.get('targets'):
            # Source of truth: relational Target rows.
            _sync_targets(db_session, new_goal, validated_data['targets'])
            new_goal.targets = None
        
        # Link to session if session_id provided and it's a Micro Goal
        # We need to check the level name
        is_micro = False
        if getattr(new_goal, 'level', None) and new_goal.level.name == 'Micro Goal':
            is_micro = True
            
        if validated_data.get('session_id') and (validated_data.get('type') == 'MicroGoal' or is_micro):
            db_session.execute(session_goals.insert().values(
                **_session_goal_insert_values(
                    db_session,
                    validated_data['session_id'],
                    new_goal.id,
                    'MicroGoal', # Legacy string for the junction table if it still expects it
                    'micro_goal'
                )
            ))
        
        db_session.commit()
        db_session.refresh(new_goal)
        
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
        
        # Query micro goals linked to session
        # Junction table query
        stmt = (
            select(Goal)
            .join(session_goals, Goal.id == session_goals.c.goal_id)
            .outerjoin(models.GoalLevel, Goal.level_id == models.GoalLevel.id)
            .where(session_goals.c.session_id == session_id)
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
            if 'name' in data and data['name'] is not None:
                goal.name = data['name']
            if 'description' in data and data['description'] is not None:
                goal.description = data['description']
            if 'deadline' in data:
                goal.deadline = deadline
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
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        if not _authorize_goal_access(db_session, current_user.id, goal):
            return jsonify({"error": "Goal not found or access denied"}), 404
        
        # Create new Target object
        target_id = data.get('id') or str(uuid.uuid4())
        new_target = Target(
            id=target_id,
            goal_id=goal_id,
            root_id=goal.root_id or goal_id,  # For root goals, use goal_id
            activity_id=data.get('activity_id'),
            name=data.get('name', 'Measure'),
            type=data.get('type', 'threshold'),
            time_scope=data.get('time_scope', 'all_time'),
            start_date=data.get('start_date'),
            end_date=data.get('end_date'),
            linked_block_id=data.get('linked_block_id'),
            frequency_days=data.get('frequency_days'),
            frequency_count=data.get('frequency_count'),
            completed=False
        )
        
        db_session.add(new_target)
        db_session.flush()
        for metric in (data.get('metrics') or []):
            metric_id = metric.get('metric_id') or metric.get('metric_definition_id')
            if not metric_id:
                continue
            target_value = metric.get('value', metric.get('target_value', 0))
            try:
                target_value = float(target_value)
            except (TypeError, ValueError):
                target_value = 0
            db_session.add(TargetMetricCondition(
                target_id=new_target.id,
                metric_definition_id=metric_id,
                operator=metric.get('operator', '>='),
                target_value=target_value
            ))
        db_session.commit()
        db_session.refresh(new_target)
        
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
        return jsonify({"targets": all_targets, "id": new_target.id}), 201
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
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        if not _authorize_goal_access(db_session, current_user.id, goal):
            return jsonify({"error": "Goal not found or access denied"}), 404
        
        # Find the target in the relational model
        target = db_session.query(Target).filter(
            Target.id == target_id,
            Target.goal_id == goal_id,
            Target.deleted_at == None
        ).first()
        
        if not target:
            return jsonify({"error": "Target not found"}), 404
        
        # Soft delete
        target.deleted_at = datetime.now(timezone.utc)
        db_session.commit()
        
        # Emit target deleted event
        event_bus.emit(Event(Events.TARGET_DELETED, {
            'target_id': target_id,
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal_id
        }, source='goals_api.remove_target'))
        
        # Return remaining targets
        remaining_targets = [serialize_target(t) for t in goal.targets_rel if t.deleted_at is None]
        return jsonify({"targets": remaining_targets}), 200
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
    from datetime import datetime
    
    data = request.get_json(silent=True) or {}
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404

        # Authorize by owned root (works for both global and fractal-scoped routes)
        authorized_root_id = root_id or goal.root_id or goal.id
        root = validate_root_goal(db_session, authorized_root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        if goal.root_id and goal.root_id != authorized_root_id:
            return jsonify({"error": "Goal not found in this fractal"}), 404

        if 'completed' in data:
            goal.completed = data['completed']
        else:
            goal.completed = not goal.completed
        
        # Enforce allow_manual_completion from level
        if goal.completed:
            level = getattr(goal, 'level', None)
            if level and level.allow_manual_completion == False:
                return jsonify({"error": "Manual completion is not allowed for this goal level"}), 403
            
            # Enforce requires_smart from level
            if level and getattr(level, 'requires_smart', False):
                smart_status = calculate_smart_status(goal)
                if not all(smart_status.values()):
                    missing = [k for k, v in smart_status.items() if not v]
                    return jsonify({
                        "error": f"SMART criteria not met. Missing: {', '.join(missing)}",
                        "smart_status": smart_status
                    }), 400
        
        # Set or clear completed_at based on completion status
        if goal.completed:
            goal.completed_at = datetime.now(timezone.utc)
        else:
            goal.completed_at = None
            
        db_session.commit()
        db_session.refresh(goal)
        
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
        return jsonify(result)
        
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
        # Filter root goals by owner_id with eager loading for SMART status checks
        roots = db_session.query(Goal).options(
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups),
            selectinload(Goal.children) # For max_updated recursion if needed, though recursion might still trigger loads deeply
        ).filter(
            Goal.parent_id == None,
            Goal.owner_id == current_user.id,
            Goal.deleted_at == None
        ).all()
        
        result = []
        
        for root in roots:
            # Find the most recent updated_at timestamp in the entire fractal tree
            max_updated = root.updated_at
            
            def find_max_updated(goal, current_max):
                if goal.updated_at and (not current_max or goal.updated_at > current_max):
                    current_max = goal.updated_at
                for child in goal.children:
                    current_max = find_max_updated(child, current_max)
                return current_max
            
            last_activity = find_max_updated(root, max_updated)
            
            level_name = root.level.name if getattr(root, 'level', None) else "Ultimate Goal"
            result.append({
                "id": root.id,
                "name": root.name,
                "description": root.description,
                "type": level_name.replace(" ", ""),
                "created_at": format_utc(root.created_at),
                "updated_at": format_utc(last_activity),
                "is_smart": all(calculate_smart_status(root).values())
            })
        
        return jsonify(result)
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
        # For now we'll lookup or create the Ultimate Goal level
        level = db_session.query(models.GoalLevel).filter_by(name="Ultimate Goal").first()
        if not level:
            level = models.GoalLevel(name="Ultimate Goal", rank=0)
            db_session.add(level)
            db_session.flush()

        # Create root goal
        new_fractal = Goal(
            level_id=level.id,
            name=validated_data['name'],
            description=validated_data.get('description', ''),
            relevance_statement=validated_data.get('relevance_statement'),
            parent_id=None,
            owner_id=current_user.id
        )
        
        db_session.add(new_fractal)
        db_session.commit()
        db_session.refresh(new_fractal)
        
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
        root = db_session.query(Goal).filter_by(id=root_id, parent_id=None, owner_id=current_user.id).first()
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Also delete all sessions for this fractal
        sessions = db_session.query(Session).filter_by(root_id=root_id).all()
        for session in sessions:
            db_session.delete(session)
        
        # Delete the root (cascade will handle all children)
        db_session.delete(root)
        db_session.commit()
        
        return jsonify({"status": "success", "message": "Fractal deleted"})
        
    except Exception as e:
        db_session.rollback()
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals', methods=['GET'])
@token_required
def get_fractal_goals(current_user, root_id):
    """Get the complete goal tree for a specific fractal if owned by user."""
    from sqlalchemy.orm import selectinload
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Simplified eager loading to ensure stability
        options = [
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups)
        ]

        root = db_session.query(Goal).options(*options).filter(
            Goal.id == root_id, 
            Goal.parent_id == None,
            Goal.owner_id == current_user.id,
            Goal.deleted_at == None
        ).first()

        if not root:
            # Fallback to simple validation if the complex query fails or returns nothing
            root = require_owned_root(db_session, root_id, current_user.id)
            if not root:
                return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Build complete tree for this fractal
        result = serialize_goal(root)
        return etag_json_response(result)
        
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
        # Verify ownership
        root = db_session.query(Goal).filter_by(id=root_id, parent_id=None, owner_id=current_user.id).first()
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Query ShortTermGoals directly using root_id index
        # Filter for active (not completed) goals only
        # Eagerly load children and associations for SMART status checks
        from sqlalchemy.orm import selectinload
        st_goals = db_session.query(Goal).join(models.GoalLevel, Goal.level_id == models.GoalLevel.id).options(
            selectinload(Goal.children),
            selectinload(Goal.associated_activities),
            selectinload(Goal.associated_activity_groups)
        ).filter(
            Goal.root_id == root_id,
            models.GoalLevel.name == 'Short Term Goal',
            Goal.completed == False,
            Goal.deleted_at == None
        ).all()
        
        result = []
        for stg in st_goals:
            # Manually find active children to avoid loading entire tree or deleted items
            active_children = []
            for child in stg.children:
                is_imm = False
                if getattr(child, 'level', None) and child.level.name == 'Immediate Goal':
                    is_imm = True
                if is_imm and not child.completed and not child.deleted_at:
                    active_children.append(serialize_goal(child, include_children=False))
            
            stg_dict = {
                "id": stg.id,
                "name": stg.name,
                "description": stg.description,
                "deadline": format_utc(stg.deadline),
                "completed": stg.completed,
                "immediateGoals": active_children
            }
            result.append(stg_dict)
            
        return etag_json_response(result)
        
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
        # Verify ownership
        root = db_session.query(Goal).filter_by(id=root_id, parent_id=None, owner_id=current_user.id).first()
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Parse deadline if provided (already validated by schema)
        deadline = None
        if validated_data.get('deadline'):
            deadline = parse_date_string(validated_data['deadline'])
            
        level_id = _resolve_level_id(db_session, validated_data.get('type'))
        
        # Resolve level to inherit defaults
        level_obj = db_session.query(GoalLevel).filter_by(id=level_id).first() if level_id else None
        
        # --- ENFORCE CHARACTERISTICS ---
        if level_obj:
            # 1. Enforce description_required
            if getattr(level_obj, 'description_required', False):
                if not validated_data.get('description') or not validated_data['description'].strip():
                    return jsonify({"error": f"A description is required for {level_obj.name}s."}), 400
            
            # 2. Enforce max_children on the PARENT goal
            parent_id = validated_data.get('parent_id')
            if parent_id:
                parent_goal = db_session.query(Goal).filter_by(id=parent_id, root_id=root_id).first()
                if not parent_goal:
                     return jsonify({"error": "Parent goal not found in this fractal."}), 400
                if parent_goal and parent_goal.level:
                    parent_max = parent_goal.level.max_children
                    if parent_max is not None:
                        current_children = db_session.query(Goal).filter_by(
                            parent_id=parent_id, 
                            deleted_at=None
                        ).count()
                        if current_children >= parent_max:
                            return jsonify({"error": f"Cannot create goal: Parent level '{parent_goal.level.name}' allows a maximum of {parent_max} children."}), 400
        # -------------------------------
        
        # Inherit auto_complete_when_children_done from level if not explicitly set
        completed_via_children = validated_data.get('completed_via_children', False)
        if not completed_via_children and level_obj and getattr(level_obj, 'auto_complete_when_children_done', False):
            completed_via_children = True
        
        # Create new goal
        new_goal = Goal(
            id=str(uuid.uuid4()),
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            level_id=level_id,
            parent_id=validated_data.get('parent_id'),
            deadline=deadline,
            completed=False,
            completed_via_children=completed_via_children,
            allow_manual_completion=validated_data.get('allow_manual_completion', True),
            track_activities=validated_data.get('track_activities', True),
            relevance_statement=validated_data.get('relevance_statement'),
            root_id=root_id  # Set root_id for performance
        )
        
        db_session.add(new_goal)
        db_session.flush()

        # Handle targets if provided
        if validated_data.get('targets'):
            # Source of truth: relational Target rows.
            _sync_targets(db_session, new_goal, validated_data['targets'])
            new_goal.targets = None
        
        # Link to session if session_id provided and it's a MicroGoal
        is_micro = getattr(new_goal, 'level', None) and new_goal.level.name == 'Micro Goal'
        if validated_data.get('session_id') and is_micro:
            db_session.execute(session_goals.insert().values(
                **_session_goal_insert_values(
                    db_session,
                    validated_data['session_id'],
                    new_goal.id,
                    'MicroGoal',
                    'micro_goal'
                )
            ))
        
        db_session.commit()
        db_session.refresh(new_goal)
        
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
        # Validate root goal exists
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the goal
        goal = get_goal_in_root(db_session, root_id, goal_id)
        
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Return goal data
        result = serialize_goal(goal)
        return jsonify(result)
        
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
@token_required
def delete_fractal_goal(current_user, root_id, goal_id):
    """Delete a goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Find the goal
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        if goal.root_id != root_id:
            return jsonify({"error": "Goal not found in this fractal"}), 404
        
        # Capture data before delete for the event
        goal_id = goal.id
        goal_name = goal.name
        root_id = goal.root_id
        
        # Delete the goal (cascade will handle children)
        db_session.delete(goal)
        db_session.commit()
        
        # Emit goal deleted event
        event_bus.emit(Event(Events.GOAL_DELETED, {
            'goal_id': goal_id,
            'goal_name': goal_name,
            'root_id': root_id
        }, source='goals_api.delete_fractal_goal'))
        
        return jsonify({"status": "success", "message": "Goal deleted"}), 200
        
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
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Find the goal
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        if goal.root_id != root_id:
            return jsonify({"error": "Goal not found in this fractal"}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            goal.name = data['name']
        if 'description' in data:
            goal.description = data['description']
        
        # Enforce description_required for updates
        level = getattr(goal, 'level', None)
        has_description = getattr(goal, 'description', '')
        if level and getattr(level, 'description_required', False):
            if not has_description or not has_description.strip():
                return jsonify({"error": f"A description is required for {level.name}s."}), 400

        if 'deadline' in data:
            if data['deadline']:
                try:
                    d_str = data['deadline']
                    # Handle ISO datetime strings (e.g., "2026-01-15T00:00:00.000Z")
                    if 'T' in d_str:
                        d_str = d_str.split('T')[0]
                    goal.deadline = datetime.strptime(d_str, '%Y-%m-%d').date()
                except ValueError:
                    return jsonify({"error": "Invalid deadline format. Use YYYY-MM-DD"}), 400
            else:
                goal.deadline = None
        if 'targets' in data:
            _sync_targets(db_session, goal, data['targets'] or [])
            goal.targets = None
            
        if 'parent_id' in data:
            new_parent_id = data['parent_id']
            # Enforce max_children on reparenting (only when moving to a DIFFERENT parent)
            if new_parent_id and new_parent_id != goal.parent_id:
                new_parent = db_session.query(Goal).filter_by(id=new_parent_id, root_id=root_id).first()
                if not new_parent:
                     return jsonify({"error": "New parent goal not found in this fractal."}), 400
                if new_parent and new_parent.level:
                    parent_max = new_parent.level.max_children
                    if parent_max is not None:
                        current_children = db_session.query(Goal).filter_by(
                            parent_id=new_parent_id, 
                            deleted_at=None
                        ).count()
                        if current_children >= parent_max:
                            return jsonify({"error": f"Cannot move goal: New parent level '{new_parent.level.name}' allows a maximum of {parent_max} children."}), 400
            # Allow reparenting (e.g. moving ImmediateGoal between ShortTermGoals)
            goal.parent_id = new_parent_id
        
        if 'relevance_statement' in data:
            goal.relevance_statement = data['relevance_statement']
        
        if 'completed_via_children' in data:
            goal.completed_via_children = data['completed_via_children']
        
        if 'allow_manual_completion' in data:
            goal.allow_manual_completion = data['allow_manual_completion']
            
        if 'track_activities' in data:
            goal.track_activities = data['track_activities']
        
        db_session.commit()
        db_session.refresh(goal)
        
        # Emit goal updated event
        event_bus.emit(Event(Events.GOAL_UPDATED, {
            'goal_id': goal.id,
            'goal_name': goal.name,
            'root_id': goal.root_id or goal.id, # For root goals, root_id is None, so use id
            'updated_fields': list(data.keys())
        }, source='goals_api.update_fractal_goal'))
        
        return jsonify(serialize_goal(goal, include_children=False)), 200
        
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
    from sqlalchemy import func, and_
    from sqlalchemy.orm import joinedload
    from models import session_goals, ActivityInstance, ActivityDefinition
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404

        cached = get_analytics(root_id)
        if cached is not None:
            return etag_json_response(cached)
        
        # === BATCH QUERY 1: Get all goals for this fractal ===
        all_goals = db_session.query(Goal).filter(
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).all()
        
        goal_ids = [g.id for g in all_goals]
        goal_map = {g.id: g for g in all_goals}
        
        # Calculate high-level statistics
        now = datetime.now(timezone.utc)
        
        # Goals completed
        completed_goals = [g for g in all_goals if g.completed]
        total_completed = len(completed_goals)
        
        # Average goal age (days since creation for all goals)
        goal_ages = []
        for g in all_goals:
            if g.created_at:
                created = g.created_at.replace(tzinfo=timezone.utc) if g.created_at.tzinfo is None else g.created_at
                age_days = (now - created).days
                goal_ages.append(age_days)
        avg_goal_age = sum(goal_ages) / len(goal_ages) if goal_ages else 0
        
        # Average time to completion (for completed goals with completed_at timestamp)
        completion_times = []
        for g in completed_goals:
            if g.completed_at and g.created_at:
                created = g.created_at.replace(tzinfo=timezone.utc) if g.created_at.tzinfo is None else g.created_at
                completed = g.completed_at.replace(tzinfo=timezone.utc) if g.completed_at.tzinfo is None else g.completed_at
                days_to_complete = (completed - created).days
                completion_times.append(days_to_complete)
        avg_time_to_completion = sum(completion_times) / len(completion_times) if completion_times else 0
        
        # === BATCH QUERY 2: Get all sessions with goals eagerly loaded ===
        all_sessions = db_session.query(Session).options(
            joinedload(Session.goals)
        ).filter(
            Session.root_id == root_id,
            Session.deleted_at == None
        ).all()
        
        session_map = {s.id: s for s in all_sessions}
        
        # Build goal -> sessions mapping using the batch-loaded data
        goal_session_map = {}  # goal_id -> list of session data
        for session in all_sessions:
            session_duration = session.total_duration_seconds or 0
            if session_duration == 0 and session.session_start and session.session_end:
                start = session.session_start.replace(tzinfo=timezone.utc) if session.session_start.tzinfo is None else session.session_start
                end = session.session_end.replace(tzinfo=timezone.utc) if session.session_end.tzinfo is None else session.session_end
                session_duration = int((end - start).total_seconds())
            
            # Goals already eagerly loaded
            for goal in session.goals:
                if goal.id not in goal_session_map:
                    goal_session_map[goal.id] = []
                goal_session_map[goal.id].append({
                    'session_id': session.id,
                    'session_name': session.name,
                    'duration_seconds': session_duration,
                    'completed': session.completed,
                    'session_start': format_utc(session.session_start)
                })
        
        # === BATCH QUERY 3: Get ALL activity instances for this fractal in one query ===
        all_activity_instances = db_session.query(ActivityInstance).options(
            joinedload(ActivityInstance.definition)
        ).filter(
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at == None
        ).all()
        
        # Group activity instances by session_id for fast lookup
        session_activity_map = {}  # session_id -> list of ActivityInstance
        for ai in all_activity_instances:
            if ai.session_id not in session_activity_map:
                session_activity_map[ai.session_id] = []
            session_activity_map[ai.session_id].append(ai)
        
        # Calculate avg duration towards completed goals
        total_duration_completed = 0
        completed_goals_with_sessions = 0
        for g in completed_goals:
            if g.id in goal_session_map:
                goal_duration = sum(s['duration_seconds'] for s in goal_session_map[g.id])
                if goal_duration > 0:
                    total_duration_completed += goal_duration
                    completed_goals_with_sessions += 1
        
        avg_duration_to_completion = total_duration_completed / completed_goals_with_sessions if completed_goals_with_sessions > 0 else 0
        
        # Build per-goal analytics (for ShortTermGoals and ImmediateGoals which have sessions)
        goals_data = []
        for goal in all_goals:
            sessions_for_goal = goal_session_map.get(goal.id, [])
            total_duration = sum(s['duration_seconds'] for s in sessions_for_goal)
            session_count = len(sessions_for_goal)
            
            # Get activity breakdowns using pre-fetched data (no additional queries!)
            activity_breakdown = {}
            session_ids = [s['session_id'] for s in sessions_for_goal]
            
            # Collect activity instances from the pre-fetched map
            goal_activity_instances = []
            for sid in session_ids:
                goal_activity_instances.extend(session_activity_map.get(sid, []))
            
            for ai in goal_activity_instances:
                activity_name = ai.definition.name if ai.definition else 'Unknown'
                activity_id = ai.activity_definition_id
                
                if activity_id not in activity_breakdown:
                    activity_breakdown[activity_id] = {
                        'activity_id': activity_id,
                        'activity_name': activity_name,
                        'instance_count': 0,
                        'total_duration_seconds': 0
                    }
                
                activity_breakdown[activity_id]['instance_count'] += 1
                if ai.duration_seconds:
                    activity_breakdown[activity_id]['total_duration_seconds'] += ai.duration_seconds
            
            # Goal age
            goal_age_days = 0
            if goal.created_at:
                created = goal.created_at.replace(tzinfo=timezone.utc) if goal.created_at.tzinfo is None else goal.created_at
                goal_age_days = (now - created).days
            
            # Build session durations by date for timeline chart
            session_durations_by_date = []
            for s in sessions_for_goal:
                if s['session_start']:
                    session_durations_by_date.append({
                        'date': s['session_start'],
                        'duration_seconds': s['duration_seconds'],
                        'session_name': s['session_name']
                    })
            # Sort by date
            session_durations_by_date.sort(key=lambda x: x['date'])
            
            # Build activity durations by date (activity instance level)
            activity_durations_by_date = []
            for ai in goal_activity_instances:
                # Get the session date for this activity instance
                session = next((s for s in sessions_for_goal if s['session_id'] == ai.session_id), None)
                if session and session['session_start'] and ai.duration_seconds:
                    activity_durations_by_date.append({
                        'date': session['session_start'],
                        'duration_seconds': ai.duration_seconds,
                        'activity_name': ai.definition.name if ai.definition else 'Unknown'
                    })
            # Sort by date
            activity_durations_by_date.sort(key=lambda x: x['date'])
            
            goals_data.append({
                'id': goal.id,
                'name': goal.name,
                'type': goal.level.name.replace(" ", "") if getattr(goal, 'level', None) else "Goal",
                'description': goal.description,
                'completed': goal.completed,
                'completed_at': format_utc(goal.completed_at),
                'created_at': format_utc(goal.created_at),
                'deadline': format_utc(goal.deadline),
                'parent_id': goal.parent_id,
                'age_days': goal_age_days,
                'total_duration_seconds': total_duration,
                'session_count': session_count,
                'activity_breakdown': list(activity_breakdown.values()),
                'session_durations_by_date': session_durations_by_date,
                'activity_durations_by_date': activity_durations_by_date
            })
        
        payload = {
            'summary': {
                'total_goals': len(all_goals),
                'completed_goals': total_completed,
                'completion_rate': (total_completed / len(all_goals) * 100) if all_goals else 0,
                'avg_goal_age_days': round(avg_goal_age, 1),
                'avg_time_to_completion_days': round(avg_time_to_completion, 1),
                'avg_duration_to_completion_seconds': round(avg_duration_to_completion, 0)
            },
            'goals': goals_data
        }
        set_analytics(root_id, payload)
        return etag_json_response(payload)
        
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
    from models import ActivityInstance
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = require_owned_root(db_session, root_id, current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
        
        # Get the goal
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        if goal.root_id != root_id:
            return jsonify({"error": "Goal not found in this fractal"}), 404
        
        # Get request data
        data = request.get_json() or {}
        session_id = data.get('session_id')
        
        if not session_id:
            return jsonify({"error": "session_id is required"}), 400
        
        # Get session
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Use relational targets (current source of truth)
        targets = [t for t in goal.targets_rel if t.deleted_at is None]
        if not targets:
            return jsonify({
                "goal": serialize_goal(goal, include_children=False),
                "targets_evaluated": 0,
                "targets_completed": 0,
                "newly_completed_targets": [],
                "goal_completed": False
            })
        
        # Get all activity instances for this session with their metrics
        activity_instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.session_id == session_id,
            ActivityInstance.deleted_at == None
        ).all()
        
        # Build a map of activity_id -> list of instance data with metrics
        instances_by_activity = {}
        for inst in activity_instances:
            activity_id = inst.activity_definition_id
            if activity_id not in instances_by_activity:
                instances_by_activity[activity_id] = []
            
            # Get metrics for this instance (both flat metrics and sets)
            inst_dict = serialize_activity_instance(inst)
            instances_by_activity[activity_id].append(inst_dict)
        
        # Evaluate each target
        newly_completed_targets = []
        now = datetime.now(timezone.utc)
        
        for target in targets:
            # Skip already completed targets
            if target.completed:
                continue
            
            activity_id = target.activity_id
            target_metrics = [
                {
                    'metric_id': c.metric_definition_id,
                    'metric_definition_id': c.metric_definition_id,
                    'value': c.target_value,
                    'target_value': c.target_value,
                    'operator': c.operator,
                }
                for c in (target.metric_conditions or [])
            ]
            
            if not activity_id or not target_metrics:
                continue
            
            # Check if any instance satisfies this target
            instances = instances_by_activity.get(activity_id, [])
            target_achieved = False
            
            for inst in instances:
                # Check sets first (for set-based activities)
                sets = inst.get('sets', [])
                if sets:
                    for s in sets:
                        set_metrics = s.get('metrics', [])
                        if _check_metrics_meet_target(target_metrics, set_metrics):
                            target_achieved = True
                            break
                    if target_achieved:
                        break
                
                # Check flat metrics (for non-set activities)
                inst_metrics = inst.get('metrics', [])
                if inst_metrics and _check_metrics_meet_target(target_metrics, inst_metrics):
                    target_achieved = True
                    break
            
            if target_achieved:
                target.completed = True
                target.completed_at = now
                target.completed_session_id = session_id
                newly_completed_targets.append(serialize_target(target))
        
        # Count completed targets
        targets_completed = sum(1 for t in targets if t.completed)
        targets_total = len(targets)
        
        # Auto-complete the goal if ALL targets are met
        goal_was_completed = False
        if targets_completed == targets_total and targets_total > 0:
            if not goal.completed:
                goal.completed = True
                goal.completed_at = now
                goal_was_completed = True
                logger.info(f"Auto-completing goal {goal_id} - all {targets_total} targets met")
        
        db_session.commit()
        db_session.refresh(goal)
        
        return jsonify({
            "goal": serialize_goal(goal, include_children=False),
            "targets_evaluated": targets_total,
            "targets_completed": targets_completed,
            "newly_completed_targets": newly_completed_targets,
            "goal_completed": goal_was_completed
        })
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error evaluating targets")
        return internal_error(logger, "Goals API request failed")
    finally:
        db_session.close()


def _check_metrics_meet_target(target_metrics, actual_metrics):
    """
    Check if actual metrics meet or exceed all target metrics.
    
    Args:
        target_metrics: List of {metric_id, value} from the target
        actual_metrics: List of {metric_id, value} from the activity instance or set
    
    Returns:
        bool: True if all target metrics are met or exceeded
    """
    if not target_metrics:
        return False
    
    # Build a map of actual metric values by metric_id
    actual_map = {}
    for m in actual_metrics:
        metric_id = m.get('metric_id') or m.get('metric_definition_id')
        if metric_id and m.get('value') is not None:
            actual_map[metric_id] = float(m['value'])
    
    # Check all target metrics are met
    for tm in target_metrics:
        metric_id = tm.get('metric_id') or tm.get('metric_definition_id')
        target_value = tm.get('value', tm.get('target_value'))
        operator = tm.get('operator', '>=')
        
        if not metric_id or target_value is None:
            continue
        
        actual_value = actual_map.get(metric_id)
        if actual_value is None:
            return False  # Missing metric
        
        target_float = float(target_value)
        if operator == '>=' and not (actual_value >= target_float):
            return False
        if operator == '>' and not (actual_value > target_float):
            return False
        if operator == '<=' and not (actual_value <= target_float):
            return False
        if operator == '<' and not (actual_value < target_float):
            return False
        if operator in ('==', '=') and not (abs(actual_value - target_float) < 0.001):
            return False  # Below target

    return True
