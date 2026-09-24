"""Strict UTC datetime coercion shared by the session lifecycle mixins.
"""

from datetime import datetime, timezone


def _parse_iso_datetime_strict(value) -> datetime | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise ValueError("must be an ISO-8601 string")
    parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
    return parsed.astimezone(timezone.utc) if parsed.tzinfo else parsed.replace(tzinfo=timezone.utc)


def _as_utc_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
