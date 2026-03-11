"""
Notes API Blueprint

Provides endpoints for managing timestamped notes on sessions, activity instances, and sets.
"""

import logging

from flask import Blueprint, jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from models import get_engine, get_session
from services.note_service import NoteService
from validators import NanoGoalNoteCreateSchema, NoteCreateSchema, NoteUpdateSchema, validate_request

logger = logging.getLogger(__name__)

notes_bp = Blueprint('notes', __name__, url_prefix='/api')


def _with_note_service():
    db_session = get_db_session()
    return db_session, NoteService(db_session)


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
@validate_request(NoteCreateSchema)
def create_note(current_user, root_id, validated_data):
    db_session, note_service = _with_note_service()
    try:
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


@notes_bp.route('/<root_id>/nano-goal-notes', methods=['POST'])
@token_required
@validate_request(NanoGoalNoteCreateSchema)
def create_nano_goal_note(current_user, root_id, validated_data):
    db_session, note_service = _with_note_service()
    try:
        payload, error, status = note_service.create_nano_goal_note(root_id, current_user.id, validated_data)
        if error:
            return jsonify({"error": error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception("Error creating nano goal note")
        return internal_error(logger, "Error creating nano goal note")
    finally:
        db_session.close()


@notes_bp.route('/<root_id>/notes/<note_id>', methods=['PUT'])
@token_required
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
