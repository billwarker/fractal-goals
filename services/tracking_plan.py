"""The tracking plan: every product event the server will store, and its typed properties.

``tracking_plan.json`` beside this module is the single source of truth. The Privacy
Policy's event list, the client's call sites, and the stored rows are all checked against
it (tests/unit/services/test_tracking_plan.py, client/src/utils/__tests__/trackingPlan.test.js).
Properties are typed so that no free text a person wrote can reach analytics: strings are
only enum values or ``code`` identifiers.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

PLAN_PATH = Path(__file__).with_name("tracking_plan.json")
CODE_PATTERN = re.compile(r"^[A-Za-z0-9_.:-]{1,64}$")

APP_SURFACE = "app"
PUBLIC_SURFACE = "public"


@dataclass(frozen=True)
class TrackedEvent:
    name: str
    schema_version: int
    surface: str
    category: str
    props: dict[str, dict[str, Any]]


@lru_cache(maxsize=1)
def load_plan() -> dict[str, TrackedEvent]:
    raw = json.loads(PLAN_PATH.read_text(encoding="utf-8"))
    return {
        entry["name"]: TrackedEvent(
            name=entry["name"],
            schema_version=int(entry["schema_version"]),
            surface=entry["surface"],
            category=entry["category"],
            props=dict(entry.get("props") or {}),
        )
        for entry in raw["events"]
    }


def event_for(name, surface: str) -> TrackedEvent | None:
    event = load_plan().get(name) if isinstance(name, str) else None
    return event if event is not None and event.surface == surface else None


def _valid_value(spec: dict[str, Any], value) -> bool:
    if value is None:
        return bool(spec.get("nullable"))
    kind = spec["type"]
    if kind == "bool":
        return isinstance(value, bool)
    if kind == "int":
        # bool is an int subclass; True is not a count.
        return (
            isinstance(value, int) and not isinstance(value, bool)
            and spec.get("min", value) <= value <= spec.get("max", value)
        )
    if kind == "enum":
        return isinstance(value, str) and value in spec["values"]
    if kind == "code":
        return isinstance(value, str) and bool(CODE_PATTERN.match(value))
    return False


def clean_props(event: TrackedEvent, props) -> tuple[dict[str, Any] | None, list[str]]:
    """Keep only the plan's properties with valid values; return the names dropped."""
    if not isinstance(props, dict):
        return None, []
    kept: dict[str, Any] = {}
    dropped: list[str] = []
    for key, value in props.items():
        spec = event.props.get(key)
        if spec is not None and _valid_value(spec, value):
            kept[key] = value
        else:
            dropped.append(str(key)[:64])
    return kept or None, dropped
