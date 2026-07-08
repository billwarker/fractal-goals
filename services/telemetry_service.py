"""First-party product telemetry.

Records curated frontend usage events (page views + key feature surfaces)
into ``product_events``. Domain actions (goal created, session completed, ...)
already live in ``event_logs``; telemetry intentionally tracks only UI surface
usage, so the event-name allowlist below is the cardinality contract for the
admin usage dashboard.
"""
import datetime
import json
import logging

from models import ProductEvent, utc_now
from services.service_types import JsonDict, ServiceResult

logger = logging.getLogger(__name__)

# Server-side allowlist: unknown names are dropped, never stored.
# page_view covers all route-level surfaces (goals, sessions, analytics, ...)
# via normalized paths; only non-route UI surfaces get their own event name.
# Domain actions (goal/session created, ...) already live in event_logs.
ALLOWED_EVENTS = frozenset({
    "page_view",
    "settings_opened",
})

MAX_BATCH_SIZE = 20
MAX_PATH_LENGTH = 255
MAX_PROPERTIES_BYTES = 1024
DEFAULT_RETENTION_DAYS = 180


def _parse_client_ts(raw):
    if not raw:
        return None
    try:
        parsed = datetime.datetime.fromisoformat(str(raw).replace("Z", "+00:00"))
    except (TypeError, ValueError):
        return None
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=datetime.timezone.utc)
    return parsed


class TelemetryService:
    def __init__(self, db_session):
        self.db_session = db_session

    def record_events(self, user_id: str, events) -> ServiceResult[JsonDict]:
        accepted = 0
        for raw_event in list(events)[:MAX_BATCH_SIZE]:
            name = raw_event.get("name")
            if name not in ALLOWED_EVENTS:
                continue

            path = raw_event.get("path")
            if path:
                path = str(path)[:MAX_PATH_LENGTH]

            properties = raw_event.get("props")
            if properties is not None:
                try:
                    if len(json.dumps(properties)) > MAX_PROPERTIES_BYTES:
                        properties = None
                except (TypeError, ValueError):
                    properties = None

            self.db_session.add(ProductEvent(
                user_id=user_id,
                event_name=name,
                path=path,
                root_id=raw_event.get("root_id") or None,
                properties=properties,
                client_ts=_parse_client_ts(raw_event.get("ts")),
                created_at=utc_now(),
            ))
            accepted += 1

        if accepted:
            self.db_session.commit()
        return {"accepted": accepted}, None, 202

    def prune(self, older_than_days: int = DEFAULT_RETENTION_DAYS) -> ServiceResult[JsonDict]:
        older_than_days = max(int(older_than_days), 30)
        cutoff = utc_now() - datetime.timedelta(days=older_than_days)
        deleted = self.db_session.query(ProductEvent).filter(
            ProductEvent.created_at < cutoff,
        ).delete(synchronize_session=False)
        self.db_session.commit()
        logger.info("Pruned %s product events older than %s days", deleted, older_than_days)
        return {"deleted": int(deleted), "older_than_days": older_than_days}, None, 200
