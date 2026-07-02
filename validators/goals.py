"""Goal and fractal validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import (
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    MAX_RELEVANCE_LENGTH,
    VALID_PROGRESS_AGGREGATIONS,
    sanitize_string,
    parse_date_string,
)

VALID_GOAL_TYPES = [
    'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
    'ImmediateGoal'
]

VALID_ROOT_GOAL_TYPES = [
    'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal'
]


class TargetSchema(BaseModel):
    """Schema for a goal target."""
    model_config = ConfigDict(extra='allow')  # Allow additional fields for flexibility
    
    id: Optional[str] = None
    activity_id: Optional[str] = None
    metric_id: Optional[str] = None
    comparison: Optional[str] = Field(None, pattern=r'^(>=|<=|>|<|=|==)$')
    target_value: Optional[float] = None
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)


class GoalCreateSchema(BaseModel):
    """Schema for creating a new goal."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    type: str = Field(...)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    parent_id: Optional[str] = None
    deadline: Optional[str] = None
    targets: Optional[List[Dict[str, Any]]] = None
    relevance_statement: Optional[str] = Field(None, max_length=MAX_RELEVANCE_LENGTH)
    completed_via_children: Optional[bool] = False
    inherit_parent_activities: Optional[bool] = False
    allow_manual_completion: Optional[bool] = True
    track_activities: Optional[bool] = True
    session_id: Optional[str] = None  # If provided, link goal to session
    activity_definition_id: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_parent_type_constraints(self):
        return self
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)
    
    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('relevance_statement')
    @classmethod
    def sanitize_relevance(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)
    
    @field_validator('type')
    @classmethod
    def validate_goal_type(cls, v: str) -> str:
        if v not in VALID_GOAL_TYPES:
            raise ValueError(f"Invalid goal type. Must be one of: {', '.join(VALID_GOAL_TYPES)}")
        return v
    
    @field_validator('deadline')
    @classmethod
    def validate_deadline(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == '':
            return None
        try:
            # Validate it can be parsed
            parse_date_string(v)
            return v
        except ValueError:
            raise ValueError("Invalid deadline format. Use YYYY-MM-DD")


class GoalUpdateSchema(BaseModel):
    """Schema for updating an existing goal."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    deadline: Optional[str] = None
    parent_id: Optional[str] = None
    targets: Optional[List[Dict[str, Any]]] = None
    relevance_statement: Optional[str] = Field(None, max_length=MAX_RELEVANCE_LENGTH)
    completed: Optional[bool] = None
    completed_via_children: Optional[bool] = None
    inherit_parent_activities: Optional[bool] = None
    allow_manual_completion: Optional[bool] = None
    track_activities: Optional[bool] = None
    progress_settings: Optional[Dict[str, Any]] = None
    
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
        return sanitize_string(v)
    
    @field_validator('relevance_statement')
    @classmethod
    def sanitize_relevance(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('deadline')
    @classmethod
    def validate_deadline(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == '':
            return None
        try:
            # Validate it can be parsed
            parse_date_string(v)
            return v
        except ValueError:
            raise ValueError("Invalid deadline format. Use YYYY-MM-DD")

    @field_validator('progress_settings')
    @classmethod
    def validate_progress_settings(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return None
        if not isinstance(v, dict):
            raise ValueError("progress_settings must be an object")

        allowed_keys = {'enabled', 'default_aggregation', 'delta_display_mode'}
        unknown_keys = sorted(set(v.keys()) - allowed_keys)
        if unknown_keys:
            raise ValueError(
                "progress_settings only supports: " + ', '.join(sorted(allowed_keys))
            )

        normalized: Dict[str, Any] = {}

        if 'enabled' in v:
            enabled = v.get('enabled')
            if not isinstance(enabled, bool):
                raise ValueError("progress_settings.enabled must be a boolean")
            normalized['enabled'] = enabled

        if 'delta_display_mode' in v:
            ddm = v.get('delta_display_mode')
            if ddm in (None, ''):
                normalized['delta_display_mode'] = None
            elif ddm in ('percent', 'absolute'):
                normalized['delta_display_mode'] = ddm
            else:
                raise ValueError("progress_settings.delta_display_mode must be 'percent' or 'absolute'")

        if 'default_aggregation' in v:
            default_aggregation = v.get('default_aggregation')
            if default_aggregation in (None, ''):
                normalized['default_aggregation'] = None
            elif isinstance(default_aggregation, str):
                candidate = default_aggregation.strip().lower()
                if candidate not in VALID_PROGRESS_AGGREGATIONS:
                    raise ValueError(
                        "progress_settings.default_aggregation must be one of: "
                        + ', '.join(sorted(VALID_PROGRESS_AGGREGATIONS))
                    )
                normalized['default_aggregation'] = candidate
            else:
                raise ValueError("progress_settings.default_aggregation must be a string or null")

        return normalized


class GoalCompletionUpdateSchema(BaseModel):
    """Schema for toggling or explicitly setting goal completion."""
    completed: Optional[bool] = None
    session_id: Optional[str] = None


class GoalPauseSchema(BaseModel):
    """Schema for toggling the paused state on a goal."""
    paused: bool = True


class GoalMoveSchema(BaseModel):
    """Schema for moving a goal under a new parent."""
    new_parent_id: str = Field(..., min_length=1)


class GoalConvertLevelSchema(BaseModel):
    """Schema for converting a goal to a different level."""
    level_id: str = Field(..., min_length=1)


class GoalTargetCreateSchema(BaseModel):
    """Schema for creating a target on a goal."""
    model_config = ConfigDict(str_strip_whitespace=True)

    id: Optional[str] = None
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    activity_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    type: Optional[str] = None
    time_scope: Optional[str] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    linked_block_id: Optional[str] = None
    frequency_days: Optional[int] = Field(None, ge=0)
    frequency_count: Optional[int] = Field(None, ge=0)
    metrics: Optional[List[Dict[str, Any]]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('frequency_days', 'frequency_count', mode='before')
    @classmethod
    def empty_frequency_to_none(cls, v):
        if v == '':
            return None
        return v


class GoalTargetUpdateSchema(GoalTargetCreateSchema):
    """Schema for updating an existing target on a goal.

    All fields remain optional; only supplied fields are applied.
    """
    pass


class GoalTargetEvaluationSchema(BaseModel):
    """Schema for evaluating goal targets against a session."""
    session_id: str = Field(..., min_length=1)


class GoalAssociationBatchSchema(BaseModel):
    """Schema for replacing both direct activity and group associations for a goal."""
    activity_ids: List[str] = Field(default_factory=list)
    group_ids: List[str] = Field(default_factory=list)


class FractalCreateSchema(BaseModel):
    """Schema for creating a new fractal (root goal)."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    type: Optional[str] = Field('UltimateGoal')
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    relevance_statement: Optional[str] = Field(None, max_length=MAX_RELEVANCE_LENGTH)
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('relevance_statement')
    @classmethod
    def sanitize_relevance(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)
    
    @field_validator('type')
    @classmethod
    def validate_root_type(cls, v: Optional[str]) -> str:
        if v is None:
            return 'UltimateGoal'
        if v not in VALID_ROOT_GOAL_TYPES:
            raise ValueError(f"Invalid root goal type. Must be one of: {', '.join(VALID_ROOT_GOAL_TYPES)}")
        return v


