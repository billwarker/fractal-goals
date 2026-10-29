"""Provider protocol contracts against recorded-shape HTTP responses; no cloud account needed."""
import pytest
import requests

from services import storage_providers as providers
from services.storage_common import StorageError, verify_signature
from services.storage_monitoring import scrub_storage_event


@pytest.mark.parametrize('status,expected', [(401, 409), (403, 409), (404, 404), (429, 429), (500, 502), (302, 502)])
def test_provider_errors_do_not_expose_response_body(requests_mock, status, expected):
    requests_mock.get('https://api.example.test/file', status_code=status, text='secret-token-in-provider-error')
    with pytest.raises(StorageError) as error:
        providers.call('GET', 'https://api.example.test/file')
    assert error.value.status == expected
    assert 'secret-token' not in str(error.value)


def test_network_failure_degrades_without_logging_capabilities(requests_mock):
    requests_mock.get('https://api.example.test/file', exc=requests.Timeout)
    with pytest.raises(StorageError) as error:
        providers.call('GET', 'https://api.example.test/file')
    assert error.value.status == 503


def test_google_metadata_and_range_use_authorization_headers(requests_mock):
    endpoint = 'https://www.googleapis.com/drive/v3/files/file-id'
    requests_mock.get(endpoint, json={'id': 'file-id', 'name': 'photo.jpg', 'mimeType': 'image/jpeg',
                                   'size': '100', 'md5Checksum': 'checksum', 'capabilities': {'canDownload': True}})
    assert providers.metadata('google_drive', 'secret', 'file-id', 'resource-key')['size_bytes'] == 100
    assert requests_mock.last_request.headers['X-Goog-Drive-Resource-Keys'] == 'file-id/resource-key'
    with providers.download('google_drive', 'secret', 'file-id', 'resource-key', 'bytes=0-9'):
        assert requests_mock.last_request.headers['Range'] == 'bytes=0-9'
        assert requests_mock.last_request.headers['Authorization'] == 'Bearer secret'
        assert 'secret' not in requests_mock.last_request.url


def test_dropbox_does_not_use_temporary_links(requests_mock):
    requests_mock.post('https://content.dropboxapi.com/2/files/download', content=b'photo')
    with providers.download('dropbox', 'secret', 'id:file', None, 'bytes=-10'):
        assert requests_mock.last_request.headers['Range'] == 'bytes=-10'
        assert requests_mock.last_request.headers['Dropbox-API-Arg'] == '{"path": "id:file"}'


def test_dropbox_upload_recovers_correct_offset(requests_mock):
    requests_mock.post('https://content.dropboxapi.com/2/files/upload_session/append_v2', status_code=409,
                       json={'error': {'.tag': 'incorrect_offset', 'correct_offset': 1048576}})
    offset, file_id = providers.upload_chunk('dropbox', 'secret', 'session', 'a.mp4', 'video/mp4',
                                           2097152, 0, b'bytes', 'upload')
    assert offset == 1048576 and file_id is None


def test_google_upload_rejects_untrusted_session_location(requests_mock):
    requests_mock.get('https://www.googleapis.com/drive/v3/files', json={'files': [{'id': 'folder'}]})
    requests_mock.post('https://www.googleapis.com/upload/drive/v3/files', status_code=200,
                       headers={'Location': 'http://169.254.169.254/private'})
    with pytest.raises(StorageError, match='Invalid provider upload session'):
        providers.start_upload('google_drive', 'secret', 'a.mp4', 'video/mp4', 100)


def test_google_resumable_status_before_and_after_commit(requests_mock):
    url = 'https://www.googleapis.com/upload/drive/v3/files?upload_id=private'
    requests_mock.put(url, [{'status_code': 308, 'headers': {'Range': 'bytes=0-1048575'}},
                            {'status_code': 200, 'json': {'id': 'file'}}])
    assert providers.upload_status('google_drive', 'token', url, 'a.mp4', 2097152, 'upload') == (1048576, None)
    assert providers.upload_status('google_drive', 'token', url, 'a.mp4', 2097152, 'upload') == (2097152, 'file')


@pytest.mark.parametrize('mime,head', [('image/png', b'\x89PNG\r\n\x1a\n'), ('image/jpeg', b'\xff\xd8\xff'),
    ('image/webp', b'RIFFxxxxWEBP'), ('image/gif', b'GIF89a'), ('video/mp4', b'\0\0\0\x18ftyp'), ('video/webm', b'\x1a\x45\xdf\xa3')])
def test_signature_validation(mime, head):
    verify_signature(mime, head)
    with pytest.raises(StorageError):
        verify_signature(mime, b'<html>')


def test_storage_telemetry_drops_callbacks_and_capability_breadcrumbs():
    assert scrub_storage_event({'request': {'url': 'https://app.test/api/storage/google_drive/callback?code=secret'}}) is None
    event = {'request': {'url': 'https://app.test/api/goals'}, 'breadcrumbs': {'values': [
        {'data': {'url': 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret'}},
        {'data': {'url': 'https://app.test/api/goals'}},
    ]}}
    result = scrub_storage_event(event)
    assert len(result['breadcrumbs']['values']) == 1
    assert 'secret' not in str(result)


def test_storage_telemetry_filters_sdk_span_url_variants():
    result = scrub_storage_event({'spans': [
        {'data': {'http.url': 'https://www.googleapis.com/upload/drive/v3/files?upload_id=secret'}},
        {'description': 'PUT https://www.googleapis.com/upload/drive/v3/files?upload_id=secret'},
        {'data': {'url': 'https://www.googleapis.com/drive/v3/files/private-file-id'}},
        {'description': 'GET https://app.test/api/goals'},
    ]})
    assert result['spans'] == [{'description': 'GET https://app.test/api/goals'}]
    assert 'secret' not in str(result)


def test_telemetry_drops_token_bearing_instagram_oembed_breadcrumbs():
    result = scrub_storage_event({'breadcrumbs': {'values': [
        {'data': {'url': 'https://graph.facebook.com/v20.0/instagram_oembed',
                  'http.query': 'access_token=secret-graph-token'}},
        {'data': {'url': 'https://app.test/api/notes'}},
    ]}})
    assert result['breadcrumbs']['values'] == [{'data': {'url': 'https://app.test/api/notes'}}]
    assert 'secret' not in str(result)
