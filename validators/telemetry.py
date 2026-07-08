"""Validation schemas for the product telemetry API."""
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, ConfigDict, Field


class TelemetryEventSchema(BaseModel):
    """A single client-side product event."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=80)
    path: Optional[str] = Field(None, max_length=1000)
    root_id: Optional[str] = Field(None, max_length=64)
    ts: Optional[str] = Field(None, max_length=40)
    props: Optional[Dict[str, Any]] = None


class TelemetryEventsSchema(BaseModel):
    """Batched product events; the service enforces the event-name allowlist."""
    events: List[TelemetryEventSchema] = Field(..., min_length=1, max_length=20)
