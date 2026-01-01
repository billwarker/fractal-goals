from flask import Blueprint, request, jsonify
from datetime import datetime
import json
import uuid
from models import (
    get_engine, get_session,
    PracticeSession, Goal, ActivityInstance, MetricValue,
    validate_root_goal, get_all_practice_sessions, build_practice_session_tree,
    get_immediate_goals_for_session, get_practice_session_by_id
)

# Create blueprint
sessions_bp = Blueprint('sessions', __name__, url_prefix='/api')

# Initialize database engine
engine = get_engine()

# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

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
                        db_session.flush()  # Ensure instance exists in DB before creating metric values
                    
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
    
    # Clean up orphans for this session
    # BUT: Don't delete instances that have timer data (time_start/time_stop)
    # These are managed by the timer API, not the session_data JSON
    existing_for_session = db_session.query(ActivityInstance).filter_by(practice_session_id=practice_session.id).all()
    for ex_inst in existing_for_session:
        if ex_inst.id not in found_instances:
            # Only delete if this instance has no timer data
            if ex_inst.time_start is None and ex_inst.time_stop is None:
                db_session.delete(ex_inst)


def check_and_complete_goals(db_session, practice_session):
    """
    Check if any activity instances in the session meet goal targets.
    Auto-complete goals when ALL targets are met (AND logic).
    """
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

# ============================================================================
# ENDPOINTS
# ============================================================================

@sessions_bp.route('/practice-sessions', methods=['GET'])
def get_all_practice_sessions_endpoint():
    """Get all practice sessions for grid view (Global)."""
    session = get_session(engine)
    try:
        practice_sessions = get_all_practice_sessions(session)
        # Build trees for each session
        result = [build_practice_session_tree(session, ps) for ps in practice_sessions]
        return jsonify(result)
    finally:
        session.close()

@sessions_bp.route('/<root_id>/sessions', methods=['GET'])
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


@sessions_bp.route('/<root_id>/sessions', methods=['POST'])
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
            session_start=data.get('session_start'),  # ISO datetime string
            session_end=data.get('session_end'),      # ISO datetime string
            total_duration_seconds=data.get('total_duration_seconds'),
            template_id=data.get('template_id'),
            attributes=data.get('session_data')  # Store in attributes column
        )
        
        # Handle attributes if not string
        if isinstance(new_session.attributes, dict):
             new_session.attributes = json.dumps(new_session.attributes)
        
        # Keep session_data for backward compatibility
        new_session.session_data = new_session.attributes

        db_session.add(new_session)
        db_session.flush()  # Get the ID before committing
        
        # Associate with parent goals if provided
        parent_ids = data.get('parent_ids', [])
        if parent_ids:
             # Just take the first valid parent for the tree structure (legacy field)
             first_parent_id = parent_ids[0]
             # Verify
             goal = db_session.query(Goal).filter_by(id=first_parent_id).first()
             if goal and goal.type == 'ShortTermGoal':
                 new_session.parent_id = goal.id
             
             # Add ALL parents to relationship (M2M)
             for pid in parent_ids:
                 g = db_session.query(Goal).filter_by(id=pid).first()
                 if g and g.type == 'ShortTermGoal':
                      new_session.parent_goals.append(g)
        
        db_session.commit()
        

        # Return the created session
        result = build_practice_session_tree(db_session, new_session)
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
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
        
        # Update session analytics fields
        if 'session_start' in data:
            practice_session.session_start = data['session_start']
        
        if 'session_end' in data:
            practice_session.session_end = data['session_end']
        
        if 'total_duration_seconds' in data:
            practice_session.total_duration_seconds = data['total_duration_seconds']
        
        if 'template_id' in data:
            practice_session.template_id = data['template_id']
        
        if 'session_data' in data:
            # Store in attributes column (new) and session_data (legacy)
            if isinstance(data['session_data'], str):
                practice_session.attributes = data['session_data']
                practice_session.session_data = data['session_data']
            else:
                practice_session.attributes = json.dumps(data['session_data'])
                practice_session.session_data = practice_session.attributes

            # NOTE: session_data now only contains UI metadata (section names, notes, display order)
            # Activity instances are managed separately via dedicated endpoints (lines 440+)
        
        db_session.commit()
        
        # Return updated session
        result = build_practice_session_tree(db_session, practice_session)
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['DELETE'])
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
        
        # Delete immediate goals first
        immediate_goals = get_immediate_goals_for_session(db_session, session_id)
        for ig in immediate_goals:
            db_session.delete(ig)
            
        db_session.delete(practice_session)
        db_session.commit()
        
        return jsonify({"message": "Practice session deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()

# ============================================================================
# SESSION ACTIVITY INSTANCE ENDPOINTS (Database-Only Architecture)
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['GET'])
def get_session_activities(root_id, session_id):
    """Get all activity instances for a session in display order."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        practice_session = db_session.query(PracticeSession).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not practice_session:
            return jsonify({"error": "Practice session not found"}), 404
        
        # Get all activity instances for this session, ordered by created_at
        instances = db_session.query(ActivityInstance).filter_by(
            practice_session_id=session_id
        ).order_by(ActivityInstance.created_at).all()
        
        return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['POST'])
def add_activity_to_session(root_id, session_id):
    """Add a new activity instance to a session."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        practice_session = db_session.query(PracticeSession).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not practice_session:
            return jsonify({"error": "Practice session not found"}), 404
        
        data = request.get_json()
        activity_definition_id = data.get('activity_definition_id')
        instance_id = data.get('instance_id') or str(uuid.uuid4())
        
        if not activity_definition_id:
            return jsonify({"error": "activity_definition_id required"}), 400
        
        # Create the activity instance
        instance = ActivityInstance(
            id=instance_id,
            practice_session_id=session_id,
            activity_definition_id=activity_definition_id
        )
        
        db_session.add(instance)
        db_session.commit()
        
        return jsonify(instance.to_dict()), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['DELETE'])
def remove_activity_from_session(root_id, session_id, instance_id):
    """Remove an activity instance from a session."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(
            id=instance_id,
            practice_session_id=session_id
        ).first()
        
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        db_session.delete(instance)
        db_session.commit()
        
        return jsonify({"message": "Activity instance deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>/metrics', methods=['PUT'])
def update_activity_metrics(root_id, session_id, instance_id):
    """Update metric values for an activity instance."""
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(
            id=instance_id,
            practice_session_id=session_id
        ).first()
        
        if not instance:
            return jsonify({"error": "Activity instance not found"}), 404
        
        data = request.get_json()
        metrics = data.get('metrics', [])
        
        # Update or create metric values
        for metric_data in metrics:
            metric_id = metric_data.get('metric_id')
            split_id = metric_data.get('split_id')
            value = metric_data.get('value')
            
            if not metric_id or value is None or str(value).strip() == '':
                continue
            
            try:
                float_val = float(value)
                
                # Find existing metric value
                query = db_session.query(MetricValue).filter_by(
                    activity_instance_id=instance_id,
                    metric_definition_id=metric_id
                )
                
                if split_id:
                    query = query.filter_by(split_definition_id=split_id)
                else:
                    query = query.filter_by(split_definition_id=None)
                
                metric_val = query.first()
                
                if metric_val:
                    metric_val.value = float_val
                else:
                    new_metric = MetricValue(
                        activity_instance_id=instance_id,
                        metric_definition_id=metric_id,
                        split_definition_id=split_id,
                        value=float_val
                    )
                    db_session.add(new_metric)
            except ValueError:
                continue
        
        db_session.commit()
        
        return jsonify(instance.to_dict())
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
