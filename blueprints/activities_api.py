from flask import Blueprint, request, jsonify
import models
from models import (
    get_session,
    ActivityDefinition, MetricDefinition, SplitDefinition, ActivityGroup,
    validate_root_goal
)
from sqlalchemy import func

# Create blueprint
activities_bp = Blueprint('activities', __name__, url_prefix='/api')

# Global engine removed
# engine = get_engine()

# ============================================================================
# ============================================================================
# ACTIVITY GROUP ENDPOINTS
# ============================================================================

@activities_bp.route('/<root_id>/activity-groups', methods=['GET'])
def get_activity_groups(root_id):
    """Get all activity groups for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        groups = session.query(ActivityGroup).filter_by(root_id=root_id).order_by(ActivityGroup.sort_order, ActivityGroup.created_at).all()
        return jsonify([g.to_dict() for g in groups])
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups', methods=['POST'])
def create_activity_group(root_id):
    """Create a new activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        if not data.get('name'):
            return jsonify({"error": "Name is required"}), 400
        
        # Calculate order
        max_order = session.query(func.max(ActivityGroup.sort_order)).filter_by(root_id=root_id).scalar()
        new_order = (max_order or 0) + 1

        new_group = ActivityGroup(
            root_id=root_id,
            name=data['name'],
            description=data.get('description', ''),
            sort_order=new_order
        )
        session.add(new_group)
        session.commit()
        return jsonify(new_group.to_dict()), 201
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/<group_id>', methods=['PUT'])
def update_activity_group(root_id, group_id):
    """Update an activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        group = session.query(ActivityGroup).filter_by(id=group_id, root_id=root_id).first()
        if not group:
            return jsonify({"error": "Group not found"}), 404
        
        data = request.get_json()
        if 'name' in data:
            group.name = data['name']
        if 'description' in data:
            group.description = data['description']
            
        session.commit()
        return jsonify(group.to_dict())
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/<group_id>', methods=['DELETE'])
def delete_activity_group(root_id, group_id):
    """Delete an activity group."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        group = session.query(ActivityGroup).filter_by(id=group_id, root_id=root_id).first()
        if not group:
            return jsonify({"error": "Group not found"}), 404
            
        # Manually unlink activities to be safe/clear
        activities = session.query(ActivityDefinition).filter_by(group_id=group_id).all()
        for activity in activities:
            activity.group_id = None
            
        session.delete(group)
        session.commit()
        return jsonify({"message": "Group deleted"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@activities_bp.route('/<root_id>/activity-groups/reorder', methods=['PUT'])
def reorder_activity_groups(root_id):
    """Reorder activity groups."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        data = request.get_json()
        group_ids = data.get('group_ids', [])
        
        if not group_ids:
             return jsonify({"error": "No group_ids provided"}), 400
             
        # Update each group
        for idx, group_id in enumerate(group_ids):
            group = session.query(ActivityGroup).filter_by(id=group_id, root_id=root_id).first()
            if group:
                group.sort_order = idx
                
        session.commit()
        return jsonify({"message": "Groups reordered"})
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

# ============================================================================
# ACTIVITY DEFINITION ENDPOINTS (Fractal-Scoped)
# ============================================================================

@activities_bp.route('/<root_id>/activities', methods=['GET'])
def get_activities(root_id):
    """Get all activity definitions for a fractal."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        activities = session.query(ActivityDefinition).filter_by(root_id=root_id).order_by(ActivityDefinition.name).all()
        return jsonify([a.to_dict() for a in activities])
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities', methods=['POST'])
def create_activity(root_id):
    """Create a new activity definition with metrics."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        root = validate_root_goal(session, root_id)
        if not root:
             return jsonify({"error": "Fractal not found"}), 404
        
        data = request.get_json()
        if not data.get('name'):
            return jsonify({"error": "Name is required"}), 400
        
        # Check for existing activity with same name (case-insensitive)
        normalized_name = data['name'].strip()
        existing_activity = session.query(ActivityDefinition).filter(
            ActivityDefinition.root_id == root_id,
            func.lower(ActivityDefinition.name) == normalized_name.lower()
        ).first()

        if existing_activity:
            # If it exists, return it instead of creating a duplicate
            return jsonify(existing_activity.to_dict()), 200
        
        # Create Activity
        new_activity = ActivityDefinition(
            root_id=root_id,
            name=data['name'],
            description=data.get('description', ''),
            has_sets=data.get('has_sets', False),
            has_metrics=data.get('has_metrics', True),
            metrics_multiplicative=data.get('metrics_multiplicative', False),
            has_splits=data.get('has_splits', False),
            group_id=data.get('group_id')
        )
        session.add(new_activity)
        session.flush() # Get ID
        
        # Create Metrics
        metrics_data = data.get('metrics', [])
        if len(metrics_data) > 3:
             return jsonify({"error": "Maximum of 3 metrics allowed per activity."}), 400

        for m in metrics_data:
            if m.get('name') and m.get('unit'):
                new_metric = MetricDefinition(
                    activity_id=new_activity.id,
                    root_id=root_id,  # Add root_id for performance
                    name=m['name'],
                    unit=m['unit'],
                    is_top_set_metric=m.get('is_top_set_metric', False),
                    is_multiplicative=m.get('is_multiplicative', True)
                )
                session.add(new_metric)
        
        # Create Splits
        splits_data = data.get('splits', [])
        if len(splits_data) > 5:
             return jsonify({"error": "Maximum of 5 splits allowed per activity."}), 400

        for idx, s in enumerate(splits_data):
            if s.get('name'):
                new_split = SplitDefinition(
                    activity_id=new_activity.id,
                    root_id=root_id,  # Add root_id for performance
                    name=s['name'],
                    order=idx
                )
                session.add(new_split)
        
        session.commit()
        session.refresh(new_activity) # refresh to load metrics and splits
        return jsonify(new_activity.to_dict()), 201

    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities/<activity_id>', methods=['PUT'])
def update_activity(root_id, activity_id):
    """Update an activity definition and its metrics."""
    engine = models.get_engine()
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
        if 'metrics_multiplicative' in data:
            activity.metrics_multiplicative = data['metrics_multiplicative']
            activity.has_splits = data['has_splits']
        if 'group_id' in data:
            activity.group_id = data['group_id']
        
        # Update metrics if provided
        if 'metrics' in data:
            metrics_data = data.get('metrics', [])
            if len(metrics_data) > 3:
                return jsonify({"error": "Maximum of 3 metrics allowed per activity."}), 400
            
            # Get existing metrics
            existing_metrics = session.query(MetricDefinition).filter_by(activity_id=activity_id).all()
            existing_metrics_dict = {m.id: m for m in existing_metrics}
            
            # Track which existing metrics were updated
            updated_metric_ids = set()
            
            # Update or create metrics
            for m in metrics_data:
                if m.get('name') and m.get('unit'):
                    metric_id = m.get('id')
                    
                    if metric_id and metric_id in existing_metrics_dict:
                        # Update existing metric
                        existing_metric = existing_metrics_dict[metric_id]
                        existing_metric.name = m['name']
                        existing_metric.unit = m['unit']
                        existing_metric.is_top_set_metric = m.get('is_top_set_metric', False)
                        existing_metric.is_multiplicative = m.get('is_multiplicative', True)
                        updated_metric_ids.add(metric_id)
                    else:
                        # Try to match by name and unit (for backwards compatibility)
                        matched_metric = None
                        for existing_metric in existing_metrics:
                            if (existing_metric.name == m['name'] and 
                                existing_metric.unit == m['unit'] and 
                                existing_metric.id not in updated_metric_ids):
                                matched_metric = existing_metric
                                break
                        
                        if matched_metric:
                            # Update matched metric
                            matched_metric.is_top_set_metric = m.get('is_top_set_metric', False)
                            matched_metric.is_multiplicative = m.get('is_multiplicative', True)
                            updated_metric_ids.add(matched_metric.id)
                        else:
                            # Create new metric
                            new_metric = MetricDefinition(
                                activity_id=activity.id,
                                root_id=root_id,  # Add root_id for performance
                                name=m['name'],
                                unit=m['unit'],
                                is_top_set_metric=m.get('is_top_set_metric', False),
                                is_multiplicative=m.get('is_multiplicative', True)
                            )
                            session.add(new_metric)
            
            # Delete metrics that were not in the update
            for existing_metric in existing_metrics:
                if existing_metric.id not in updated_metric_ids:
                    session.delete(existing_metric)
        
        # Update splits if provided
        if 'splits' in data:
            splits_data = data.get('splits', [])
            if len(splits_data) > 5:
                return jsonify({"error": "Maximum of 5 splits allowed per activity."}), 400
            
            # Get existing splits
            existing_splits = session.query(SplitDefinition).filter_by(activity_id=activity_id).all()
            existing_splits_dict = {s.id: s for s in existing_splits}
            
            # Track which existing splits were updated
            updated_split_ids = set()
            
            # Update or create splits
            for idx, s in enumerate(splits_data):
                if s.get('name'):
                    split_id = s.get('id')
                    
                    if split_id and split_id in existing_splits_dict:
                        # Update existing split
                        existing_split = existing_splits_dict[split_id]
                        existing_split.name = s['name']
                        existing_split.order = idx
                        updated_split_ids.add(split_id)
                    else:
                        # Create new split
                        new_split = SplitDefinition(
                            activity_id=activity.id,
                            root_id=root_id,  # Add root_id for performance
                            name=s['name'],
                            order=idx
                        )
                        session.add(new_split)
            
            # Delete splits that were not in the update
            for existing_split in existing_splits:
                if existing_split.id not in updated_split_ids:
                    session.delete(existing_split)
        
        session.commit()
        session.refresh(activity)  # Refresh to load updated metrics
        return jsonify(activity.to_dict()), 200
    
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()

@activities_bp.route('/<root_id>/activities/<activity_id>', methods=['DELETE'])
def delete_activity(root_id, activity_id):
    """Delete an activity definition."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        # Check ownership via root_id
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
# ACTIVITY-GOAL ASSOCIATION ENDPOINTS (for SMART goals)
# ============================================================================

@activities_bp.route('/<root_id>/activities/<activity_id>/goals', methods=['GET'])
def get_activity_goals(root_id, activity_id):
    """Get all goals associated with an activity."""
    engine = models.get_engine()
    session = get_session(engine)
    try:
        activity = session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
        
        goals = [{"id": g.id, "name": g.name, "type": g.type} for g in activity.associated_goals]
        return jsonify(goals)
    finally:
        session.close()


@activities_bp.route('/<root_id>/activities/<activity_id>/goals', methods=['POST'])
def set_activity_goals(root_id, activity_id):
    """Set goals associated with an activity (replaces existing associations)."""
    from models import Goal, activity_goal_associations
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        activity = session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
        
        data = request.get_json()
        goal_ids = data.get('goal_ids', [])
        
        # Clear existing associations for this activity
        session.execute(
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id
            )
        )
        
        # Add new associations
        for goal_id in goal_ids:
            goal = session.query(Goal).filter_by(id=goal_id).first()
            if goal:
                session.execute(
                    activity_goal_associations.insert().values(
                        activity_id=activity_id,
                        goal_id=goal_id
                    )
                )
        
        session.commit()
        
        # Refresh and return updated activity
        session.refresh(activity)
        return jsonify(activity.to_dict()), 200
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@activities_bp.route('/<root_id>/activities/<activity_id>/goals/<goal_id>', methods=['DELETE'])
def remove_activity_goal(root_id, activity_id, goal_id):
    """Remove a goal association from an activity."""
    from models import activity_goal_associations
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        activity = session.query(ActivityDefinition).filter_by(id=activity_id, root_id=root_id).first()
        if not activity:
            return jsonify({"error": "Activity not found"}), 404
        
        # Remove the association
        result = session.execute(
            activity_goal_associations.delete().where(
                activity_goal_associations.c.activity_id == activity_id,
                activity_goal_associations.c.goal_id == goal_id
            )
        )
        
        if result.rowcount == 0:
            return jsonify({"error": "Association not found"}), 404
        
        session.commit()
        return jsonify({"message": "Goal association removed"}), 200
        
    except Exception as e:
        session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        session.close()


@activities_bp.route('/<root_id>/goals/<goal_id>/activities', methods=['GET'])
def get_goal_activities(root_id, goal_id):
    """Get all activities associated with a goal."""
    from models import Goal
    
    engine = models.get_engine()
    session = get_session(engine)
    try:
        goal = session.query(Goal).filter_by(id=goal_id).first()
        if not goal:
            return jsonify({"error": "Goal not found"}), 404
        
        activities = [{"id": a.id, "name": a.name, "description": a.description} for a in goal.associated_activities]
        return jsonify(activities)
    finally:
        session.close()

