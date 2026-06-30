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
from typing import Any, Dict
from functools import wraps
from flask import request, jsonify
from pydantic import ValidationError
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
            section['name'] = section_name
            default_group_id = section.get('default_activity_group_id')
            if default_group_id in ('', None):
                section.pop('default_activity_group_id', None)
            elif not isinstance(default_group_id, str):
                raise ValueError('section default_activity_group_id must be a string')
            else:
                stripped_group_id = default_group_id.strip()
                if stripped_group_id:
                    section['default_activity_group_id'] = stripped_group_id
                else:
                    section.pop('default_activity_group_id', None)
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
# SHARED ENUMS (used across multiple domains)
# =============================================================================

VALID_INPUT_TYPES = {'number', 'integer', 'duration'}
VALID_PROGRESS_AGGREGATIONS = {'last', 'sum', 'max', 'yield'}
