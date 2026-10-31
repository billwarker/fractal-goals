"""Provider-independent storage validation and encrypted credential envelopes."""
import json
import re

from cryptography.fernet import Fernet, InvalidToken, MultiFernet

from config import config

PROVIDERS = ('google_drive', 'dropbox')
# Canonical type -> kind, accepted extensions and the other names browsers and providers use for it.
# Mirrored by client/src/utils/cloudUpload.js; both are checked against tests/fixtures/media_types.json.
MEDIA_TYPES = {
    'image/jpeg': {'kind': 'image', 'extensions': ('.jpg', '.jpeg'), 'aliases': ()},
    'image/png': {'kind': 'image', 'extensions': ('.png',), 'aliases': ()},
    'image/webp': {'kind': 'image', 'extensions': ('.webp',), 'aliases': ()},
    'image/gif': {'kind': 'image', 'extensions': ('.gif',), 'aliases': ()},
    'video/mp4': {'kind': 'video', 'extensions': ('.mp4',), 'aliases': ()},
    'video/webm': {'kind': 'video', 'extensions': ('.webm',), 'aliases': ()},
    'audio/mpeg': {'kind': 'audio', 'extensions': ('.mp3',), 'aliases': ('audio/mp3',)},
    'audio/mp4': {'kind': 'audio', 'extensions': ('.m4a',),
                  'aliases': ('audio/x-m4a', 'audio/m4a', 'audio/mp4a-latm', 'audio/aac')},
    'audio/wav': {'kind': 'audio', 'extensions': ('.wav',), 'aliases': ('audio/x-wav', 'audio/wave', 'audio/vnd.wave')},
    'audio/flac': {'kind': 'audio', 'extensions': ('.flac',), 'aliases': ('audio/x-flac',)},
    'audio/ogg': {'kind': 'audio', 'extensions': ('.ogg', '.opus'),
                  'aliases': ('audio/opus', 'audio/x-opus+ogg', 'application/ogg')},
}
SUPPORTED_TYPES_TEXT = 'a picture (JPEG, PNG, WebP, GIF), video (MP4, WebM) or audio (MP3, M4A, WAV, FLAC, OGG) file'
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


def canonical_media_type(mime_type, name=''):
    """The canonical type for a file whose extension matches it, or None.

    Aliases (`audio/x-m4a`) resolve to their canonical type; a missing or generic type falls back to
    the extension, as browsers leave `.flac` blank and Dropbox reports no type at all.
    """
    mime = (mime_type or '').strip().lower() if isinstance(mime_type, str) else ''
    lowered = name.lower() if isinstance(name, str) else ''
    for canonical, spec in MEDIA_TYPES.items():
        if not lowered.endswith(spec['extensions']):
            continue
        if mime in ('', 'application/octet-stream') or mime == canonical or mime in spec['aliases']:
            return canonical
    return None


def media_kind(mime_type):
    spec = MEDIA_TYPES.get(mime_type)
    return spec['kind'] if spec else None


def validate_file(name, mime_type, size):
    """Validate an attachable file and return its canonical media type."""
    if not isinstance(name, str) or not name.strip() or len(name) > 255 or re.search(r'[/\\\x00-\x1f]', name):
        raise StorageError('Use a file name without folders or control characters')
    canonical = canonical_media_type(mime_type, name)
    if not canonical:
        raise StorageError(f'Choose {SUPPORTED_TYPES_TEXT}', 415, 'media_type_unsupported')
    if not isinstance(size, int) or isinstance(size, bool) or not 0 < size <= config.STORAGE_MAX_FILE_BYTES:
        raise StorageError('The file exceeds the configured media size limit', 413, 'media_too_large')
    return canonical


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
        # An ID3 tag, or straight into an MPEG audio frame (11 sync bits).
        'audio/mpeg': head.startswith(b'ID3') or (len(head) > 1 and head[0] == 0xFF and head[1] & 0xE0 == 0xE0),
        'audio/mp4': head[4:8] == b'ftyp',
        'audio/wav': head[:4] == b'RIFF' and head[8:12] == b'WAVE',
        'audio/flac': head.startswith(b'fLaC'),
        'audio/ogg': head.startswith(b'OggS'),
    }
    if not matches.get(mime_type, False):
        raise StorageError('File contents do not match a supported picture, video or audio format', 415, 'media_type_unsupported')


def serialize_asset(asset):
    return {'id': asset.id, 'name': asset.name, 'mime_type': asset.mime_type,
            'size_bytes': asset.size_bytes, 'provider': asset.connection.provider,
            'available': asset.connection.status == 'active'}
