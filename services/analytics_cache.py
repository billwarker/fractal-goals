import threading
import time
from typing import Any, Dict, Optional

from services.events import event_bus, Event


_LOCK = threading.Lock()
_ANALYTICS_BY_ROOT: Dict[str, Dict[str, Any]] = {}
_DEFAULT_TTL_SECONDS = 60


def get_analytics(root_id: str) -> Optional[dict]:
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
    with _LOCK:
        _ANALYTICS_BY_ROOT[root_id] = {
            "payload": payload,
            "expires_at": time.time() + max(1, ttl_seconds),
        }


def invalidate_root(root_id: str) -> None:
    with _LOCK:
        _ANALYTICS_BY_ROOT.pop(root_id, None)


def setup_analytics_cache_invalidation() -> None:
    @event_bus.on("*")
    def _invalidate_on_event(event: Event):
        root_id = event.data.get("root_id")
        if root_id:
            invalidate_root(root_id)
