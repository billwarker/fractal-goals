"""Connection lifecycle: status, settings view, revocation and the user-facing OAuth return."""
import hashlib
import time
from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import pytest
from cryptography.fernet import Fernet
from sqlalchemy.exc import IntegrityError

from config import config
from models import StorageAuthorization, StorageConnection
from services import storage_providers as providers
from services.media_service import MediaService
from services.note_service import NoteService
from services.storage_common import StorageError, seal
from services.storage_connection_service import StorageConnectionService


@pytest.fixture
def connection(db_session, test_user, sample_ultimate_goal, monkeypatch):
    for key, value in {'STORAGE_ENCRYPTION_KEYS': Fernet.generate_key().decode(),
                       'GOOGLE_DRIVE_CLIENT_ID': 'client', 'GOOGLE_DRIVE_CLIENT_SECRET': 'secret',
                       'GOOGLE_PICKER_API_KEY': 'picker-key', 'GOOGLE_PICKER_APP_ID': 'project',
                       'DROPBOX_CLIENT_ID': 'db-client', 'DROPBOX_CLIENT_SECRET': 'db-secret',
                       'APP_BASE_URL': 'https://app.example.test'}.items():
        monkeypatch.setattr(config, key, value)
    row = StorageConnection(user_id=test_user.id, provider='google_drive', account_id='account-id',
                            account_label='user@example.test',
                            credentials=seal({'access_token': 'access-secret', 'refresh_token': 'refresh-secret',
                                              'expires_at': time.time() + 3600}))
    db_session.add(row)
    db_session.commit()
    return SimpleNamespace(db=db_session, user=test_user, root=sample_ultimate_goal, row=row,
                           service=StorageConnectionService(db_session))


def expire(conn, provider='google_drive', access='access-secret'):
    row = conn.db.query(StorageConnection).filter_by(user_id=conn.user.id, provider=provider).one()
    row.credentials = seal({'access_token': access, 'refresh_token': 'refresh-secret', 'expires_at': 0})
    conn.db.commit()
    return row


def provider_response(status, payload):
    return type('Response', (), {'status_code': status, 'json': lambda self: payload, 'close': lambda self: None,
                                 '__enter__': lambda self: self, '__exit__': lambda self, *args: None})()


def test_revoked_refresh_grant_requires_reconnect(connection, monkeypatch):
    expire(connection)
    monkeypatch.setattr(providers.requests, 'request', lambda *args, **kwargs: provider_response(400, {
        'error': 'invalid_grant', 'error_description': 'Token has been expired or revoked.'}))
    with pytest.raises(StorageError) as error:
        connection.service.access_token(connection.row.id, connection.user.id)
    assert error.value.code == 'storage_reconnect' and 'revoked' not in str(error.value)
    connection.db.refresh(connection.row)
    assert connection.row.status == 'reconnect_required' and connection.row.credentials is None
    google = connection.service.list_connections(connection.user.id)['providers'][0]
    assert google['status'] == 'reconnect_required' and google['connected'] is False


def test_other_token_errors_stay_provider_failures(connection, monkeypatch):
    expire(connection)
    monkeypatch.setattr(providers.requests, 'request', lambda *args, **kwargs: provider_response(400, {'error': 'invalid_client'}))
    with pytest.raises(StorageError) as error:
        connection.service.access_token(connection.row.id, connection.user.id)
    assert error.value.status == 502
    connection.db.refresh(connection.row)
    assert connection.row.status == 'active'


def test_google_disconnect_revokes_the_refresh_grant(connection, monkeypatch):
    revoked = []
    monkeypatch.setattr(providers, 'revoke', lambda provider, token: revoked.append((provider, token)))
    expire(connection)  # An expired access token must not prevent revoking the grant.
    connection.service.disconnect(connection.user.id, 'google_drive')
    assert revoked == [('google_drive', 'refresh-secret')]
    connection.db.refresh(connection.row)
    assert connection.row.status == 'disconnected' and connection.row.credentials is None


def test_dropbox_disconnect_refreshes_an_expired_access_token_before_revoking(connection, monkeypatch):
    connection.db.add(StorageConnection(user_id=connection.user.id, provider='dropbox', account_id='dbx',
                                        account_label='Dropbox', credentials=seal({})))
    connection.db.commit()
    expire(connection, 'dropbox', 'stale-access')
    revoked = []
    monkeypatch.setattr(providers, 'token_request', lambda *args, **kwargs: {'access_token': 'fresh-access'})
    monkeypatch.setattr(providers, 'revoke', lambda provider, token: revoked.append((provider, token)))
    connection.service.disconnect_all(connection.user.id)
    assert sorted(revoked) == [('dropbox', 'fresh-access'), ('google_drive', 'refresh-secret')]
    assert {row.status for row in connection.db.query(StorageConnection).all()} == {'disconnected'}


def test_remote_revocation_failure_still_disconnects(connection, monkeypatch):
    def unavailable(*args):
        raise StorageError('offline', 503)
    monkeypatch.setattr(providers, 'revoke', unavailable)
    connection.service.disconnect(connection.user.id, 'google_drive')
    connection.db.refresh(connection.row)
    assert connection.row.status == 'disconnected'
    with pytest.raises(StorageError):
        connection.service.connection(connection.user.id, 'google_drive')


def test_status_and_credentials_cannot_disagree(connection):
    connection.row.credentials = None
    with pytest.raises(IntegrityError):
        connection.db.commit()
    connection.db.rollback()


def test_settings_view_counts_live_attachments_and_hides_identifiers(connection, monkeypatch):
    metadata = {'file_id': 'file-1', 'name': 'a.jpg', 'mime_type': 'image/jpeg', 'size_bytes': 10, 'revision': '1'}
    monkeypatch.setattr(providers, 'metadata', lambda *args: dict(metadata))
    def download(*args):
        return type('R', (), {'__enter__': lambda self: self, '__exit__': lambda self, *a: None,
                              'iter_content': lambda self, **k: iter([b'\xff\xd8\xff' + bytes(29)])})()
    monkeypatch.setattr(providers, 'download', download)
    asset = MediaService(connection.db).import_file(connection.root.id, connection.user.id, 'google_drive', 'file-1')
    notes = []
    for content in ('Kept', 'Deleted'):
        note, error, _ = NoteService(connection.db).create_note(connection.root.id, connection.user.id, {
            'content': content, 'context_type': 'root', 'context_id': connection.root.id,
            'attachments': [{'asset_id': asset['id']}]})
        assert error is None
        notes.append(note)
    NoteService(connection.db).delete_note(connection.root.id, notes[1]['id'], connection.user.id)
    view = connection.service.list_connections(connection.user.id)
    google, dropbox = view['providers']
    assert google == {'provider': 'google_drive', 'configured': True, 'status': 'active', 'connected': True,
                      'account_label': 'user@example.test', 'connected_at': google['connected_at'],
                      'attachment_count': 1}
    assert dropbox['status'] == 'not_connected' and dropbox['attachment_count'] == 0
    assert view['limits'] == {'max_file_bytes': config.STORAGE_MAX_FILE_BYTES, 'max_attachments': 8}
    assert 'account-id' not in str(view) and 'secret' not in str(view)


def test_unconfigured_provider_is_unavailable(connection, monkeypatch):
    monkeypatch.setattr(config, 'DROPBOX_CLIENT_ID', '')
    dropbox = connection.service.list_connections(connection.user.id)['providers'][1]
    assert dropbox['status'] == 'unavailable' and dropbox['configured'] is False


def test_reconnecting_reactivates_and_records_scopes(connection, monkeypatch):
    connection.row.deactivate('reconnect_required')
    connection.db.commit()
    state = 'state-long-enough-for-validation'
    connection.db.add(StorageAuthorization(state_hash=hashlib.sha256(state.encode()).hexdigest(),
        user_id=connection.user.id, provider='google_drive', verifier=seal('verifier'),
        expires_at=datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=1)))
    connection.db.commit()
    monkeypatch.setattr(providers, 'token_request', lambda *args, **kwargs: {
        'access_token': 'a', 'refresh_token': 'r', 'scope': providers.GOOGLE_SCOPE})
    monkeypatch.setattr(providers, 'account', lambda *args: ('account-id', 'user@example.test'))
    connection.service.callback('google_drive', state, 'code')
    connection.db.refresh(connection.row)
    assert connection.row.status == 'active' and connection.row.scopes == providers.GOOGLE_SCOPE


@pytest.mark.parametrize('error,result', [
    (None, 'connected'),
    (StorageError('Storage authorization expired. Connect again.'), 'expired'),
    (StorageError('mismatch', 409, 'storage_account_mismatch'), 'account_mismatch'),
    (StorageError('scopes', 409, 'storage_permissions'), 'permissions'),
    (StorageError('down', 503, 'storage_unavailable'), 'unavailable'),
    (StorageError('Account unavailable <script>', 403), 'failed'),
])
def test_callback_redirects_to_an_allowlisted_result(connection, client, monkeypatch, error, result):
    from blueprints.storage_api import authorization_cookie
    def callback(self, provider, state, code):
        if error:
            raise error
    monkeypatch.setattr(StorageConnectionService, 'callback', callback)
    client.set_cookie(authorization_cookie('dropbox'), 'state-value-long-enough')
    response = client.get('/api/storage/dropbox/callback?state=state-value-long-enough&code=c')
    assert response.status_code == 303
    assert response.headers['Location'] == f'https://app.example.test/storage/connected?provider=dropbox&result={result}'
    assert 'Max-Age=0' in response.headers['Set-Cookie']


def test_callback_reports_provider_denial_without_reflecting_it(connection, client):
    response = client.get('/api/storage/google_drive/callback?error=access_denied&error_description=<b>no</b>&state=x')
    assert response.headers['Location'].endswith('provider=google_drive&result=cancelled')
    assert 'access_denied' not in response.headers['Location']


def test_callback_rejects_unknown_providers(connection, client):
    response = client.get('/api/storage/evil.example/callback?state=x')
    assert response.status_code == 404 and 'Location' not in response.headers


def test_http_settings_view(connection, authed_client):
    body = authed_client.get('/api/storage/connections').get_json()
    assert [item['provider'] for item in body['providers']] == ['google_drive', 'dropbox']
    assert authed_client.delete('/api/storage/evil/connection').status_code == 404


def test_upload_destination_defaults_to_first_connected_and_can_be_chosen(connection, authed_client):
    connection.db.add(StorageConnection(user_id=connection.user.id, provider='dropbox', account_id='dbx',
                                        account_label='Dropbox', credentials=seal({})))
    connection.db.commit()
    assert connection.service.list_connections(connection.user.id)['upload_destination'] == 'google_drive'
    response = authed_client.put('/api/storage/upload-destination', json={'provider': 'dropbox'})
    assert response.status_code == 200
    assert connection.service.list_connections(connection.user.id)['upload_destination'] == 'dropbox'
    # Switching back moves the single default instead of violating the partial unique index.
    connection.service.set_upload_destination(connection.user.id, 'google_drive')
    rows = {row.provider: row.upload_default for row in connection.db.query(StorageConnection).all()}
    assert rows == {'google_drive': True, 'dropbox': False}


def test_upload_destination_falls_back_when_the_chosen_account_disconnects(connection, monkeypatch):
    monkeypatch.setattr(providers, 'revoke', lambda *args: None)
    connection.db.add(StorageConnection(user_id=connection.user.id, provider='dropbox', account_id='dbx',
                                        account_label='Dropbox', credentials=seal({'access_token': 'a', 'refresh_token': 'r',
                                                                                   'expires_at': time.time() + 3600})))
    connection.db.commit()
    connection.service.set_upload_destination(connection.user.id, 'dropbox')
    connection.service.disconnect(connection.user.id, 'dropbox')
    assert connection.service.list_connections(connection.user.id)['upload_destination'] == 'google_drive'
    connection.service.disconnect(connection.user.id, 'google_drive')
    assert connection.service.list_connections(connection.user.id)['upload_destination'] is None


@pytest.mark.parametrize('body', [{'provider': 'evil'}, {}, {'provider': 'dropbox', 'extra': 1}])
def test_upload_destination_rejects_invalid_or_unconnected_providers(connection, authed_client, body):
    assert authed_client.put('/api/storage/upload-destination', json=body).status_code == 400
    assert authed_client.put('/api/storage/upload-destination', json={'provider': 'dropbox'}).status_code == 409
