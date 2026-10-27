"""External storage and media HTTP boundary. Every response excludes persistent credentials."""
import secrets
from urllib.parse import parse_qs, urlencode, urlsplit

from flask import Blueprint, Response, g, jsonify, redirect, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from config import config
from extensions import limiter
from services import storage_providers
from services.media_service import MediaService
from services.media_stream import media_chunks, stream_headers
from services.storage_common import PROVIDERS, StorageError
from services.storage_connection_service import StorageConnectionService
from services.storage_upload_service import StorageUploadService

storage_bp = Blueprint('storage', __name__, url_prefix='/api')


@storage_bp.after_request
def private_response(response):
    response.headers['Cache-Control'] = 'private, no-store'
    response.headers['Referrer-Policy'] = 'no-referrer'
    return response


@storage_bp.errorhandler(StorageError)
def storage_error(error):
    response = jsonify({'error': str(error), 'code': error.code})
    response.status_code = error.status
    if error.status == 429:
        response.headers['Retry-After'] = '30'
    return response


def body():
    value = request.get_json(silent=True)
    if not isinstance(value, dict):
        raise StorageError('A JSON object is required')
    return value


def execute(action):
    if getattr(g, 'admin_actor_user_id', None):
        raise StorageError('Connected storage requires the account owner', 403)
    db = get_db_session()
    try:
        return action(db)
    finally:
        db.close()


@storage_bp.get('/storage/connections')
@token_required
def list_connections(current_user):
    return execute(lambda db: jsonify(StorageConnectionService(db).list_connections(current_user.id)))


@storage_bp.post('/storage/<provider>/connect')
@token_required
@limiter.limit('10 per minute')
def connect(current_user, provider):
    result = execute(lambda db: StorageConnectionService(db).start(current_user.id, provider))
    state = parse_qs(urlsplit(result['url']).query)['state'][0]
    response = jsonify(result)
    response.set_cookie(authorization_cookie(provider), state, max_age=600, httponly=True,
                        secure=config.AUTH_COOKIE_SECURE, samesite='Lax', path='/')
    return response


def authorization_cookie(provider):
    prefix = '__Host-' if config.AUTH_COOKIE_SECURE else ''
    return f'{prefix}fractal_storage_{provider}'


# Callback outcomes form a fixed allowlist; provider text, codes and state are never reflected.
CALLBACK_RESULTS = {
    'storage_reconnect': 'expired', 'storage_account_mismatch': 'account_mismatch',
    'storage_permissions': 'permissions', 'storage_unconfigured': 'unavailable',
    'storage_unavailable': 'unavailable', 'storage_throttled': 'unavailable',
}


def callback_result(provider, state):
    if request.args.get('error'):
        return 'cancelled'
    browser_state = request.cookies.get(authorization_cookie(provider), '')
    # A dedicated Lax cookie binds the initiating browser while auth cookies stay Strict.
    if not browser_state or not state or not secrets.compare_digest(browser_state.encode(), state.encode()):
        return 'wrong_browser'
    try:
        execute(lambda db: StorageConnectionService(db).callback(provider, state, request.args.get('code')))
    except StorageError as error:
        if error.code == 'storage_error' and error.status == 400:
            return 'expired'  # Missing, malformed or already-consumed state.
        return CALLBACK_RESULTS.get(error.code, 'failed')
    return 'connected'


@storage_bp.get('/storage/<provider>/callback')
@limiter.limit('20 per minute')
def callback(provider):
    if provider not in PROVIDERS:
        raise StorageError('Unknown storage provider', 404)
    result = callback_result(provider, request.args.get('state', ''))
    query = urlencode({'provider': provider, 'result': result})
    response = redirect(f'{config.APP_BASE_URL.rstrip("/")}/storage/connected?{query}', code=303)
    response.delete_cookie(authorization_cookie(provider), path='/', secure=config.AUTH_COOKIE_SECURE,
                           httponly=True, samesite='Lax')
    return response


@storage_bp.delete('/storage/<provider>/connection')
@token_required
def disconnect(current_user, provider):
    return execute(lambda db: jsonify(StorageConnectionService(db).disconnect(current_user.id, provider)))


@storage_bp.put('/storage/upload-destination')
@token_required
def set_upload_destination(current_user):
    data = body()
    if set(data) != {'provider'} or data['provider'] not in PROVIDERS:
        raise StorageError('Choose a connected storage provider')
    return execute(lambda db: jsonify(StorageConnectionService(db).set_upload_destination(current_user.id, data['provider'])))


@storage_bp.post('/storage/google_drive/picker')
@token_required
@limiter.limit('20 per minute')
def picker(current_user):
    # The short-lived selected-file token is needed only by Google's Picker and stays in memory.
    return execute(lambda db: jsonify(StorageConnectionService(db).picker(current_user.id)))


@storage_bp.post('/storage/dropbox/files')
@token_required
def dropbox_files(current_user):
    data = body()
    cursor = data.get('cursor')
    if cursor is not None and (not isinstance(cursor, str) or len(cursor) > 8192):
        raise StorageError('Invalid file cursor')

    def action(db):
        service = StorageConnectionService(db)
        row = service.connection(current_user.id, 'dropbox')
        return jsonify(storage_providers.list_dropbox(service.access_token(row.id, current_user.id), cursor))
    return execute(action)


@storage_bp.post('/<root_id>/media')
@token_required
def import_media(current_user, root_id):
    data = body()
    if set(data) - {'provider', 'file_id', 'resource_key'}:
        raise StorageError('Unexpected media fields')
    return execute(lambda db: (jsonify(MediaService(db).import_file(
        root_id, current_user.id, data.get('provider'), data.get('file_id'), data.get('resource_key'),
    )), 201))


@storage_bp.get('/<root_id>/goals/<goal_id>/attachments')
@token_required
def goal_attachments(current_user, root_id, goal_id):
    return execute(lambda db: jsonify(MediaService(db).goal_attachments(root_id, current_user.id, goal_id)))


@storage_bp.patch('/<root_id>/media/<asset_id>')
@token_required
@limiter.limit('30 per minute')
def rename_media(current_user, root_id, asset_id):
    data = body()
    if set(data) != {'name'}:
        raise StorageError('Provide the new file name')
    return execute(lambda db: jsonify(MediaService(db).rename(root_id, current_user.id, asset_id, data['name'])))


@storage_bp.get('/<root_id>/media/<asset_id>/usage')
@token_required
def media_usage(current_user, root_id, asset_id):
    return execute(lambda db: jsonify(MediaService(db).usage(root_id, current_user.id, asset_id)))


@storage_bp.delete('/<root_id>/media/<asset_id>')
@token_required
@limiter.limit('30 per minute')
def delete_media(current_user, root_id, asset_id):
    return execute(lambda db: jsonify(MediaService(db).delete_from_storage(root_id, current_user.id, asset_id)))


@storage_bp.get('/<root_id>/media/<asset_id>/content')
@token_required
@limiter.limit('120 per minute')
def content(current_user, root_id, asset_id):
    def action(db):
        asset, upstream = MediaService(db).open_content(root_id, current_user.id, asset_id, request.headers.get('Range'))
        headers = stream_headers(asset, upstream)
        if upstream.status_code == 416:
            upstream.close()
            return Response(status=416, headers={key: value for key, value in headers.items() if key != 'Content-Length'})
        response = Response(media_chunks(upstream, asset.id, asset.size_bytes), status=upstream.status_code, headers=headers)
        response.call_on_close(upstream.close)
        return response
    return execute(action)


@storage_bp.post('/<root_id>/media/uploads')
@token_required
@limiter.limit('20 per minute')
def start_upload(current_user, root_id):
    data = body()
    if set(data) != {'provider', 'name', 'mime_type', 'size_bytes'}:
        raise StorageError('Provide provider, name, mime_type and size_bytes')
    return execute(lambda db: (jsonify(StorageUploadService(db).start(
        root_id, current_user.id, data['provider'], data['name'], data['mime_type'], data['size_bytes'],
    )), 201))


@storage_bp.put('/<root_id>/media/uploads/<upload_id>')
@token_required
def upload_chunk(current_user, root_id, upload_id):
    raw_offset = request.headers.get('Upload-Offset', '')
    if not raw_offset.isdigit() or len(raw_offset) > 12:
        raise StorageError('A valid Upload-Offset header is required')
    if request.content_length is None or request.content_length > 1024 * 1024:
        raise StorageError('Upload chunks are limited to 1 MiB', 413)
    return execute(lambda db: jsonify(StorageUploadService(db).chunk(
        root_id, current_user.id, upload_id, int(raw_offset), request.get_data(),
    )))


@storage_bp.delete('/<root_id>/media/uploads/<upload_id>')
@token_required
def cancel_upload(current_user, root_id, upload_id):
    return execute(lambda db: jsonify(StorageUploadService(db).cancel(root_id, current_user.id, upload_id)))
