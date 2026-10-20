from datetime import date, datetime
from types import SimpleNamespace

import pytest

from services.goal_review_rules import deferred_review_date, review_cadence, review_state

TODAY = date(2026, 10, 19)


def _level(uses=True, value=3, unit='months'):
    return SimpleNamespace(uses_reviews=uses, review_cadence_value=value, review_cadence_unit=unit)


def _goal(**overrides):
    fields = dict(
        review_cadence_value=None, review_cadence_unit=None, review_disabled=False, review_deferred_until=None,
        completed=False, started_at=datetime(2026, 7, 19), created_at=datetime(2026, 1, 1),
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
            'last_review_on': None, 'next_review_on': '2026-10-19', 'deferred_until': None, 'status': 'due',
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

    def test_review_cadence_needs_both_parts(self):
        assert review_cadence(_goal(review_cadence_value=2), _level(value=None, unit=None)) is None


@pytest.mark.unit
def test_deferring_moves_one_cadence_past_the_review_due_or_today():
    assert deferred_review_date(_goal(), _level(), None, TODAY) == date(2027, 1, 19)
    # Long overdue: the next period starts from today, not from the missed date.
    overdue = _goal(started_at=datetime(2025, 1, 1))
    assert deferred_review_date(overdue, _level(), None, TODAY) == date(2027, 1, 19)
    assert deferred_review_date(_goal(review_disabled=True), _level(), None, TODAY) is None
