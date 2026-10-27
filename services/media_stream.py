"""Bounded HTTP media streaming, independent of provider credentials and Flask state."""
import logging
import re
import time
from typing import Any, TypeVar

T = TypeVar("T")

import requests

from services.storage_common import StorageError

logger = logging.getLogger(__name__)


def stream_headers(asset, upstream):
    result = {'Content-Type': asset.mime_type, 'Cache-Control': 'private, no-store',
              'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'bytes',
              'Content-Disposition': 'inline', 'Referrer-Policy': 'no-referrer'}
    length = upstream.headers.get('Content-Length') if upstream.status_code != 416 else None
    if length is not None:
        if not length.isdigit() or int(length) > asset.size_bytes:
            upstream.close()
            raise StorageError('Invalid media length from provider', 502)
        result['Content-Length'] = length
    if upstream.status_code in (206, 416):
        content_range = upstream.headers.get('Content-Range', '')
        pattern = r'bytes \d+-\d+/\d+' if upstream.status_code == 206 else r'bytes \*/\d+'
        if not re.fullmatch(pattern, content_range) or int(content_range.rsplit('/', 1)[1]) != asset.size_bytes:
            upstream.close()
            raise StorageError('Invalid media range from provider', 502)
        result['Content-Range'] = content_range
        if upstream.status_code == 206:
            start, end = map(int, content_range.split(' ')[1].split('/')[0].split('-'))
            if not 0 <= start <= end < asset.size_bytes or (length is not None and int(length) != end - start + 1):
                upstream.close()
                raise StorageError('Invalid media range length from provider', 502)
    return result


def media_chunks(upstream, asset_id, limit):
    sent = 0
    deadline = time.monotonic() + 120
    try:
        for chunk in upstream.iter_content(chunk_size=64 * 1024):
            sent += len(chunk)
            if sent > limit or time.monotonic() > deadline:
                logger.warning('Media stream budget exceeded for asset %s', asset_id)
                return
            yield chunk
    except requests.RequestException:
        logger.warning('Media stream interrupted for asset %s', asset_id)
    finally:
        upstream.close()


def omit_private_media(value: T) -> T:
    """Publication boundary: no attachment identity or owner-authorized media leaves the app."""
    if isinstance(value, dict):
        result: Any = {key: omit_private_media(item) for key, item in value.items() if key != 'attachments'}
        return result
    if isinstance(value, list):
        items: Any = [omit_private_media(item) for item in value]
        return items
    return value
