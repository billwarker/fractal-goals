import threading
import time
import json
from typing import Any, Dict, Optional

from services.events import event_bus, Event
from config import config


_LOCK = threading.Lock()
_ANALYTICS_BY_ROOT: Dict[str, Dict[str, Any]] = {}
_DEFAULT_TTL_SECONDS = 60
_REDIS_CLIENT = None


def _get_redis_client():
    global _REDIS_CLIENT
    storage_uri = config.RATELIMIT_STORAGE_URI
    if not storage_uri or storage_uri == "memory://" or not storage_uri.startswith(("redis://", "rediss://")):
        return None
    if _REDIS_CLIENT is not None:
        return _REDIS_CLIENT
    try:
        import redis
        _REDIS_CLIENT = redis.Redis.from_url(storage_uri, decode_responses=True)
        return _REDIS_CLIENT
    except Exception:
        return None


def _cache_key(root_id: str) -> str:
    return f"fractal-goals:analytics:{root_id}"


def get_analytics(root_id: str) -> Optional[dict]:
    redis_client = _get_redis_client()
    if redis_client:
        try:
            raw = redis_client.get(_cache_key(root_id))
            return json.loads(raw) if raw else None
        except Exception:
            pass

    now = time.time()
    with _LOCK:
        entry = _ANALYTICS_BY_ROOT.get(root_id)
        if not entry:
            return None
        if entry["expires_at"] <= now:
            _ANALYTICS_BY_ROOT.pop(root_id, None)
            return None
        return entry["payload"]


def set_analytics(root_id: str, payload: dict, ttl_seconds: int = _DEFAULT_TTL_SECONDS) -> None:
    ttl_seconds = max(1, ttl_seconds)
    redis_client = _get_redis_client()
    if redis_client:
        try:
            redis_client.setex(_cache_key(root_id), ttl_seconds, json.dumps(payload, default=str))
            return
        except Exception:
            pass

    with _LOCK:
        _ANALYTICS_BY_ROOT[root_id] = {
            "payload": payload,
            "expires_at": time.time() + ttl_seconds,
        }


def invalidate_root(root_id: str) -> None:
    redis_client = _get_redis_client()
    if redis_client:
        try:
            redis_client.delete(_cache_key(root_id))
        except Exception:
            pass

    with _LOCK:
        _ANALYTICS_BY_ROOT.pop(root_id, None)


def setup_analytics_cache_invalidation() -> None:
    def _invalidate_on_event(event: Event):
        root_id = event.data.get("root_id")
        if root_id:
            invalidate_root(root_id)

    invalidating_events = (
        "session.created",
        "session.updated",
        "session.completed",
        "session.deleted",
        "goal.created",
        "goal.updated",
        "goal.completed",
        "goal.uncompleted",
        "goal.deleted",
        "target.achieved",
        "target.reverted",
        "target.created",
        "target.deleted",
        "activity_instance.created",
        "activity_instance.updated",
        "activity_instance.completed",
        "activity_instance.deleted",
        "activity_instance.metrics_updated",
    )
    for event_name in invalidating_events:
        event_bus.subscribe(event_name, _invalidate_on_event)
