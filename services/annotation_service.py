import json

import models
from models import VisualizationAnnotation, validate_root_goal
from services.serializers import serialize_visualization_annotation
from services.service_types import JsonDict, ServiceResult


def _parse_context_filter(raw_context):
    if not raw_context:
        return None
    try:
        parsed = json.loads(raw_context)
    except json.JSONDecodeError:
        return None
    if not isinstance(parsed, dict) or not parsed:
        return None
    return parsed


def _context_contains(stored_context, target_context):
    if not target_context:
        return True
    if stored_context is None:
        return False

    if isinstance(stored_context, str):
        try:
            stored_context = json.loads(stored_context)
        except (TypeError, ValueError, json.JSONDecodeError):
            return False

    if not isinstance(stored_context, dict):
        return False

    for key, value in target_context.items():
        if stored_context.get(key) != value:
            return False
    return True


class AnnotationService:
    def __init__(self, db_session):
        self.db_session = db_session

    def _get_root(self, root_id, current_user_id):
        return validate_root_goal(self.db_session, root_id, owner_id=current_user_id)

    def _get_annotation(self, root_id, annotation_id):
        return self.db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.id == annotation_id,
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None,
        ).first()

    def get_annotations(
        self,
        root_id,
        current_user_id,
        *,
        visualization_type=None,
        visualization_context=None,
    ) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Root goal not found or access denied", 404

        query = self.db_session.query(VisualizationAnnotation).filter(
            VisualizationAnnotation.root_id == root_id,
            VisualizationAnnotation.deleted_at == None,
        )

        if visualization_type:
            query = query.filter(VisualizationAnnotation.visualization_type == visualization_type)

        annotations = query.order_by(VisualizationAnnotation.created_at.desc()).all()
        target_context = _parse_context_filter(visualization_context)
        if target_context:
            annotations = [
                annotation
                for annotation in annotations
                if _context_contains(annotation.visualization_context, target_context)
            ]

        return {
            "data": [serialize_visualization_annotation(annotation) for annotation in annotations]
        }, None, 200

    def create_annotation(self, root_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Root goal not found or access denied", 404

        annotation = VisualizationAnnotation(
            root_id=root_id,
            visualization_type=data["visualization_type"],
            visualization_context=data.get("visualization_context"),
            selected_points=data["selected_points"],
            selection_bounds=data.get("selection_bounds"),
            content=data["content"],
        )

        self.db_session.add(annotation)
        self.db_session.commit()

        return {
            "data": serialize_visualization_annotation(annotation),
            "message": "Annotation created successfully",
        }, None, 201

    def get_annotation(self, root_id, annotation_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        annotation = self._get_annotation(root_id, annotation_id)
        if not annotation:
            return None, "Annotation not found", 404

        return {"data": serialize_visualization_annotation(annotation)}, None, 200

    def update_annotation(self, root_id, annotation_id, current_user_id, data) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        annotation = self._get_annotation(root_id, annotation_id)
        if not annotation:
            return None, "Annotation not found", 404

        if "content" in data:
            annotation.content = data["content"]
        if "selected_points" in data:
            annotation.selected_points = data["selected_points"]
        if "selection_bounds" in data:
            annotation.selection_bounds = data["selection_bounds"]

        self.db_session.commit()

        return {
            "data": serialize_visualization_annotation(annotation),
            "message": "Annotation updated successfully",
        }, None, 200

    def delete_annotation(self, root_id, annotation_id, current_user_id) -> ServiceResult[JsonDict]:
        root = self._get_root(root_id, current_user_id)
        if not root:
            return None, "Fractal not found or access denied", 404

        annotation = self._get_annotation(root_id, annotation_id)
        if not annotation:
            return None, "Annotation not found", 404

        annotation.deleted_at = models.utc_now()
        self.db_session.commit()

        return {"message": "Annotation deleted successfully"}, None, 200
