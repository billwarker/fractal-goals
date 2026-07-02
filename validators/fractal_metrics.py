"""Fractal metric validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, List
from pydantic import BaseModel, Field, field_validator, ConfigDict
from .core import (
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    VALID_INPUT_TYPES,
    VALID_PROGRESS_AGGREGATIONS,
    sanitize_string,
)

class FractalMetricCreateSchema(BaseModel):
    """Schema for creating a fractal-scoped metric definition."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    unit: str = Field(..., min_length=1, max_length=50)
    is_multiplicative: bool = True
    is_additive: bool = True
    input_type: str = 'number'
    default_value: Optional[float] = None
    higher_is_better: Optional[bool] = None
    predefined_values: Optional[List[float]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    default_progress_aggregation: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator('name', 'unit')
    @classmethod
    def sanitize_text(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('input_type')
    @classmethod
    def validate_input_type(cls, v: str) -> str:
        if v not in VALID_INPUT_TYPES:
            raise ValueError(f"input_type must be one of: {', '.join(sorted(VALID_INPUT_TYPES))}")
        return v

    @field_validator('default_progress_aggregation')
    @classmethod
    def validate_progress_aggregation(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in VALID_PROGRESS_AGGREGATIONS:
            raise ValueError(
                "default_progress_aggregation must be one of: "
                + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
            )
        return candidate

    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


class FractalMetricUpdateSchema(BaseModel):
    """Schema for updating a fractal-scoped metric definition."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    unit: Optional[str] = Field(None, min_length=1, max_length=50)
    is_multiplicative: Optional[bool] = None
    is_additive: Optional[bool] = None
    input_type: Optional[str] = None
    default_value: Optional[float] = None
    higher_is_better: Optional[bool] = None
    predefined_values: Optional[List[float]] = None
    min_value: Optional[float] = None
    max_value: Optional[float] = None
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    default_progress_aggregation: Optional[str] = None
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator('name', 'unit')
    @classmethod
    def sanitize_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('input_type')
    @classmethod
    def validate_input_type(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        if v not in VALID_INPUT_TYPES:
            raise ValueError(f"input_type must be one of: {', '.join(sorted(VALID_INPUT_TYPES))}")
        return v

    @field_validator('default_progress_aggregation')
    @classmethod
    def validate_progress_aggregation(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in VALID_PROGRESS_AGGREGATIONS:
            raise ValueError(
                "default_progress_aggregation must be one of: "
                + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
            )
        return candidate

    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


