"""HTTP boundary for explicit execution-to-goal links."""
from flask import Blueprint
from blueprints.auth_api import token_required
from blueprints.api_utils import get_db_session, service_response as _service_response
from validators import validate_request
from validators.activities import ActivityInstanceGoalSchema
from services.activity_instance_goal_service import ActivityInstanceGoalService

instance_goals_bp = Blueprint('instance_goals', __name__)


@instance_goals_bp.route('/<root_id>/activity-instances/<instance_id>/goals', methods=['GET'])
@token_required
def get_instance_goals(current_user, root_id, instance_id):
    session = get_db_session()
    try:
        return _service_response(*ActivityInstanceGoalService(session).get_goals(root_id, instance_id, current_user.id))
    finally:
        session.close()


@instance_goals_bp.route('/<root_id>/activity-instances/<instance_id>/goals', methods=['POST'])
@token_required
@validate_request(ActivityInstanceGoalSchema)
def associate_instance_goal(current_user, root_id, instance_id, validated_data):
    session = get_db_session()
    try:
        return _service_response(*ActivityInstanceGoalService(session).set_goal(root_id, instance_id, validated_data['goal_id'], current_user.id))
    finally:
        session.close()


@instance_goals_bp.route('/<root_id>/activity-instances/<instance_id>/goals/<goal_id>', methods=['DELETE'])
@token_required
def disassociate_instance_goal(current_user, root_id, instance_id, goal_id):
    session = get_db_session()
    try:
        return _service_response(*ActivityInstanceGoalService(session).set_goal(root_id, instance_id, goal_id, current_user.id, remove=True))
    finally:
        session.close()
