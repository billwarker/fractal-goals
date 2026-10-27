"""Storage ownership, OAuth replay, durable references and media lifecycle regressions."""
from datetime import datetime, timedelta, timezone
import hashlib
from types import SimpleNamespace
import time
from unittest.mock import MagicMock

from cryptography.fernet import Fernet
import pytest

from config import config
from models import Goal, MediaAsset, Note, NoteAttachment, StorageAuthorization, StorageConnection
from services import storage_providers as providers
from services.data_export_service import DataExportService
from services.media_service import MediaService
from services.media_stream import media_chunks, omit_private_media, stream_headers
from services.note_service import NoteService
from services.storage_common import StorageError, seal, unseal, validate_file
from services.storage_connection_service import StorageConnectionService


@pytest.fixture
def storage(db_session, test_user, sample_ultimate_goal, monkeypatch):
    for key, value in {'STORAGE_ENCRYPTION_KEYS': Fernet.generate_key().decode(),
                       'GOOGLE_DRIVE_CLIENT_ID': 'client', 'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
                       'GOOGLE_PICKER_API_KEY': 'picker-key', 'GOOGLE_PICKER_APP_ID': 'project',
                       'DROPBOX_CLIENT_ID': 'db-client', 'DROPBOX_CLIENT_SECRET': 'db-secret',
                       'APP_BASE_URL': 'https://app.example.test'}.items():
        monkeypatch.setattr(config, key, value)
    row = StorageConnection(user_id=test_user.id, provider='google_drive', account_id='account', account_label='user@example.test',
                            credentials=seal({'access_token': 'access-secret', 'refresh_token': 'refresh-secret',
                                              'expires_at': time.time() + 3600}))
    db_session.add(row)
    db_session.commit()
    metadata = {'file_id': 'file-123', 'name': 'practice.mp4', 'mime_type': 'video/mp4', 'size_bytes': 100, 'revision': '1'}
    monkeypatch.setattr(providers, 'metadata', lambda *args: dict(metadata))
    def download(*args):
        response = MagicMock()
        response.__enter__.return_value = response
        response.iter_content.return_value = iter([b'\x00\x00\x00\x18ftypisom' + bytes(20)])
        return response
    monkeypatch.setattr(providers, 'download', download)
    return SimpleNamespace(db=db_session, user=test_user, root=sample_ultimate_goal, connection=row, metadata=metadata)


def import_asset(storage):
    return MediaService(storage.db).import_file(storage.root.id, storage.user.id, 'google_drive', storage.metadata['file_id'])


def create_note(storage, attachments):
    return NoteService(storage.db).create_note(storage.root.id, storage.user.id, {
        'content': 'Evidence', 'context_type': 'root', 'context_id': storage.root.id, 'attachments': attachments,
    })


@pytest.mark.parametrize('mime,name', [('image/jpeg', 'a.jpg'), ('image/png', 'a.png'), ('image/webp', 'a.webp'),
                                      ('image/gif', 'a.gif'), ('video/mp4', 'a.mp4'), ('video/webm', 'a.webm')])
def test_supported_media(mime, name):
    validate_file(name, mime, 1)


@pytest.mark.parametrize('size', [0, -1, True, None, '100', 501 * 1024 * 1024])
def test_size_boundaries(size):
    with pytest.raises(StorageError):
        validate_file('a.jpg', 'image/jpeg', size)


@pytest.mark.parametrize('name,mime', [('a.svg', 'image/svg+xml'), ('a.html', 'text/html'), ('a.jpg', 'video/mp4'),
                                      ('../a.jpg', 'image/jpeg'), ('a\x00.jpg', 'image/jpeg'), ('', 'image/jpeg')])
def test_reject_active_content_and_invalid_names(name, mime):
    with pytest.raises(StorageError):
        validate_file(name, mime, 10)


def test_encryption_rotation_and_wrong_key(storage, monkeypatch):
    secret = seal({'refresh': 'do-not-leak'})
    assert 'do-not-leak' not in secret
    old_key = config.STORAGE_ENCRYPTION_KEYS
    monkeypatch.setattr(config, 'STORAGE_ENCRYPTION_KEYS', Fernet.generate_key().decode() + ',' + old_key)
    assert unseal(secret) == {'refresh': 'do-not-leak'}
    monkeypatch.setattr(config, 'STORAGE_ENCRYPTION_KEYS', Fernet.generate_key().decode())
    with pytest.raises(StorageError, match='Reconnect'):
        unseal(secret)


def test_import_deduplicates_and_rejects_replaced_evidence(storage):
    first = import_asset(storage)
    assert import_asset(storage)['id'] == first['id']
    storage.metadata['revision'] = '2'
    with pytest.raises(StorageError, match='source file changed'):
        import_asset(storage)


def test_import_and_attachment_ownership(storage):
    asset = import_asset(storage)
    with pytest.raises(StorageError):
        MediaService(storage.db).import_file(storage.root.id, 'different-user', 'google_drive', 'file-123')
    with pytest.raises(StorageError):
        MediaService(storage.db).validate_attachments('different-root', storage.user.id, [{'asset_id': asset['id']}])
    with pytest.raises(StorageError):
        MediaService(storage.db).validate_attachments(storage.root.id, 'different-user', [{'asset_id': asset['id']}])
    assert storage.db.query(MediaAsset).count() == 1


@pytest.mark.parametrize('count', [0, 1, 7, 8, 9])
def test_attachment_count_boundaries(storage, count):
    assets = []
    for index in range(count):
        storage.metadata['file_id'] = f'file-{index}'
        asset = import_asset(storage)
        assets.append({'asset_id': asset['id']})
    if count > 8:
        with pytest.raises(StorageError):
            MediaService(storage.db).validate_attachments(storage.root.id, storage.user.id, assets)
    else:
        assert len(MediaService(storage.db).validate_attachments(storage.root.id, storage.user.id, assets)) == count


def test_duplicate_attachment_rejected(storage):
    asset = import_asset(storage)
    with pytest.raises(StorageError):
        MediaService(storage.db).validate_attachments(storage.root.id, storage.user.id, [{'asset_id': asset['id']}] * 2)


def test_note_save_replace_and_soft_delete_gate_playback(storage):
    asset = import_asset(storage)
    # Not attached yet: its owner can preview it (e.g. before saving the note); nobody else can.
    assert MediaService(storage.db).playable_asset(storage.root.id, storage.user.id, asset['id']).id == asset['id']
    with pytest.raises(StorageError):
        MediaService(storage.db).playable_asset(storage.root.id, 'someone-else', asset['id'])
    payload, error, _ = create_note(storage, [{'asset_id': asset['id'], 'alt_text': 'First practice'}])
    assert error is None
    assert payload['attachments'][0]['alt_text'] == 'First practice'
    assert MediaService(storage.db).playable_asset(storage.root.id, storage.user.id, asset['id']).id == asset['id']
    NoteService(storage.db).delete_note(storage.root.id, payload['id'], storage.user.id)
    with pytest.raises(StorageError):
        MediaService(storage.db).playable_asset(storage.root.id, storage.user.id, asset['id'])
    assert storage.db.query(MediaAsset).count() == 1  # Removing a note never deletes the provider original.


def test_attachment_reorder_and_invalid_update_are_atomic(storage):
    first = import_asset(storage)
    storage.metadata['file_id'] = 'file-456'
    second = import_asset(storage)
    note, _, _ = create_note(storage, [{'asset_id': first['id']}, {'asset_id': second['id']}])
    result, error, _ = NoteService(storage.db).update_note(storage.root.id, note['id'], storage.user.id, {
        'attachments': [{'asset_id': second['id']}, {'asset_id': first['id']}],
    })
    assert error is None
    assert [asset['id'] for asset in result['attachments']] == [second['id'], first['id']]
    _, error, _ = NoteService(storage.db).update_note(storage.root.id, note['id'], storage.user.id, {
        'content': 'Should not save', 'attachments': [{'asset_id': 'missing'}],
    })
    assert error
    assert storage.db.get(Note, note['id']).content == 'Evidence'


def test_disconnect_destroys_local_secrets_even_if_provider_fails(storage, monkeypatch):
    def unavailable(*args):
        raise StorageError('offline', 503)
    monkeypatch.setattr(providers, 'revoke', unavailable)
    asset = import_asset(storage)
    create_note(storage, [{'asset_id': asset['id']}])
    StorageConnectionService(storage.db).disconnect(storage.user.id, 'google_drive')
    assert storage.connection.credentials is None
    assert storage.db.query(MediaAsset).count() == 1
    with pytest.raises(StorageError, match='Reconnect'):
        MediaService(storage.db).open_content(storage.root.id, storage.user.id, asset['id'])


def test_refresh_and_connection_serialization_do_not_expose_tokens(storage, monkeypatch):
    storage.connection.credentials = seal({'access_token': 'old', 'refresh_token': 'refresh-secret', 'expires_at': 0})
    storage.db.commit()
    calls = []
    def refresh(provider, **kwargs):
        calls.append(kwargs)
        return {'access_token': 'new-secret', 'expires_in': 3600}
    monkeypatch.setattr(providers, 'token_request', refresh)
    service = StorageConnectionService(storage.db)
    assert service.access_token(storage.connection.id, storage.user.id) == 'new-secret'
    assert service.access_token(storage.connection.id, storage.user.id) == 'new-secret'
    assert len(calls) == 1
    assert 'secret' not in str(service.list_connections(storage.user.id))


def test_oauth_state_consumed_once_and_bound_to_provider(storage, monkeypatch):
    state = 'state-long-enough-for-validation'
    storage.db.add(StorageAuthorization(state_hash=hashlib.sha256(state.encode()).hexdigest(),
        user_id=storage.user.id, provider='google_drive', verifier=seal('verifier'),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=1)))
    storage.db.commit()
    service = StorageConnectionService(storage.db)
    with pytest.raises(StorageError):
        service.callback('dropbox', state, 'code')
    monkeypatch.setattr(providers, 'token_request', lambda *args, **kwargs: {'access_token': 'a', 'refresh_token': 'r', 'scope': providers.GOOGLE_SCOPE})
    monkeypatch.setattr(providers, 'account', lambda *args: ('account', 'user@example.test'))
    service.callback('google_drive', state, 'code')
    with pytest.raises(StorageError):
        service.callback('google_drive', state, 'code')


def test_consent_cannot_restore_credentials_after_concurrent_erasure(storage, monkeypatch):
    from sqlalchemy.orm import Session
    from models import User
    state = 'state-long-enough-for-erasure-race'
    user_id = storage.user.id
    storage.db.add(StorageAuthorization(state_hash=hashlib.sha256(state.encode()).hexdigest(),
        user_id=user_id, provider='google_drive', verifier=seal('verifier'),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=1)))
    storage.db.commit()
    monkeypatch.setattr(providers, 'token_request', lambda *args, **kwargs: {
        'access_token': 'new', 'refresh_token': 'new-refresh', 'scope': providers.GOOGLE_SCOPE,
    })
    def account(*args):
        with Session(storage.db.get_bind()) as concurrent:
            concurrent.query(User).filter_by(id=user_id).update({'erasure_requested_at': datetime.now(timezone.utc)})
            concurrent.query(StorageConnection).filter_by(user_id=user_id).update({'credentials': None, 'status': 'disconnected'})
            concurrent.commit()
        return 'account', 'user@example.test'
    monkeypatch.setattr(providers, 'account', account)
    with pytest.raises(StorageError, match='Account unavailable'):
        StorageConnectionService(storage.db).callback('google_drive', state, 'code')
    storage.db.rollback()
    assert storage.db.query(StorageConnection).filter_by(user_id=user_id).one().credentials is None


def test_export_and_publication_boundaries(storage):
    asset = import_asset(storage)
    note, _, _ = create_note(storage, [{'asset_id': asset['id']}])
    exported, error, _ = DataExportService(storage.db).build_export(storage.user.id)
    assert error is None
    assert 'access-secret' not in str(exported) and 'refresh-secret' not in str(exported)
    assert exported['fractals'][0]['media_assets'][0]['file_id'] == 'file-123'
    published = omit_private_media({'goals': [{'notes': [note]}], 'timeline': {'attachments': [asset]}})
    assert 'attachments' not in str(published)
    assert 'attachments' in note


@pytest.mark.parametrize('range_value,forwarded', [('bytes=0-9', 'bytes=0-9'), ('bytes=10-', 'bytes=10-99'),
                                                    ('bytes=-20', 'bytes=-20'), (None, None)])
def test_content_revalidates_revision_and_forwards_range(storage, monkeypatch, range_value, forwarded):
    asset = import_asset(storage)
    create_note(storage, [{'asset_id': asset['id']}])
    observed = []
    monkeypatch.setattr(providers, 'download', lambda *args: observed.append(args) or 'response')
    _, response = MediaService(storage.db).open_content(storage.root.id, storage.user.id, asset['id'], range_value)
    assert response == 'response' and observed[0][-1] == forwarded
    storage.metadata['revision'] = '2'
    with pytest.raises(StorageError, match='source file changed'):
        MediaService(storage.db).open_content(storage.root.id, storage.user.id, asset['id'])


@pytest.mark.parametrize('range_value', ['bytes=0-1,3-4', 'evil', 'bytes=a-b', 'bytes=-', 'bytes=1--2'])
def test_invalid_ranges(storage, range_value):
    asset = import_asset(storage)
    create_note(storage, [{'asset_id': asset['id']}])
    with pytest.raises(StorageError) as error:
        MediaService(storage.db).open_content(storage.root.id, storage.user.id, asset['id'], range_value)
    assert error.value.status == 416


@pytest.mark.parametrize('status,headers,valid', [(200, {'Content-Length': '100'}, True),
    (206, {'Content-Length': '10', 'Content-Range': 'bytes 0-9/100'}, True),
    (416, {'Content-Range': 'bytes */100'}, True), (206, {}, False),
    (206, {'Content-Range': 'bytes 0-9/200'}, False), (200, {'Content-Length': '101'}, False)])
def test_stream_response_boundaries(status, headers, valid):
    response = SimpleNamespace(status_code=status, headers=headers, close=lambda: None)
    asset = SimpleNamespace(mime_type='video/mp4', size_bytes=100)
    if valid:
        assert stream_headers(asset, response)['Cache-Control'] == 'private, no-store'
    else:
        with pytest.raises(StorageError):
            stream_headers(asset, response)


def test_stream_bounds_and_closes_on_cancellation():
    closed = []
    response = SimpleNamespace(iter_content=lambda **kwargs: iter([b'ab', b'cd', b'ef']), close=lambda: closed.append(True))
    assert b''.join(media_chunks(response, 'asset', 4)) == b'abcd'
    assert closed == [True]
    stream = media_chunks(response, 'asset', 100)
    assert next(stream) == b'ab'
    stream.close()
    assert closed == [True, True]


def test_resumable_upload_recovers_lost_response_and_final_replay(storage, monkeypatch):
    from services.storage_common import CHUNK_BYTES
    from services.storage_upload_service import StorageUploadService
    service = StorageUploadService(storage.db)
    storage.metadata['size_bytes'] = CHUNK_BYTES + 32
    remote = {'offset': 0, 'lost': False}
    monkeypatch.setattr(providers, 'start_upload', lambda *args: 'https://www.googleapis.com/upload/drive/v3/files?upload_id=private')
    monkeypatch.setattr(providers, 'upload_status', lambda *args: (remote['offset'], None))
    def chunk(provider, token, session, name, mime, total, offset, body, upload_id):
        remote['offset'] = offset + len(body)
        if not remote['lost']:
            remote['lost'] = True
            raise StorageError('Response lost', 503)
        return remote['offset'], 'file-123' if remote['offset'] == total else None
    monkeypatch.setattr(providers, 'upload_chunk', chunk)
    upload = service.start(storage.root.id, storage.user.id, 'google_drive', 'practice.mp4', 'video/mp4', storage.metadata['size_bytes'])
    first = b'\x00\x00\x00\x18ftypisom' + bytes(CHUNK_BYTES - 12)
    with pytest.raises(StorageError):
        service.chunk(storage.root.id, storage.user.id, upload['id'], 0, first)
    storage.db.rollback()
    recovered = service.chunk(storage.root.id, storage.user.id, upload['id'], 0, first)
    assert recovered['offset'] == CHUNK_BYTES
    final = service.chunk(storage.root.id, storage.user.id, upload['id'], CHUNK_BYTES, bytes(32))
    assert final['asset']['id']
    replay = service.chunk(storage.root.id, storage.user.id, upload['id'], CHUNK_BYTES, bytes(32))
    assert replay['asset']['id'] == final['asset']['id']
    assert storage.db.query(MediaAsset).count() == 1


@pytest.mark.parametrize('offset,body', [(-1, b'x'), (0, b''), (1, b'x'), (0, b'<html>')])
def test_invalid_upload_chunks_do_not_reach_provider(storage, monkeypatch, offset, body):
    from services.storage_upload_service import StorageUploadService
    monkeypatch.setattr(providers, 'start_upload', lambda *args: 'session')
    service = StorageUploadService(storage.db)
    upload = service.start(storage.root.id, storage.user.id, 'google_drive', 'practice.mp4', 'video/mp4', 100)
    with pytest.raises(StorageError):
        service.chunk(storage.root.id, storage.user.id, upload['id'], offset, body)


def test_upload_cancel_and_cross_user_access(storage, monkeypatch):
    from models import StorageUpload
    from services.storage_upload_service import StorageUploadService
    monkeypatch.setattr(providers, 'start_upload', lambda *args: 'session')
    service = StorageUploadService(storage.db)
    upload = service.start(storage.root.id, storage.user.id, 'google_drive', 'practice.mp4', 'video/mp4', 100)
    with pytest.raises(StorageError):
        service.cancel(storage.root.id, 'other-user', upload['id'])
    result = service.cancel(storage.root.id, storage.user.id, upload['id'])
    assert result['originals_preserved']
    assert storage.db.query(StorageUpload).count() == 0


def test_http_routes_validate_body_and_media_auth(storage, authed_client):
    root = storage.root.id
    assert authed_client.post(f'/api/{root}/media', json={'provider': 'google_drive', 'file_id': '../bad'}).status_code == 400
    assert authed_client.post(f'/api/{root}/media', json=['invalid']).status_code == 400
    imported = authed_client.post(f'/api/{root}/media', json={'provider': 'google_drive', 'file_id': 'file-123'})
    assert imported.status_code == 201
    asset = imported.get_json()
    created = authed_client.post(f'/api/{root}/notes', json={
        'content': 'HTTP evidence', 'context_type': 'root', 'context_id': root,
        'attachments': [{'asset_id': asset['id'], 'alt_text': 'Practice'}],
    })
    assert created.status_code == 201
    note = created.get_json()
    assert note['attachments'][0]['alt_text'] == 'Practice'
    updated = authed_client.put(f'/api/{root}/notes/{note["id"]}', json={'attachments': []})
    assert updated.status_code == 200 and updated.get_json()['attachments'] == []
    # Media whose only note was deleted is no longer served.
    attached = authed_client.put(f'/api/{root}/notes/{note["id"]}', json={'attachments': [{'asset_id': asset['id']}]})
    assert attached.status_code == 200
    assert authed_client.delete(f'/api/{root}/notes/{note["id"]}').status_code in (200, 204)
    assert authed_client.get(f'/api/{root}/media/{asset["id"]}/content').status_code == 404


def test_http_connection_responses_are_private(storage, authed_client):
    response = authed_client.get('/api/storage/connections')
    assert response.status_code == 200
    assert response.headers['Cache-Control'] == 'private, no-store'
    assert 'refresh-secret' not in response.get_data(as_text=True)


def test_oauth_callback_requires_the_initiating_browser(storage, authed_client, client, monkeypatch):
    from urllib.parse import parse_qs, urlsplit
    from blueprints.storage_api import authorization_cookie
    monkeypatch.setattr(config, 'AUTH_COOKIE_SECURE', True)
    started = authed_client.post('/api/storage/google_drive/connect')
    assert started.status_code == 200
    cookie = started.headers['Set-Cookie']
    assert '__Host-fractal_storage_google_drive=' in cookie
    assert all(flag in cookie for flag in ('Secure', 'HttpOnly', 'SameSite=Lax', 'Path=/'))
    state = parse_qs(urlsplit(started.get_json()['url']).query)['state'][0]
    url = f'/api/storage/google_drive/callback?state={state}&code=provider-code'
    # A forwarded authorization URL must not connect its recipient's cloud account.
    client.delete_cookie(authorization_cookie('google_drive'))
    assert client.get(url).headers['Location'].endswith('result=wrong_browser')
    client.set_cookie(authorization_cookie('google_drive'), 'another-browser-state')
    assert client.get(url).headers['Location'].endswith('result=wrong_browser')
    assert storage.db.query(StorageAuthorization).count() == 1
    client.set_cookie(authorization_cookie('google_drive'), state)
    monkeypatch.setattr(providers, 'token_request', lambda *args, **kwargs: {
        'access_token': 'a', 'refresh_token': 'r', 'scope': providers.GOOGLE_SCOPE,
    })
    monkeypatch.setattr(providers, 'account', lambda *args: ('account', 'user@example.test'))
    completed = client.get(url)
    assert completed.status_code == 303
    assert completed.headers['Location'] == 'https://app.example.test/storage/connected?provider=google_drive&result=connected'
    assert 'Max-Age=0' in completed.headers['Set-Cookie']
    assert storage.db.query(StorageAuthorization).count() == 0


@pytest.mark.parametrize('status,body,content_range', [(200, bytes(100), None),
    (206, bytes(10), 'bytes 20-29/100'), (416, b'', 'bytes */100')])
def test_cookie_authenticated_streaming(storage, client, monkeypatch, status, body, content_range):
    import requests
    from tests.conftest import session_token_for
    asset = import_asset(storage)
    create_note(storage, [{'asset_id': asset['id']}])
    def download(*args):
        response = requests.Response()
        response.status_code = status
        response._content = body
        response._content_consumed = True
        response.headers['Content-Length'] = str(len(body))
        if content_range:
            response.headers['Content-Range'] = content_range
        return response
    monkeypatch.setattr(providers, 'download', download)
    client.set_cookie(config.AUTH_COOKIE_NAME, session_token_for(storage.user))
    response = client.get(f'/api/{storage.root.id}/media/{asset["id"]}/content',
                          environ_overrides={'HTTP_RANGE': 'bytes=20-29'} if status != 200 else {}, buffered=True)
    assert response.status_code == status
    assert response.data == body
    assert response.headers['Cache-Control'] == 'private, no-store'
    assert response.headers['Content-Type'] == 'video/mp4'


def test_erasure_disconnects_all_providers_and_blocks_reauthorization(storage, monkeypatch):
    storage.db.add(StorageConnection(user_id=storage.user.id, provider='dropbox', account_id='dbx', account_label='Dropbox',
                                     credentials=storage.connection.credentials))
    storage.db.commit()
    def unavailable(*args):
        raise StorageError('Provider unavailable', 503)
    monkeypatch.setattr(providers, 'revoke', unavailable)
    service = StorageConnectionService(storage.db)
    service.disconnect_all(storage.user.id)
    assert all(row.credentials is None for row in storage.db.query(StorageConnection).all())
    storage.user.erasure_requested_at = datetime.now(timezone.utc)
    storage.db.commit()
    with pytest.raises(StorageError, match='pending deletion'):
        service.start(storage.user.id, 'google_drive')


@pytest.mark.parametrize('offset', [None, '', 'evil', '-1', '999999999999999999'])
def test_http_upload_offset_validation(storage, authed_client, offset):
    response = authed_client.put(f'/api/{storage.root.id}/media/uploads/missing',
                                data=b'bytes', environ_overrides={'HTTP_UPLOAD_OFFSET': offset} if offset is not None else {})
    assert response.status_code == 400


MiB = 1024 * 1024


@pytest.mark.parametrize('requested,size,upstream', [
    (None, 100 * MiB, None),
    ('bytes=0-', 100 * MiB, f'bytes=0-{8 * MiB - 1}'),
    ('bytes=0-', 1000, 'bytes=0-999'),
    ('bytes=20-29', 100 * MiB, 'bytes=20-29'),
    (f'bytes=10-{50 * MiB}', 100 * MiB, f'bytes=10-{10 + 8 * MiB - 1}'),
    (f'bytes=-{20 * MiB}', 100 * MiB, f'bytes=-{8 * MiB}'),
    ('bytes=-500', 100 * MiB, 'bytes=-500'),
    ('bytes=5000-', 1000, 'bytes=5000-'),
])
def test_media_ranges_are_fetched_in_bounded_pieces(requested, size, upstream):
    # Cloud Run rejects responses over 32 MiB with a declared length, so a video is served in pieces.
    from services.media_stream import bounded_range
    assert bounded_range(requested, size) == upstream


def test_large_media_streams_in_pieces_and_full_files_go_out_chunked(storage, client, monkeypatch):
    import requests
    from services.media_stream import MAX_RANGE_BYTES
    from tests.conftest import session_token_for
    size = 40 * MiB
    asset = storage.db.query(MediaAsset).filter_by(id=import_asset(storage)['id']).one()
    asset.size_bytes = size
    storage.db.commit()
    monkeypatch.setattr(providers, 'metadata', lambda *args: {'revision': asset.revision, 'size_bytes': size,
                                                              'mime_type': asset.mime_type})
    create_note(storage, [{'asset_id': asset.id}])
    requested = []
    def download(provider, token, file_id, resource_key=None, byte_range=None):
        requested.append(byte_range)
        response = requests.Response()
        if byte_range:
            start, end = map(int, byte_range.removeprefix('bytes=').split('-'))
            response.status_code, response._content = 206, bytes(end - start + 1)
            response.headers['Content-Range'] = f'bytes {start}-{end}/{size}'
        else:
            response.status_code, response._content = 200, bytes(size)
        response._content_consumed = True
        response.headers['Content-Length'] = str(len(response._content))
        return response
    monkeypatch.setattr(providers, 'download', download)
    client.set_cookie(config.AUTH_COOKIE_NAME, session_token_for(storage.user))
    url = f'/api/{storage.root.id}/media/{asset.id}/content'
    piece = client.get(url, headers={'Range': 'bytes=0-'})
    assert piece.status_code == 206 and requested[-1] == f'bytes=0-{MAX_RANGE_BYTES - 1}'
    assert piece.headers['Content-Range'] == f'bytes 0-{MAX_RANGE_BYTES - 1}/{size}'
    assert int(piece.headers['Content-Length']) == MAX_RANGE_BYTES
    full = client.get(url)
    assert full.status_code == 200 and 'Content-Length' not in full.headers and len(full.data) == size
