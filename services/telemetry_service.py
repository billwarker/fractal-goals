"""First-party product telemetry.

Records curated frontend usage events (page views + key feature surfaces)
into ``product_events``. Domain actions (goal created, session completed, ...)
already live in ``event_logs``; telemetry intentionally tracks only UI surface
usage. ``services/tracking_plan.json`` is the contract: unknown names are dropped,
and so is any property it doesn't list or whose value has the wrong type.
"""
import datetime

import models
from models import ProductEvent, utc_now
from services.service_types import JsonDict, ServiceResult
from services.tracking_plan import APP_SURFACE, clean_props, event_for

# Account preference (user.preferences) that turns usage analytics off: the Privacy
# Policy's right to object. Absent means on.
USAGE_ANALYTICS_PREFERENCE = "usage_analytics"

MAX_BATCH_SIZE = 20
MAX_PATH_LENGTH = 255


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


def usage_analytics_enabled(user) -> bool:
    preferences = models._safe_load_json(getattr(user, "preferences", None), {})
    return not (isinstance(preferences, dict) and preferences.get(USAGE_ANALYTICS_PREFERENCE) is False)


def privacy_signal_present(headers) -> bool:
    """Global Privacy Control or Do Not Track sent with the request."""
    return headers.get("Sec-GPC") == "1" or headers.get("DNT") == "1"


class TelemetryService:
    def __init__(self, db_session):
        self.db_session = db_session

    def record_events(self, user_id: str, events, context=None) -> ServiceResult[JsonDict]:
        context = context or {}
        accepted = 0
        rejected = []
        for raw_event in list(events)[:MAX_BATCH_SIZE]:
            name = raw_event.get("name")
            event = event_for(name, APP_SURFACE)
            if event is None:
                rejected.append({"name": str(name)[:80], "reason": "unknown_event"})
                continue

            path = raw_event.get("path")
            if path:
                path = str(path)[:MAX_PATH_LENGTH]

            properties, dropped = clean_props(event, raw_event.get("props"))
            if dropped:
                rejected.append({"name": event.name, "reason": "invalid_props", "props": dropped})

            self.db_session.add(ProductEvent(
                user_id=user_id,
                event_name=event.name,
                schema_version=event.schema_version,
                path=path,
                root_id=raw_event.get("root_id") or None,
                properties=properties,
                client_ts=_parse_client_ts(raw_event.get("ts")),
                visit_id=context.get("visit_id"),
                surface=APP_SURFACE,
                app_version=context.get("app_version"),
                created_at=utc_now(),
            ))
            accepted += 1

        if accepted:
            self.db_session.commit()
        return {"accepted": accepted, "rejected": rejected}, None, 202
