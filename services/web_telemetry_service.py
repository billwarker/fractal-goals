"""Anonymous public-site telemetry: landing page, live demo and waitlist.

Nothing is stored on the visitor's device and no identifier reaches the database. Unique
visitors are counted with ``visitor_day_hash``: SHA-256 of a daily salt, the request's IP
address, user agent and host. The salt lives in ``app_settings`` and is replaced on the
first request of each UTC day; the old one is overwritten, so once a day ends its hashes
can no longer be recomputed from an IP address, and two days' visits never match.
"""
from __future__ import annotations

import hashlib
import re
import secrets
from urllib.parse import urlsplit

from sqlalchemy.exc import IntegrityError

from models import AppSetting, WebEvent, utc_now
from services.service_types import JsonDict, ServiceResult
from services.tracking_plan import PUBLIC_SURFACE, clean_props, event_for

VISITOR_SALT_KEY = "web_visitor_salt"
MAX_PATH_LENGTH = 255
UTM_PATTERN = re.compile(r"[^a-z0-9_.:-]+")
UUID_SEGMENT = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.IGNORECASE)
# Crawlers and link previews are not visitors.
BOT_USER_AGENT = re.compile(r"bot|crawl|spider|slurp|preview|facebookexternalhit|lighthouse", re.IGNORECASE)


def normalize_utm(value) -> str | None:
    """Lowercase codes only, so a campaign name can't carry anything else."""
    if not isinstance(value, str):
        return None
    cleaned = UTM_PATTERN.sub("-", value.strip().lower()).strip("-")[:80]
    return cleaned or None


def referrer_host(referrer, own_host: str) -> str | None:
    """The referring site's host; nothing for direct visits or the site linking to itself."""
    if not isinstance(referrer, str) or not referrer:
        return None
    try:
        host = (urlsplit(referrer).hostname or "").lower()
    except ValueError:
        return None
    if not host or host == (own_host or "").split(":")[0].lower():
        return None
    return host[:255]


def normalize_public_path(path) -> str | None:
    """`/demo/<root id>/goals` → `/demo/:id/goals`; query strings and fragments dropped."""
    if not isinstance(path, str) or not path.startswith("/"):
        return None
    bare = path.split("?", 1)[0].split("#", 1)[0]
    segments = [":id" if UUID_SEGMENT.match(segment) else segment for segment in bare.split("/")]
    return "/".join(segments)[:MAX_PATH_LENGTH]


class WebTelemetryService:
    def __init__(self, db_session):
        self.db_session = db_session

    def record_events(self, events, context, *, client_ip: str, user_agent: str, host: str) -> ServiceResult[JsonDict]:
        if BOT_USER_AGENT.search(user_agent or ""):
            return {"accepted": 0, "rejected": []}, None, 202

        context = context or {}
        accepted_rows = []
        rejected = []
        for raw_event in events:
            event = event_for(raw_event.get("name"), PUBLIC_SURFACE)
            if event is None:
                rejected.append({"name": str(raw_event.get("name"))[:80], "reason": "unknown_event"})
                continue
            properties, dropped = clean_props(event, raw_event.get("props"))
            if dropped:
                rejected.append({"name": event.name, "reason": "invalid_props", "props": dropped})
            accepted_rows.append((event, properties))

        if accepted_rows:
            visitor_hash = self._visitor_day_hash(client_ip, user_agent, host)
            now = utc_now()
            for event, properties in accepted_rows:
                self.db_session.add(WebEvent(
                    event_name=event.name,
                    schema_version=event.schema_version,
                    path=normalize_public_path(context.get("path")),
                    properties=properties,
                    visitor_day_hash=visitor_hash,
                    referrer_host=referrer_host(context.get("referrer"), host),
                    utm_source=normalize_utm(context.get("utm_source")),
                    utm_medium=normalize_utm(context.get("utm_medium")),
                    utm_campaign=normalize_utm(context.get("utm_campaign")),
                    created_at=now,
                ))
            self.db_session.commit()
        return {"accepted": len(accepted_rows), "rejected": rejected}, None, 202

    def _visitor_day_hash(self, client_ip: str, user_agent: str, host: str) -> str:
        salt = self._daily_salt()
        material = "\x1f".join((salt, client_ip or "", user_agent or "", (host or "").lower()))
        return hashlib.sha256(material.encode("utf-8")).hexdigest()

    def _daily_salt(self) -> str:
        today = utc_now().date().isoformat()
        setting = self.db_session.get(AppSetting, VISITOR_SALT_KEY)
        if setting is not None and isinstance(setting.value, dict) and setting.value.get("date") == today:
            return setting.value["salt"]

        # The first request of the day rotates it; the row lock makes concurrent
        # workers agree on one salt rather than each writing their own.
        if setting is not None:
            setting = self.db_session.query(AppSetting).filter_by(key=VISITOR_SALT_KEY).with_for_update().one()
            if isinstance(setting.value, dict) and setting.value.get("date") == today:
                return setting.value["salt"]
            salt = secrets.token_hex(32)
            setting.value = {"date": today, "salt": salt}
            self.db_session.flush()
            return salt

        salt = secrets.token_hex(32)
        try:
            with self.db_session.begin_nested():
                self.db_session.add(AppSetting(key=VISITOR_SALT_KEY, value={"date": today, "salt": salt}))
            return salt
        except IntegrityError:
            # Another worker created it first: use theirs.
            self.db_session.expire_all()
            return self._daily_salt()
