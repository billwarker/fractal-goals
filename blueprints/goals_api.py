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
def create_goal():
    """Create a new goal."""
    data = request.get_json()
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        parent = None
        parent_id = data.get('parent_id')
        
        if parent_id:
            logger.debug(f"Looking for parent with ID: {parent_id}")
            parent = get_goal_by_id(db_session, parent_id)
            if not parent:
                return jsonify({"error": f"Parent not found: {parent_id}"}), 404
        
        # Validate goal type
        valid_types = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
                       'ImmediateGoal', 'MicroGoal', 'NanoGoal']
        goal_type = data.get('type')
        if goal_type not in valid_types:
            return jsonify({"error": f"Invalid goal type: {goal_type}"}), 400
        
        # Parse deadline if provided
        deadline = None
        if data.get('deadline'):
            try:
                d_str = data['deadline']
                if 'T' in d_str: d_str = d_str.split('T')[0]
                deadline = datetime.strptime(d_str, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid deadline format. Use YYYY-MM-DD"}), 400
        
        # Create the goal
        new_goal = Goal(
            type=goal_type,
            name=data.get('name'),
            description=data.get('description', ''),
            deadline=deadline,
            completed=data.get('completed', False),
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
        if 'targets' in data and data['targets']:
            new_goal.targets = json.dumps(data['targets'])
        
        db_session.add(new_goal)
        db_session.commit()
        db_session.refresh(new_goal)
        
        logger.debug(f"Created goal {new_goal.id}")
        
        # Return the goal with its tree
        result = build_goal_tree(db_session, new_goal)
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
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
def create_fractal():
    """Create a new fractal (root goal)."""
    data = request.get_json()
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate allowed types for root goals
        goal_type = data.get('type', 'UltimateGoal')
        valid_root_types = ['UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal']
        
        if goal_type not in valid_root_types:
             return jsonify({"error": f"Invalid root goal type. Must be one of: {', '.join(valid_root_types)}"}), 400

        # Create root goal (UltimateGoal with no parent)
        new_fractal = Goal(
            type=goal_type,
            name=data.get('name'),
            description=data.get('description', ''),
            parent_id=None  # Root goal has no parent
        )
        
        db_session.add(new_fractal)
        db_session.commit()
        db_session.refresh(new_fractal)
        
        return jsonify(new_fractal.to_dict(include_children=False)), 201
        
    except Exception as e:
        db_session.rollback()
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
def create_fractal_goal(root_id):
    """Create a new goal within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Goal name is required"}), 400
        
        if not data.get('type'):
            return jsonify({"error": "Goal type is required"}), 400
        
        # Parse deadline if provided
        deadline = None
        if data.get('deadline'):
            try:
                d_str = data['deadline']
                if 'T' in d_str:
                    d_str = d_str.split('T')[0]
                deadline = datetime.strptime(d_str, '%Y-%m-%d').date()
            except ValueError:
                return jsonify({"error": "Invalid deadline format. Use YYYY-MM-DD"}), 400
        
        # Create new goal
        new_goal = Goal(
            id=str(uuid.uuid4()),
            name=data['name'],
            description=data.get('description', ''),
            type=data['type'],
            parent_id=data.get('parent_id'),
            deadline=deadline,
            completed=False,
            root_id=root_id  # Set root_id for performance
        )
        
        # Handle targets if provided
        if 'targets' in data and data['targets']:
            new_goal.targets = json.dumps(data['targets'])
        
        db_session.add(new_goal)
        db_session.commit()
        
        # Return the created goal
        return jsonify(new_goal.to_dict(include_children=False)), 201
        
    except Exception as e:
        db_session.rollback()
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
                goal.deadline = datetime.strptime(data['deadline'], '%Y-%m-%d').date()
            else:
                goal.deadline = None
        if 'targets' in data:
            goal.targets = json.dumps(data['targets']) if data['targets'] else None
            
        if 'parent_id' in data:
            # Allow reparenting (e.g. moving ImmediateGoal between ShortTermGoals)
            goal.parent_id = data['parent_id']
        
        db_session.commit()
        
        return jsonify(goal.to_dict(include_children=False)), 200
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
