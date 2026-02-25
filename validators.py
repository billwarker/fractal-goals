"""
Pydantic Validation Schemas for Fractal Goals API

This module provides request validation for all API endpoints using Pydantic v2.
Schemas enforce:
- Required fields
- Data types (strings, integers, booleans, dates)
- String length limits
- Enum constraints
- Optional field handling

Usage in blueprints:
    from validators import validate_request, GoalCreateSchema
    
    @goals_bp.route('/goals', methods=['POST'])
    @validate_request(GoalCreateSchema)
    def create_goal(validated_data):
        # validated_data is a dict with validated and sanitized fields
        ...
"""

from datetime import datetime, date
from typing import Optional, List, Any, Dict
from functools import wraps
from flask import request, jsonify
from pydantic import BaseModel, Field, field_validator, model_validator, ValidationError, ConfigDict
import re
import logging

logger = logging.getLogger(__name__)


# =============================================================================
# CONFIGURATION
# =============================================================================

# Maximum string lengths to prevent abuse
MAX_NAME_LENGTH = 255
MAX_DESCRIPTION_LENGTH = 5000
MAX_RELEVANCE_LENGTH = 2000


# =============================================================================
# VALIDATION DECORATOR
# =============================================================================

def validate_request(schema_class):
    """
    Decorator that validates request JSON against a Pydantic schema.
    
    Usage:
        @validate_request(GoalCreateSchema)
        def create_goal(validated_data):
            # validated_data is the validated dict
            ...
    
    On validation error, returns 400 with detailed error messages.
    """
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            try:
                json_data = request.get_json(silent=True)
                if json_data is None:
                    return jsonify({
                        "error": "Invalid or missing JSON body",
                        "details": "Request must include a valid JSON body"
                    }), 400
                
                # Validate using Pydantic
                validated = schema_class(**json_data)
                
                # Convert to dict, excluding unset fields
                validated_dict = validated.model_dump(exclude_unset=True)
                
                # Pass validated data as first argument after route params
                return func(*args, validated_data=validated_dict, **kwargs)
                
            except ValidationError as e:
                # Format Pydantic errors for API response
                errors = []
                for error in e.errors():
                    field = ".".join(str(loc) for loc in error["loc"])
                    errors.append({
                        "field": field,
                        "message": error["msg"],
                        "type": error["type"]
                    })
                
                logger.warning(f"Validation error: {errors}")
                return jsonify({
                    "error": "Validation failed",
                    "details": errors
                }), 400
                
        return wrapper
    return decorator


# =============================================================================
# UTILITY FUNCTIONS
# =============================================================================

def sanitize_string(value: str) -> str:
    """
    Sanitize a string by:
    - Stripping leading/trailing whitespace
    - Removing null bytes
    - Normalizing whitespace
    """
    if not value:
        return value
    # Remove null bytes
    value = value.replace('\x00', '')
    # Strip whitespace
    value = value.strip()
    # Normalize internal whitespace (collapse multiple spaces)
    value = re.sub(r'\s+', ' ', value)
    return value


def parse_date_string(value: str) -> date:
    """Parse various date formats to a date object."""
    if not value:
        return None
    
    # Handle ISO datetime with time component
    if 'T' in value:
        value = value.split('T')[0]
    
    # Remove any timezone suffix
    value = value.replace('Z', '')
    
    return datetime.strptime(value, '%Y-%m-%d').date()


# =============================================================================
# AUTH SCHEMAS
# =============================================================================

def validate_strong_password(v: str) -> str:
    """Shared validator for password strength requirements."""
    if not re.search(r'[A-Z]', v):
        raise ValueError('Must contain at least one uppercase letter')
    if not re.search(r'[0-9]', v):
        raise ValueError('Must contain at least one digit')
    return v

class UserSignupSchema(BaseModel):
    """Schema for user registration."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    username: str = Field(..., min_length=3, max_length=80)
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    password: str = Field(..., min_length=8)
    
    @field_validator('username')
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)


class UserLoginSchema(BaseModel):
    """Schema for user login."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    username_or_email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=1)


class UserPreferencesUpdateSchema(BaseModel):
    """Schema for updating user preferences."""
    preferences: Dict[str, Any] = Field(...)


class UserPasswordUpdateSchema(BaseModel):
    """Schema for updating password."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)


class UserEmailUpdateSchema(BaseModel):
    """Schema for updating email."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    password: str = Field(..., min_length=1)  # Require password to change email


class UserUsernameUpdateSchema(BaseModel):
    """Schema for updating username."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    username: str = Field(..., min_length=3, max_length=80)
    password: str = Field(..., min_length=1)  # Require password to change username
    
    @field_validator('username')
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return sanitize_string(v)

class UserDeleteSchema(BaseModel):
    """Schema for deleting account."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    password: str = Field(..., min_length=1)  # Require password to delete account
    confirmation: str = Field(..., pattern=r'^DELETE$')

# =============================================================================
# GOAL SCHEMAS
# =============================================================================

VALID_GOAL_TYPES = [
    'UltimateGoal', 'LongTermGoal', 'MidTermGoal', 'ShortTermGoal',
    'ImmediateGoal', 'MicroGoal', 'NanoGoal'
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
    allow_manual_completion: Optional[bool] = True
    track_activities: Optional[bool] = True
    session_id: Optional[str] = None  # If provided, link goal to session
    
    @model_validator(mode='after')
    def validate_parent_type_constraints(self):
        if self.type == 'MicroGoal' and not self.parent_id:
            raise ValueError('MicroGoal must have a parent_id (ImmediateGoal)')
        if self.type == 'NanoGoal' and not self.parent_id:
            raise ValueError('NanoGoal must have a parent_id (MicroGoal)')
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
    allow_manual_completion: Optional[bool] = None
    track_activities: Optional[bool] = None
    
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


# =============================================================================
# SESSION SCHEMAS
# =============================================================================

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
        # OR it's part of a program (indicated by program_context in session_data)
        
        is_program_linked = False
        if self.session_data and 'program_context' in self.session_data:
            is_program_linked = True

        if not any([self.parent_id, self.parent_ids, self.goal_ids, is_program_linked]):
             raise ValueError('Session must be linked to at least one parent goal (parent_id, parent_ids, or goal_ids) or be part of a program')
        return self




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
        pattern=r'^(UltimateGoal|LongTermGoal|MidTermGoal|ShortTermGoal|ImmediateGoal|MicroGoal|NanoGoal)$'
    )


# =============================================================================
# ACTIVITY SCHEMAS  
# =============================================================================

class ActivityInstanceCreateSchema(BaseModel):
    """Schema for creating an activity instance in a session."""
    activity_definition_id: str = Field(..., min_length=1)
    instance_id: Optional[str] = None


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


class MetricDefinitionSchema(BaseModel):
    """Schema for a metric definition within an activity."""
    id: Optional[str] = None
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    unit: Optional[str] = Field(None, max_length=50)
    is_top_set_metric: Optional[bool] = False
    is_multiplicative: Optional[bool] = True
    is_active: Optional[bool] = True
    sort_order: Optional[int] = Field(None, ge=0)


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
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


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


class ActivityGoalsSetSchema(BaseModel):
    """Schema for setting goals associated with an activity."""
    goal_ids: List[str] = Field(default_factory=list)


class GroupReorderSchema(BaseModel):
    """Schema for reordering activity groups."""
    group_ids: List[str] = Field(..., min_length=1)


# =============================================================================
# NOTE SCHEMAS
# =============================================================================

class NoteCreateSchema(BaseModel):
    """Schema for creating a note."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    content: str = Field(..., min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    context_type: str = Field(..., pattern=r'^(session|activity_instance|set)$')
    context_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    set_index: Optional[int] = Field(None, ge=0)
    image_data: Optional[str] = None  # Base64 encoded image
    
    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        return sanitize_string(v)


class NoteUpdateSchema(BaseModel):
    """Schema for updating a note."""
    content: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    
    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)


# =============================================================================
# PROGRAM SCHEMAS
# =============================================================================

VALID_DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']

class ProgramCreateSchema(BaseModel):
    """Schema for creating a program."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    start_date: str = Field(...)  # Required
    end_date: str = Field(...)  # Required
    is_active: Optional[bool] = True
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
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    is_active: Optional[bool] = None
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


class ProgramBlockUpdateSchema(BaseModel):
    """Schema for updating a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    color: Optional[str] = Field(None, pattern=r'^#[0-9A-Fa-f]{6}$')
    goal_ids: Optional[List[str]] = None



class ProgramDayCreateSchema(BaseModel):
    """Schema for adding a day to a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    date: Optional[str] = None
    day_of_week: Optional[List[str]] = None
    template_id: Optional[str] = None
    template_ids: Optional[List[str]] = None
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


# =============================================================================
# TEMPLATE SCHEMAS
# =============================================================================

class SessionTemplateCreateSchema(BaseModel):
    """Schema for creating a session template."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    template_data: Dict[str, Any] = Field(...)
    
    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


class SessionTemplateUpdateSchema(BaseModel):
    """Schema for updating a session template."""
    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    template_data: Optional[Dict[str, Any]] = None
