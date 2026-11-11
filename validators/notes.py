"""Note validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from datetime import date
from typing import Literal, Optional
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict
from .core import MAX_DESCRIPTION_LENGTH, sanitize_note_content


class NoteAttachmentSchema(BaseModel):
    model_config = ConfigDict(extra='forbid')
    asset_id: str = Field(min_length=1, max_length=255)
    alt_text: str = Field(default='', max_length=500)

REVIEW_ANSWER_MAX = 2000


class GoalReviewDataSchema(BaseModel):
    """A guided goal review's answers. The note's content is derived from them on the server."""
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid', populate_by_name=True)

    schema_version: Literal[1] = Field(1, alias='schema')
    status: Optional[Literal['on_track', 'at_risk', 'off_track']] = None
    went_well: str = Field('', max_length=REVIEW_ANSWER_MAX)
    change: str = Field('', max_length=REVIEW_ANSWER_MAX)
    next_focus: str = Field('', max_length=REVIEW_ANSWER_MAX)

    @field_validator('went_well', 'change', 'next_focus')
    @classmethod
    def sanitize_answer(cls, v: str) -> str:
        return sanitize_note_content(v) if v else v

    @model_validator(mode='after')
    def require_an_answer(self):
        if not (self.status or self.went_well or self.change or self.next_focus):
            raise ValueError('A review needs a status or at least one answer')
        return self

    def stored(self) -> dict:
        return {'schema': 1, **self.model_dump(exclude={'schema_version'})}


class NoteCreateSchema(BaseModel):
    """Schema for creating a note."""
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')
    
    # Optional only for structured reviews, whose content the server derives from review_data.
    content: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    context_type: str = Field(
        ...,
        pattern=r'^(root|goal|session|program|program_date|activity_instance|activity_definition|circuit_run|circuit_round)$',
    )
    context_id: str = Field(..., min_length=1)
    session_id: Optional[str] = None
    activity_instance_id: Optional[str] = None
    activity_definition_id: Optional[str] = None
    goal_id: Optional[str] = None
    activity_set_id: Optional[str] = None
    note_kind: Optional[str] = Field(None, pattern=r'^(goal_completion|goal_review)$')
    calendar_date: Optional[date] = None
    review_data: Optional[GoalReviewDataSchema] = None
    attachments: list[NoteAttachmentSchema] = Field(default_factory=list, max_length=8)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_note_content(v) if v is not None else v

    @model_validator(mode='after')
    def content_or_review(self):
        if self.review_data is not None:
            if self.note_kind != 'goal_review':
                raise ValueError('review_data is only valid on goal_review notes')
        elif not self.content:
            raise ValueError('content is required')
        return self


class NoteCreateRequestSchema(NoteCreateSchema):
    """HTTP note creation; adds a client-minted id so offline notes can be edited before they sync."""
    id: Optional[str] = Field(
        None,
        pattern=r'^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$',
    )


class NoteUpdateSchema(BaseModel):
    """Schema for updating a note."""
    content: Optional[str] = Field(None, min_length=1, max_length=MAX_DESCRIPTION_LENGTH)
    # Pin to the next instance of the note's activity (services/note_carry_forward.py).
    carry_forward: Optional[bool] = None
    review_data: Optional[GoalReviewDataSchema] = None
    attachments: Optional[list[NoteAttachmentSchema]] = Field(default=None, max_length=8)

    @field_validator('content')
    @classmethod
    def sanitize_content(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return sanitize_note_content(v)
