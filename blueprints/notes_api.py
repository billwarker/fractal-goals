"""
Notes API Blueprint

Provides endpoints for managing timestamped notes on sessions, activity instances, and sets.
"""

import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from blueprints.idempotency import idempotent
from extensions import limiter
from models import Note, get_engine, get_session
from services.note_service import NoteService
from services.serializers import serialize_note_display
from services.oembed_service import get_instagram_oembed
from validators import NoteCreateRequestSchema, NoteUpdateSchema, validate_request

logger = logging.getLogger(__name__)

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


def _with_note_service():
    db_session = get_db_session()
    return db_session, NoteService(db_session)


@notes_bp.route('/oembed/instagram', methods=['GET'])
@token_required
@limiter.limit("60 per minute")
def oembed_instagram(current_user):
    """Resolve an Instagram permalink to official oEmbed HTML when a Meta token
    is configured; otherwise report unconfigured so the client uses /embed."""
    url = request.args.get('url', '')
    if not url:
        return jsonify({"error": "url is required"}), 400
    payload = get_instagram_oembed(url)
    return jsonify(payload), 200


@notes_bp.route('/<root_id>/sessions/<session_id>/notes', methods=['GET'])
@token_required
def get_session_notes(current_user, root_id, session_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.get_session_notes(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching session notes")
        return internal_error(logger, "Error fetching session notes")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/activity-instances/<instance_id>/notes', methods=['GET'])
@token_required
def get_activity_instance_notes(current_user, root_id, instance_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.get_activity_instance_notes(root_id, instance_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching activity instance notes")
        return internal_error(logger, "Error fetching activity instance notes")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/sessions/<session_id>/previous-session-notes', methods=['GET'])
@token_required
def get_previous_session_notes(current_user, root_id, session_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.get_previous_session_notes(root_id, session_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching previous session notes")
        return internal_error(logger, "Error fetching previous session notes")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/notes', methods=['GET'])
@token_required
def get_activity_definition_notes(current_user, root_id, activity_id):
    db_session, note_service = _with_note_service()
    try:
        limit = request.args.get('limit', 20, type=int)
        exclude_session_id = request.args.get('exclude_session')
        payload, error, status = note_service.get_activity_definition_notes(
            root_id,
            activity_id,
            current_user.id,
            limit=limit,
            exclude_session_id=exclude_session_id,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching activity definition notes")
        return internal_error(logger, "Error fetching activity definition notes")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/activities/<activity_id>/history', methods=['GET'])
@token_required
def get_activity_history(current_user, root_id, activity_id):
    db_session, note_service = _with_note_service()
    try:
        limit = request.args.get('limit', 3, type=int)
        exclude_session_id = request.args.get('exclude_session')
        payload, error, status = note_service.get_activity_history(
            root_id,
            activity_id,
            current_user.id,
            limit=limit,
            exclude_session_id=exclude_session_id,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching activity history")
        return internal_error(logger, "Error fetching activity history")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes', methods=['POST'])
@token_required
@idempotent
@validate_request(NoteCreateRequestSchema)
def create_note(current_user, root_id, validated_data):
    db_session, note_service = _with_note_service()
    try:
        # Client-minted ids (offline notes): a replay whose idempotency record is gone finds its own note.
        existing = db_session.get(Note, validated_data['id']) if validated_data.get('id') else None
        if existing is not None:
            same_note = (existing.root_id, existing.context_type, existing.context_id) == (
                root_id, validated_data.get('context_type'), validated_data.get('context_id'),
            )
            if not same_note or existing.deleted_at is not None:
                return jsonify({"error": "A note with this id already exists"}), 409
            return jsonify(serialize_note_display(existing)), 200
        payload, error, status = note_service.create_note(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating note")
        return internal_error(logger, "Error creating note")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
@token_required
@idempotent
@validate_request(NoteUpdateSchema)
def update_note(current_user, root_id, note_id, validated_data):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.update_note(root_id, note_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error updating note")
        return internal_error(logger, "Error updating note")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['DELETE'])
@token_required
@idempotent
def delete_note(current_user, root_id, note_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.delete_note(root_id, note_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error deleting note")
        return internal_error(logger, "Error deleting note")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/goals/<goal_id>/notes', methods=['GET'])
@token_required
def get_goal_notes(current_user, root_id, goal_id):
    db_session, note_service = _with_note_service()
    try:
        include_descendants = request.args.get('include_descendants', 'false').lower() == 'true'
        include_goal_notes = request.args.get('include_goal_notes', 'true').lower() == 'true'
        include_activity_instance_notes = request.args.get('include_activity_instance_notes', 'true').lower() == 'true'
        payload, error, status = note_service.get_goal_notes(
            root_id,
            goal_id,
            current_user.id,
            include_descendants=include_descendants,
            include_goal_notes=include_goal_notes,
            include_activity_instance_notes=include_activity_instance_notes,
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching goal notes")
        return internal_error(logger, "Error fetching goal notes")
    finally:
        db_session.close()


def _csv(name):
    return [part.strip() for part in request.args.get(name, '').split(',') if part.strip()]


def _feed_filters():
    """Notes page query parameters. Spec fields are validated by services/note_filter_spec.py."""
    return {
        'context_types': _csv('context_types') or None,
        'context_id': request.args.get('context_id') or None,
        'text': request.args.get('text', ''),
        'categories': _csv('categories'),
        'goal_id': request.args.get('goal_id') or None,
        'activity_definition_ids': request.args.getlist('activity_definition_ids[]') or _csv('activity_definition_ids'),
        'activity_group_ids': request.args.getlist('activity_group_ids[]') or _csv('activity_group_ids'),
        'pinned_only': request.args.get('pinned_only', 'false').lower() == 'true',
        'saved_filter_ids': _csv('filters'),
        'day': request.args.get('day') or None,
        'timezone': request.args.get('timezone') or None,
    }


@notes_bp.route('/<root_id>/notes', methods=['GET'])
@token_required
def get_all_notes(current_user, root_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.get_all_notes(
            root_id, current_user.id, filters=_feed_filters(),
            page=request.args.get('page', 0, type=int), page_size=request.args.get('page_size', 25, type=int),
        )
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching all notes")
        return internal_error(logger, "Error fetching all notes")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/heatmap', methods=['GET'])
@token_required
def get_notes_heatmap(current_user, root_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.get_notes_heatmap(root_id, current_user.id, filters=_feed_filters())
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error fetching notes heatmap")
        return internal_error(logger, "Error fetching notes heatmap")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/<note_id>/pin', methods=['PUT'])
@token_required
@idempotent
def pin_note(current_user, root_id, note_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.pin_note(root_id, note_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error pinning note")
        return internal_error(logger, "Error pinning note")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/<note_id>/unpin', methods=['PUT'])
@token_required
@idempotent
def unpin_note(current_user, root_id, note_id):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.unpin_note(root_id, note_id, current_user.id)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error unpinning note")
        return internal_error(logger, "Error unpinning note")
    finally:
        db_session.close()
