from flask import Blueprint, request, jsonify
from datetime import datetime
import json
import uuid
import models
from models import (
    get_session,
    Goal, PracticeSession,
    get_all_root_goals, get_goal_by_id, get_practice_session_by_id,
    get_immediate_goals_for_session,
    build_goal_tree, build_practice_session_tree,
    validate_root_goal
)

# Create blueprint
goals_bp = Blueprint('goals', __name__, url_prefix='/api')

# Global engine removed to ensure tests use patched get_engine()
# engine = get_engine()

# ============================================================================
# GLOBAL GOAL ENDPOINTS
# ============================================================================

@goals_bp.route('/goals', methods=['GET'])
def get_goals():
    """Get all root goals with their complete trees."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        roots = get_all_root_goals(session)
        # Build complete trees for each root
        result = [build_goal_tree(session, root) for root in roots]
        return jsonify(result)
    finally:
        session.close()


@goals_bp.route('/goals', methods=['POST'])
def create_goal():
    """Create a new goal."""
    data = request.get_json()
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        parent = None
        parent_id = data.get('parent_id')
        
        if parent_id:
            print(f"DEBUG: Looking for parent with ID: {parent_id}")
            # Check if parent is a goal
            parent = get_goal_by_id(session, parent_id)
            if not parent:
                # Check if parent is a practice session (for ImmediateGoals)
                parent_ps = get_practice_session_by_id(session, parent_id)
                if not parent_ps:
                    return jsonify({"error": f"Parent not found: {parent_id}"}), 404
                # For practice sessions, we just use the ID
                parent = None  # We'll set parent_id directly
        
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
            parent_id=parent_id  # Can be goal ID or practice session ID
        )
        
        session.add(new_goal)
        session.commit()
        session.refresh(new_goal)
        
        print(f"DEBUG: Created goal {new_goal.id}")
        
        # Return the goal with its tree
        result = build_goal_tree(session, new_goal)
        return jsonify(result), 201
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/goals/practice-session', methods=['POST'])
def create_practice_session():
    """Create a new practice session with multiple parent goals and immediate goals."""
    data = request.get_json()
    
    print(f"DEBUG: Creating practice session with {len(data.get('parent_ids', []))} parents")
    
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        parent_ids = data.get('parent_ids', [])
        immediate_goals = data.get('immediate_goals', [])
        
        # Validation
        if not parent_ids or len(parent_ids) == 0:
            return jsonify({"error": "At least one parent short-term goal required"}), 400
        
        # Find all parent goals and identify root
        parent_goals = []
        detected_root_id = None

        for parent_id in parent_ids:
            parent_goal = get_goal_by_id(db_session, parent_id)
            if not parent_goal:
                return jsonify({"error": f"Parent goal {parent_id} not found"}), 404
            if parent_goal.type != 'ShortTermGoal':
                return jsonify({"error": f"Parent {parent_id} must be a ShortTermGoal"}), 400
            
            # Find fractal root for this parent
            current = parent_goal
            depth = 0
            while current.parent_id and depth < 20:  # Max depth safety
                # Explicitly fetch parent by ID to ensure we get a scalar object
                parent = get_goal_by_id(db_session, current.parent_id)
                
                if parent:
                    current = parent
                else:
                    break  # Reached top or broken link
                depth += 1
            
            if detected_root_id and detected_root_id != current.id:
                return jsonify({"error": "All parent goals must belong to the same fractal tree"}), 400
            detected_root_id = current.id

            parent_goals.append(parent_goal)
        
        # Generate name based on index relative to this fractal root
        session_count = db_session.query(PracticeSession).filter_by(root_id=detected_root_id).count()
        session_index = session_count + 1
        date_str = datetime.now().strftime("%m/%d/%Y")
        generated_name = f"Practice Session {session_index} - {date_str}"

        # Create practice session
        # Use first parent as primary
        primary_parent_id = parent_goals[0].id if parent_goals else None
        
        practice_session = PracticeSession(
            name=generated_name,
            description=data.get('description', ''),
            completed=False,
            root_id=detected_root_id,
            parent_id=primary_parent_id
        )
        
        # Add parent relationships (Legacy: only one parent supported now)
        # practice_session.parent_goals = parent_goals
        
        db_session.add(practice_session)
        db_session.commit()
        db_session.refresh(practice_session)
        
        # Create immediate goals
        for ig_data in immediate_goals:
            if ig_data.get("name") and ig_data["name"].strip():
                immediate_goal = Goal(
                    type="ImmediateGoal",
                    name=ig_data["name"],
                    description=ig_data.get("description", ""),
                    parent_id=practice_session.id
                )
                db_session.add(immediate_goal)
        
        db_session.commit()
        
        # Return the practice session with its tree
        result = build_practice_session_tree(db_session, practice_session)
        return jsonify({"success": True, "practice_session": result}), 201
        
    except Exception as e:
        db_session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@goals_bp.route('/goals/<goal_id>', methods=['DELETE'])
def delete_goal_endpoint(goal_id: str):
    """Delete a goal or practice session and all its children."""
    print(f"DEBUG: Attempting to delete goal/session with ID: {goal_id}")
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        # Try to find as a goal first
        goal = get_goal_by_id(session, goal_id)
        if goal:
            # Check if it's a root goal
            is_root = goal.parent_id is None
            session.delete(goal)
            session.commit()
            print(f"DEBUG: Deleted {'root ' if is_root else ''}goal {goal_id}")
            return jsonify({"status": "success", "message": f"{'Root g' if is_root else 'G'}oal deleted"})
        
        # Try to find as a practice session
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            # Delete immediate goals first
            immediate_goals = get_immediate_goals_for_session(session, goal_id)
            for ig in immediate_goals:
                session.delete(ig)
            # Delete practice session
            session.delete(ps)
            session.commit()
            print(f"DEBUG: Deleted practice session {goal_id}")
            return jsonify({"status": "success", "message": "Practice session deleted"})
        
        # Not found
        print(f"DEBUG: Goal/session {goal_id} not found")
        return jsonify({"error": "Goal or practice session not found"}), 404
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()



@goals_bp.route('/goals/<goal_id>', methods=['GET'])
def get_goal_endpoint(goal_id: str):
    """Get a goal or practice session by ID."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        goal = get_goal_by_id(session, goal_id)
        if goal:
            return jsonify(goal.to_dict(include_children=False))
        
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            return jsonify(ps.to_dict(include_children=False))
            
        return jsonify({"error": "Goal not found"}), 404
    finally:
        session.close()


@goals_bp.route('/goals/<goal_id>', methods=['PUT'])
def update_goal_endpoint(goal_id: str):
    """Update goal or practice session details."""
    data = request.get_json()
    
    engine = models.get_engine()
    session = get_session(engine)
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
        
        # Try finding as Goal
        goal = get_goal_by_id(session, goal_id)
        if goal:
            if 'name' in data and data['name'] is not None:
                goal.name = data['name']
            if 'description' in data and data['description'] is not None:
                goal.description = data['description']
            if 'deadline' in data:
                goal.deadline = deadline
            if 'targets' in data:
                # Store targets as JSON string
                print(f"DEBUG: Received targets data: {data['targets']}")
                goal.targets = json.dumps(data['targets']) if data['targets'] else None
                print(f"DEBUG: Stored targets in goal: {goal.targets}")
            session.commit()
            print(f"DEBUG: Committed changes. Goal targets after commit: {goal.targets}")
            return jsonify(goal.to_dict(include_children=False))
        
        # Try finding as PracticeSession
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            if 'name' in data and data['name'] is not None:
                ps.name = data['name']
            if 'description' in data and data['description'] is not None:
                ps.description = data['description']
            # PracticeSession has no deadline
            session.commit()
            return jsonify(ps.to_dict(include_children=False))
        
        return jsonify({"error": "Goal or session not found"}), 404
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()



@goals_bp.route('/goals/<goal_id>/targets', methods=['POST'])
def add_goal_target(goal_id):
    """Add a target to a goal."""
    data = request.get_json()
    engine = models.get_engine()
    session = get_session(engine)
    try:
        goal = get_goal_by_id(session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        current_targets = json.loads(goal.targets) if goal.targets else []
        if 'id' not in data:
            data['id'] = str(uuid.uuid4())
            
        current_targets.append(data)
        goal.targets = json.dumps(current_targets)
        session.commit()
        
        return jsonify({"targets": current_targets, "id": data['id']}), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@goals_bp.route('/goals/<goal_id>/targets/<target_id>', methods=['DELETE'])
def remove_goal_target(goal_id, target_id):
    """Remove a target from a goal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        goal = get_goal_by_id(session, goal_id)
        if not goal: return jsonify({"error": "Goal not found"}), 404
        
        current_targets = json.loads(goal.targets) if goal.targets else []
        new_targets = [t for t in current_targets if t.get('id') != target_id]
        
        if len(new_targets) == len(current_targets):
             return jsonify({"error": "Target not found"}), 404
             
        goal.targets = json.dumps(new_targets)
        session.commit()
        return jsonify({"targets": new_targets}), 200
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/goals/<goal_id>/complete', methods=['PATCH'])
@goals_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
def update_goal_completion_endpoint(goal_id: str, root_id=None):
    """Update goal or practice session completion status."""
    data = request.get_json(silent=True) or {}
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        # Try to find as a goal
        goal = get_goal_by_id(session, goal_id)
        if goal:
            if 'completed' in data:
                goal.completed = data['completed']
            else:
                goal.completed = not goal.completed
                
            session.commit()
            session.refresh(goal)
            result = build_goal_tree(session, goal)
            return jsonify(result)
        
        # Try to find as a practice session
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            if 'completed' in data:
                ps.completed = data['completed']
            else:
                ps.completed = not ps.completed
                
            session.commit()
            session.refresh(ps)
            result = build_practice_session_tree(session, ps)
            return jsonify(result)
        
        return jsonify({"error": "Goal or practice session not found"}), 404
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


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
            # This includes the root and all descendant goals
            max_updated = root.updated_at
            
            # Recursively check all descendants
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
    session = get_session(engine)
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
        
        session.add(new_fractal)
        session.commit()
        session.refresh(new_fractal)
        
        return jsonify(new_fractal.to_dict(include_children=False)), 201
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/fractals/<root_id>', methods=['DELETE'])
def delete_fractal(root_id):
    """Delete an entire fractal and all its data."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Delete the root (cascade will handle all children)
        session.delete(root)
        session.commit()
        
        return jsonify({"status": "success", "message": "Fractal deleted"})
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/<root_id>/goals', methods=['GET'])
def get_fractal_goals(root_id):
    """Get the complete goal tree for a specific fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Build complete tree for this fractal
        result = build_goal_tree(session, root)
        return jsonify(result)
        
    finally:
        session.close()


@goals_bp.route('/<root_id>/goals', methods=['POST'])
def create_fractal_goal(root_id):
    """Create a new goal within a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Goal name is required"}), 400
        
        if not data.get('type'):
            return jsonify({"error": "Goal type is required"}), 400
        
        # Create new goal
        new_goal = Goal(
            id=str(uuid.uuid4()),
            name=data['name'],
            description=data.get('description', ''),
            type=data['type'],
            parent_id=data.get('parent_id'),
            deadline=data.get('deadline'),
            completed=False
        )
        
        session.add(new_goal)
        session.commit()
        
        # Return the created goal
        return jsonify(new_goal.to_dict(include_children=False)), 201
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['GET'])
def get_fractal_goal(root_id, goal_id):
    """Get a specific goal by ID within a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the goal
        goal = session.query(Goal).filter_by(id=goal_id).first()
        
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        
        # Return goal data
        result = build_goal_tree(session, goal)
        return jsonify(result)
        
    finally:
        session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
def delete_fractal_goal(root_id, goal_id):
    """Delete a goal within a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Find the goal
        goal = get_goal_by_id(session, goal_id)
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Delete the goal (cascade will handle children)
        session.delete(goal)
        session.commit()
        
        return jsonify({"status": "success", "message": "Goal deleted"}), 200
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@goals_bp.route('/<root_id>/goals/<goal_id>', methods=['PUT'])
def update_fractal_goal(root_id, goal_id):
    """Update a goal within a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Find the goal
        goal = get_goal_by_id(session, goal_id)
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
            # Store targets as JSON string
            goal.targets = json.dumps(data['targets']) if data['targets'] else None
        
        session.commit()
        
        return jsonify(goal.to_dict(include_children=False)), 200
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()
