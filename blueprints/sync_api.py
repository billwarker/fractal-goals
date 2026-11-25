from flask import Blueprint, jsonify, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from services.sync_feed_service import DEFAULT_PAGE, MAX_PAGE, SyncCursorError, SyncFeedService
from services.sync_merge_service import SyncMergeService

sync_bp = Blueprint('sync', __name__, url_prefix='/api/sync')


def _page(read):
    limit = min(max(request.args.get('limit', DEFAULT_PAGE, type=int), 1), MAX_PAGE)
    db = get_db_session()
    try:
        return jsonify(read(SyncFeedService(db), limit))
    except SyncCursorError as exc:
        return jsonify({'error': str(exc), 'code': exc.code}), exc.status
    finally:
        db.close()


@sync_bp.get('/snapshot')
@token_required
def snapshot(current_user):
    """Everything the user owns, page by page, ending with the cursor to read changes from."""
    return _page(lambda feed, limit: feed.snapshot(current_user.id, request.args.get('page'), limit))


@sync_bp.get('/changes')
@token_required
def changes(current_user):
    with_data = request.args.get('view') != 'ids'
    return _page(lambda feed, limit: feed.changes(
        current_user.id, request.args.get('cursor'), limit, with_data=with_data,
    ))


@sync_bp.get('/cursor')
@token_required
def cursor(current_user):
    """Where the feed is now, for a client that has just read what it shows."""
    return _page(lambda feed, _limit: feed.current_cursor())


@sync_bp.get('/conflicts')
@token_required
def conflicts(current_user):
    db = get_db_session()
    try:
        return jsonify(SyncMergeService(db).list_conflicts(current_user.id))
    finally:
        db.close()


@sync_bp.post('/conflicts/<conflict_id>/resolve')
@token_required
def resolve_conflict(current_user, conflict_id):
    db = get_db_session()
    try:
        payload, error, status = SyncMergeService(db).resolve(current_user.id, conflict_id)
        return jsonify({'error': error} if error else payload), status
    finally:
        db.close()
