import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.program_goal_window import is_goal_in_program_window

CASES = json.loads((Path(__file__).parents[2] / 'fixtures/program_goal_window_cases.json').read_text())


@pytest.mark.parametrize('case', CASES, ids=lambda case: case['name'])
def test_program_goal_window_matches_client_contract(case):
    goal = SimpleNamespace(
        completed=case['completed'],
        completed_at=datetime.fromisoformat(case['completed_at'].replace('Z', '+00:00')) if case['completed_at'] else None,
    )
    assert is_goal_in_program_window(goal, date(2026, 5, 22), date(2026, 8, 31)) == case['eligible']
