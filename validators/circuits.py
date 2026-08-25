from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .core import HEX_COLOR_RE, MAX_DESCRIPTION_LENGTH, MAX_NAME_LENGTH, sanitize_string
from services.circuit_rules import MAX_CIRCUIT_SLOTS


class CircuitSlotSchema(BaseModel):
    id: Optional[str] = None
    activity_definition_id: str = Field(..., min_length=1)


class CircuitDefinitionCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field("", max_length=MAX_DESCRIPTION_LENGTH)
    group_id: Optional[str] = None
    slots: List[CircuitSlotSchema] = Field(..., min_length=1, max_length=MAX_CIRCUIT_SLOTS)

    @field_validator("name", "description")
    @classmethod
    def clean_text(cls, value):
        return sanitize_string(value or "")


class CircuitDefinitionUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    group_id: Optional[str] = None
    slots: Optional[List[CircuitSlotSchema]] = Field(None, min_length=1, max_length=MAX_CIRCUIT_SLOTS)
    version: Optional[int] = Field(None, ge=1)

    @field_validator("name", "description")
    @classmethod
    def clean_text(cls, value):
        return sanitize_string(value) if value is not None else value


class CircuitRunCreateSchema(BaseModel):
    circuit_definition_id: str = Field(..., min_length=1)
    section_index: Optional[int] = Field(None, ge=0)
    item_index: Optional[int] = Field(None, ge=0)


class CircuitRunTimingUpdateSchema(BaseModel):
    time_start: Optional[str] = None
    time_stop: Optional[str] = None

    @model_validator(mode="after")
    def require_timing_field(self):
        if not self.model_fields_set.intersection({"time_start", "time_stop"}):
            raise ValueError("At least one timing field is required")
        return self


class CircuitMemberMetricSchema(BaseModel):
    metric_id: str = Field(..., min_length=1)
    split_id: Optional[str] = None
    value: float


class CircuitMemberMetricsUpdateSchema(BaseModel):
    metrics: List[CircuitMemberMetricSchema] = Field(default_factory=list, max_length=100)


class CircuitMemberMetricCascadeSchema(BaseModel):
    metric_id: str = Field(..., min_length=1)
    split_id: Optional[str] = None


class CircuitScopeTagMutationSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    color: Optional[str] = Field(None, max_length=7)
    assigned: bool = True

    @field_validator("name")
    @classmethod
    def clean_name(cls, value):
        return sanitize_string(value)

    @field_validator("color")
    @classmethod
    def validate_color(cls, value):
        if value in (None, ""):
            return None
        if not HEX_COLOR_RE.match(value):
            raise ValueError("color must be a valid #RRGGBB hex color")
        return value
