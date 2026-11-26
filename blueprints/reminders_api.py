from flask import Blueprint, jsonify, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from services.reminder_service import ReminderService

reminders_bp = Blueprint('reminders', __name__, url_prefix='/api/reminders')


@reminders_bp.get('/upcoming')
@token_required
def upcoming(current_user):
    db = get_db_session()
    try:
        payload, error, status = ReminderService(db).upcoming(current_user, request.args.get('timezone'))
        return jsonify({'error': error} if error else payload), status
    finally:
        db.close()
