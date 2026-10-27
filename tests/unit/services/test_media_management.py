"""Renaming and deleting originals in the user's storage, and the note references that follow."""
import time
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet

from config import config
from models import MediaAsset, Note, NoteAttachment, StorageConnection
from services import storage_providers as providers
from services.media_service import MediaService
from services.note_service import NoteService
from services.storage_common import StorageError, seal


@pytest.fixture
def media(db_session, test_user, sample_ultimate_goal, monkeypatch):
    for key, value in {'STORAGE_ENCRYPTION_KEYS': Fernet.generate_key().decode(),
                       'GOOGLE_DRIVE_CLIENT_ID': 'client', 'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
                       'DROPBOX_CLIENT_ID': 'db-client', 'DROPBOX_CLIENT_SECRET': 'db-secret',
                       'APP_BASE_URL': 'https://app.example.test'}.items():
        monkeypatch.setattr(config, key, value)
    row = StorageConnection(user_id=test_user.id, provider='google_drive', account_id='account', account_label='me',
                            credentials=seal({'access_token': 'token', 'refresh_token': 'refresh', 'expires_at': time.time() + 3600}))
    db_session.add(row)
    db_session.commit()
    calls = []
    monkeypatch.setattr(providers, 'rename', lambda provider, token, file_id, name, key=None: calls.append(('rename', file_id, name)) or name)
    monkeypatch.setattr(providers, 'trash', lambda provider, token, file_id, key=None: calls.append(('trash', file_id)))
    service = MediaService(db_session)
    asset = service.store_asset(sample_ultimate_goal.id, row.id, {
        'file_id': 'file-1', 'name': 'Pasted image.png', 'mime_type': 'image/png', 'size_bytes': 10, 'revision': 'r1'})
    db_session.commit()
    return SimpleNamespace(db=db_session, user=test_user, root=sample_ultimate_goal, connection=row, asset=asset,
                           service=service, calls=calls)


def note_with(media, asset_id, content='Evidence'):
    note, error, _ = NoteService(media.db).create_note(media.root.id, media.user.id, {
        'content': content, 'context_type': 'root', 'context_id': media.root.id, 'attachments': [{'asset_id': asset_id}]})
    assert error is None
    return note


def test_rename_updates_the_original_and_keeps_the_type(media):
    renamed = media.service.rename(media.root.id, media.user.id, media.asset.id, '  Handstand form.png ')
    assert renamed['name'] == 'Handstand form.png'
    assert media.calls == [('rename', 'file-1', 'Handstand form.png')]
    for bad in ('Handstand form.jpg', 'folder/name.png', ''):
        with pytest.raises(StorageError):
            media.service.rename(media.root.id, media.user.id, media.asset.id, bad)


def test_rename_without_change_does_not_call_the_provider(media):
    media.service.rename(media.root.id, media.user.id, media.asset.id, 'Pasted image.png')
    assert media.calls == []


def test_usage_and_delete_remove_the_file_from_every_note(media):
    first, second = note_with(media, media.asset.id, 'One'), note_with(media, media.asset.id, 'Two')
    NoteService(media.db).delete_note(media.root.id, second['id'], media.user.id)
    assert media.service.usage(media.root.id, media.user.id, media.asset.id) == {'notes': 1, 'goals': 0, 'provider': 'google_drive'}
    result = media.service.delete_from_storage(media.root.id, media.user.id, media.asset.id)
    assert result == {'deleted': True, 'notes_updated': 1, 'goals_updated': 0}
    assert media.calls == [('trash', 'file-1')]
    assert media.db.query(MediaAsset).count() == 0
    assert media.db.query(NoteAttachment).count() == 0
    assert media.db.get(Note, first['id']).content == 'One'  # The note itself stays.


def test_failed_provider_delete_keeps_references(media, monkeypatch):
    note_with(media, media.asset.id)
    def forbidden(*args):
        raise StorageError('Only the file’s owner can delete it from Google Drive.', 403, 'storage_forbidden')
    monkeypatch.setattr(providers, 'trash', forbidden)
    with pytest.raises(StorageError, match='owner'):
        media.service.delete_from_storage(media.root.id, media.user.id, media.asset.id)
    media.db.rollback()
    assert media.db.query(NoteAttachment).count() == 1


def test_other_users_cannot_rename_or_delete(media):
    for action in (lambda: media.service.rename(media.root.id, 'someone-else', media.asset.id, 'x.png'),
                   lambda: media.service.delete_from_storage(media.root.id, 'someone-else', media.asset.id),
                   lambda: media.service.usage('another-root', media.user.id, media.asset.id)):
        with pytest.raises(StorageError):
            action()
    assert media.calls == []


def test_http_routes(media, authed_client):
    base = f'/api/{media.root.id}/media/{media.asset.id}'
    assert authed_client.patch(base, json={'name': 'Form.png', 'extra': 1}).status_code == 400
    assert authed_client.patch(base, json={'name': 'Form.png'}).get_json()['name'] == 'Form.png'
    assert authed_client.get(f'{base}/usage').get_json() == {'notes': 0, 'goals': 0, 'provider': 'google_drive'}
    assert authed_client.delete(base).get_json() == {'deleted': True, 'notes_updated': 0, 'goals_updated': 0}
    assert authed_client.delete(base).status_code == 404


class FakeResponse:
    def __init__(self, status, payload):
        self.status_code, self.payload = status, payload
    def json(self): return self.payload
    def close(self): pass
    def __enter__(self): return self
    def __exit__(self, *args): pass


def test_provider_permission_denied_is_not_a_reconnect(monkeypatch):
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: FakeResponse(403, {}))
    with pytest.raises(StorageError) as error:
        providers.trash('google_drive', 'token', 'file-1')
    assert error.value.code == 'storage_forbidden'


def test_dropbox_rename_conflict_and_already_deleted(monkeypatch):
    responses = iter([FakeResponse(200, {'path_display': '/Apps/Fractal Goals/a.png'}),
                      FakeResponse(409, {'error_summary': 'to/conflict/file/'})])
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: next(responses))
    with pytest.raises(StorageError) as error:
        providers.rename('dropbox', 'token', 'id:abc', 'b.png')
    assert error.value.code == 'storage_name_conflict'
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: FakeResponse(409, {'error_summary': 'path_lookup/not_found/'}))
    providers.trash('dropbox', 'token', 'id:abc')  # Already gone is success.
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: FakeResponse(409, {'error_summary': 'path_write/disallowed_name/'}))
    with pytest.raises(StorageError):
        providers.trash('dropbox', 'token', 'id:abc')


def test_open_in_provider_links_to_the_original(media, authed_client, monkeypatch):
    base = f'/api/{media.root.id}/media/{media.asset.id}/open'
    response = authed_client.get(base)
    assert response.status_code == 302
    assert response.headers['Location'] == 'https://drive.google.com/file/d/file-1/view'
    media.asset.resource_key = 'rk_1'
    media.db.commit()
    assert authed_client.get(base).headers['Location'] == 'https://drive.google.com/file/d/file-1/view?resourcekey=rk_1'
    assert authed_client.get(f'/api/{media.root.id}/media/missing/open').status_code == 404
    with pytest.raises(StorageError):
        media.service.web_url(media.root.id, 'someone-else', media.asset.id)


def test_dropbox_links_use_the_current_path_or_fall_back_to_the_app_folder(monkeypatch):
    monkeypatch.setattr(config, 'DROPBOX_APP_FOLDER', 'Fractal Goals')
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: FakeResponse(200, {'path_display': '/Lessons/Run 1.mp4'}))
    assert providers.web_url('dropbox', 'id:abc', token='t') == \
        'https://www.dropbox.com/home/Apps/Fractal%20Goals/Lessons?preview=Run%201.mp4'
    monkeypatch.setattr(providers.requests, 'request', lambda *a, **k: FakeResponse(409, {'error_summary': 'path/not_found/'}))
    assert providers.web_url('dropbox', 'id:abc', token='t') == 'https://www.dropbox.com/home/Apps/Fractal%20Goals'
    assert providers.web_url('dropbox', 'id:abc') == 'https://www.dropbox.com/home/Apps/Fractal%20Goals'
