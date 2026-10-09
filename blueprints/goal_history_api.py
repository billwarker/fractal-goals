"""Goal history read routes registered on the existing goals blueprint."""

import logging
from flask import jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.goal_timeline_service import GoalTimelineService

logger = logging.getLogger(__name__)


def _read_goal_history(current_user, root_id, goal_id, *, heatmap=False):
    db_session = get_db_session()
    try:
        service = GoalTimelineService(db_session)
        include_children = request.args.get('include_children', 'true').lower() not in {'0', 'false', 'no'}
        if heatmap:
            view = request.args.get('view', 'calendar')
            if view not in {'calendar', 'entries'}:
                return jsonify({'error': 'Invalid timeline view'}), 400
            payload, error, status = service.get_goal_activity_heatmap(
                root_id, goal_id, current_user.id,
                include_children=include_children,
                timezone_name=request.args.get('timezone', 'UTC'),
                day=request.args.get('date'),
                page_size=request.args.get('limit', '20') if view == 'entries' else None,
                cursor=request.args.get('cursor'),
                metric=request.args.get('metric', 'activities'),
            )
        else:
            types = [item.strip() for item in request.args.get('types', '').split(',') if item.strip()]
            payload, error, status = service.get_goal_timeline(
                root_id, goal_id, current_user.id,
                types=types if 'types' in request.args else None,
                include_children=include_children,
                limit=request.args.get('limit', 50, type=int),
            )
        return jsonify({'error': error} if error else payload), status
    except SQLAlchemyError:
        db_session.rollback()
        return internal_error(logger, 'Error fetching goal history')
    finally:
        db_session.close()


def register_goal_history_routes(blueprint):
    @blueprint.route('/<root_id>/goals/<goal_id>/activity-heatmap', methods=['GET'])
    @token_required
    def get_goal_activity_heatmap(current_user, root_id, goal_id):
        """Complete daily evidence or all entries for one local day."""
        return _read_goal_history(current_user, root_id, goal_id, heatmap=True)

    @blueprint.route('/<root_id>/goals/<goal_id>/timeline', methods=['GET'])
    @token_required
    def get_goal_timeline(current_user, root_id, goal_id):
        """Normalized display timeline of goal progress and related events."""
        return _read_goal_history(current_user, root_id, goal_id)
