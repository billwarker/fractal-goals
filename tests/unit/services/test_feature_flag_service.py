from models import AppSetting
from services.feature_flag_service import FEATURE_FLAGS_SETTING_KEY, FeatureFlagService


def test_feature_flags_default_off_and_persisted(db_session):
    service = FeatureFlagService(db_session)

    payload, error, status = service.get_flags(include_definitions=True)
    assert error is None
    assert status == 200
    assert payload["flags"] == {
        "goal_surface_configuration": False,
        "analytics_sql_explorer": False,
    }
    assert [item["key"] for item in payload["definitions"]] == [
        "goal_surface_configuration",
        "analytics_sql_explorer",
    ]

    updated, error, status = service.update_flags({"analytics_sql_explorer": True})
    assert error is None
    assert status == 200
    assert updated["flags"]["analytics_sql_explorer"] is True

    setting = db_session.get(AppSetting, FEATURE_FLAGS_SETTING_KEY)
    assert setting.value["analytics_sql_explorer"] is True
    assert FeatureFlagService(db_session).get_flags()[0]["flags"]["analytics_sql_explorer"] is True


def test_feature_flags_reject_unknown_keys(db_session):
    payload, error, status = FeatureFlagService(db_session).update_flags({"unknown": True})

    assert payload is None
    assert status == 400
    assert error == "Unknown feature flag: unknown"
