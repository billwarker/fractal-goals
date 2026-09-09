"""Bounded local query caching; production reads stay fresh across workers.

A process-local event bus cannot invalidate every worker atomically. Production
and staging therefore bypass this optional development cache instead of promising
cross-worker freshness that a best-effort invalidation channel cannot provide.
"""

from collections import OrderedDict
import hashlib
import json
import threading
import time

from config import config
from services.events import Event, event_bus


_LOCK = threading.Lock()
_CACHE = OrderedDict()
_DEFAULT_TTL_SECONDS = 45
MAX_CACHE_ENTRIES = 128
MAX_CACHE_BYTES = 8 * 1024 * 1024
MAX_ENTRY_BYTES = 512 * 1024
_CACHE_BYTES = 0


def build_cache_key(user_id: str, query_spec: dict) -> str:
    normalized = json.dumps(query_spec, sort_keys=True, separators=(',', ':'), default=str)
    digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    return f"{user_id}:{digest}"


def _drop(key):
    global _CACHE_BYTES
    entry = _CACHE.pop(key)
    _CACHE_BYTES -= entry['size']


def _sweep(now):
    for key in list(_CACHE):
        if _CACHE[key]['expires_at'] <= now:
            _drop(key)


def get_cached_result(cache_key: str) -> dict | None:
    if config.ENV not in ('development', 'testing'):
        return None
    with _LOCK:
        _sweep(time.monotonic())
        entry = _CACHE.get(cache_key)
        if entry is None:
            return None
        _CACHE.move_to_end(cache_key)
        payload = json.loads(entry['payload'])
    payload['metadata'] = {**(payload.get('metadata') or {}), 'cache_hit': True}
    return payload


def set_cached_result(cache_key: str, payload: dict, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
    global _CACHE_BYTES
    if config.ENV not in ('development', 'testing'):
        return
    encoded = json.dumps(payload, separators=(',', ':'), default=str).encode('utf-8')
    size = len(encoded) + len(cache_key.encode('utf-8'))
    with _LOCK:
        now = time.monotonic()
        _sweep(now)
        if cache_key in _CACHE:
            _drop(cache_key)
        if size > min(MAX_ENTRY_BYTES, MAX_CACHE_BYTES):
            return
        while _CACHE and (len(_CACHE) >= MAX_CACHE_ENTRIES or _CACHE_BYTES + size > MAX_CACHE_BYTES):
            _drop(next(iter(_CACHE)))
        _CACHE[cache_key] = {'payload': encoded, 'size': size, 'expires_at': now + max(1, ttl_seconds)}
        _CACHE_BYTES += size


def clear_cache() -> None:
    global _CACHE_BYTES
    with _LOCK:
        _CACHE.clear()
        _CACHE_BYTES = 0


def setup_analytics_query_cache_invalidation() -> None:
    def _invalidate(_event: Event):
        clear_cache()

    for event_name in (
        "session.created",
        "session.updated",
        "session.completed",
        "session.deleted",
        "goal.created",
        "goal.updated",
        "goal.completed",
        "goal.uncompleted",
        "goal.deleted",
        "target.created",
        "target.updated",
        "target.deleted",
        "activity_instance.created",
        "activity_instance.updated",
        "activity_instance.completed",
        "activity_instance.deleted",
        "activity_instance.metrics_updated",
        "note.created",
        "note.updated",
        "note.deleted",
        "program.created",
        "program.updated",
        "program.deleted",
    ):
        event_bus.subscribe(event_name, _invalidate)
