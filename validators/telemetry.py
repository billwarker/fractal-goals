"""Validation schemas for the product telemetry API.

These bound sizes only; services/tracking_plan.json owns which events and properties
are kept, and the services drop anything it doesn't list.
"""
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


class TelemetryContextSchema(BaseModel):
    """Sent once per batch: where the events came from, never who."""
    model_config = ConfigDict(str_strip_whitespace=True)

    visit_id: Optional[str] = Field(None, pattern=r'^[0-9a-f-]{36}$')
    app_version: Optional[str] = Field(None, max_length=40, pattern=r'^[A-Za-z0-9_.:+-]+$')


class TelemetryEventsSchema(BaseModel):
    """Batched product events; the service enforces the tracking plan."""
    events: List[TelemetryEventSchema] = Field(..., min_length=1, max_length=20)
    context: Optional[TelemetryContextSchema] = None


class PublicTelemetryEventSchema(BaseModel):
    """A single public-site event: no account, root or timestamp."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=80)
    props: Optional[Dict[str, Any]] = None


class PublicTelemetryContextSchema(BaseModel):
    """The page and how the visitor arrived. Only the referrer's host is kept."""
    model_config = ConfigDict(str_strip_whitespace=True)

    path: Optional[str] = Field(None, max_length=1000)
    referrer: Optional[str] = Field(None, max_length=2000)
    utm_source: Optional[str] = Field(None, max_length=200)
    utm_medium: Optional[str] = Field(None, max_length=200)
    utm_campaign: Optional[str] = Field(None, max_length=200)


class PublicTelemetryEventsSchema(BaseModel):
    events: List[PublicTelemetryEventSchema] = Field(..., min_length=1, max_length=10)
    context: Optional[PublicTelemetryContextSchema] = None
