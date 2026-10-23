"""Goal charts: saved analytics views on goals, and the bounded data they read
(services/goal_chart_service.py). Registered on the goals blueprint (prefix /api)."""

import logging
from datetime import datetime

from flask import jsonify, request
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from services.goal_chart_service import GoalChartService
from validators import (
    DashboardGoalsSchema, GoalChartAttachSchema, GoalChartOrderSchema, parse_date_string, validate_request,
)

logger = logging.getLogger(__name__)


def _respond(call, message):
    db_session = get_db_session()
    try:
        payload, error, status = call(GoalChartService(db_session))
        if error:
            return jsonify({'error': error}), status
        return jsonify(payload), status
    except SQLAlchemyError:
        db_session.rollback()
        logger.exception(message)
        return internal_error(logger, message)
    finally:
        db_session.close()


def register_goal_chart_routes(blueprint):
    @blueprint.route('/<root_id>/goals/<goal_id>/charts', methods=['GET'])
    @token_required
    def list_goal_charts(current_user, root_id, goal_id):
        """The goal's default chart (if any) and its attached analytics views, in order."""
        return _respond(lambda service: service.list_goal_charts(root_id, current_user.id, goal_id), "Error reading goal charts")

    @blueprint.route('/<root_id>/goals/<goal_id>/charts', methods=['POST'])
    @token_required
    @validate_request(GoalChartAttachSchema)
    def attach_goal_chart(current_user, root_id, goal_id, validated_data):
        """Show a saved activity or goal view on the goal (after its other charts)."""
        return _respond(lambda service: service.attach(
            root_id, current_user.id, goal_id, validated_data['dashboard_id'],
        ), "Error adding goal chart")

    @blueprint.route('/<root_id>/goals/<goal_id>/charts/order', methods=['PUT'])
    @token_required
    @validate_request(GoalChartOrderSchema)
    def reorder_goal_charts(current_user, root_id, goal_id, validated_data):
        return _respond(lambda service: service.reorder(
            root_id, current_user.id, goal_id, validated_data.get('dashboard_ids') or [],
        ), "Error reordering goal charts")

    @blueprint.route('/<root_id>/goals/<goal_id>/charts/<dashboard_id>', methods=['DELETE'])
    @token_required
    def detach_goal_chart(current_user, root_id, goal_id, dashboard_id):
        return _respond(lambda service: service.detach(root_id, current_user.id, goal_id, dashboard_id), "Error removing goal chart")

    @blueprint.route('/roots/<root_id>/dashboards/<dashboard_id>/goals', methods=['GET'])
    @token_required
    def get_view_goals(current_user, root_id, dashboard_id):
        """The goals a saved view shows on (Analytics' "Add to goal…" and its delete warning)."""
        return _respond(lambda service: service.view_goals(root_id, current_user.id, dashboard_id), "Error reading view goals")

    @blueprint.route('/roots/<root_id>/dashboards/<dashboard_id>/goals', methods=['PUT'])
    @token_required
    @validate_request(DashboardGoalsSchema)
    def set_view_goals(current_user, root_id, dashboard_id, validated_data):
        return _respond(lambda service: service.set_view_goals(
            root_id, current_user.id, dashboard_id, validated_data.get('goal_ids') or [],
        ), "Error updating view goals")

    @blueprint.route('/<root_id>/activities/<activity_id>/analytics-evidence', methods=['GET'])
    @token_required
    def get_activity_analytics_evidence(current_user, root_id, activity_id):
        """An activity's most recent completed instances (at most 500), for a chart on a goal."""
        since_raw = (request.args.get('since') or '').strip()
        since = None
        if since_raw:
            try:
                since = datetime.combine(parse_date_string(since_raw.split('T')[0]), datetime.min.time())
            except ValueError:
                return jsonify({'error': 'since must be a date (YYYY-MM-DD)'}), 400
        try:
            limit = int(request.args.get('limit', 500))
        except ValueError:
            return jsonify({'error': 'limit must be a number'}), 400
        return _respond(lambda service: service.activity_evidence(
            root_id, current_user.id, activity_id, since=since, limit=limit,
        ), "Error reading activity evidence")
