"""Program validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional, List, Any, Dict
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import (
    MAX_NAME_LENGTH,
    MAX_DESCRIPTION_LENGTH,
    sanitize_string,
    parse_date_string,
)

VALID_DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

class ProgramCreateSchema(BaseModel):
    """Schema for creating a program."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    start_date: str = Field(...)  # Required
    end_date: str = Field(...)  # Required
    weeklySchedule: Optional[List[Dict[str, Any]]] = None
    selectedGoals: Optional[List[str]] = None
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_dates(cls, v: Optional[str]) -> Optional[str]:
        if v is None: return v
        try:
            parse_date_string(v)
            return v
        except ValueError:
            raise ValueError('Invalid date format')

    @model_validator(mode='after')
    def validate_date_range(self) -> 'ProgramCreateSchema':
        if self.start_date and self.end_date:
            try:
                start = parse_date_string(self.start_date)
                end = parse_date_string(self.end_date)
                if start > end:
                    raise ValueError('end_date must be after or equal to start_date')
            except ValueError as e:
                # Re-raise date comparison errors
                if str(e).startswith('end_date'):
                    raise e
        return self

class ProgramUpdateSchema(BaseModel):
    """Schema for updating a program."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    weeklySchedule: Optional[List[Dict[str, Any]]] = None
    selectedGoals: Optional[List[str]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v:
            return sanitize_string(v)
        return v

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_dates(cls, v: Optional[str]) -> Optional[str]:
        if v is None: return v
        try:
            parse_date_string(v)
            return v
        except ValueError:
            raise ValueError('Invalid date format')

    @model_validator(mode='after')
    def validate_date_range(self) -> 'ProgramUpdateSchema':
        if self.start_date and self.end_date:
            try:
                start = parse_date_string(self.start_date)
                end = parse_date_string(self.end_date)
                if start > end:
                    raise ValueError('end_date must be after or equal to start_date')
            except ValueError as e:
                if str(e).startswith('end_date'):
                    raise e
        return self

class ProgramBlockSchema(BaseModel):
    """Schema for a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    goal_ids: Optional[List[str]] = None

    @model_validator(mode='before')
    @classmethod
    def normalize_date_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized = dict(data)
        if 'start_date' not in normalized and 'startDate' in normalized:
            normalized['start_date'] = normalized['startDate']
        if 'end_date' not in normalized and 'endDate' in normalized:
            normalized['end_date'] = normalized['endDate']
        return normalized


class ProgramBlockUpdateSchema(BaseModel):
    """Schema for updating a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    goal_ids: Optional[List[str]] = None

    @model_validator(mode='before')
    @classmethod
    def normalize_date_aliases(cls, data: Any) -> Any:
        if not isinstance(data, dict):
            return data

        normalized = dict(data)
        if 'start_date' not in normalized and 'startDate' in normalized:
            normalized['start_date'] = normalized['startDate']
        if 'end_date' not in normalized and 'endDate' in normalized:
            normalized['end_date'] = normalized['endDate']
        return normalized



class ProgramDayTemplateConfigSchema(BaseModel):
    """Completion metadata for a session template attached to a program day."""
    model_config = ConfigDict(str_strip_whitespace=True)

    template_id: str
    is_required: Optional[bool] = True
    order: Optional[int] = 0


class ProgramDayCreateSchema(BaseModel):
    """Schema for adding a day to a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    date: Optional[str] = None
    day_of_week: Optional[List[str]] = None
    template_id: Optional[str] = None
    template_ids: Optional[List[str]] = None
    template_configs: Optional[List[ProgramDayTemplateConfigSchema]] = None
    completion_min_templates: Optional[int] = Field(None, ge=1)
    cascade: Optional[bool] = False

    @field_validator('day_of_week')
    @classmethod
    def validate_day_of_week(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for day in v:
            if day not in VALID_DAYS_OF_WEEK:
                raise ValueError(f"Invalid day of week: {day}. Must be one of {VALID_DAYS_OF_WEEK}")
        return v


class ProgramDayUpdateSchema(BaseModel):
    """Schema for updating a program day."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    date: Optional[str] = None
    day_of_week: Optional[List[str]] = None
    template_ids: Optional[List[str]] = None
    template_configs: Optional[List[ProgramDayTemplateConfigSchema]] = None
    completion_min_templates: Optional[int] = Field(None, ge=1)
    cascade: Optional[bool] = False

    @field_validator('day_of_week')
    @classmethod
    def validate_day_of_week(cls, v: Optional[List[str]]) -> Optional[List[str]]:
        if v is None:
            return v
        for day in v:
            if day not in VALID_DAYS_OF_WEEK:
                raise ValueError(f"Invalid day of week: {day}. Must be one of {VALID_DAYS_OF_WEEK}")
        return v

class ProgramBlockGoalAttachSchema(BaseModel):
    """Schema for attaching a goal to a block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    goal_id: str = Field(..., min_length=1)
    deadline: Optional[str] = None
    
    @field_validator('deadline')
    @classmethod
    def validate_deadline(cls, v: Optional[str]) -> Optional[str]:
        if v is None or v == '': 
            return None
        try:
            parse_date_string(v)
            return v
        except ValueError:
            raise ValueError('Invalid date format')

class ProgramDayGoalAttachSchema(BaseModel):
    """Schema for attaching a goal to a program day."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    goal_id: str = Field(..., min_length=1)


class ProgramDayCopySchema(BaseModel):
    """Schema for copying a block day across blocks."""
    target_mode: Optional[str] = Field('all', pattern=r'^(all|selected)$')


class ProgramDayScheduleSchema(BaseModel):
    """Schema for scheduling an existing program day onto the calendar."""
    model_config = ConfigDict(str_strip_whitespace=True)

    session_start: str = Field(..., min_length=1)


class ProgramDayOccurrenceUnscheduleSchema(BaseModel):
    """Schema for unscheduling a program day occurrence on a specific local date."""
    model_config = ConfigDict(str_strip_whitespace=True)

    date: str = Field(..., min_length=1)
    timezone: Optional[str] = None

    @field_validator('date')
    @classmethod
    def validate_date(cls, v: str) -> str:
        parse_date_string(v)
        return v


class ProgramGoalDeadlineSchema(BaseModel):
    """Schema for setting a goal deadline through program calendar semantics."""
    model_config = ConfigDict(str_strip_whitespace=True)

    goal_id: str = Field(..., min_length=1)
    deadline: str = Field(..., min_length=1)

    @field_validator('deadline')
    @classmethod
    def validate_deadline(cls, v: str) -> str:
        parse_date_string(v)
        return v


