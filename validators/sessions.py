"""Session validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import MAX_NAME_LENGTH, MAX_DESCRIPTION_LENGTH, sanitize_string

class SessionCreateSchema(BaseModel):
    """Schema for creating a new session."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field('Untitled Session', max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)  # Max 24 hours
    session_start: Optional[str] = None
    session_end: Optional[str] = None
    total_duration_seconds: Optional[int] = Field(None, ge=0)
    template_id: Optional[str] = None
    parent_ids: Optional[List[str]] = None
    goal_ids: Optional[List[str]] = None
    parent_id: Optional[str] = None
    immediate_goal_ids: Optional[List[str]] = None
    session_data: Optional[Dict[str, Any]] = None
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> str:
        if v is None:
            return 'Untitled Session'
        return sanitize_string(v) or 'Untitled Session'
    
    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @model_validator(mode='after')
    def check_parent_linkage(self) -> 'SessionCreateSchema':
        # Ensure at least one way of linking to a parent goal is provided
        # OR it's template-backed
        # OR it's part of a program (indicated by program_context in session_data)
        
        is_program_linked = False
        if self.session_data and 'program_context' in self.session_data:
            is_program_linked = True

        if not any([self.parent_id, self.parent_ids, self.goal_ids, self.template_id, is_program_linked]):
             raise ValueError('Session must be linked to a parent goal, template, or program')
        return self


class QuickSessionMetricValueSchema(BaseModel):
    metric_id: str = Field(..., min_length=1)
    split_id: Optional[str] = None
    value: float


class QuickSessionSetSchema(BaseModel):
    instance_id: Optional[str] = None
    completed: Optional[bool] = False
    metrics: List[QuickSessionMetricValueSchema] = Field(default_factory=list)


class QuickSessionActivityInstanceSchema(BaseModel):
    activity_definition_id: str = Field(..., min_length=1)
    completed: Optional[bool] = False
    has_sets: Optional[bool] = False
    notes: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    metrics: List[QuickSessionMetricValueSchema] = Field(default_factory=list)
    sets: List[QuickSessionSetSchema] = Field(default_factory=list)

    @field_validator('notes')
    @classmethod
    def sanitize_notes(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


class QuickSessionCompleteSchema(SessionCreateSchema):
    activity_instances: List[QuickSessionActivityInstanceSchema] = Field(default_factory=list)




class SessionUpdateSchema(BaseModel):
    """Schema for updating an existing session."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    duration_minutes: Optional[int] = Field(None, ge=0, le=1440)
    completed: Optional[bool] = None
    session_start: Optional[str] = None
    session_end: Optional[str] = None
    total_duration_seconds: Optional[int] = Field(None, ge=0)
    template_id: Optional[str] = None
    session_data: Optional[Dict[str, Any]] = None


class SessionGoalAssociationSchema(BaseModel):
    """Schema for associating a goal with a session."""
    goal_id: str = Field(..., min_length=1)
    goal_type: Optional[str] = Field(
        'ImmediateGoal',
        pattern=r'^(UltimateGoal|LongTermGoal|MidTermGoal|ShortTermGoal|ImmediateGoal)$'
    )


