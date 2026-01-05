from flask import Blueprint, request, jsonify
from datetime import datetime
import json
import uuid
import models
from models import (
    get_session,
    Session, Goal, ActivityInstance, MetricValue, session_goals,
    validate_root_goal, get_all_sessions, get_sessions_for_root,
    get_immediate_goals_for_session, get_session_by_id
)

# Create blueprint
sessions_bp = Blueprint('sessions', __name__, url_prefix='/api')


# ============================================================================
# HELPER FUNCTIONS
# ============================================================================

def sync_session_activities(db_session, session, session_data_dict):
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
        items = section.get('exercises', [])
        
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
                            session_id=session.id,
                            activity_definition_id=activity_def_id,
                            root_id=session.root_id,  # Add root_id for performance
                            created_at=session.created_at  # Approximate timestamp
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
                                            root_id=session.root_id,  # Add root_id for performance
                                            value=float_val
                                        )
                                        db_session.add(new_mv)
                                except ValueError:
                                    pass # Ignore non-numeric values
    
    # Clean up orphans for this session
    # BUT: Don't delete instances that have timer data (time_start/time_stop)
    # These are managed by the timer API, not the session_data JSON
    existing_for_session = db_session.query(ActivityInstance).filter_by(session_id=session.id).all()
    for ex_inst in existing_for_session:
        if ex_inst.id not in found_instances:
            # Only delete if this instance has no timer data
            if ex_inst.time_start is None and ex_inst.time_stop is None:
                db_session.delete(ex_inst)


def check_and_complete_goals(db_session, session):
    """
    Check if any activity instances in the session meet goal targets.
    Auto-complete goals when ALL targets are met (AND logic).
    """
    # Get all goals for this fractal that have targets
    root_id = session.root_id
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
            target_met = check_target_met(db_session, session, target)
            if not target_met:
                all_targets_met = False
                break
        
        # If all targets met, mark goal as complete
        if all_targets_met:
            goal.completed = True
            print(f"✅ Goal '{goal.name}' auto-completed (all targets met)")


def check_target_met(db_session, session, target):
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
        session_id=session.id,
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
def get_all_sessions_endpoint():
    """Get all sessions for grid view (Global)."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        sessions = get_all_sessions(db_session)
        result = [s.to_dict() for s in sessions]
        return jsonify(result)
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['GET'])
def get_fractal_sessions(root_id):
    """Get all sessions for a specific fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get sessions filtered by root_id, sorted by date (newest first)
        sessions = db_session.query(Session).filter_by(root_id=root_id).order_by(Session.created_at.desc()).all()
        result = [s.to_dict() for s in sessions]
        return jsonify(result)
        
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions', methods=['POST'])
def create_fractal_session(root_id):
    """Create a new session within a fractal."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get request data
        data = request.get_json()
        
        # Parse dates
        s_start = data.get('session_start')
        if s_start and isinstance(s_start, str):
             try: s_start = datetime.fromisoformat(s_start.replace('Z', '+00:00'))
             except: s_start = None

        s_end = data.get('session_end')
        if s_end and isinstance(s_end, str):
             try: s_end = datetime.fromisoformat(s_end.replace('Z', '+00:00'))
             except: s_end = None

        # Parse session_data
        session_data = data.get('session_data', {})
        if isinstance(session_data, str):
            try:
                session_data = json.loads(session_data)
            except:
                session_data = {}
        
        program_context = session_data.get('program_context', {})

        # Create the session
        new_session = Session(
            name=data.get('name', 'Untitled Session'),
            description=data.get('description', ''),
            root_id=root_id,
            duration_minutes=int(data['duration_minutes']) if data.get('duration_minutes') is not None else None,
            session_start=s_start,
            session_end=s_end,
            total_duration_seconds=int(data['total_duration_seconds']) if data.get('total_duration_seconds') is not None else None,
            template_id=data.get('template_id')
        )
        
        # Handle attributes
        if isinstance(session_data, dict):
            new_session.attributes = json.dumps(session_data)
        else:
            new_session.attributes = session_data
        
        # Extract program_day_id from program_context if present
        program_day_id = None
        if new_session.attributes:
            try:
                session_data_dict = json.loads(new_session.attributes) if isinstance(new_session.attributes, str) else new_session.attributes
                program_context = session_data_dict.get('program_context')
                if program_context and 'day_id' in program_context:
                    program_day_id = program_context['day_id']
                    new_session.program_day_id = program_day_id
            except (json.JSONDecodeError, TypeError):
                pass

        db_session.add(new_session)
        db_session.flush()  # Get the ID before committing
        
        # Associate with goals via junction table
        goal_ids = data.get('parent_ids', []) or data.get('goal_ids', [])
        if data.get('parent_id'):
            goal_ids.append(data.get('parent_id'))
        
        for goal_id in goal_ids:
            goal = db_session.query(Goal).filter_by(id=goal_id).first()
            if goal:
                goal_type = 'short_term' if goal.type == 'ShortTermGoal' else 'immediate'
                # Insert into junction table
                db_session.execute(
                    session_goals.insert().values(
                        session_id=new_session.id,
                        goal_id=goal_id,
                        goal_type=goal_type
                    )
                )
        
        # Handle immediate goals
        immediate_goal_ids = data.get('immediate_goal_ids', [])
        for ig_id in immediate_goal_ids:
            goal = db_session.query(Goal).filter_by(id=ig_id).first()
            if goal and goal.type == 'ImmediateGoal':
                db_session.execute(
                    session_goals.insert().values(
                        session_id=new_session.id,
                        goal_id=ig_id,
                        goal_type='immediate'
                    )
                )
        
        # Update program day completion status if linked to a program day
        if program_day_id:
            from models import ProgramDay
            program_day = db_session.query(ProgramDay).filter_by(id=program_day_id).first()
            if program_day:
                program_day.is_completed = program_day.check_completion()
        
        db_session.commit()
        
        # Refresh to load the goals relationship
        db_session.refresh(new_session)

        # Return the created session
        result = new_session.to_dict()
        return jsonify(result), 201
        
    except Exception as e:
        db_session.rollback()
        import traceback
        traceback.print_exc()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['PUT'])
def update_session(root_id, session_id):
    """Update a session's details."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the session
        session = db_session.query(Session).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get update data from request
        data = request.get_json()
        
        # Update fields if provided
        if 'name' in data:
            session.name = data['name']
        
        if 'description' in data:
            session.description = data['description']
        
        if 'duration_minutes' in data:
            session.duration_minutes = data['duration_minutes']
        
        if 'completed' in data:
            session.completed = data['completed']
            if data['completed']:
                session.completed_at = datetime.now()
        
        # Update session analytics fields
        if 'session_start' in data:
            if isinstance(data['session_start'], str):
                session.session_start = datetime.fromisoformat(data['session_start'].replace('Z', '+00:00'))
            else:
                session.session_start = data['session_start']
        
        if 'session_end' in data:
            if isinstance(data['session_end'], str):
                session.session_end = datetime.fromisoformat(data['session_end'].replace('Z', '+00:00'))
            else:
                session.session_end = data['session_end']
        
        if 'total_duration_seconds' in data:
            session.total_duration_seconds = data['total_duration_seconds']
        
        if 'template_id' in data:
            session.template_id = data['template_id']
        
        if 'session_data' in data:
            if isinstance(data['session_data'], str):
                session.attributes = data['session_data']
            else:
                session.attributes = json.dumps(data['session_data'])
        
        db_session.commit()
        
        # Return updated session
        result = session.to_dict()
        return jsonify(result)
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['GET'])
def get_session_endpoint(root_id, session_id):
    """Get a session by ID."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        return jsonify(session.to_dict())
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>', methods=['DELETE'])
def delete_session_endpoint(root_id, session_id):
    """Delete a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the session
        session = db_session.query(Session).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Delete junction table entries
        db_session.execute(
            session_goals.delete().where(session_goals.c.session_id == session_id)
        )
            
        db_session.delete(session)
        db_session.commit()
        
        return jsonify({"message": "Session deleted successfully"})
        
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        session = db_session.query(Session).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get all activity instances for this session, ordered by created_at
        instances = db_session.query(ActivityInstance).filter_by(
            session_id=session_id
        ).order_by(ActivityInstance.created_at).all()
        
        return jsonify([inst.to_dict() for inst in instances])
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities', methods=['POST'])
def add_activity_to_session(root_id, session_id):
    """Add a new activity instance to a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Validate session exists
        session = db_session.query(Session).filter_by(
            id=session_id,
            root_id=root_id
        ).first()
        
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        data = request.get_json()
        activity_definition_id = data.get('activity_definition_id')
        instance_id = data.get('instance_id') or str(uuid.uuid4())
        
        if not activity_definition_id:
            return jsonify({"error": "activity_definition_id required"}), 400
        
        # Create the activity instance
        instance = ActivityInstance(
            id=instance_id,
            session_id=session_id,
            activity_definition_id=activity_definition_id,
            root_id=root_id  # Add root_id for performance
        )
        
        db_session.add(instance)
        db_session.commit()
        
        return jsonify(instance.to_dict()), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/reorder', methods=['POST'])
def reorder_activities(root_id, session_id):
    """Reorder activities in a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = request.get_json()
        activity_ids = data.get('activity_ids', [])
        
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Update sort_order for each activity
        for idx, instance_id in enumerate(activity_ids):
            instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
            if instance:
                instance.sort_order = idx
        
        db_session.commit()
        return jsonify({"status": "success"}), 200
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['PUT'])
def update_activity_instance_in_session(root_id, session_id, instance_id):
    """Update activity instance in session context."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        data = request.get_json()
        instance = db_session.query(ActivityInstance).filter_by(id=instance_id).first()
        if not instance:
            return jsonify({"error": "Instance not found"}), 404
        
        if 'notes' in data:
            instance.notes = data['notes']
        if 'completed' in data:
            instance.completed = data.get('completed')
        
        db_session.commit()
        return jsonify(instance.to_dict())
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/activities/<instance_id>', methods=['DELETE'])
def remove_activity_from_session(root_id, session_id, instance_id):
    """Remove an activity instance from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(
            id=instance_id,
            session_id=session_id
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
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        # Validate root goal exists
        root = validate_root_goal(db_session, root_id)
        if not root:
            return jsonify({"error": "Fractal not found"}), 404
        
        # Get the activity instance
        instance = db_session.query(ActivityInstance).filter_by(
            id=instance_id,
            session_id=session_id
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
                        root_id=root_id,  # Add root_id for performance
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


# ============================================================================
# SESSION-GOAL ASSOCIATION ENDPOINTS
# ============================================================================

@sessions_bp.route('/<root_id>/sessions/<session_id>/goals', methods=['GET'])
def get_session_goals(root_id, session_id):
    """Get all goals associated with a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        # Get goals via the junction table
        from sqlalchemy import select
        stmt = select(Goal, session_goals.c.goal_type).join(
            session_goals, Goal.id == session_goals.c.goal_id
        ).where(session_goals.c.session_id == session_id)
        
        results = db_session.execute(stmt).all()
        
        goals_list = []
        for goal, goal_type in results:
            goal_dict = goal.to_dict(include_children=False)
            goal_dict['association_type'] = goal_type
            goals_list.append(goal_dict)
        
        return jsonify(goals_list)
        
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/goals', methods=['POST'])
def add_goal_to_session(root_id, session_id):
    """Associate a goal with a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        session = get_session_by_id(db_session, session_id)
        if not session:
            return jsonify({"error": "Session not found"}), 404
        
        data = request.get_json()
        goal_id = data.get('goal_id')
        goal_type = data.get('goal_type', 'short_term')  # 'short_term' or 'immediate'
        
        if not goal_id:
            return jsonify({"error": "goal_id required"}), 400
        
        goal = db_session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        # Insert into junction table
        db_session.execute(
            session_goals.insert().values(
                session_id=session_id,
                goal_id=goal_id,
                goal_type=goal_type
            )
        )
        
        db_session.commit()
        return jsonify({"message": "Goal associated with session"}), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@sessions_bp.route('/<root_id>/sessions/<session_id>/goals/<goal_id>', methods=['DELETE'])
def remove_goal_from_session(root_id, session_id, goal_id):
    """Remove a goal association from a session."""
    engine = models.get_engine()
    db_session = get_session(engine)
    try:
        db_session.execute(
            session_goals.delete().where(
                session_goals.c.session_id == session_id,
                session_goals.c.goal_id == goal_id
            )
        )
        db_session.commit()
        return jsonify({"message": "Goal removed from session"})
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
