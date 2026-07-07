"""
oEmbed proxy for note video embeds.

Currently only Instagram, which needs a Meta app access token to return official
embed HTML via the Graph API. The token is optional: when it is not configured
the service reports `configured=False` so the frontend silently falls back to
the plain `/embed` iframe. Successful responses are cached in-process with a
short TTL since oEmbed HTML for a given permalink changes rarely.

Outbound HTTP mirrors the pattern in services/landing_publish_service.py
(short timeout, RequestException guarded, never raises to the caller).
"""

import logging
import re
import time
from threading import Lock
from urllib.parse import urlparse

import requests

from config import config

logger = logging.getLogger(__name__)

_INSTAGRAM_HOSTS = {'instagram.com', 'www.instagram.com'}
_INSTAGRAM_PATH = re.compile(r'^/(p|reel|reels|tv)/[A-Za-z0-9_-]+/?$')
_GRAPH_OEMBED_URL = 'https://graph.facebook.com/v20.0/instagram_oembed'

_CACHE_TTL_SECONDS = 60 * 60  # 1 hour
_CACHE_MAX_ENTRIES = 256


class _TtlCache:
    """Tiny thread-safe TTL cache. Not an LRU; bounded by size with FIFO evict."""

    def __init__(self, ttl_seconds, max_entries):
        self._ttl = ttl_seconds
        self._max = max_entries
        self._store = {}
        self._lock = Lock()

    def get(self, key):
        with self._lock:
            entry = self._store.get(key)
            if not entry:
                return None
            value, expires_at = entry
            if time.monotonic() > expires_at:
                self._store.pop(key, None)
                return None
            return value

    def set(self, key, value):
        with self._lock:
            if len(self._store) >= self._max:
                # Drop the oldest inserted key.
                oldest = next(iter(self._store), None)
                if oldest is not None:
                    self._store.pop(oldest, None)
            self._store[key] = (value, time.monotonic() + self._ttl)


_instagram_cache = _TtlCache(_CACHE_TTL_SECONDS, _CACHE_MAX_ENTRIES)


def is_valid_instagram_permalink(url: str) -> bool:
    """Only allow canonical Instagram post/reel/tv permalinks (no other hosts)."""
    if not url or not isinstance(url, str):
        return False
    try:
        parsed = urlparse(url.strip())
    except ValueError:
        return False
    if parsed.scheme not in ('http', 'https'):
        return False
    if parsed.hostname not in _INSTAGRAM_HOSTS:
        return False
    return bool(_INSTAGRAM_PATH.match(parsed.path))


def get_instagram_oembed(url: str) -> dict:
    """
    Resolve an Instagram permalink to an oEmbed payload.

    Returns one of:
      {"configured": False}                         — no token; client falls back
      {"configured": True, "html": ..., ...}        — success
      {"configured": True, "error": "..."}          — upstream/validation failure

    Never raises: callers can treat any non-success as "fall back to /embed".
    """
    if not is_valid_instagram_permalink(url):
        return {"configured": True, "error": "invalid_instagram_url"}

    token = config.INSTAGRAM_OEMBED_TOKEN
    if not token:
        return {"configured": False}

    cached = _instagram_cache.get(url)
    if cached is not None:
        return cached

    try:
        response = requests.get(
            _GRAPH_OEMBED_URL,
            params={
                'url': url,
                'access_token': token,
                'omitscript': 'false',
            },
            timeout=2.5,
        )
        response.raise_for_status()
        data = response.json()
    except (requests.RequestException, ValueError):
        logger.warning("Instagram oEmbed request failed for %s", url, exc_info=True)
        # Do not cache failures — the post may become available or token refreshed.
        return {"configured": True, "error": "upstream_error"}

    result = {
        "configured": True,
        "html": data.get("html"),
        "width": data.get("width"),
        "height": data.get("height"),
        "author_name": data.get("author_name"),
        "thumbnail_url": data.get("thumbnail_url"),
    }
    _instagram_cache.set(url, result)
    return result
