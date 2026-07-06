"""Note validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from .core import MAX_DESCRIPTION_LENGTH, sanitize_note_content

class NoteCreateSchema(BaseModel):
    """Schema for creating a note."""
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    
    content: str = Field(..., min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    context_type: str = Field(..., pattern=r'^(root|goal|session|program|activity_instance|activity_definition)$')
    context_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    goal_id: Optional[str] = None
    set_index: Optional[int] = Field(None, ge=0)
    note_kind: Optional[str] = Field(None, pattern=r'^(goal_completion)$')

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

