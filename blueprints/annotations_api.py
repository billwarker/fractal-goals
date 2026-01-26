"""
API Blueprint for Visualization Annotations.

Provides CRUD operations for annotations on analytics visualizations.
"""
from flask import Blueprint, request, jsonify
from models import (
    get_engine, get_session, VisualizationAnnotation, validate_root_goal, utc_now
)
from blueprints.auth_api import token_required
import json

annotations_bp = Blueprint('annotations_api', __name__)


@annotations_bp.route('/api/roots/<root_id>/annotations', methods=['GET'])
@token_required
def get_annotations(current_user, root_id):
    """Get all annotations for a fractal root if owned by user."""
    engine = get_engine()
    db_session = get_session(engine)
    
    try:
        # Validate root exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Root goal not found or access denied"}), 404
        
        query = db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None
        )
        
        # Optional filtering
        viz_type = request.args.get('visualization_type')
        if viz_type:
            query = query.filter(VisualizationAnnotation.visualization_type == viz_type)
        
        viz_context = request.args.get('visualization_context')
        should_filter_context = False
        target_context = {}
        
        if viz_context:
            try:
                target_context = json.loads(viz_context)
                if target_context and len(target_context) > 0:
                    should_filter_context = True
            except json.JSONDecodeError:
                pass
        
        # Get all annotations for this viz type
        annotations = query.order_by(VisualizationAnnotation.created_at.desc()).all()
        
        # Filter in Python if needed
        if should_filter_context:
            filtered_annotations = []
            for ann in annotations:
                if not ann.visualization_context:
                    continue
                try:
                    # Parse stored context
                    stored = json.loads(ann.visualization_context) if isinstance(ann.visualization_context, str) else ann.visualization_context
                    
                    # Check if stored context contains target context
                    # This implements the @> (contains) logic in Python
                    match = True
                    for key, value in target_context.items():
                        if stored.get(key) != value:
                            match = False
                            break
                    if match:
                        filtered_annotations.append(ann)
                except:
                    continue
            annotations = filtered_annotations
        
        return jsonify({
            "data": [a.to_dict() for a in annotations]
        })
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations', methods=['POST'])
@token_required
def create_annotation(current_user, root_id):
    """Create a new visualization annotation if owned by user."""
    engine = get_engine()
    db_session = get_session(engine)
    
    try:
        # Validate root exists and is owned by user
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Root goal not found or access denied"}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body required"}), 400
        
        # Validate required fields
        if not data.get('visualization_type'):
            return jsonify({"error": "visualization_type is required"}), 400
        if not data.get('selected_points'):
            return jsonify({"error": "selected_points is required"}), 400
        if not data.get('content'):
            return jsonify({"error": "content is required"}), 400
        
        annotation = VisualizationAnnotation(
            root_id=root_id,
            visualization_type=data['visualization_type'],
            visualization_context=json.dumps(data.get('visualization_context')) if data.get('visualization_context') else None,
            selected_points=json.dumps(data['selected_points']),
            selection_bounds=json.dumps(data.get('selection_bounds')) if data.get('selection_bounds') else None,
            content=data['content']
        )
        
        db_session.add(annotation)
        db_session.commit()
        
        return jsonify({
            "data": annotation.to_dict(),
            "message": "Annotation created successfully"
        }), 201
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['GET'])
@token_required
def get_annotation(current_user, root_id, annotation_id):
    """Get a single annotation by ID if owned by user."""
    engine = get_engine()
    db_session = get_session(engine)
    
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        annotation = db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.id == annotation_id,
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None
        ).first()
        
        if not annotation:
            return jsonify({"error": "Annotation not found"}), 404
        
        return jsonify({"data": annotation.to_dict()})
        
    except Exception as e:
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['PUT'])
@token_required
def update_annotation(current_user, root_id, annotation_id):
    """Update an existing annotation if owned by user."""
    engine = get_engine()
    db_session = get_session(engine)
    
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        annotation = db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.id == annotation_id,
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None
        ).first()
        
        if not annotation:
            return jsonify({"error": "Annotation not found"}), 404
        
        data = request.get_json()
        if not data:
            return jsonify({"error": "Request body required"}), 400
        
        # Update allowed fields
        if 'content' in data:
            annotation.content = data['content']
        if 'selected_points' in data:
            annotation.selected_points = json.dumps(data['selected_points'])
        if 'selection_bounds' in data:
            annotation.selection_bounds = json.dumps(data['selection_bounds']) if data['selection_bounds'] else None
        
        db_session.commit()
        
        return jsonify({
            "data": annotation.to_dict(),
            "message": "Annotation updated successfully"
        })
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()


@annotations_bp.route('/api/roots/<root_id>/annotations/<annotation_id>', methods=['DELETE'])
@token_required
def delete_annotation(current_user, root_id, annotation_id):
    """Soft delete an annotation if owned by user."""
    engine = get_engine()
    db_session = get_session(engine)
    
    try:
        # Verify ownership
        root = validate_root_goal(db_session, root_id, owner_id=current_user.id)
        if not root:
            return jsonify({"error": "Fractal not found or access denied"}), 404
            
        annotation = db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.id == annotation_id,
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None
        ).first()
        
        if not annotation:
            return jsonify({"error": "Annotation not found"}), 404
        
        annotation.deleted_at = utc_now()
        db_session.commit()
        
        return jsonify({"message": "Annotation deleted successfully"})
        
    except Exception as e:
        db_session.rollback()
        return jsonify({"error": str(e)}), 500
    finally:
        db_session.close()
