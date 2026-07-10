"""Auth, admin, and user validation schemas. Split from validators.py (audit P1-8).

Re-exported by the validators package __init__, so existing
`from validators import <Schema>` imports keep working.
"""
from datetime import date
from typing import Optional, List, Any, Dict
import re
from pydantic import BaseModel, Field, field_validator, model_validator, ConfigDict

from account_tiers import ACCOUNT_TIER_PATTERN, DEFAULT_ACCOUNT_TIER
from .core import sanitize_string, sanitize_note_content

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
    invite_key: str = Field(..., min_length=8, max_length=128)
    
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
    remember_me: bool = False


class PasswordForgotSchema(BaseModel):
    """Schema for requesting a password reset email."""
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')

    @field_validator('email')
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return sanitize_string(v).lower()


class PasswordResetSchema(BaseModel):
    """Schema for completing a password reset."""
    model_config = ConfigDict(str_strip_whitespace=True)

    token: str = Field(..., min_length=20, max_length=512)
    new_password: str = Field(..., min_length=8)

    @field_validator('new_password')
    @classmethod
    def validate_password_strength(cls, v: str) -> str:
        return validate_strong_password(v)


class BetaSignupRequestSchema(BaseModel):
    """Schema for public private-beta access requests."""
    model_config = ConfigDict(str_strip_whitespace=True)

    name: Optional[str] = Field(None, min_length=2, max_length=120)
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    use_case: Optional[str] = Field(None, min_length=2, max_length=280)
    note: Optional[str] = Field(None, max_length=1000)

    @field_validator('name', 'use_case')
    @classmethod
    def sanitize_optional_text(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return None
        return sanitize_string(v)

    @field_validator('email')
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return sanitize_string(v).lower()

    @field_validator('note')
    @classmethod
    def sanitize_optional_note(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        cleaned = sanitize_note_content(v)
        return cleaned or None


class AdminBetaSignupStatusSchema(BaseModel):
    """Admin update for a beta signup request's triage status."""
    model_config = ConfigDict(str_strip_whitespace=True)

    status: str = Field(..., pattern=r'^(new|invited|dismissed)$')


class AdminUserCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    username: str = Field(..., min_length=3, max_length=80)
    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    password: Optional[str] = Field(None, min_length=8)
    role: Optional[str] = Field('user', pattern=r'^(user|admin)$')
    membership_tier: Optional[str] = Field(DEFAULT_ACCOUNT_TIER, pattern=ACCOUNT_TIER_PATTERN)
    storage_limit_bytes: Optional[int] = Field(104857600, ge=0)

    @field_validator('username')
    @classmethod
    def sanitize_username(cls, v: str) -> str:
        return sanitize_string(v)

    @field_validator('password')
    @classmethod
    def validate_password_strength(cls, v: Optional[str]) -> Optional[str]:
        if v is None:
            return v
        return validate_strong_password(v)


class AdminUserUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: Optional[str] = Field(None, pattern=r'^(user|admin)$')
    is_active: Optional[bool] = None
    membership_tier: Optional[str] = Field(None, pattern=ACCOUNT_TIER_PATTERN)
    quota_overrides: Optional[Dict[str, int]] = None
    storage_limit_bytes: Optional[int] = Field(None, ge=0)

    @field_validator('quota_overrides')
    @classmethod
    def validate_quota_overrides(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is None:
            return v
        if any(value < 0 for value in v.values()):
            raise ValueError('Quota override values must be non-negative')
        return v


class AdminUserRoleUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    role: str = Field(..., pattern=r'^(user|admin)$')


class AdminUserStatusUpdateSchema(BaseModel):
    is_active: bool


class AdminUserTierUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    membership_tier: str = Field(..., pattern=ACCOUNT_TIER_PATTERN)


class AdminUserQuotaUpdateSchema(BaseModel):
    quota_overrides: Optional[Dict[str, int]] = None
    storage_limit_bytes: Optional[int] = Field(None, ge=0)

    @field_validator('quota_overrides')
    @classmethod
    def validate_quota_overrides(cls, v: Optional[Dict[str, int]]) -> Optional[Dict[str, int]]:
        if v is None:
            return v
        if any(value < 0 for value in v.values()):
            raise ValueError('Quota override values must be non-negative')
        return v


class AdminUserForcePasswordChangeSchema(BaseModel):
    force_password_change: bool = True


class AdminUsageRetentionSchema(BaseModel):
    """Retention policy for admin telemetry (product_events)."""
    product_events_days: int = Field(..., ge=1, le=100000)


class AdminTierQuotaUpdateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    tier: str = Field(..., pattern=ACCOUNT_TIER_PATTERN)
    limits: Dict[str, int]
    storage_limit_bytes: int = Field(..., ge=0)
    apply_existing_users: bool = False

    @field_validator('limits')
    @classmethod
    def validate_limits(cls, v: Dict[str, int]) -> Dict[str, int]:
        if any(value < 0 for value in v.values()):
            raise ValueError('Quota limit values must be non-negative')
        return v


class AdminFeatureFlagsUpdateSchema(BaseModel):
    flags: Dict[str, bool]


class LandingExampleShowcaseSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    session_id: Optional[str] = Field(None, min_length=1, max_length=120)
    activity_ids: List[str] = Field(default_factory=list, max_length=4)
    program_id: Optional[str] = Field(None, min_length=1, max_length=120)
    program_start_date: Optional[str] = None
    program_end_date: Optional[str] = None
    analytics_view_ids: List[str] = Field(default_factory=list, max_length=3)

    @field_validator('session_id', 'program_id')
    @classmethod
    def sanitize_showcase_id(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_string(v) if v else v

    @field_validator('activity_ids', 'analytics_view_ids')
    @classmethod
    def sanitize_showcase_id_lists(cls, v: List[str]) -> List[str]:
        cleaned = [sanitize_string(item) for item in v if item and item.strip()]
        if len(cleaned) != len(set(cleaned)):
            raise ValueError('Showcase id lists must not contain duplicates')
        return cleaned

    @field_validator('program_start_date', 'program_end_date')
    @classmethod
    def validate_showcase_date(cls, v: Optional[str]) -> Optional[str]:
        if v is None or not v.strip():
            return None
        try:
            date.fromisoformat(v)
        except ValueError as exc:
            raise ValueError('Showcase dates must be YYYY-MM-DD') from exc
        return v

    @model_validator(mode='after')
    def validate_program_date_window(self) -> 'LandingExampleShowcaseSchema':
        if self.program_start_date and self.program_end_date:
            if date.fromisoformat(self.program_end_date) < date.fromisoformat(self.program_start_date):
                raise ValueError('Showcase program end date must not be before the start date')
        return self


class LandingExampleSelectionSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    root_id: str = Field(..., min_length=1, max_length=120)
    label: str = Field(..., min_length=1, max_length=120)
    sort_order: int = Field(..., ge=0, le=1000)
    showcase: Optional[LandingExampleShowcaseSchema] = None

    @field_validator('root_id', 'label')
    @classmethod
    def sanitize_landing_example_text(cls, v: str) -> str:
        return sanitize_string(v)


class AdminLandingExamplesUpdateSchema(BaseModel):
    examples: List[LandingExampleSelectionSchema] = Field(default_factory=list, max_length=12)

    @field_validator('examples')
    @classmethod
    def validate_unique_landing_example_roots(
        cls,
        v: List[LandingExampleSelectionSchema],
    ) -> List[LandingExampleSelectionSchema]:
        root_ids = [item.root_id for item in v]
        if len(root_ids) != len(set(root_ids)):
            raise ValueError('Landing example root ids must be unique')
        return v


class AdminInviteKeyCreateSchema(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)

    email: str = Field(..., pattern=r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$')
    label: Optional[str] = Field(None, max_length=255)
    expires_at: Optional[str] = None

    @field_validator('email')
    @classmethod
    def normalize_email(cls, v: str) -> str:
        return sanitize_string(v).lower()

    @field_validator('label')
    @classmethod
    def sanitize_label(cls, v: Optional[str]) -> Optional[str]:
        return sanitize_string(v) if v else v


class UserPreferencesUpdateSchema(BaseModel):
    """Schema for updating user preferences."""
    preferences: Dict[str, Any] = Field(...)


class OnboardingStateUpdateSchema(BaseModel):
    """Concurrency-safe update for user-controlled onboarding presentation state."""
    model_config = ConfigDict(str_strip_whitespace=True)

    revision: int = Field(..., ge=0)
    root_id: Optional[str] = Field(None, max_length=64)
    status: Optional[str] = Field(None, pattern=r'^(active|dismissed|completed)$')
    hints_dismissed: Optional[List[str]] = Field(None, max_length=64)
    visited: Optional[List[str]] = Field(None, max_length=16)
    celebrated_first_session: Optional[bool] = None
    restart: bool = False

    @field_validator('hints_dismissed', 'visited')
    @classmethod
    def clean_onboarding_keys(cls, values: Optional[List[str]]) -> Optional[List[str]]:
        if values is None:
            return None
        cleaned = [sanitize_string(value) for value in values if value and value.strip()]
        return list(dict.fromkeys(cleaned))


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
