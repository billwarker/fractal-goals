"""Shared ProgramService exception (split out for the mixin package, audit P1-7)."""
from typing import Any


class ProgramServiceValidationError(ValueError):
    def __init__(self, payload: Any, status_code: int = 400):
        self.payload = payload
        self.status_code = status_code
        if isinstance(payload, dict):
            message = payload.get('error') or payload.get('message') or str(payload)
        else:
            message = str(payload)
        super().__init__(message)

