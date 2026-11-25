from functools import wraps

from flask import jsonify, request

from blueprints.api_utils import get_db_session
from services.occurred_at import parse_client_datetime
from services.sync_merge_service import SyncMergeService


def merges(entity_type, id_argument):
    """Merge an update field by field (services/sync_merge_service.py). Place below ``token_required``.

    ``_base`` and ``_edited_at`` are taken out of the body, so request schemas are unchanged. The
    record joins the handler's transaction: an update that fails leaves no trace of the merge.
    """
    def decorator(handler):
        @wraps(handler)
        def wrapper(current_user, *args, **kwargs):
            body = request.get_json(silent=True)
            if not isinstance(body, dict):
                return handler(current_user, *args, **kwargs)
            base, raw_edited_at = body.pop('_base', None), body.pop('_edited_at', None)
            edited_at = parse_client_datetime(raw_edited_at)
            if (base is not None and not isinstance(base, dict)) or (raw_edited_at is not None and edited_at is None):
                return jsonify({'error': 'Invalid sync metadata', 'code': 'invalid_sync_metadata'}), 400
            db = get_db_session()
            dropped = SyncMergeService(db).merge(
                current_user.id, kwargs['root_id'], entity_type, kwargs[id_argument], body, base, edited_at,
            )
            if not body and (dropped or base):
                db.commit()
                return jsonify({'code': 'sync_superseded', 'superseded_fields': dropped}), 200
            return handler(current_user, *args, **kwargs)
        return wrapper
    return decorator
