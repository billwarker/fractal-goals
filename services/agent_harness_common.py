"""Shared helpers for the delegated AI execution harness."""

import datetime as dt
import hashlib
import json

TASK_TTL_HOURS = 72
PROPOSAL_TTL_HOURS = 24
MAX_CONTEXT_GOALS = 200
MAX_CONTEXT_ACTIVITIES = 100
MAX_CONTEXT_PROGRAMS = 50
MAX_CONTEXT_TEMPLATES = 100


class AgentHarnessError(ValueError):
    def __init__(self, message, status=400, code="invalid_request"):
        super().__init__(message)
        self.message = message
        self.status = status
        self.code = code


def _canonical_json(value):
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), default=str)


def _digest(value):
    return hashlib.sha256(_canonical_json(value).encode("utf-8")).hexdigest()


def _aware(value):
    if value is None or value.tzinfo is not None:
        return value
    return value.replace(tzinfo=dt.timezone.utc)


def _iso(value):
    return value.isoformat().replace("+00:00", "Z") if value else None


def _model_data(model):
    return model.model_dump(mode="json", exclude_unset=True)
