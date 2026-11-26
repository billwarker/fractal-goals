import re
from functools import wraps

from flask import jsonify, request

from blueprints.api_utils import get_db_session
from models import Goal, ProgramBlock, ProgramDay, Program
from services.client_ids import clear_client_id, set_client_id

_UUID = re.compile(r'[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}')


def _owned_by(db, row, user_id) -> bool:
    if isinstance(row, (ProgramBlock, ProgramDay)):
        row = db.get(Program, row.program_id)
    root = db.get(Goal, row.root_id) if row is not None else None
    return root is not None and root.owner_id == user_id


def accepts_client_id(model):
    """Let a create name its own ``id``. Place below ``token_required``, above validation.

    The id is taken out of the body, so request schemas (and the agent's strict copies) are unchanged.
    """
    def decorator(handler):
        @wraps(handler)
        def wrapper(current_user, *args, **kwargs):
            body = request.get_json(silent=True)
            entity_id = body.pop('id', None) if isinstance(body, dict) else None
            if entity_id is None:
                return handler(current_user, *args, **kwargs)
            if not isinstance(entity_id, str) or not _UUID.fullmatch(entity_id):
                return jsonify({'error': 'id must be a UUID', 'code': 'invalid_client_id'}), 400
            entity_id = entity_id.lower()
            db = get_db_session()
            existing = db.get(model, entity_id)
            if existing is not None:
                # A replay past the idempotency window: the device can treat its create as done.
                owned = _owned_by(db, existing, current_user.id)
                db.rollback()
                return jsonify({
                    'error': 'That id is already in use', 'code': 'client_id_taken', 'already_created': owned,
                }), 409
            set_client_id(model, entity_id)
            try:
                return handler(current_user, *args, **kwargs)
            finally:
                clear_client_id()
        return wrapper
    return decorator
