import json
from datetime import date, datetime
from pathlib import Path
from types import SimpleNamespace

import pytest

from services.goal_review_rules import deferred_review_date, next_review_date, review_cadence, review_state

TODAY = date(2026, 10, 19)
CASES = json.loads((Path(__file__).parents[2] / 'fixtures' / 'goal_review_cases.json').read_text())


def _level(uses=True, value=3, unit='months'):
    return SimpleNamespace(uses_reviews=uses, review_cadence_value=value, review_cadence_unit=unit)


def _goal(**overrides):
    fields = dict(
        review_cadence_value=None, review_cadence_unit=None, review_disabled=False, review_deferred_until=None,
        completed=False, started_at=datetime(2026, 7, 19), created_at=datetime(2026, 1, 1),
        paused=False, pause_intervals=[],
    )
    return SimpleNamespace(**{**fields, **overrides})


@pytest.mark.unit
class TestReviewState:
    def test_levels_without_a_success_vision_have_no_reviews(self):
        assert review_state(_goal(), _level(uses=False), None, TODAY) is None
        assert review_state(_goal(), None, None, TODAY) is None

    def test_the_first_review_falls_one_cadence_after_the_start(self):
        state = review_state(_goal(), _level(), None, TODAY)
        assert state == {
            'cadence': {'value': 3, 'unit': 'months', 'source': 'level'},
            'last_review_on': None, 'next_review_on': '2026-10-19', 'deferred_until': None, 'pauses': [],
            'status': 'due',
        }
        tomorrow_start = _goal(started_at=datetime(2026, 7, 20))
        assert review_state(tomorrow_start, _level(), None, TODAY)['status'] == 'upcoming'

    def test_later_reviews_count_from_the_last_one_and_the_goal_cadence_wins(self):
        goal = _goal(review_cadence_value=2, review_cadence_unit='weeks')
        state = review_state(goal, _level(), datetime(2026, 10, 10, 15, 30), TODAY)
        assert (state['cadence']['source'], state['last_review_on'], state['next_review_on'], state['status']) == (
            'goal', '2026-10-10', '2026-10-24', 'upcoming',
        )

    def test_month_ends_clamp(self):
        state = review_state(_goal(started_at=datetime(2026, 1, 31)), _level(value=1), None, TODAY)
        assert state['next_review_on'] == '2026-02-28'

    def test_a_deferral_pushes_the_review_later_but_never_earlier(self):
        later = review_state(_goal(review_deferred_until=datetime(2026, 11, 30)), _level(), None, TODAY)
        assert (later['next_review_on'], later['deferred_until'], later['status']) == ('2026-11-30', '2026-11-30', 'upcoming')
        earlier = review_state(_goal(review_deferred_until=datetime(2026, 9, 1)), _level(), None, TODAY)
        assert (earlier['next_review_on'], earlier['deferred_until']) == ('2026-10-19', None)

    @pytest.mark.parametrize('goal, level, status', [
        (_goal(review_disabled=True), _level(), 'off'),
        (_goal(completed=True), _level(), 'complete'),
        (_goal(), _level(value=None, unit=None), 'none'),
    ])
    def test_off_complete_and_cadence_less_goals_are_never_due(self, goal, level, status):
        state = review_state(goal, level, None, TODAY)
        assert (state['status'], state['next_review_on']) == (status, None)

    def test_days_paused_before_the_review_push_it_back(self):
        goal = _goal(pause_intervals=[_pause(datetime(2026, 8, 1, 9), datetime(2026, 8, 15, 18))])
        state = review_state(goal, _level(), None, TODAY)
        assert (state['next_review_on'], state['status']) == ('2026-11-02', 'upcoming')
        assert state['pauses'] == [{'paused_on': '2026-08-01', 'resumed_on': '2026-08-15'}]

    def test_a_paused_goal_has_no_review_due_until_it_resumes(self):
        # Overdue before the pause; pausing quiets it, and it counts as reviewed meanwhile.
        goal = _goal(started_at=datetime(2026, 1, 1), paused=True, pause_intervals=[_pause(datetime(2026, 9, 1), None)])
        state = review_state(goal, _level(), None, TODAY)
        assert (state['status'], state['next_review_on']) == ('paused', None)
        assert state['pauses'] == [{'paused_on': '2026-09-01', 'resumed_on': None}]

    def test_review_cadence_needs_both_parts(self):
        assert review_cadence(_goal(review_cadence_value=2), _level(value=None, unit=None)) is None


def _pause(paused_at, resumed_at):
    return SimpleNamespace(paused_at=paused_at, resumed_at=resumed_at)


@pytest.mark.unit
@pytest.mark.parametrize('case', CASES, ids=[case['name'] for case in CASES])
def test_next_review_date_matches_the_shared_cases(case):
    pauses = [(date.fromisoformat(start), date.fromisoformat(end) if end else None) for start, end in case['pauses']]
    next_on, paused_days = next_review_date(
        date.fromisoformat(case['anchor']), case['cadence'], pauses, date.fromisoformat(case['today']),
    )
    assert {'next_review_on': next_on.isoformat() if next_on else None, 'paused_days': paused_days} == case['expected']


@pytest.mark.unit
def test_deferring_moves_one_cadence_past_the_review_due_or_today():
    assert deferred_review_date(_goal(), _level(), None, TODAY) == date(2027, 1, 19)
    # Long overdue: the next period starts from today, not from the missed date.
    overdue = _goal(started_at=datetime(2025, 1, 1))
    assert deferred_review_date(overdue, _level(), None, TODAY) == date(2027, 1, 19)
    assert deferred_review_date(_goal(review_disabled=True), _level(), None, TODAY) is None
