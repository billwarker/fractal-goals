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
HEX_COLOR_RE = re.compile(r'^#[0-9A-Fa-f]{6}$')


# =============================================================================
# VALIDATION DECORATOR
# =============================================================================

def validate_request(schema_class, *, allow_empty_json: bool = False):
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
                if json_data is None and allow_empty_json:
                    json_data = {}

                if json_data is None:
                    return jsonify({
                        "error": "Invalid or missing JSON body",
                        "details": "Request must include a valid JSON body"
                    }), 400

                if not isinstance(json_data, dict):
                    return jsonify({
                        "error": "Validation failed",
                        "details": [{
                            "field": "",
                            "message": "Input should be a valid dictionary",
                            "type": "dict_type",
                        }],
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


def sanitize_note_content(value: str) -> str:
    """
    Sanitize note content, preserving newlines for markdown rendering.
    - Removes null bytes
    - Strips leading/trailing whitespace
    - Collapses multiple spaces on a single line (but preserves newlines)
    """
    if not value:
        return value
    value = value.replace('\x00', '')
    value = value.strip()
    # Collapse multiple spaces/tabs within each line, but keep newlines intact
    value = re.sub(r'[^\S\n]+', ' ', value)
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


def validate_session_template_data(template_data: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(template_data, dict):
        raise ValueError('template_data must be an object')

    normalized = dict(template_data)
    session_type = str(normalized.get('session_type') or 'normal').strip().lower()
    if session_type not in {'normal', 'quick'}:
        raise ValueError("template_data.session_type must be 'normal' or 'quick'")
    normalized['session_type'] = session_type

    template_color = normalized.get('template_color')
    if template_color in ('', None):
        normalized.pop('template_color', None)
    else:
        if not isinstance(template_color, str) or not HEX_COLOR_RE.match(template_color.strip()):
            raise ValueError('template_data.template_color must be a valid #RRGGBB hex color')
        normalized['template_color'] = template_color.strip()

    if session_type == 'normal':
        sections = normalized.get('sections')
        if not isinstance(sections, list) or len(sections) == 0:
            raise ValueError('normal templates must include at least one section')
        for section in sections:
            if not isinstance(section, dict):
                raise ValueError('each section must be an object')
            section_name = sanitize_string(section.get('name') or '')
            if not section_name:
                raise ValueError('each section must include a name')
            section_activities = None
            for key in ('activities', 'exercises', 'activity_ids'):
                if key in section:
                    section_activities = section.get(key)
                    break
            if section_activities is None:
                continue
            if not isinstance(section_activities, list):
                raise ValueError('section activities must be a list')
        quick_activities = normalized.get('activities')
        if isinstance(quick_activities, list) and len(quick_activities) > 0:
            raise ValueError('normal templates cannot define top-level activities')
    else:
        activities = normalized.get('activities')
        if not isinstance(activities, list) or not (1 <= len(activities) <= 5):
            raise ValueError('quick templates must include between 1 and 5 activities')
        sections = normalized.get('sections')
        if isinstance(sections, list) and len(sections) > 0:
            raise ValueError('quick templates cannot define sections')
        normalized.pop('sections', None)

    return normalized


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
    inherit_parent_activities: Optional[bool] = False
    allow_manual_completion: Optional[bool] = True
    track_activities: Optional[bool] = True
    session_id: Optional[str] = None  # If provided, link goal to session
    activity_definition_id: Optional[str] = None
    
    @model_validator(mode='after')
    def validate_parent_type_constraints(self):
        if self.type == 'MicroGoal' and not self.parent_id:
            raise ValueError("MicroGoal must have a parent_id")
        if self.type == 'NanoGoal' and not self.parent_id:
            raise ValueError("NanoGoal must have a parent_id")
        if self.type == 'MicroGoal' and self.deadline:
            raise ValueError("MicroGoal cannot have deadlines")
        if self.type == 'NanoGoal' and self.description:
            raise ValueError("NanoGoal cannot have a description")
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


class GoalFreezeSchema(BaseModel):
    """Schema for toggling the frozen state on a goal."""
    frozen: bool = True


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


# =============================================================================
# ACTIVITY SCHEMAS  
# =============================================================================

class ActivityInstanceCreateSchema(BaseModel):
    """Schema for creating an activity instance in a session."""
    session_id: Optional[str] = None
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


# =============================================================================
# FRACTAL METRIC SCHEMAS
# =============================================================================

VALID_INPUT_TYPES = {'number', 'integer', 'duration'}
VALID_PROGRESS_AGGREGATIONS = {'last', 'sum', 'max', 'yield'}


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


# =============================================================================
# NOTE SCHEMAS
# =============================================================================

class NoteCreateSchema(BaseModel):
    """Schema for creating a note."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    content: str = Field(..., min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    context_type: str = Field(..., pattern=r'^(root|goal|session|activity_instance|activity_definition)$')
    context_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    goal_id: Optional[str] = None
    nano_goal_id: Optional[str] = None
    set_index: Optional[int] = Field(None, ge=0)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        return sanitize_note_content(v)


class NoteUpdateSchema(BaseModel):
    """Schema for updating a note."""
    content: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    pin: Optional[bool] = None

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_note_content(v)


# =============================================================================
# ANALYTICS DASHBOARD SCHEMAS
# =============================================================================

def validate_dashboard_layout(value: Dict[str, Any]) -> Dict[str, Any]:
    if not isinstance(value, dict):
        raise ValueError('layout must be an object')

    required_keys = {'layout', 'window_states', 'selected_window_id', 'version'}
    missing = sorted(required_keys - set(value.keys()))
    if missing:
        raise ValueError(f"layout is missing required keys: {', '.join(missing)}")

    if not isinstance(value.get('layout'), dict):
        raise ValueError('layout.layout must be an object')
    if not isinstance(value.get('window_states'), dict):
        raise ValueError('layout.window_states must be an object')
    if not isinstance(value.get('selected_window_id'), str) or not value['selected_window_id'].strip():
        raise ValueError('layout.selected_window_id must be a non-empty string')
    if not isinstance(value.get('version'), int):
        raise ValueError('layout.version must be an integer')

    return value


class DashboardCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)
    layout: Dict[str, Any] = Field(...)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('layout')
    @classmethod
    def validate_layout(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_dashboard_layout(v)


class DashboardUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    layout: Optional[Dict[str, Any]] = None

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('layout')
    @classmethod
    def validate_layout(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return v
        return validate_dashboard_layout(v)

    @model_validator(mode='after')
    def require_at_least_one_field(self):
        if self.name is None and self.layout is None:
            raise ValueError('At least one of name or layout is required')
        return self


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



class ProgramDayCreateSchema(BaseModel):
    """Schema for adding a day to a program block."""
    model_config = ConfigDict(str_strip_whitespace=True)
    
    name: Optional[str] = Field(None, max_length=MAX_NAME_LENGTH)
    date: Optional[str] = None
    day_of_week: Optional[List[str]] = None
    template_id: Optional[str] = None
    template_ids: Optional[List[str]] = None
    note_condition: Optional[bool] = False
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
    note_condition: Optional[bool] = None
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

    @field_validator('description')
    @classmethod
    def sanitize_description(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_string(v)

    @field_validator('template_data')
    @classmethod
    def validate_template_data(cls, v: Dict[str, Any]) -> Dict[str, Any]:
        return validate_session_template_data(v)


class SessionTemplateFromSessionSchema(BaseModel):
    """Schema for creating a session template from a session."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: str = Field(..., min_length=1, max_length=MAX_NAME_LENGTH)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, v: str) -> str:
        return sanitize_string(v)


class SessionTemplateUpdateSchema(BaseModel):
    """Schema for updating a session template."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=1, max_length=MAX_NAME_LENGTH)
    description: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)
    template_data: Optional[Dict[str, Any]] = None

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

    @field_validator('template_data')
    @classmethod
    def validate_template_data(cls, v: Optional[Dict[str, Any]]) -> Optional[Dict[str, Any]]:
        if v is None:
            return v
        return validate_session_template_data(v)
