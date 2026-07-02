"""Analytics engine validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import (
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    sanitize_string,
    sanitize_note_content,
)

class AnalyticsQueryRunSchema(BaseModel):
    query_spec: Dict[str, Any] = Field(...)


class AnalyticsQueryProfileCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    query_spec: Dict[str, Any] = Field(...)
    visualization_spec: Optional[Dict[str, Any]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_note_content(v)


class AnalyticsQueryProfileUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    query_spec: Optional[Dict[str, Any]] = None
    visualization_spec: Optional[Dict[str, Any]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_note_content(v)

    @model_validator(mode='after')
    def require_at_least_one_field(self):
        if (
            self.name is None
            and self.description is None
            and self.query_spec is None
            and self.visualization_spec is None
        ):
            raise ValueError('At least one field is required')
        return self


