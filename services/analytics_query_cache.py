import hashlib
import json
import threading
import time
from typing import Any

from services.events import Event, event_bus


_LOCK = threading.Lock()
_CACHE: dict[str, dict[str, Any]] = {}
_DEFAULT_TTL_SECONDS = 45


def build_cache_key(user_id: str, query_spec: dict) -> str:
    normalized = json.dumps(query_spec, sort_keys=True, separators=(',', ':'), default=str)
    digest = hashlib.sha256(normalized.encode('utf-8')).hexdigest()
    return f"{user_id}:{digest}"


def get_cached_result(cache_key: str) -> dict | None:
    now = time.time()
    with _LOCK:
        entry = _CACHE.get(cache_key)
        if not entry:
            return None
        if entry["expires_at"] <= now:
            _CACHE.pop(cache_key, None)
            return None
        payload = dict(entry["payload"])
        metadata = dict(payload.get("metadata") or {})
        metadata["cache_hit"] = True
        payload["metadata"] = metadata
        return payload


def set_cached_result(cache_key: str, payload: dict, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
    with _LOCK:
        _CACHE[cache_key] = {
            "payload": payload,
            "expires_at": time.time() + max(1, ttl_seconds),
        }


def clear_cache() -> None:
    with _LOCK:
        _CACHE.clear()


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
