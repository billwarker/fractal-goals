from types import SimpleNamespace

from services import analytics_cache
from services.event_logger import _get_entity_info, _get_event_description
from services.events import Event, EventBus, Events
from services.goal_type_utils import get_canonical_goal_level_name, get_canonical_goal_type


def test_analytics_cache_set_get_and_expire(monkeypatch):
    analytics_cache._ANALYTICS_BY_ROOT.clear()

    now = {"value": 1000.0}

    def fake_time():
        return now["value"]

    monkeypatch.setattr(analytics_cache.time, "time", fake_time)

    analytics_cache.set_analytics("root-1", {"score": 7}, ttl_seconds=2)
    assert analytics_cache.get_analytics("root-1") == {"score": 7}

    now["value"] = 1003.0
    assert analytics_cache.get_analytics("root-1") is None


def test_analytics_cache_ttl_has_minimum_one_second(monkeypatch):
    analytics_cache._ANALYTICS_BY_ROOT.clear()

    now = {"value": 2000.0}
    monkeypatch.setattr(analytics_cache.time, "time", lambda: now["value"])

    analytics_cache.set_analytics("root-2", {"score": 9}, ttl_seconds=0)
    now["value"] = 2000.5
    assert analytics_cache.get_analytics("root-2") == {"score": 9}

    now["value"] = 2001.1
    assert analytics_cache.get_analytics("root-2") is None


def test_analytics_cache_invalidation_via_event_bus(monkeypatch):
    analytics_cache._ANALYTICS_BY_ROOT.clear()

    isolated_bus = EventBus()
    monkeypatch.setattr(analytics_cache, "event_bus", isolated_bus)

    analytics_cache.set_analytics("root-3", {"value": 1})
    analytics_cache.setup_analytics_cache_invalidation()

    isolated_bus.emit(Event("goal.updated", {"root_id": "root-3"}))
    assert analytics_cache.get_analytics("root-3") is None

    # Event with no root_id should not invalidate other entries.
    analytics_cache.set_analytics("root-4", {"value": 2})
    isolated_bus.emit(Event("goal.updated", {}))
    assert analytics_cache.get_analytics("root-4") == {"value": 2}


def _make_goal(level_name=None, parent=None):
    level = SimpleNamespace(name=level_name) if level_name is not None else None
    return SimpleNamespace(level=level, parent=parent)


def test_goal_type_utils_prefers_explicit_level():
    goal = _make_goal(level_name="Micro Goal")
    assert get_canonical_goal_type(goal) == "MicroGoal"
    assert get_canonical_goal_level_name(goal) == "Micro Goal"


def test_goal_type_utils_uses_depth_fallback():
    root = _make_goal()
    long_term = _make_goal(parent=root)
    mid_term = _make_goal(parent=long_term)
    short_term = _make_goal(parent=mid_term)
    immediate = _make_goal(parent=short_term)
    micro = _make_goal(parent=immediate)
    nano = _make_goal(parent=micro)

    assert get_canonical_goal_type(root) == "UltimateGoal"
    assert get_canonical_goal_type(long_term) == "LongTermGoal"
    assert get_canonical_goal_type(mid_term) == "MidTermGoal"
    assert get_canonical_goal_type(short_term) == "ShortTermGoal"
    assert get_canonical_goal_type(immediate) == "ImmediateGoal"
    assert get_canonical_goal_type(micro) == "MicroGoal"
    assert get_canonical_goal_type(nano) == "NanoGoal"
    assert get_canonical_goal_level_name(nano) == "Nano Goal"


def test_goal_type_utils_unknown_level_name_falls_back_to_depth():
    root = _make_goal()
    goal = _make_goal(level_name="Unmapped Name", parent=root)
    assert get_canonical_goal_type(goal) == "LongTermGoal"


def test_event_logger_get_entity_info_prefers_entity_id_key():
    event = Event("goal.updated", {"goal_id": "g-1", "id": "fallback"})
    entity_type, entity_id = _get_entity_info(event)
    assert entity_type == "goal"
    assert entity_id == "g-1"


def test_event_logger_get_entity_info_falls_back_to_generic_id():
    event = Event("custom.event", {"id": "only-id"})
    entity_type, entity_id = _get_entity_info(event)
    assert entity_type == "custom"
    assert entity_id == "only-id"


def test_event_logger_get_event_description_goal_updated_deadline_suffix():
    event = Event(
        Events.GOAL_UPDATED,
        {"goal_name": "Ship Feature", "updated_fields": ["deadline"]},
    )
    assert _get_event_description(event) == "Updated goal: Ship Feature (Deadline updated)"


def test_event_logger_get_event_description_known_and_fallback_events():
    created = Event(Events.SESSION_CREATED, {"session_name": "Morning Session"})
    assert _get_event_description(created) == "Created session: Morning Session"

    unknown = Event("unknown.event", {"name": "Something"})
    assert _get_event_description(unknown) == "Event unknown.event occurred"
