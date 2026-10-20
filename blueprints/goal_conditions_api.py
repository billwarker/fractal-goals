"""Goal completion condition routes registered on the goals blueprint."""

import logging

from flask import jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.goal_condition_reads import GoalConditionReadService
from services.goal_deadline_rules import warnings_for_goal
from services.goal_service import GoalService
from services.serializers import serialize_goal
from validators import GoalConditionUpdateSchema, validate_request

logger = logging.getLogger(__name__)


def goal_response(db_session, goal, status, *, check_pending):
    """Serialize a written goal, flagging an incomplete goal whose condition is already met."""
    payload = serialize_goal(goal, include_children=False)
    payload['deadline_warnings'] = warnings_for_goal(goal)
    payload['condition_pending_completion'] = (
        GoalConditionReadService(db_session).pending_completion(goal) if check_pending else False
    )
    return jsonify(payload), status


def error_response(error, status):
    return jsonify(error if isinstance(error, dict) else {'error': error}), status


def register_goal_condition_routes(blueprint):
    @blueprint.route('/<root_id>/goals/condition-progress', methods=['GET'])
    @token_required
    def get_goal_condition_progress(current_user, root_id):
        """Derived condition progress for up to 200 goals (`goal_ids` is comma separated)."""
        goal_ids = [item.strip() for item in request.args.get('goal_ids', '').split(',') if item.strip()]
        db_session = get_db_session()
        try:
            payload, error, status = GoalConditionReadService(db_session).get_progress(
                root_id, current_user.id, goal_ids,
            )
            return (error_response(error, status) if error else (jsonify(payload), status))
        except SQLAlchemyError:
            db_session.rollback()
            logger.exception('Error reading goal condition progress')
            return internal_error(logger, 'Goals API request failed')
        finally:
            db_session.close()

    @blueprint.route('/<root_id>/goals/conditions', methods=['GET'])
    @token_required
    def list_activity_goal_conditions(current_user, root_id):
        """Up to 50 live goals whose condition is on `activity_id` (open goals first)."""
        db_session = get_db_session()
        try:
            payload, error, status = GoalConditionReadService(db_session).list_for_activity(
                root_id, current_user.id, request.args.get('activity_id', '').strip(),
            )
            return (error_response(error, status) if error else (jsonify(payload), status))
        except SQLAlchemyError:
            db_session.rollback()
            logger.exception('Error listing goal conditions')
            return internal_error(logger, 'Goals API request failed')
        finally:
            db_session.close()

    @blueprint.route('/<root_id>/goals/<goal_id>/condition/evidence', methods=['GET'])
    @token_required
    def get_goal_condition_evidence(current_user, root_id, goal_id):
        """Contributing instances for the goal's condition; `activity_id` previews an unsaved one."""
        since = 'all' if request.args.get('since') == 'all' else 'active'
        db_session = get_db_session()
        try:
            payload, error, status = GoalConditionReadService(db_session).get_evidence(
                root_id, current_user.id, goal_id, since=since, activity_id=request.args.get('activity_id'),
            )
            return (error_response(error, status) if error else (jsonify(payload), status))
        except SQLAlchemyError:
            db_session.rollback()
            logger.exception('Error reading goal condition evidence')
            return internal_error(logger, 'Goals API request failed')
        finally:
            db_session.close()

    @blueprint.route('/<root_id>/goals/<goal_id>/condition', methods=['PUT'])
    @token_required
    @validate_request(GoalConditionUpdateSchema)
    def put_goal_condition(current_user, root_id, goal_id, validated_data):
        """Set how a goal completes: an activity threshold, its children, or manually."""
        db_session = get_db_session()
        try:
            goal, error, status = GoalService(db_session).update_fractal_goal(
                root_id, goal_id, current_user.id, validated_data,
            )
            if error:
                return error_response(error, status)
            return goal_response(db_session, goal, status, check_pending=True)
        except SQLAlchemyError:
            db_session.rollback()
            logger.exception('Error updating goal condition')
            return internal_error(logger, 'Goals API request failed')
        finally:
            db_session.close()
