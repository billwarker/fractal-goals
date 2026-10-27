"""Note validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from typing import Optional
from pydantic import BaseModel, Field, field_validator, ConfigDict
from .core import MAX_DESCRIPTION_LENGTH, sanitize_note_content


class NoteAttachmentSchema(BaseModel):
    model_config = ConfigDict(extra='forbid')
    asset_id: str = Field(min_length=1, max_length=255)
    alt_text: str = Field(default='', max_length=500)

class NoteCreateSchema(BaseModel):
    """Schema for creating a note."""
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    
    content: str = Field(..., min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    context_type: str = Field(
        ...,
        pattern=r'^(root|goal|session|program|activity_instance|activity_definition|circuit_run|circuit_round)$',
    )
    context_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    goal_id: Optional[str] = None
    activity_set_id: Optional[str] = None
    note_kind: Optional[str] = Field(None, pattern=r'^(goal_completion|goal_review)$')
    attachments: list[NoteAttachmentSchema] = Field(default_factory=list, max_length=8)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: str) -> str:
        return sanitize_note_content(v)


class NoteCreateRequestSchema(NoteCreateSchema):
    """HTTP note creation; adds a client-minted id so offline notes can be edited before they sync."""
    id: Optional[str] = Field(
        None,
        pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    )


class NoteUpdateSchema(BaseModel):
    """Schema for updating a note."""
    content: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    pin: Optional[bool] = None
    attachments: Optional[list[NoteAttachmentSchema]] = Field(default=None, max_length=8)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_note_content(v)
