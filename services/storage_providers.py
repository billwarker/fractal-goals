"""Fixed-endpoint adapters. Never fetch a caller-supplied URL or follow redirects."""
import json
import mimetypes
from typing import Any
from urllib.parse import quote, urlencode, urlparse

import requests

from services.storage_common import StorageError, provider_config

GOOGLE_SCOPE = 'https://www.googleapis.com/auth/drive.file'
DROPBOX_SCOPE = 'account_info.read files.metadata.read files.content.read files.content.write'
TIMEOUT = (5, 20)


def call(method, url, **kwargs):
    accepted = kwargs.pop('accepted_statuses', (200, 201, 206, 308, 416))
    forbidden = kwargs.pop('forbidden', None)  # Message when a 403 means "not allowed", not "reconnect".
    try:
        response = requests.request(method, url, timeout=TIMEOUT, allow_redirects=False, **kwargs)
    except requests.RequestException as exc:
        raise StorageError('Storage provider is temporarily unavailable. Try again.', 503, 'storage_unavailable') from exc
    if response.status_code == 403 and forbidden:
        response.close()
        raise StorageError(forbidden, 403, 'storage_forbidden')
    if response.status_code in (401, 403):
        response.close()
        raise StorageError('Reconnect storage or check the file permissions', 409, 'storage_reconnect')
    if response.status_code == 429:
        response.close()
        raise StorageError('Storage provider is busy. Try again later.', 429, 'storage_throttled')
    if response.status_code not in accepted:
        status = response.status_code
        response.close()
        raise StorageError('File unavailable or provider request failed', 404 if status in (404, 409, 410) else 502, 'storage_file_unavailable')
    return response


def json_call(method, url, **kwargs):
    with call(method, url, **kwargs) as response:
        try:
            payload = response.json()
            if not isinstance(payload, dict):
                raise StorageError('Invalid response from storage provider', 502)
            return payload
        except ValueError as exc:
            raise StorageError('Invalid response from storage provider', 502) from exc


def authorization_url(provider, redirect_uri, state, challenge):
    client_id, _ = provider_config(provider)
    params = {'client_id': client_id, 'redirect_uri': redirect_uri, 'response_type': 'code',
              'state': state, 'code_challenge': challenge, 'code_challenge_method': 'S256'}
    if provider == 'google_drive':
        params.update(scope=GOOGLE_SCOPE, access_type='offline', prompt='consent')
        base = 'https://accounts.google.com/o/oauth2/v2/auth'
    else:
        params.update(scope=DROPBOX_SCOPE, token_access_type='offline')
        base = 'https://www.dropbox.com/oauth2/authorize'
    return f'{base}?{urlencode(params)}'


def token_request(provider, **fields):
    client_id, secret = provider_config(provider)
    url = 'https://oauth2.googleapis.com/token' if provider == 'google_drive' else 'https://api.dropboxapi.com/oauth2/token'
    with call('POST', url, data={'client_id': client_id, 'client_secret': secret, **fields},
              accepted_statuses=(200, 400)) as response:
        try:
            payload = response.json()
        except ValueError as exc:
            raise StorageError('Invalid response from storage provider', 502) from exc
        if not isinstance(payload, dict):
            raise StorageError('Invalid response from storage provider', 502)
        if response.status_code == 400:
            # Only the standard error code is read; provider descriptions are never surfaced.
            if payload.get('error') == 'invalid_grant':
                raise StorageError('Access expired or was removed. Reconnect your storage account.', 409, 'storage_reconnect')
            raise StorageError('Storage provider rejected the request', 502)
        return payload


def headers(token):
    return {'Authorization': f'Bearer {token}'}


def account(provider, token):
    if provider == 'google_drive':
        data = json_call('GET', 'https://www.googleapis.com/drive/v3/about', headers=headers(token), params={'fields': 'user'})['user']
        return data['permissionId'], data.get('emailAddress', 'Google Drive')
    data = json_call('POST', 'https://api.dropboxapi.com/2/users/get_current_account', headers=headers(token))
    return data['account_id'], data.get('email', 'Dropbox')


def revoke(provider, token):
    """Revoke a grant. Google takes the refresh token, which ends the whole grant;
    Dropbox authenticates with a current access token."""
    url = 'https://oauth2.googleapis.com/revoke' if provider == 'google_drive' else 'https://api.dropboxapi.com/2/auth/token/revoke'
    # Revocation may return an empty body. The caller always destroys local credentials.
    with call('POST', url, **({'data': {'token': token}} if provider == 'google_drive' else {'headers': headers(token)})):
        pass


def metadata(provider, token, file_id, resource_key=None):
    auth = headers(token)
    if provider == 'google_drive':
        if resource_key:
            auth['X-Goog-Drive-Resource-Keys'] = f'{file_id}/{resource_key}'
        data = json_call('GET', f'https://www.googleapis.com/drive/v3/files/{file_id}', headers=auth,
                        params={'fields': 'id,name,mimeType,size,md5Checksum,headRevisionId,trashed,capabilities(canDownload)'})
        if data.get('trashed') or not data.get('capabilities', {}).get('canDownload', False):
            raise StorageError('This file is unavailable for download', 409)
        revision = data.get('md5Checksum') or data.get('headRevisionId')
        if not revision:
            raise StorageError('This file has no downloadable content revision', 409)
        return {'file_id': data['id'], 'name': data['name'], 'mime_type': data['mimeType'],
                'size_bytes': int(data.get('size', 0)), 'revision': revision}
    data = json_call('POST', 'https://api.dropboxapi.com/2/files/get_metadata', headers=auth, json={'path': file_id})
    return dropbox_metadata(data)


def dropbox_metadata(data):
    return {'file_id': data['id'], 'name': data['name'],
            'mime_type': mimetypes.guess_type(data['name'])[0] or 'application/octet-stream',
            'size_bytes': int(data.get('size', 0)), 'revision': data.get('content_hash') or data.get('rev', '')}


def rename(provider, token, file_id, name, resource_key=None):
    """Rename a file in place. Content, file ID and content hash are unchanged."""
    auth = headers(token)
    if provider == 'google_drive':
        if resource_key:
            auth['X-Goog-Drive-Resource-Keys'] = f'{file_id}/{resource_key}'
        data = json_call('PATCH', f'https://www.googleapis.com/drive/v3/files/{file_id}', headers=auth,
                         params={'fields': 'id,name'}, json={'name': name},
                         forbidden='You don’t have permission to rename this file in Google Drive.')
        return data['name']
    current = json_call('POST', 'https://api.dropboxapi.com/2/files/get_metadata', headers=auth, json={'path': file_id})
    folder = current['path_display'].rsplit('/', 1)[0]
    with call('POST', 'https://api.dropboxapi.com/2/files/move_v2', headers=auth,
              json={'from_path': file_id, 'to_path': f'{folder}/{name}', 'autorename': False},
              accepted_statuses=(200, 409)) as response:
        payload = response.json()
        if response.status_code == 409:
            raise StorageError('A file with that name already exists in this folder.', 409, 'storage_name_conflict')
        return payload['metadata']['name']


def trash(provider, token, file_id, resource_key=None):
    """Move a file to the provider's trash/deleted files, where the user can still restore it."""
    auth = headers(token)
    if provider == 'google_drive':
        if resource_key:
            auth['X-Goog-Drive-Resource-Keys'] = f'{file_id}/{resource_key}'
        json_call('PATCH', f'https://www.googleapis.com/drive/v3/files/{file_id}', headers=auth,
                  params={'fields': 'id'}, json={'trashed': True},
                  forbidden='Only the file’s owner can delete it from Google Drive.')
        return
    with call('POST', 'https://api.dropboxapi.com/2/files/delete_v2', headers=auth, json={'path': file_id},
              accepted_statuses=(200, 409)) as response:
        # Already deleted is the requested end state; any other conflict is a real failure.
        if response.status_code == 409 and 'not_found' not in str(response.json().get('error_summary', '')):
            raise StorageError('Dropbox couldn’t delete this file. Try again.', 409, 'storage_delete_failed')


def web_url(provider, file_id, resource_key=None, token=None):
    """The provider's own page for a file. Built from fixed hosts, never from caller input."""
    if provider == 'google_drive':
        url = f'https://drive.google.com/file/d/{quote(file_id, safe="")}/view'
        return f'{url}?resourcekey={quote(resource_key, safe="")}' if resource_key else url
    from config import config
    folder_root = f'https://www.dropbox.com/home/Apps/{quote(config.DROPBOX_APP_FOLDER)}'
    if not token:
        return folder_root
    try:
        path = json_call('POST', 'https://api.dropboxapi.com/2/files/get_metadata', headers=headers(token),
                         json={'path': file_id})['path_display']
    except (StorageError, KeyError):
        return folder_root  # Moved or deleted: the app folder is the best place to look.
    folder, _, name = path.rpartition('/')
    return f'{folder_root}{quote(folder)}?preview={quote(name)}'


def list_dropbox(token, cursor=None):
    endpoint = 'list_folder/continue' if cursor else 'list_folder'
    body = {'cursor': cursor} if cursor else {'path': '', 'recursive': True, 'limit': 100}
    data = json_call('POST', f'https://api.dropboxapi.com/2/files/{endpoint}', headers=headers(token), json=body)
    return {'files': [dropbox_metadata(row) for row in data['entries'] if row['.tag'] == 'file'],
            'cursor': data['cursor'] if data.get('has_more') else None}


def download(provider, token, file_id, resource_key=None, byte_range=None):
    auth = headers(token)
    if byte_range:
        auth['Range'] = byte_range
    if provider == 'google_drive':
        if resource_key:
            auth['X-Goog-Drive-Resource-Keys'] = f'{file_id}/{resource_key}'
        return call('GET', f'https://www.googleapis.com/drive/v3/files/{file_id}', headers=auth, params={'alt': 'media'}, stream=True)
    auth['Dropbox-API-Arg'] = json.dumps({'path': file_id})
    return call('POST', 'https://content.dropboxapi.com/2/files/download', headers=auth, stream=True)


def start_upload(provider, token, name, mime_type, size):
    if provider == 'google_drive':
        folders = json_call('GET', 'https://www.googleapis.com/drive/v3/files', headers=headers(token), params={
            'q': "trashed = false and mimeType = 'application/vnd.google-apps.folder' and appProperties has { key='fractalGoals' and value='media' }",
            'fields': 'files(id)', 'pageSize': 1,
        })['files']
        folder_id = folders[0]['id'] if folders else json_call('POST', 'https://www.googleapis.com/drive/v3/files',
            headers=headers(token), json={'name': 'Fractal Goals', 'mimeType': 'application/vnd.google-apps.folder',
                                         'appProperties': {'fractalGoals': 'media'}})['id']
        auth = {**headers(token), 'X-Upload-Content-Type': mime_type, 'X-Upload-Content-Length': str(size)}
        with call('POST', 'https://www.googleapis.com/upload/drive/v3/files', headers=auth,
                  params={'uploadType': 'resumable'}, json={'name': name, 'mimeType': mime_type, 'parents': [folder_id]}) as response:
            location = response.headers.get('Location', '')
            parsed = urlparse(location)
            if parsed.scheme != 'https' or parsed.netloc != 'www.googleapis.com' or not parsed.path.startswith('/upload/drive/'):
                raise StorageError('Invalid provider upload session', 502)
            return location
    return json_call('POST', 'https://content.dropboxapi.com/2/files/upload_session/start',
                     headers={**headers(token), 'Content-Type': 'application/octet-stream',
                              'Dropbox-API-Arg': json.dumps({'close': False})}, data=b'')['session_id']


def upload_status(provider, token, session, name, total, upload_id):
    if provider == 'google_drive':
        with call('PUT', session, headers={**headers(token), 'Content-Range': f'bytes */{total}'}, data=b'') as response:
            if response.status_code != 308:
                return total, response.json()['id']
            acknowledged = response.headers.get('Range', '')
            return int(acknowledged.rsplit('-', 1)[-1]) + 1 if acknowledged else 0, None
    try:
        data = json_call('POST', 'https://api.dropboxapi.com/2/files/get_metadata', headers=headers(token),
                         json={'path': f'/{upload_id}-{name}'})
        return total, data['id']
    except StorageError as exc:
        if exc.status != 404:
            raise
        return None, None


def upload_chunk(provider, token, session, name, mime_type, total, offset, body, upload_id):
    end = offset + len(body)
    if provider == 'google_drive':
        auth = {**headers(token), 'Content-Type': mime_type, 'Content-Range': f'bytes {offset}-{end - 1}/{total}'}
        with call('PUT', session, headers=auth, data=body) as response:
            if response.status_code == 308:
                acknowledged = response.headers.get('Range', '')
                confirmed = int(acknowledged.rsplit('-', 1)[-1]) + 1 if acknowledged else 0
                return confirmed, None
            return end, response.json()['id']
    final = end == total
    args: dict[str, Any] = {'cursor': {'session_id': session, 'offset': offset}}
    if final:
        args['commit'] = {'path': f'/{upload_id}-{name}', 'mode': 'add', 'autorename': False, 'mute': True}
    else:
        args['close'] = False
    endpoint = 'finish' if final else 'append_v2'
    with call('POST', f'https://content.dropboxapi.com/2/files/upload_session/{endpoint}',
              headers={**headers(token), 'Content-Type': 'application/octet-stream',
                       'Dropbox-API-Arg': json.dumps(args)}, data=body,
              accepted_statuses=(200, 409)) as response:
        if response.status_code == 409:
            correct = correct_offset(response.json())
            if correct is None:
                raise StorageError('Upload session unavailable. Choose the file again.', 409)
            return correct, None
        return end, response.json()['id'] if final else None


def correct_offset(value):
    if isinstance(value, dict):
        offset = value.get('correct_offset')
        if isinstance(offset, int) and not isinstance(offset, bool) and offset >= 0:
            return offset
        for child in value.values():
            result = correct_offset(child)
            if result is not None:
                return result
    return None
