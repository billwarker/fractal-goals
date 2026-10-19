from types import SimpleNamespace

from services.goal_domain_rules import (
    goal_requires_smart_validation,
    should_inherit_parent_activities,
)


def _goal(*, level=None, parent_id=None):
    return SimpleNamespace(level=level, parent_id=parent_id, associated_activities=[])


def test_should_inherit_parent_activities_uses_explicit_value():
    parent = _goal(level=SimpleNamespace(name="Immediate Goal"))
    goal = _goal(level=SimpleNamespace(name="Immediate Goal"), parent_id="parent-1")

    assert should_inherit_parent_activities(goal, parent) is False
    assert should_inherit_parent_activities(goal, parent, explicit_value=True) is True
    assert should_inherit_parent_activities(goal, parent, explicit_value=False) is False


def test_smart_validation_follows_the_level_flag():
    assert goal_requires_smart_validation(_goal(level=SimpleNamespace(requires_smart=True))) is True
    assert goal_requires_smart_validation(_goal(level=SimpleNamespace(requires_smart=False))) is False
    assert goal_requires_smart_validation(_goal(level=None)) is False
