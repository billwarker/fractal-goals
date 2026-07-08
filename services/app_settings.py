"""Shared helpers for the app_settings key/value store.

Mirrors the pattern used by LandingPublishService/FeatureFlagService:
deepcopy on read so callers can't mutate cached state, get-or-create plus
flag_modified on write so in-place JSON updates persist. Callers own the
commit.
"""
from copy import deepcopy

from sqlalchemy.orm.attributes import flag_modified

from models import AppSetting

# Keys owned by the admin usage/telemetry surface.
TELEMETRY_RETENTION_KEY = "telemetry_retention"
ANALYTICS_EXPORT_STATE_KEY = "analytics_export_state"


def get_app_setting(db_session, key: str, default=None):
    setting = db_session.get(AppSetting, key)
    if setting is None or setting.value is None:
        return deepcopy(default)
    return deepcopy(setting.value)


def set_app_setting(db_session, key: str, value):
    setting = db_session.get(AppSetting, key)
    if setting is None:
        setting = AppSetting(key=key, value=value)
        db_session.add(setting)
    else:
        setting.value = value
        flag_modified(setting, "value")
    return setting
