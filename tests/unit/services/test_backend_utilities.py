import pytest
from types import SimpleNamespace

from models import _safe_load_json
from services.event_logger import _get_entity_info, _get_event_description
from services.events import Event, EventBus, Events
from services.goal_type_utils import get_canonical_goal_level_name, get_canonical_goal_type


def test_safe_json_loader_handles_valid_native_and_malformed_inputs():
    native = {"program_context": {"day_id": "day-1"}}

    assert _safe_load_json(native, {}) is native
    assert _safe_load_json('{"day_id": "day-1"}', {}) == {"day_id": "day-1"}
    assert _safe_load_json("{malformed", {}) == {}
    assert _safe_load_json(b"\xff", {}) == {}


def _make_goal(level_name=None, parent=None):
    level = SimpleNamespace(name=level_name) if level_name is not None else None
    return SimpleNamespace(level=level, parent=parent)


def test_goal_type_utils_prefers_explicit_level():
    goal = _make_goal(level_name="Immediate Goal")
    assert get_canonical_goal_type(goal) == "ImmediateGoal"
    assert get_canonical_goal_level_name(goal) == "Immediate Goal"


def test_goal_type_utils_uses_depth_fallback():
    root = _make_goal()
    long_term = _make_goal(parent=root)
    mid_term = _make_goal(parent=long_term)
    short_term = _make_goal(parent=mid_term)
    immediate = _make_goal(parent=short_term)

    assert get_canonical_goal_type(root) == "UltimateGoal"
    assert get_canonical_goal_type(long_term) == "LongTermGoal"
    assert get_canonical_goal_type(mid_term) == "MidTermGoal"
    assert get_canonical_goal_type(short_term) == "ShortTermGoal"
    assert get_canonical_goal_type(immediate) == "ImmediateGoal"
    assert get_canonical_goal_type(_make_goal(parent=immediate)) is None


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


def test_event_logger_get_event_description_for_new_note_and_schedule_events():
    note_event = Event(Events.NOTE_CREATED, {"note_content": "Remember to breathe"})
    assert _get_event_description(note_event) == "Created note: Remember to breathe"

    note_updated = Event(Events.NOTE_UPDATED, {"note_content": "Tighter form"})
    assert _get_event_description(note_updated) == "Updated note: Tighter form"

    note_deleted = Event(Events.NOTE_DELETED, {"note_content": "Retired cue"})
    assert _get_event_description(note_deleted) == "Deleted note: Retired cue"

    scheduled_event = Event(
        Events.PROGRAM_DAY_SCHEDULED,
        {"day_name": "Tempo", "scheduled_date": "2026-03-18"},
    )
    assert _get_event_description(scheduled_event) == "Scheduled program day: Tempo on 2026-03-18"

    unscheduled_event = Event(
        Events.PROGRAM_DAY_UNSCHEDULED,
        {"day_name": "Tempo", "date": "2026-03-19"},
    )
    assert _get_event_description(unscheduled_event) == "Unscheduled program day: Tempo on 2026-03-19"

    template_deleted = Event(Events.SESSION_TEMPLATE_DELETED, {"name": "Base Template"})
    assert _get_event_description(template_deleted) == "Deleted session template: Base Template"


def test_event_bus_reports_handler_failures_and_continues():
    bus = EventBus()
    calls = []
    failures = []

    @bus.on("goal.updated")
    def failing_handler(event):
        calls.append(("failing", event.name))
        raise RuntimeError("boom")

    @bus.on("goal.updated")
    def succeeding_handler(event):
        calls.append(("succeeding", event.name))

    bus.subscribe_failures(lambda failure: failures.append(failure))

    bus.emit(Event("goal.updated", {"root_id": "root-1", "goal_id": "goal-1"}))

    assert calls == [
        ("failing", "goal.updated"),
        ("succeeding", "goal.updated"),
    ]
    assert len(failures) == 1
    assert failures[0].handler_name == "failing_handler"
    assert failures[0].event.name == "goal.updated"
    assert str(failures[0].error) == "boom"
