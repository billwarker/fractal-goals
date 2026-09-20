"""Program service.

Originally a single ~1,360-line ProgramService class; decomposed into
concern-focused mixins (audit P1-7). `ProgramService` and
`ProgramServiceValidationError` are importable from `services.programs`, and
current methods are called as
`ProgramService.<method>(session, ...)`. Methods are classmethods on the
concern mixins and resolve across mixins through the composed class via `cls`.

Concern modules:
- _program_helpers.py     parsing/date/commit/event/goal-scope helpers
- _program_crud.py        program + block CRUD
- _program_days.py        block-day lifecycle + scheduling + deadlines
- _program_goals.py       goal attachment to days/blocks
- _program_day_statuses.py occurrence-level manual completion/rest overrides
"""
from services.program_service_errors import ProgramServiceValidationError
from services._program_helpers import _ProgramHelpersMixin
from services._program_crud import _ProgramCrudMixin
from services._program_days import _ProgramDaysMixin
from services._program_goals import _ProgramGoalsMixin
from services._program_day_statuses import _ProgramDayStatusesMixin

__all__ = ["ProgramService", "ProgramServiceValidationError"]


class ProgramService(
    _ProgramHelpersMixin,
    _ProgramCrudMixin,
    _ProgramDaysMixin,
    _ProgramGoalsMixin,
    _ProgramDayStatusesMixin,
):
    """Validated backend write/read path for programs, blocks, days, and
    program-driven goal scheduling. Composed from concern mixins; their
    classmethods call each other through `cls`, which binds to this class."""
