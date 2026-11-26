"""Installed apps update on their own schedule; one too old for the API is told so plainly."""
from flask import has_request_context, jsonify, request
from sqlalchemy import event, text
from sqlalchemy.orm import Session

from config import config

PLATFORM_HEADER = 'X-Client-Platform'
BUILD_HEADER = 'X-Client-Build'
INSTANCE_HEADER = 'X-Client-Instance'


def check_client_version():
    if request.method == 'OPTIONS' or not request.path.startswith('/api/'):
        return None
    minimum = config.MIN_SUPPORTED_BUILDS.get(request.headers.get(PLATFORM_HEADER, ''))
    if not minimum:
        return None
    build = request.headers.get(BUILD_HEADER, '')
    if build.isascii() and build.isdigit() and int(build) >= minimum:
        return None
    return jsonify({
        'error': 'Update required',
        'code': 'client_update_required',
        'min_supported_build': minimum,
    }), 426


def _note_origin(_session, _transaction, connection):
    """Tell the sync log's triggers which app instance this transaction's writes come from."""
    origin = request.headers.get(INSTANCE_HEADER, '')[:36] if has_request_context() else ''
    if origin and request.method not in ('GET', 'HEAD', 'OPTIONS'):
        connection.execute(text("SELECT set_config('app.sync_origin', :origin, true)"), {'origin': origin})


def register_client_version(app):
    app.before_request(check_client_version)
    if not event.contains(Session, 'after_begin', _note_origin):
        event.listen(Session, 'after_begin', _note_origin)
