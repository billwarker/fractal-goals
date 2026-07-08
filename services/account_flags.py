"""Shared account-state flags stored in the User.preferences JSON blob.

Kept separate from AdminService so auth, serializers, and user services can
read/clear the flags without importing admin logic.
"""
from sqlalchemy.orm.attributes import flag_modified

from models import _safe_load_json

FORCE_PASSWORD_CHANGE_PREFERENCE = "admin_force_password_change"


def must_change_password(user) -> bool:
    preferences = _safe_load_json(user.preferences, {}) or {}
    return bool(preferences.get(FORCE_PASSWORD_CHANGE_PREFERENCE))


def clear_force_password_change(user) -> bool:
    """Clear the marker after a successful self-service password change.

    Returns True when the marker was present. The caller owns the commit.
    """
    preferences = _safe_load_json(user.preferences, {}) or {}
    if not preferences.get(FORCE_PASSWORD_CHANGE_PREFERENCE):
        return False
    updated = dict(preferences)
    updated.pop(FORCE_PASSWORD_CHANGE_PREFERENCE, None)
    user.preferences = updated
    flag_modified(user, "preferences")
    return True
