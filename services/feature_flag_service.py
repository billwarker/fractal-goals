from copy import deepcopy

from sqlalchemy.orm.attributes import flag_modified

from models import AppSetting
from services.service_types import JsonDict, ServiceResult


FEATURE_FLAGS_SETTING_KEY = "feature_flags"

FEATURE_FLAG_DEFINITIONS: dict[str, JsonDict] = {
    "onboarding_v1": {
        "key": "onboarding_v1",
        "label": "First-run onboarding",
        "description": "Shows the Getting Started journey and contextual onboarding guidance.",
        "default_enabled": False,
    },
    "goal_surface_configuration": {
        "key": "goal_surface_configuration",
        "label": "Goal view configuration",
        "description": "Shows the configurable goal surface, layout picker, configure controls, and surface widgets.",
        "default_enabled": False,
    },
    "analytics_sql_explorer": {
        "key": "analytics_sql_explorer",
        "label": "Analytics SQL explorer",
        "description": "Shows the analytics query console, SQL chart query inspector, and SQL authoring affordances.",
        "default_enabled": False,
    },
}


class FeatureFlagService:
    def __init__(self, db_session):
        self.db_session = db_session

    @staticmethod
    def _default_values() -> dict[str, bool]:
        return {
            key: bool(definition["default_enabled"])
            for key, definition in FEATURE_FLAG_DEFINITIONS.items()
        }

    def _load_values(self) -> dict[str, bool]:
        setting = self.db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
        stored = setting.value if setting and isinstance(setting.value, dict) else {}
        values = self._default_values()
        for key in values:
            if key in stored:
                values[key] = bool(stored[key])
        return values

    def get_flags(self, *, include_definitions: bool = False) -> ServiceResult[JsonDict]:
        values = self._load_values()
        payload: JsonDict = {"flags": values}
        if include_definitions:
            payload["definitions"] = [
                {
                    **deepcopy(definition),
                    "enabled": values[key],
                }
                for key, definition in FEATURE_FLAG_DEFINITIONS.items()
            ]
        return payload, None, 200

    def update_flags(self, flags: JsonDict) -> ServiceResult[JsonDict]:
        unknown = sorted(set(flags.keys()) - set(FEATURE_FLAG_DEFINITIONS.keys()))
        if unknown:
            return None, f"Unknown feature flag: {unknown[0]}", 400

        values = self._load_values()
        for key, enabled in flags.items():
            values[key] = bool(enabled)

        setting = self.db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
        if setting is None:
            setting = AppSetting(key=FEATURE_FLAGS_SETTING_KEY, value=values)
            self.db_session.add(setting)
        else:
            setting.value = values
            flag_modified(setting, "value")

        self.db_session.commit()
        return self.get_flags(include_definitions=True)
