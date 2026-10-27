"""Saved Notes page filters."""
from flask import Blueprint, jsonify, request

from blueprints.api_utils import get_db_session
from blueprints.auth_api import token_required
from services.note_filter_service import NoteFilterService
from services.note_filter_spec import NoteFilterError

note_filters_bp = Blueprint('note_filters', __name__, url_prefix='/api')


def _execute(action, success_status=200):
    db = get_db_session()
    try:
        return jsonify(action(NoteFilterService(db))), success_status
    except NoteFilterError as exc:
        db.rollback()
        return jsonify({'error': str(exc), 'code': exc.code}), 404 if exc.code == 'not_found' else 400
    finally:
        db.close()


def _body():
    data = request.get_json(silent=True)
    if not isinstance(data, dict) or set(data) - {'name', 'spec', 'position'}:
        raise NoteFilterError('Provide name, spec or position')
    return data


@note_filters_bp.get('/<root_id>/note-filters')
@token_required
def list_note_filters(current_user, root_id):
    return _execute(lambda service: service.list(root_id, current_user.id))


@note_filters_bp.post('/<root_id>/note-filters')
@token_required
def create_note_filter(current_user, root_id):
    return _execute(lambda service: service.create(root_id, current_user.id, _body()), 201)


@note_filters_bp.put('/<root_id>/note-filters/<filter_id>')
@token_required
def update_note_filter(current_user, root_id, filter_id):
    return _execute(lambda service: service.update(root_id, current_user.id, filter_id, _body()))


@note_filters_bp.delete('/<root_id>/note-filters/<filter_id>')
@token_required
def delete_note_filter(current_user, root_id, filter_id):
    return _execute(lambda service: service.delete(root_id, current_user.id, filter_id))
