"""Provider-independent storage validation and encrypted credential envelopes."""
import json
import re

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from config import config

PROVIDERS = ('google_drive', 'dropbox')
MEDIA_TYPES = {
    'image/jpeg': ('.jpg', '.jpeg'), 'image/png': ('.png',), 'image/webp': ('.webp',),
    'image/gif': ('.gif',), 'video/mp4': ('.mp4',), 'video/webm': ('.webm',),
}
MAX_ATTACHMENTS = 8
CHUNK_BYTES = 1024 * 1024


class StorageError(Exception):
    def __init__(self, message, status=400, code='storage_error'):
        super().__init__(message)
        self.status = status
        self.code = code


def cipher():
    try:
        keys = [Fernet(key.strip().encode()) for key in config.STORAGE_ENCRYPTION_KEYS.split(',') if key.strip()]
        if not keys:
            raise ValueError('missing key')
        return MultiFernet(keys)
    except (ValueError, TypeError) as exc:
        raise StorageError('Cloud storage is not configured', 503, 'storage_unconfigured') from exc


def seal(value):
    return cipher().encrypt(json.dumps(value).encode()).decode()


def unseal(value):
    try:
        return json.loads(cipher().decrypt(value.encode()))
    except (InvalidToken, ValueError, AttributeError) as exc:
        raise StorageError('Reconnect your storage account', 409, 'storage_reconnect') from exc


def provider_config(provider):
    if provider not in PROVIDERS:
        raise StorageError('Unknown storage provider', 404)
    prefix = 'GOOGLE_DRIVE' if provider == 'google_drive' else 'DROPBOX'
    client_id = getattr(config, f'{prefix}_CLIENT_ID')
    secret = getattr(config, f'{prefix}_CLIENT_SECRET')
    if not client_id or not secret or not config.APP_BASE_URL:
        raise StorageError('Cloud storage is not configured', 503, 'storage_unconfigured')
    cipher()
    return client_id, secret


def validate_file(name, mime_type, size):
    if not isinstance(name, str) or not name.strip() or len(name) > 255 or re.search(r'[/\\\x00-\x1f]', name):
        raise StorageError('Use a file name without folders or control characters')
    extensions = MEDIA_TYPES.get(mime_type, ())
    if not extensions or not name.lower().endswith(extensions):
        raise StorageError('Choose a JPEG, PNG, WebP, GIF, MP4 or WebM file', 415, 'media_type_unsupported')
    if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= config.STORAGE_MAX_FILE_BYTES:
        raise StorageError('The file exceeds the configured media size limit', 413, 'media_too_large')


def validate_file_id(provider, file_id):
    pattern = r'[A-Za-z0-9_-]{1,255}' if provider == 'google_drive' else r'id:[A-Za-z0-9_-]{1,250}'
    if not isinstance(file_id, str) or not re.fullmatch(pattern, file_id):
        raise StorageError('Invalid provider file ID')


def verify_signature(mime_type, head):
    matches = {
        'image/jpeg': head.startswith(b'\xff\xd8\xff'),
        'image/png': head.startswith(b'\x89PNG\r\n\x1a\n'),
        'image/gif': head.startswith((b'GIF87a', b'GIF89a')),
        'image/webp': head[:4] == b'RIFF' and head[8:12] == b'WEBP',
        'video/mp4': head[4:8] == b'ftyp',
        'video/webm': head.startswith(b'\x1a\x45\xdf\xa3'),
    }
    if not matches.get(mime_type, False):
        raise StorageError('File contents do not match a supported picture or video format', 415, 'media_type_unsupported')


def serialize_asset(asset):
    return {'id': asset.id, 'name': asset.name, 'mime_type': asset.mime_type,
            'size_bytes': asset.size_bytes, 'provider': asset.connection.provider,
            'available': asset.connection.status == 'active'}
