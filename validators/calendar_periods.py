"""Calendar period (time off) validation schemas."""
from datetime import date
from typing import Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

from .core import MAX_DESCRIPTION_LENGTH, sanitize_string

MAX_CALENDAR_PERIOD_DAYS = 366
CalendarPeriodKind = Literal['vacation', 'travel', 'illness', 'other']


def _parse_iso_date(value):
    try:
        parsed = date.fromisoformat(value)
    except (TypeError, ValueError) as exc:
        raise ValueError('dates must be ISO calendar dates (YYYY-MM-DD)') from exc
    if parsed.isoformat() != value:
        raise ValueError('dates must be ISO calendar dates (YYYY-MM-DD)')
    return parsed


class CalendarPeriodCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')

    name: str = Field(..., min_length=1, max_length=120)
    kind: CalendarPeriodKind = 'vacation'
    start_date: str
    end_date: str
    protects_streaks: bool = True
    notes: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        return sanitize_string(value)

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_dates(cls, value: str) -> date:
        return _parse_iso_date(value)

    @model_validator(mode='after')
    def validate_span(self):
        if self.end_date < self.start_date:
            raise ValueError('end_date must be on or after start_date')
        if (self.end_date - self.start_date).days + 1 > MAX_CALENDAR_PERIOD_DAYS:
            raise ValueError(f'Calendar periods can span at most {MAX_CALENDAR_PERIOD_DAYS} days')
        return self


class CalendarPeriodUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra='forbid')

    name: Optional[str] = Field(None, min_length=1, max_length=120)
    kind: Optional[CalendarPeriodKind] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    protects_streaks: Optional[bool] = None
    notes: Optional[str] = Field(None, max_length=MAX_DESCRIPTION_LENGTH)

    @field_validator('name')
    @classmethod
    def sanitize_name(cls, value: Optional[str]) -> Optional[str]:
        return sanitize_string(value) if value is not None else value

    @field_validator('start_date', 'end_date')
    @classmethod
    def validate_dates(cls, value: Optional[str]) -> Optional[date]:
        return _parse_iso_date(value) if value is not None else value
