"""Sequence tracks: ordered sibling goals that unlock one at a time (services/goal_sequence_service.py)."""

import logging

from flask import jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.goal_sequence_service import GoalSequenceService
from validators import GoalSequenceCreateSchema, GoalSequenceStepsSchema, validate_request

logger = logging.getLogger(__name__)


def _respond(call, message):
    db_session = get_db_session()
    try:
        payload, error, status = call(GoalSequenceService(db_session))
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception(message)
        return internal_error(logger, message)
    finally:
        db_session.close()


def register_goal_sequence_routes(blueprint):
    @blueprint.route('/<root_id>/sequence-tracks', methods=['POST'])
    @token_required
    @validate_request(GoalSequenceCreateSchema)
    def create_sequence_track(current_user, root_id, validated_data):
        """Sequence sibling goals of one level; later steps wait, paused, for the one before."""
        return _respond(lambda service: service.create_track(
            root_id, current_user.id, validated_data['parent_goal_id'], validated_data['goal_ids'],
        ), "Error creating sequence")

    @blueprint.route('/<root_id>/sequence-tracks/<track_id>', methods=['PUT'])
    @token_required
    @validate_request(GoalSequenceStepsSchema)
    def set_sequence_steps(current_user, root_id, track_id, validated_data):
        """Reorder, add or remove steps; fewer than two steps dissolves the sequence."""
        return _respond(lambda service: service.set_track_steps(
            root_id, current_user.id, track_id, validated_data.get('goal_ids') or [],
        ), "Error updating sequence")

    @blueprint.route('/<root_id>/sequence-tracks/<track_id>', methods=['DELETE'])
    @token_required
    def delete_sequence_track(current_user, root_id, track_id):
        """Dissolve a sequence; goals it held paused resume."""
        return _respond(lambda service: service.dissolve_track(root_id, current_user.id, track_id), "Error removing sequence")

    @blueprint.route('/<root_id>/goals/<goal_id>/sequence-hold', methods=['POST'])
    @token_required
    def hold_sequence_step(current_user, root_id, goal_id):
        """Undo an automatic begin: the step waits, paused, on its sequence again."""
        return _respond(lambda service: service.hold_step(root_id, current_user.id, goal_id), "Error holding sequence step")

    @blueprint.route('/<root_id>/goals/<goal_id>/sequence', methods=['GET'])
    @token_required
    def get_goal_sequence(current_user, root_id, goal_id):
        """A goal's sequence: its steps, the step completing it begins, and the step it began."""
        return _respond(lambda service: service.get_goal_sequence(root_id, current_user.id, goal_id), "Error reading sequence")
