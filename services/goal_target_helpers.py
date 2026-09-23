"""Shared timestamp normalization for goal-target read models."""

from datetime import timezone


def as_utc(value):
    if value is None:
        return None
    return value.astimezone(timezone.utc) if value.tzinfo else value.replace(tzinfo=timezone.utc)
