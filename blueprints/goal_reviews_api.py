"""Goal reviews: put the review now due off to the next period (services/goal_review_rules.py).

Writing a review is creating a goal note with note_kind 'goal_review'; turning reviews off or
changing the cadence is a goal update.
"""

import logging
from datetime import datetime, timezone
from typing import Any

from flask import jsonify
from sqlalchemy.exc import SQLAlchemyError

from blueprints.api_utils import get_db_session, internal_error
from blueprints.auth_api import token_required
from models import Goal, validate_root_goal
from services.goal_review_rules import deferred_review_date, last_review_dates
from services.serializers import serialize_goal

logger = logging.getLogger(__name__)


def register_goal_review_routes(blueprint):
    @blueprint.route('/<root_id>/goals/<goal_id>/review/defer', methods=['POST'])
    @token_required
    def defer_goal_review(current_user, root_id, goal_id):
        """Defer the review now due by one cadence period."""
        db_session = get_db_session()
        try:
            if not validate_root_goal(db_session, root_id, owner_id=current_user.id):
                return jsonify({'error': 'Fractal not found or access denied'}), 404
            goal: Any = db_session.query(Goal).filter_by(id=goal_id, root_id=root_id, deleted_at=None).first()
            if not goal:
                return jsonify({'error': 'Goal not found'}), 404
            today = datetime.now(timezone.utc).date()
            last = last_review_dates(db_session, [goal.id]).get(goal.id)
            until = deferred_review_date(goal, goal.level, last, today)
            if until is None:
                return jsonify({'error': "This goal has no review to defer"}), 409
            goal.review_deferred_until = datetime.combine(until, datetime.min.time())
            db_session.commit()
            db_session.refresh(goal)
            return jsonify(serialize_goal(goal, include_children=False)), 200
        except SQLAlchemyError:
            db_session.rollback()
            logger.exception("Error deferring goal review")
            return internal_error(logger, "Error deferring goal review")
        finally:
            db_session.close()
