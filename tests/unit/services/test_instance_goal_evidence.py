from datetime import datetime, timedelta, timezone
from types import SimpleNamespace
import pytest
from services.instance_goal_evidence import instance_contributes_to_goal, instance_source_goal_ids, resolve_instance_goals

NOW = datetime(2026, 10, 10, 12, tzinfo=timezone.utc)

@pytest.mark.parametrize('occurred,paused,deleted,expected', [
    (NOW - timedelta(seconds=1), False, None, False),
    (NOW, False, None, True),
    (NOW + timedelta(seconds=1), False, None, True),
    (NOW, True, None, False),
    (NOW, False, NOW, False),
])
def test_lifetime_and_state_boundaries(occurred, paused, deleted, expected):
    goal = SimpleNamespace(created_at=NOW, paused=paused, deleted_at=deleted, completed_at=None, pause_intervals=[])
    instance = SimpleNamespace(time_start=occurred, created_at=occurred)
    assert instance_contributes_to_goal(instance, goal) is expected


def test_union_deduplicates_and_does_not_widen_sibling_scope():
    links = {'one': {'goal', 'other'}}
    assert instance_source_goal_ids('one', {'goal'}, links, {'goal'}) == {'goal'}
    assert instance_source_goal_ids('sibling', set(), links, {'goal'}) == set()
    assert instance_source_goal_ids('one', {'inherited'}, links, {'goal'}) == {'goal', 'inherited'}


def test_direct_links_roll_up_and_never_flow_down():
    parent = SimpleNamespace(id='parent', parent_id=None, deleted_at=None)
    child = SimpleNamespace(id='child', parent_id='parent', deleted_at=None)
    graph = {row.id: row for row in [parent, child]}
    assert {row.id for row in resolve_instance_goals('one', [parent], {'one': {'child'}}, graph)} == {'child', 'parent'}
    assert {row.id for row in resolve_instance_goals('one', [], {'one': {'parent'}}, graph)} == {'parent'}


def test_explicit_links_respect_creation_date_in_analytics_resolution():
    goal = SimpleNamespace(id='new', parent_id=None, deleted_at=None, created_at=NOW)
    graph = {'new': goal}
    assert resolve_instance_goals('one', [], {'one': {'new'}}, graph, NOW - timedelta(seconds=1)) == []
    assert resolve_instance_goals('one', [], {'one': {'new'}}, graph, NOW) == [goal]
