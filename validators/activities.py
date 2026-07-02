"""Activity validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, ConfigDict
from .core import (
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    VALID_PROGRESS_AGGREGATIONS,
    sanitize_string,
)

class ActivityInstanceCreateSchema(BaseModel):
    """Schema for creating an activity instance in a session."""
    session_id: Optional[str] = None
    activity_definition_id: str = Field(..., min_length=1)
    instance_id: Optional[str] = None
    section_index: Optional[int] = Field(None, ge=0)


class ActivityInstanceUpdateSchema(BaseModel):
    """Schema for updating an activity instance."""
    notes: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    completed: Optional[bool] = None
    
    @field_validator('notes')
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


class ActivityTimerStartSchema(BaseModel):
    """Schema for starting a timer when creation details may be provided."""
    session_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    target_duration_seconds: Optional[int] = None

    @field_validator('target_duration_seconds')
    @classmethod
    def validate_target_duration_seconds(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v <= 0:
            raise ValueError("target_duration_seconds must be greater than 0")
        return v


class TimerActivityInstanceManualUpdateSchema(BaseModel):
    """Schema for manual timer/activity-instance updates."""
    model_config = ConfigDict(str_strip_whitespace=True)

    session_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    time_start: Optional[str] = None
    time_stop: Optional[str] = None
    completed: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    sets: Optional[List[Dict[str, Any]]] = None
    target_duration_seconds: Optional[int] = None

    @field_validator('target_duration_seconds')
    @classmethod
    def validate_target_duration_seconds(cls, v: Optional[int]) -> Optional[int]:
        if v is None:
            return None
        if v <= 0:
            raise ValueError("target_duration_seconds must be greater than 0")
        return v

    @field_validator('notes')
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


class MetricValueSchema(BaseModel):
    """Schema for a single metric value."""
    metric_id: str = Field(..., min_length=1)
    split_id: Optional[str] = None
    value: float


class ActivityMetricsUpdateSchema(BaseModel):
    """Schema for updating activity metrics."""
    metrics: List[MetricValueSchema] = Field(default_factory=list)


class ActivityReorderSchema(BaseModel):
    """Schema for reordering activities in a session."""
    activity_ids: List[str] = Field(..., min_length=1)



class ActivityGroupCreateSchema(BaseModel):
    """Schema for creating an activity group."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    sort_order: Optional[int] = Field(None, ge=0)
    parent_id: Optional[str] = None
    goal_ids: Optional[list[str]] = None
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


class ActivityGroupUpdateSchema(BaseModel):
    """Schema for updating an activity group."""
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    sort_order: Optional[int] = Field(None, ge=0)
    parent_id: Optional[str] = None
    goal_ids: Optional[list[str]] = None


class MetricDefinitionSchema(BaseModel):
    """Schema for a metric definition within an activity."""
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    unit: Optional[str] = Field(None, max_length=50)
    is_best_set_metric: Optional[bool] = False
    is_multiplicative: Optional[bool] = True
    track_progress: Optional[bool] = True
    progress_aggregation: Optional[str] = None
    is_active: Optional[bool] = True
    sort_order: Optional[int] = Field(None, ge=0)

    @field_validator('progress_aggregation')
    @classmethod
    def validate_progress_aggregation(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in VALID_PROGRESS_AGGREGATIONS:
            raise ValueError(
                "progress_aggregation must be one of: "
                + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
            )
        return candidate


class SplitDefinitionSchema(BaseModel):
    """Schema for a split definition within an activity."""
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    order: Optional[int] = Field(None, ge=0)


class ActivityDefinitionCreateSchema(BaseModel):
    """Schema for creating an activity definition."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    group_id: Optional[str] = None
    has_sets: Optional[bool] = False
    has_metrics: Optional[bool] = False
    metrics_multiplicative: Optional[bool] = False
    has_splits: Optional[bool] = False
    metrics: Optional[List[Dict[str, Any]]] = None
    splits: Optional[List[Dict[str, Any]]] = None
    goal_ids: Optional[List[str]] = None
    track_progress: Optional[bool] = None
    progress_aggregation: Optional[str] = None
    delta_display_mode: Optional[str] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('progress_aggregation')
    @classmethod
    def validate_progress_aggregation(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in VALID_PROGRESS_AGGREGATIONS:
            raise ValueError(
                "progress_aggregation must be one of: "
                + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
            )
        return candidate

    @field_validator('delta_display_mode')
    @classmethod
    def validate_delta_display_mode(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in ('percent', 'absolute'):
            raise ValueError("delta_display_mode must be 'percent' or 'absolute'")
        return candidate


class ActivityDefinitionUpdateSchema(BaseModel):
    """Schema for updating an activity definition."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    group_id: Optional[str] = None
    has_sets: Optional[bool] = None
    has_metrics: Optional[bool] = None
    metrics_multiplicative: Optional[bool] = None
    has_splits: Optional[bool] = None
    metrics: Optional[List[Dict[str, Any]]] = None
    splits: Optional[List[Dict[str, Any]]] = None
    goal_ids: Optional[List[str]] = None
    track_progress: Optional[bool] = None
    progress_aggregation: Optional[str] = None
    delta_display_mode: Optional[str] = None

    @field_validator('progress_aggregation')
    @classmethod
    def validate_progress_aggregation(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in VALID_PROGRESS_AGGREGATIONS:
            raise ValueError(
                "progress_aggregation must be one of: "
                + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
            )
        return candidate

    @field_validator('delta_display_mode')
    @classmethod
    def validate_delta_display_mode(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ''):
            return None
        candidate = v.strip().lower()
        if candidate not in ('percent', 'absolute'):
            raise ValueError("delta_display_mode must be 'percent' or 'absolute'")
        return candidate


class ActivityGoalsSetSchema(BaseModel):
    """Schema for setting goals associated with an activity."""
    goal_ids: List[str] = Field(default_factory=list)


class GroupReorderSchema(BaseModel):
    """Schema for reordering activity groups."""
    group_ids: List[str] = Field(..., min_length=1)


