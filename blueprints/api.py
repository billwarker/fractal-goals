"""
Flask API Blueprint - Migrated from FastAPI server.py
Provides RESTful API endpoints for goals and practice sessions.
"""

from flask import Blueprint, request, jsonify
from typing import List, Optional
from datetime import date, datetime

from models import (
    get_engine, get_session, init_db,
    Goal, PracticeSession, SessionTemplate,
    get_all_root_goals, get_goal_by_id, get_practice_session_by_id,
    get_all_practice_sessions, get_immediate_goals_for_session,
    build_goal_tree, build_practice_session_tree,
    delete_goal_recursive, delete_practice_session,
    validate_root_goal, get_root_id_for_goal,
    ActivityDefinition, MetricDefinition, ActivityInstance, MetricValue
)

# Create blueprint
api_bp = Blueprint('api', __name__, url_prefix='/api')

# Initialize database
engine = get_engine('sqlite:///goals.db')
init_db(engine)


@api_bp.route('/goals', methods=['GET'])
def get_goals():
    """Get all root goals with their complete trees."""
    session = get_session(engine)
    try:
        roots = get_all_root_goals(session)
        # Build complete trees for each root
        result = [build_goal_tree(session, root) for root in roots]
        return jsonify(result)
    finally:
        session.close()


@api_bp.route('/goals', methods=['POST'])
def create_goal():
    """Create a new goal."""
    data = request.get_json()
    
    print(f"DEBUG: Creating goal of type {data.get('type')}, parent_id: {data.get('parent_id')}")
    
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
                deadline = datetime.strptime(data['deadline'], '%Y-%m-%d').date()
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


@api_bp.route('/goals/practice-session', methods=['POST'])
def create_practice_session():
    """Create a new practice session with multiple parent goals and immediate goals."""
    data = request.get_json()
    
    print(f"DEBUG: Creating practice session with {len(data.get('parent_ids', []))} parents")
    
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
        practice_session = PracticeSession(
            name=generated_name,
            description=data.get('description', ''),
            completed=False,
            root_id=detected_root_id
        )
        
        # Add parent relationships
        practice_session.parent_goals = parent_goals
        
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

def sync_session_activities(db_session, practice_session, session_data_dict):
    """
    Parses session_data JSON to find activity instances and syncs them to the relational DB.
     This allows for analytics querying later.
    """
    if not session_data_dict:
        return

    # Extract all activity items from the session structure
    # Structure: { sections: [ { items/exercises: [ { type: 'activity', ... } ] } ] }
    
    found_instances = []
    
    sections = session_data_dict.get('sections', [])
    for section in sections:
        items = section.get('exercises', []) # Currently called 'exercises' in frontend, maybe mixed
        # items might include old-style exercises AND new activities.
        # We look for explicit type='activity' or presence of 'activity_id'
        
        for item in items:
            # Check if this is a trackable activity
            activity_def_id = item.get('activity_id')
            if activity_def_id:
                # Check for Sets
                sets = item.get('sets', [])
                instances_to_process = []

                if sets:
                    # Treat each set as an instance
                    for s in sets:
                         if s.get('instance_id'):
                             instances_to_process.append(s)
                else:
                    # Treat the item itself as the instance (legacy or single instance)
                    if item.get('instance_id'):
                        instances_to_process.append(item)

                for inst_data in instances_to_process:
                    instance_id = inst_data.get('instance_id')
                    
                    # Update or Create Instance
                    instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
                    if not instance:
                        instance = ActivityInstance(
                            id=instance_id,
                            practice_session_id=practice_session.id,
                            activity_definition_id=activity_def_id,
                            created_at=practice_session.created_at # Approximate timestamp
                        )
                        db_session.add(instance)
                    
                    found_instances.append(instance_id)

                    # Update Metrics
                    # metrics = [ { 'metric_id': '...', 'value': 100 }, ... ]
                    for m_data in inst_data.get('metrics', []):
                        m_def_id = m_data.get('metric_id')
                        m_val = m_data.get('value')
                        
                        # Only save if we have a value.
                        if m_def_id and m_val is not None and str(m_val).strip() != '':
                                # Check if value is float convertible
                                try:
                                    float_val = float(m_val)
                                    # Find existing value record
                                    metric_val_rec = db_session.query(MetricValue).filter_by(
                                        activity_instance_id=instance_id,
                                        metric_definition_id=m_def_id
                                    ).first()
                                    
                                    if metric_val_rec:
                                        metric_val_rec.value = float_val
                                    else:
                                        new_mv = MetricValue(
                                            activity_instance_id=instance_id,
                                            metric_definition_id=m_def_id,
                                            value=float_val
                                        )
                                        db_session.add(new_mv)
                                except ValueError:
                                    pass # Ignore non-numeric values
    
    # Optional: Delete instances that are no longer in the session_data?
    # This is risky if we have partial updates (PATCH). 
    # But currently we overwrite session_data on PUT/POST fully.
    # So yes, we should clean up orphans for this session.
    # Get all current instances for this session
    existing_for_session = db_session.query(ActivityInstance).filter_by(practice_session_id=practice_session.id).all()
    for ex_inst in existing_for_session:
        if ex_inst.id not in found_instances:
            db_session.delete(ex_inst)
            



@api_bp.route('/practice-sessions', methods=['GET'])
def get_all_practice_sessions_endpoint():
    """Get all practice sessions for grid view."""
    session = get_session(engine)
    try:
        practice_sessions = get_all_practice_sessions(session)
        # Build trees for each session
        result = [build_practice_session_tree(session, ps) for ps in practice_sessions]
        return jsonify(result)
    finally:
        session.close()


@api_bp.route('/goals/<goal_id>', methods=['DELETE'])
def delete_goal_endpoint(goal_id: str):
    """Delete a goal or practice session and all its children."""
    print(f"DEBUG: Attempting to delete goal/session with ID: {goal_id}")
    
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


@api_bp.route('/goals/<goal_id>', methods=['PUT'])
def update_goal_endpoint(goal_id: str):
    """Update goal or practice session details."""
    data = request.get_json()
    
    session = get_session(engine)
    try:
        # Parse deadline if provided
        deadline = None
        if 'deadline' in data and data['deadline']:
            try:
                deadline = datetime.strptime(data['deadline'], '%Y-%m-%d').date()
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
                import json
                print(f"DEBUG: Received targets data: {data['targets']}")
                goal.targets = json.dumps(data['targets']) if data['targets'] else None
                print(f"DEBUG: Stored targets in goal: {goal.targets}")
            session.commit()
            print(f"DEBUG: Committed changes. Goal targets after commit: {goal.targets}")
            return jsonify({"status": "success", "message": "Goal updated"})
        
        # Try finding as PracticeSession
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            if 'name' in data and data['name'] is not None:
                ps.name = data['name']
            if 'description' in data and data['description'] is not None:
                ps.description = data['description']
            # PracticeSession has no deadline
            session.commit()
            return jsonify({"status": "success", "message": "Practice Session updated"})
        
        return jsonify({"error": "Goal or session not found"}), 404
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/goals/<goal_id>/complete', methods=['PATCH'])
@api_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
def update_goal_completion_endpoint(goal_id: str, root_id=None):
    """Update goal or practice session completion status."""
    data = request.get_json()
    completed = data.get('completed', False)
    
    print(f"DEBUG: Updating completion status for {goal_id} to {completed}")
    
    session = get_session(engine)
    try:
        # Try to find as a goal
        goal = get_goal_by_id(session, goal_id)
        if goal:
            goal.completed = completed
            session.commit()
            session.refresh(goal)
            result = build_goal_tree(session, goal)
            return jsonify({"status": "success", "goal": result})
        
        # Try to find as a practice session
        ps = get_practice_session_by_id(session, goal_id)
        if ps:
            ps.completed = completed
            session.commit()
            session.refresh(ps)
            result = build_practice_session_tree(session, ps)
            return jsonify({"status": "success", "goal": result})
        
        return jsonify({"error": "Goal or practice session not found"}), 404
        
    except Exception as e:
        session.rollback()
        print(f"ERROR: {str(e)}")
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


# ============================================================================
# FRACTAL-SCOPED ROUTES
# New architecture: All data scoped to a specific fractal (root goal)
# ============================================================================



@api_bp.route('/fractals', methods=['GET'])
def get_all_fractals():
    """Get all fractals (root goals) for the selection page."""
    session = get_session(engine)
    try:
        roots = get_all_root_goals(session)
        # Return simplified list for selection page
        result = [{
            "id": root.id,
            "name": root.name,
            "description": root.description,
            "created_at": root.created_at.isoformat() if root.created_at else None
        } for root in roots]
        return jsonify(result)
    finally:
        session.close()


@api_bp.route('/fractals', methods=['POST'])
def create_fractal():
    """Create a new fractal (root goal)."""
    data = request.get_json()
    
    session = get_session(engine)
    try:
        # Create root goal (UltimateGoal with no parent)
        new_fractal = Goal(
            type='UltimateGoal',
            name=data.get('name'),
            description=data.get('description', ''),
            parent_id=None  # Root goal has no parent
        )
        
        session.add(new_fractal)
        session.commit()
        session.refresh(new_fractal)
        
        return jsonify({
            "id": new_fractal.id,
            "name": new_fractal.name,
            "description": new_fractal.description
        }), 201
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/fractals/<root_id>', methods=['DELETE'])
def delete_fractal(root_id):
    """Delete an entire fractal and all its data."""
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


@api_bp.route('/<root_id>/goals', methods=['GET'])
def get_fractal_goals(root_id):
    """Get the complete goal tree for a specific fractal."""
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


@api_bp.route('/<root_id>/sessions', methods=['GET'])
def get_fractal_sessions(root_id):
    """Get all practice sessions for a specific fractal."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get sessions filtered by root_id, sorted by date (newest first)
        sessions = session.query(PracticeSession).filter_by(root_id=root_id).order_by(PracticeSession.created_at.desc()).all()
        result = [build_practice_session_tree(session, ps) for ps in sessions]
        return jsonify(result)
        
    finally:
        session.close()


@api_bp.route('/<root_id>/sessions', methods=['POST'])
def create_fractal_session(root_id):
    """Create a new practice session within a fractal."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get request data
        data = request.get_json()
        
        # Create the practice session
        new_session = PracticeSession(
            name=data.get('name', 'Untitled Session'),
            description=data.get('description', ''),
            root_id=root_id,
            duration_minutes=data.get('duration_minutes'),
            session_data=data.get('session_data')  # Already a JSON string
        )
        
        db_session.add(new_session)
        db_session.flush()  # Get the ID before committing
        
        # Associate with parent goals if provided
        parent_ids = data.get('parent_ids', [])
        if parent_ids:
            for goal_id in parent_ids:
                # Verify the goal exists and is a ShortTermGoal
                goal = db_session.query(Goal).filter_by(id=goal_id).first()
                if goal and goal.type == 'ShortTermGoal':
                    new_session.parent_goals.append(goal)
        
        db_session.commit()
        
        # Sync activities to relational DB
        if new_session.session_data:
             import json
             try:
                 data_dict = json.loads(new_session.session_data)
                 sync_session_activities(db_session, new_session, data_dict)
                 db_session.commit() # Commit changes from sync
             except Exception as e:
                 print(f"Warning: Failed to sync activities: {e}")

        # Sync activities to relational DB
        if new_session.session_data:
             import json
             try:
                 data_dict = json.loads(new_session.session_data)
                 sync_session_activities(db_session, new_session, data_dict)
                 db_session.commit() # Commit changes from sync
             except Exception as e:
                 print(f"Warning: Failed to sync activities: {e}")

        # Return the created session
        result = build_practice_session_tree(db_session, new_session)
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@api_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
def update_practice_session(root_id, session_id):
    """Update a practice session's details."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the practice session
        practice_session = db_session.query(PracticeSession).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not practice_session:
            return jsonify({"error": "Practice session not found"}), 404
        
        # Get update data from request
        data = request.get_json()
        
        # Update fields if provided
        if 'name' in data:
            practice_session.name = data['name']
        
        if 'description' in data:
            practice_session.description = data['description']
        
        if 'duration_minutes' in data:
            practice_session.duration_minutes = data['duration_minutes']
        
        if 'completed' in data:
            practice_session.completed = data['completed']
        
        if 'session_data' in data:
            # session_data should be a JSON string
            import json
            if isinstance(data['session_data'], str):
                practice_session.session_data = data['session_data']
            else:
                practice_session.session_data = json.dumps(data['session_data'])

            # Sync activities
            try:
                # If string, parse it first
                if isinstance(data['session_data'], str):
                     s_data = json.loads(data['session_data'])
                else:
                     s_data = data['session_data']
                
                sync_session_activities(db_session, practice_session, s_data)
                
                # Check if any targets are met and auto-complete goals
                check_and_complete_goals(db_session, practice_session)
            except Exception as e:
                print(f"Warning: Failed to sync activities in update: {e}")
        
        db_session.commit()
        
        # Return updated session
        result = build_practice_session_tree(db_session, practice_session)
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()



@api_bp.route('/<root_id>/sessions/<session_id>', methods=['DELETE'])
def delete_practice_session(root_id, session_id):
    """Delete a practice session."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the practice session
        practice_session = db_session.query(PracticeSession).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not practice_session:
            return jsonify({"error": "Practice session not found"}), 404
            
        db_session.delete(practice_session)
        db_session.commit()
        
        return jsonify({"message": "Practice session deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
# ============================================================================
# SESSION TEMPLATE ENDPOINTS (Fractal-Scoped)
# ============================================================================

@api_bp.route('/<root_id>/session-templates', methods=['GET'])
def get_session_templates(root_id):
    """Get all session templates for a fractal."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        templates = session.query(SessionTemplate).filter_by(root_id=root_id).all()
        result = [template.to_dict() for template in templates]
        return jsonify(result)
        
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['GET'])
def get_session_template(root_id, template_id):
    """Get a specific session template."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        return jsonify(template.to_dict())
        
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates', methods=['POST'])
def create_session_template(root_id):
    """Create a new session template."""
    import json
    import uuid
    
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        
        # Validate required fields
        if not data.get('name'):
            return jsonify({"error": "Template name is required"}), 400
        
        if not data.get('template_data'):
            return jsonify({"error": "Template data is required"}), 400
        
        # Create new template
        new_template = SessionTemplate(
            id=str(uuid.uuid4()),
            name=data['name'],
            description=data.get('description', ''),
            root_id=root_id,
            template_data=json.dumps(data['template_data'])
        )
        
        session.add(new_template)
        session.commit()
        
        return jsonify(new_template.to_dict()), 201
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['PUT'])
def update_session_template(root_id, template_id):
    """Update a session template."""
    import json
    
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        data = request.get_json()
        
        # Update fields
        if 'name' in data:
            template.name = data['name']
        if 'description' in data:
            template.description = data['description']
        if 'template_data' in data:
            template.template_data = json.dumps(data['template_data'])
        
        session.commit()
        
        return jsonify(template.to_dict())
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@api_bp.route('/<root_id>/session-templates/<template_id>', methods=['DELETE'])
def delete_session_template(root_id, template_id):
    """Delete a session template."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        template = session.query(SessionTemplate).filter_by(id=template_id, root_id=root_id).first()
        if not template:
            return jsonify({"error": "Template not found"}), 404
        
        session.delete(template)
        session.commit()
        
        return jsonify({"message": "Template deleted successfully"})
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@api_bp.route('/<root_id>/goals', methods=['POST'])
def create_fractal_goal(root_id):
    """Create a new goal within a fractal."""
    import uuid
    
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



@api_bp.route('/<root_id>/goals/<goal_id>', methods=['GET'])
def get_fractal_goal(root_id, goal_id):
    """Get a specific goal by ID within a fractal."""
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

@api_bp.route('/<root_id>/goals/<goal_id>', methods=['DELETE'])
def delete_fractal_goal(root_id, goal_id):
    """Delete a goal within a fractal."""
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


@api_bp.route('/<root_id>/goals/<goal_id>', methods=['PUT'])
def update_fractal_goal(root_id, goal_id):
    """Update a goal within a fractal."""
    import json
    from datetime import datetime
    
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


@api_bp.route('/<root_id>/goals/<goal_id>/complete', methods=['PATCH'])
def toggle_fractal_goal_completion(root_id, goal_id):
    """Toggle goal completion status within a fractal."""
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
        goal.completed = data.get('completed', False)
        
        session.commit()
        
        return jsonify({"goal": goal.to_dict(include_children=False)}), 200
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

# ============================================================================
# ACTIVITY DEFINITION ENDPOINTS (Fractal-Scoped)
# ============================================================================

@api_bp.route('/<root_id>/activities', methods=['GET'])
def get_activities(root_id):
    """Get all activity definitions for a fractal."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        activities = session.query(ActivityDefinition).filter_by(root_id=root_id).order_by(ActivityDefinition.name).all()
        return jsonify([a.to_dict() for a in activities])
    finally:
        session.close()

@api_bp.route('/<root_id>/activities', methods=['POST'])
def create_activity(root_id):
    """Create a new activity definition with metrics."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        if not data.get('name'):
            return jsonify({"error": "Name is required"}), 400
        
        # Create Activity
        new_activity = ActivityDefinition(
            root_id=root_id,
            name=data['name'],
            description=data.get('description', ''),
            has_sets=data.get('has_sets', False),
            has_metrics=data.get('has_metrics', True)
        )
        session.add(new_activity)
        session.flush() # Get ID
        
        # Create Metrics
        # Expect metrics: [ { name: "Speed", unit: "bpm" }, ... ]
        metrics_data = data.get('metrics', [])
        # LIMIT TO 3 METRICS per requirements? "picking up to as many as three"
        if len(metrics_data) > 3:
             return jsonify({"error": "Maximum of 3 metrics allowed per activity."}), 400

        for m in metrics_data:
            if m.get('name') and m.get('unit'):
                new_metric = MetricDefinition(
                    activity_id=new_activity.id,
                    name=m['name'],
                    unit=m['unit']
                )
                session.add(new_metric)
        
        session.commit()
        session.refresh(new_activity) # refresh to load metrics
        return jsonify(new_activity.to_dict()), 201

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@api_bp.route('/<root_id>/activities/<activity_id>', methods=['PUT'])
def update_activity(root_id, activity_id):
    """Update an activity definition and its metrics."""
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Find the activity
        activity = session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
        
        data = request.get_json()
        
        # Update activity fields
        if 'name' in data:
            activity.name = data['name']
        if 'description' in data:
            activity.description = data['description']
        if 'has_sets' in data:
            activity.has_sets = data['has_sets']
        if 'has_metrics' in data:
            activity.has_metrics = data['has_metrics']
        
        # Update metrics if provided
        if 'metrics' in data:
            # Delete existing metrics
            session.query(MetricDefinition).filter_by(activity_id=activity_id).delete()
            
            # Add new metrics
            metrics_data = data.get('metrics', [])
            if len(metrics_data) > 3:
                return jsonify({"error": "Maximum of 3 metrics allowed per activity."}), 400
            
            for m in metrics_data:
                if m.get('name') and m.get('unit'):
                    new_metric = MetricDefinition(
                        activity_id=activity.id,
                        name=m['name'],
                        unit=m['unit']
                    )
                    session.add(new_metric)
        
        session.commit()
        session.refresh(activity)  # Refresh to load updated metrics
        return jsonify(activity.to_dict()), 200
    
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@api_bp.route('/<root_id>/activities/<activity_id>', methods=['DELETE'])
def delete_activity(root_id, activity_id):
    """Delete an activity definition."""
    session = get_session(engine)
    try:
        # Check ownership via root_id? Not strictly necessary if ID is unique, but good practice.
        activity = session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
            
        session.delete(activity)
        session.commit()
        return jsonify({"message": "Activity deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

# ============================================================================
# ACTIVITY INSTANCE TIME TRACKING ENDPOINTS
# ============================================================================

@api_bp.route('/<root_id>/activity-instances/<instance_id>/start', methods=['POST'])
def start_activity_timer(root_id, instance_id):
    """Start the timer for an activity instance."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        # Set start time to now
        instance.time_start = datetime.now()
        # Clear stop time and duration if restarting
        instance.time_stop = None
        instance.duration_seconds = None
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@api_bp.route('/<root_id>/activity-instances/<instance_id>/stop', methods=['POST'])
def stop_activity_timer(root_id, instance_id):
    """Stop the timer for an activity instance and calculate duration."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        if not instance.time_start:
            return jsonify({"error": "Timer was not started"}), 400
        
        # Set stop time to now
        instance.time_stop = datetime.now()
        
        # Calculate duration in seconds
        duration = (instance.time_stop - instance.time_start).total_seconds()
        instance.duration_seconds = int(duration)
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@api_bp.route('/<root_id>/activity-instances', methods=['GET'])
def get_activity_instances(root_id):
    """Get all activity instances for a fractal's practice sessions."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get all practice sessions for this fractal
        sessions = db_session.query(PracticeSession).filter_by(root_id=root_id).all()
        session_ids = [s.id for s in sessions]
        
        # Get all activity instances for these sessions
        instances = db_session.query(ActivityInstance).filter(
            ActivityInstance.practice_session_id.in_(session_ids)
        ).all()
        
        return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

def check_and_complete_goals(db_session, practice_session):
    """
    Check if any activity instances in the session meet goal targets.
    Auto-complete goals when ALL targets are met (AND logic).
    """
    import json
    
    # Get all goals for this fractal that have targets
    root_id = practice_session.root_id
    if not root_id:
        return
    
    # Get all goals in this fractal
    all_goals = db_session.query(Goal).filter(
        (Goal.id == root_id) | (Goal.parent_id != None)
    ).all()
    
    # Filter to goals with targets
    goals_with_targets = [g for g in all_goals if g.targets]
    
    for goal in goals_with_targets:
        if goal.completed:
            continue  # Skip already completed goals
        
        try:
            targets = json.loads(goal.targets)
        except:
            continue
        
        if not targets:
            continue
        
        # Check if ALL targets are met (AND logic)
        all_targets_met = True
        
        for target in targets:
            target_met = check_target_met(db_session, practice_session, target)
            if not target_met:
                all_targets_met = False
                break
        
        # If all targets met, mark goal as complete
        if all_targets_met:
            goal.completed = True
            print(f"✅ Goal '{goal.name}' auto-completed (all targets met)")


def check_target_met(db_session, practice_session, target):
    """
    Check if a specific target has been met by any activity instance in the session.
    Returns True if at least one instance meets or exceeds the target.
    """
    activity_id = target.get('activity_id')
    target_metrics = target.get('metrics', [])
    
    if not activity_id or not target_metrics:
        return False
    
    # Get all activity instances for this activity in this session
    instances = db_session.query(ActivityInstance).filter_by(
        practice_session_id=practice_session.id,
        activity_definition_id=activity_id
    ).all()
    
    # Check if any instance meets the target
    for instance in instances:
        if instance_meets_target(instance, target_metrics):
            return True
    
    return False


def instance_meets_target(instance, target_metrics):
    """
    Check if a single activity instance meets or exceeds all target metric values.
    Returns True only if ALL metrics meet or exceed their targets.
    """
    # Get all metric values for this instance
    instance_metrics = {mv.metric_definition_id: mv.value for mv in instance.metric_values}
    
    # Check each target metric
    for target_metric in target_metrics:
        metric_id = target_metric.get('metric_id')
        target_value = target_metric.get('value')
        
        if not metric_id or target_value is None:
            continue
        
        # Get instance's value for this metric
        instance_value = instance_metrics.get(metric_id)
        
        # If metric not found or value is less than target, fail
        if instance_value is None or instance_value < target_value:
            return False
    
    # All metrics meet or exceed targets
    return True

