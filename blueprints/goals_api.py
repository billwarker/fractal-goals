from flask import Blueprint, request, jsonify
from datetime import datetime, timezone
import json
import uuid
import logging
import models

logger = logging.getLogger(__name__)
from models import (
    get_session,
    Goal, Session,
    get_all_root_goals, get_goal_by_id, get_session_by_id,
    build_goal_tree,
    validate_root_goal
)
from validators import (
    validate_request,
    GoalCreateSchema, GoalUpdateSchema,
    FractalCreateSchema,
    parse_date_string
)

# Create blueprint
goals_bp = Blueprint('goals', __name__, url_prefix='/api')


# ============================================================================
# GLOBAL GOAL ENDPOINTS
# ============================================================================

@goals_bp.route('/goals', methods=['GET'])
def get_goals():
    """Get all root goals with their complete trees."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        roots = get_all_root_goals(db_session)
        # Build complete trees for each root
        result = [build_goal_tree(db_session, root) for root in roots]
        return jsonify(result)
    finally:
        db_session.close()


@goals_bp.route('/goals', methods=['POST'])
@validate_request(GoalCreateSchema)
def create_goal(validated_data):
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
        
        # Parse deadline if provided (already validated by schema)
        deadline = None
        if validated_data.get('deadline'):
            deadline = parse_date_string(validated_data['deadline'])
        
        # Create the goal (type already validated by schema)
        new_goal = Goal(
            type=validated_data['type'],
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            deadline=deadline,
            completed=False,
            completed_via_children=validated_data.get('completed_via_children', False),
            parent_id=parent_id
        )
        
        # Set root_id
        if parent:
            # Traverse up to find root
            current = parent
            while current.parent_id:
                current = get_goal_by_id(db_session, current.parent_id)
            new_goal.root_id = current.id
        
        # Handle targets if provided
        if validated_data.get('targets'):
            new_goal.targets = json.dumps(validated_data['targets'])
        
        db_session.add(new_goal)
        db_session.commit()
        db_session.refresh(new_goal)
        
        logger.debug(f"Created goal {new_goal.id}")
        
        # Return the goal with its tree
        result = build_goal_tree(db_session, new_goal)
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error creating goal")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['DELETE'])
def delete_goal_endpoint(goal_id: str):
    """Delete a goal and all its children."""
    logger.debug(f"Attempting to delete goal with ID: {goal_id}")
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            is_root = goal.parent_id is None
            db_session.delete(goal)
            db_session.commit()
            logger.info(f"Deleted {'root ' if is_root else ''}goal {goal_id}")
            return jsonify({"status": "success", "message": f"{'Root g' if is_root else 'G'}oal deleted"})
        
        # Not found
        logger.warning(f"Goal {goal_id} not found")
        return jsonify({"error": "Goal not found"}), 404
        
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['GET'])
def get_goal_endpoint(goal_id: str):
    """Get a goal by ID."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            return jsonify(goal.to_dict(include_children=False))
            
        return jsonify({"error": "Goal not found"}), 404
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['PUT'])
def update_goal_endpoint(goal_id: str):
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
            if 'name' in data and data['name'] is not None:
                goal.name = data['name']
            if 'description' in data and data['description'] is not None:
                goal.description = data['description']
            if 'deadline' in data:
                goal.deadline = deadline
            if 'targets' in data:
                logger.debug(f"Received targets data: {data['targets']}")
                goal.targets = json.dumps(data['targets']) if data['targets'] else None
                logger.debug(f"Stored targets in goal: {goal.targets}")
            if 'completed_via_children' in data:
                goal.completed_via_children = data['completed_via_children']
            db_session.commit()
            logger.debug(f"Committed changes. Goal targets after commit: {goal.targets}")
            return jsonify(goal.to_dict(include_children=False))
        
        return jsonify({"error": "Goal not found"}), 404
        
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/targets', methods=['POST'])
def add_goal_target(goal_id):
    """Add a target to a goal."""
    data = request.get_json()
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        current_targets = json.loads(goal.targets) if goal.targets else []
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
            
        current_targets.append(data)
        goal.targets = json.dumps(current_targets)
        db_session.commit()
        
        return jsonify({"targets": current_targets, "id": data['id']}), 201
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/targets/<target_id>', methods=['DELETE'])
def remove_goal_target(goal_id, target_id):
    """Remove a target from a goal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        current_targets = json.loads(goal.targets) if goal.targets else []
        new_targets = [t for t in current_targets if t.get('id') != target_id]
        
        if len(new_targets) == len(current_targets):
             return jsonify({"error": "Target not found"}), 404
             
        goal.targets = json.dumps(new_targets)
        db_session.commit()
        return jsonify({"targets": new_targets}), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>/complete', methods=['PATCH'])
@goals_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
def update_goal_completion_endpoint(goal_id: str, root_id=None):
    """Update goal completion status."""
    from datetime import datetime
    
    data = request.get_json(silent=True) or {}
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        goal = get_goal_by_id(db_session, goal_id)
        if goal:
            if 'completed' in data:
                goal.completed = data['completed']
            else:
                goal.completed = not goal.completed
            
            # Set or clear completed_at based on completion status
            if goal.completed:
                goal.completed_at = datetime.now(timezone.utc)
            else:
                goal.completed_at = None
                
            db_session.commit()
            db_session.refresh(goal)
            result = build_goal_tree(db_session, goal)
            return jsonify(result)
        
        return jsonify({"error": "Goal not found"}), 404
        
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


# ============================================================================
# FRACTAL-SCOPED ROUTES
# ============================================================================

@goals_bp.route('/fractals', methods=['GET'])
def get_all_fractals():
    """Get all fractals (root goals) for the selection page."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        roots = get_all_root_goals(db_session)
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
            
            result.append({
                "id": root.id,
                "name": root.name,
                "description": root.description,
                "type": root.type,
                "created_at": root.created_at.isoformat() if root.created_at else None,
                "updated_at": last_activity.isoformat() if last_activity else None
            })
        
        return jsonify(result)
    finally:
        db_session.close()


@goals_bp.route('/fractals', methods=['POST'])
@validate_request(FractalCreateSchema)
def create_fractal(validated_data):
    """Create a new fractal (root goal)."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Create root goal (type already validated by schema)
        new_fractal = Goal(
            type=validated_data.get('type', 'UltimateGoal'),
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            parent_id=None  # Root goal has no parent
        )
        
        db_session.add(new_fractal)
        db_session.commit()
        db_session.refresh(new_fractal)
        
        return jsonify(new_fractal.to_dict(include_children=False)), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error creating fractal")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/fractals/<root_id>', methods=['DELETE'])
def delete_fractal(root_id):
    """Delete an entire fractal and all its data."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
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
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals', methods=['GET'])
def get_fractal_goals(root_id):
    """Get the complete goal tree for a specific fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Build complete tree for this fractal
        result = build_goal_tree(db_session, root)
        return jsonify(result)
        
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/selection', methods=['GET'])
def get_active_goals_for_selection(root_id):
    """
    Get active ShortTermGoals and their active ImmediateGoals for session creation.
    Excludes completed goals.
    """
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Query ShortTermGoals directly using root_id index
        # Filter for active (not completed) goals only
        st_goals = db_session.query(Goal).filter(
            Goal.root_id == root_id,
            Goal.type == 'ShortTermGoal',
            Goal.completed == False,
            Goal.deleted_at == None
        ).all()
        
        result = []
        for stg in st_goals:
            # Manually find active children to avoid loading entire tree or deleted items
            active_children = [
                child.to_dict(include_children=False) 
                for child in stg.children 
                if child.type == 'ImmediateGoal' and not child.completed and not child.deleted_at
            ]
            
            stg_dict = {
                "id": stg.id,
                "name": stg.name,
                "description": stg.description,
                "deadline": stg.deadline.isoformat() if stg.deadline else None,
                "completed": stg.completed,
                "immediateGoals": active_children
            }
            result.append(stg_dict)
            
        return jsonify(result)
        
    except Exception as e:
        logger.exception("Error fetching selection goals")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals', methods=['POST'])
@validate_request(GoalCreateSchema)
def create_fractal_goal(root_id, validated_data):
    """Create a new goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Parse deadline if provided (already validated by schema)
        deadline = None
        if validated_data.get('deadline'):
            deadline = parse_date_string(validated_data['deadline'])
        
        # Create new goal (type already validated by schema)
        new_goal = Goal(
            id=str(uuid.uuid4()),
            name=validated_data['name'],  # Already sanitized
            description=validated_data.get('description', ''),
            type=validated_data['type'],
            parent_id=validated_data.get('parent_id'),
            deadline=deadline,
            completed=False,
            completed_via_children=validated_data.get('completed_via_children', False),
            allow_manual_completion=validated_data.get('allow_manual_completion', True),
            track_activities=validated_data.get('track_activities', True),
            root_id=root_id  # Set root_id for performance
        )
        
        # Handle targets if provided
        if validated_data.get('targets'):
            new_goal.targets = json.dumps(validated_data['targets'])
        
        db_session.add(new_goal)
        db_session.commit()
        
        # Return the created goal
        return jsonify(new_goal.to_dict(include_children=False)), 201
        
    except Exception as e:
        db_session.rollback()
        logger.exception("Error creating fractal goal")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['GET'])
def get_fractal_goal(root_id, goal_id):
    """Get a specific goal by ID within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the goal
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Return goal data
        result = build_goal_tree(db_session, goal)
        return jsonify(result)
        
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
def delete_fractal_goal(root_id, goal_id):
    """Delete a goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Find the goal
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Delete the goal (cascade will handle children)
        db_session.delete(goal)
        db_session.commit()
        
        return jsonify({"status": "success", "message": "Goal deleted"}), 200
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['PUT'])
def update_fractal_goal(root_id, goal_id):
    """Update a goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Find the goal
        goal = get_goal_by_id(db_session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            goal.name = data['name']
        if 'description' in data:
            goal.description = data['description']
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
            goal.targets = json.dumps(data['targets']) if data['targets'] else None
            
        if 'parent_id' in data:
            # Allow reparenting (e.g. moving ImmediateGoal between ShortTermGoals)
            goal.parent_id = data['parent_id']
        
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
        
        return jsonify(goal.to_dict(include_children=False)), 200
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/<root_id>/goals/analytics', methods=['GET'])
def get_goal_analytics(root_id):
    """
    Get goal analytics data for the fractal.
    
    Returns:
    - High-level statistics (completed count, avg age, avg time to completion, avg duration)
    - Per-goal analytics with session associations
    """
    from sqlalchemy import func, and_
    from models import session_goals, ActivityInstance
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get all goals for this fractal (excluding the root itself)
        all_goals = db_session.query(Goal).filter(
            Goal.root_id == root_id,
            Goal.deleted_at == None
        ).all()
        
        # Calculate high-level statistics
        now = datetime.now(timezone.utc)
        
        # Goals completed
        completed_goals = [g for g in all_goals if g.completed]
        total_completed = len(completed_goals)
        
        # Average goal age (days since creation for all goals)
        goal_ages = []
        for g in all_goals:
            if g.created_at:
                age_days = (now - g.created_at.replace(tzinfo=timezone.utc) if g.created_at.tzinfo is None else now - g.created_at).days
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
        
        # Get all sessions for this fractal
        all_sessions = db_session.query(Session).filter(
            Session.root_id == root_id,
            Session.deleted_at == None
        ).all()
        
        # Build goal -> sessions mapping
        goal_session_map = {}  # goal_id -> list of session data
        for session in all_sessions:
            session_duration = session.total_duration_seconds or 0
            if session_duration == 0 and session.session_start and session.session_end:
                start = session.session_start.replace(tzinfo=timezone.utc) if session.session_start.tzinfo is None else session.session_start
                end = session.session_end.replace(tzinfo=timezone.utc) if session.session_end.tzinfo is None else session.session_end
                session_duration = (end - start).total_seconds()
            
            # Get associated goals via relationship
            for goal in session.goals:
                if goal.id not in goal_session_map:
                    goal_session_map[goal.id] = []
                goal_session_map[goal.id].append({
                    'session_id': session.id,
                    'session_name': session.name,
                    'duration_seconds': session_duration,
                    'completed': session.completed,
                    'session_start': session.session_start.isoformat() if session.session_start else None
                })
        
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
            
            # Get activity breakdowns for this goal's sessions
            activity_breakdown = {}
            session_ids = [s['session_id'] for s in sessions_for_goal]
            
            if session_ids:
                # Get all activity instances for these sessions
                activity_instances = db_session.query(ActivityInstance).filter(
                    ActivityInstance.session_id.in_(session_ids),
                    ActivityInstance.deleted_at == None
                ).all()
                
                for ai in activity_instances:
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
            
            goals_data.append({
                'id': goal.id,
                'name': goal.name,
                'type': goal.type,
                'description': goal.description,
                'completed': goal.completed,
                'completed_at': goal.completed_at.isoformat() if goal.completed_at else None,
                'created_at': goal.created_at.isoformat() if goal.created_at else None,
                'deadline': goal.deadline.isoformat() if goal.deadline else None,
                'parent_id': goal.parent_id,
                'age_days': goal_age_days,
                'total_duration_seconds': total_duration,
                'session_count': session_count,
                'activity_breakdown': list(activity_breakdown.values()),
                'session_durations_by_date': session_durations_by_date
            })
        
        return jsonify({
            'summary': {
                'total_goals': len(all_goals),
                'completed_goals': total_completed,
                'completion_rate': (total_completed / len(all_goals) * 100) if all_goals else 0,
                'avg_goal_age_days': round(avg_goal_age, 1),
                'avg_time_to_completion_days': round(avg_time_to_completion, 1),
                'avg_duration_to_completion_seconds': round(avg_duration_to_completion, 0)
            },
            'goals': goals_data
        })
        
    except Exception as e:
        logger.exception("Error fetching goal analytics")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
