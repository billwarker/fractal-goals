"""Due-date guidance, checked against the cases the client mirror also runs."""
import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.goal_deadline_rules import DeadlineContext, add_interval, as_date, deadline_warnings, warnings_for_goal

CASES = json.loads((Path(__file__).parents[2] / 'fixtures' / 'goal_deadline_cases.json').read_text())


def _context(raw):
    return DeadlineContext(
        parent_deadline=as_date(raw.get('parent_deadline')),
        child_deadlines=tuple(as_date(value) for value in raw.get('child_deadlines', [])),
        started_at=as_date(raw.get('started_at')),
        horizon_min=tuple(raw.get('horizon_min', (None, None))),
        horizon_max=tuple(raw.get('horizon_max', (None, None))),
        program_start=as_date(raw.get('program_start')),
        program_end=as_date(raw.get('program_end')),
    )


@pytest.mark.parametrize('case', CASES, ids=[case['name'] for case in CASES])
def test_shared_deadline_cases(case):
    assert deadline_warnings(as_date(case['deadline']), _context(case['context'])) == case['expected']


def test_unknown_interval_units_are_ignored():
    assert add_interval(date(2026, 1, 1), 3, 'fortnights') is None
    assert add_interval(date(2026, 1, 1), None, 'days') is None


def test_warnings_for_goal_reads_parent_live_children_level_and_program():
    level = SimpleNamespace(deadline_min_value=None, deadline_min_unit=None, deadline_max_value=1, deadline_max_unit='weeks')
    parent = SimpleNamespace(deadline=datetime(2026, 5, 5), deleted_at=None)
    goal = SimpleNamespace(
        deadline=datetime(2026, 5, 10), started_at=datetime(2026, 5, 1), created_at=datetime(2026, 4, 1),
        level=level, parent=parent,
        children=[
            SimpleNamespace(deadline=datetime(2026, 5, 12), deleted_at=None),
            SimpleNamespace(deadline=datetime(2026, 5, 30), deleted_at=datetime(2026, 5, 2)),
        ],
    )
    program = SimpleNamespace(start_date=datetime(2026, 5, 1), end_date=datetime(2026, 5, 9))

    assert [warning['code'] for warning in warnings_for_goal(goal, program=program)] == [
        'outside_program', 'after_horizon', 'after_parent', 'children_after',
    ]
    assert warnings_for_goal(goal)[-1] == {'code': 'children_after', 'count': 1, 'latest': '2026-05-12'}


def test_a_goal_without_a_due_date_has_no_warnings():
    goal = SimpleNamespace(deadline=None, started_at=None, created_at=None, level=None, parent=None, children=[])
    assert warnings_for_goal(goal) == []
