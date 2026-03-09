from types import SimpleNamespace

from services.goal_domain_rules import (
    all_active_targets_completed,
    goal_allows_manual_completion,
    goal_uses_child_completion,
    is_micro_goal,
    is_nano_goal,
    resolve_completed_via_children,
    should_inherit_parent_activities,
)


def _goal(*, level_name=None, parent_id=None, completed_via_children=False, allow_manual_completion=True, targets=None):
    level = SimpleNamespace(
        name=level_name,
        auto_complete_when_children_done=(level_name == "Auto Parent"),
        allow_manual_completion=True,
    ) if level_name else None
    return SimpleNamespace(
        level=level,
        parent_id=parent_id,
        completed_via_children=completed_via_children,
        allow_manual_completion=allow_manual_completion,
        targets_rel=targets or [],
        associated_activities=[],
    )


def test_goal_uses_child_completion_from_goal_flag():
    assert goal_uses_child_completion(_goal(completed_via_children=True)) is True


def test_goal_uses_child_completion_from_level_default():
    assert goal_uses_child_completion(_goal(level_name="Auto Parent")) is True


def test_resolve_completed_via_children_prefers_explicit_or_level_default():
    auto_level = SimpleNamespace(auto_complete_when_children_done=True)
    assert resolve_completed_via_children({"completed_via_children": True}, auto_level) is True
    assert resolve_completed_via_children({}, auto_level) is True
    assert resolve_completed_via_children({}, None) is False


def test_nano_and_micro_goal_detection():
    assert is_nano_goal(_goal(level_name="Nano Goal")) is True
    assert is_micro_goal(_goal(level_name="Micro Goal")) is True


def test_should_inherit_parent_activities_only_for_nano_children():
    parent = _goal(level_name="Immediate Goal")
    parent.associated_activities = [SimpleNamespace(id="activity-1")]
    nano = _goal(level_name="Nano Goal", parent_id="parent-1")
    micro = _goal(level_name="Micro Goal", parent_id="parent-1")

    assert should_inherit_parent_activities(nano, parent) is True
    assert should_inherit_parent_activities(micro, parent) is False


def test_all_active_targets_completed_ignores_deleted_targets():
    active_completed = SimpleNamespace(completed=True, deleted_at=None)
    deleted_incomplete = SimpleNamespace(completed=False, deleted_at="deleted")
    goal = _goal(targets=[active_completed, deleted_incomplete])
    assert all_active_targets_completed(goal) is True


def test_goal_allows_manual_completion_checks_goal_and_level_flags():
    level_blocked = SimpleNamespace(name="Immediate Goal", allow_manual_completion=False)
    goal = SimpleNamespace(level=level_blocked, allow_manual_completion=True)
    assert goal_allows_manual_completion(goal) is False

    goal_only_blocked = SimpleNamespace(level=None, allow_manual_completion=False)
    assert goal_allows_manual_completion(goal_only_blocked) is False
