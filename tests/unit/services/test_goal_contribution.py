from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from services.goal_contribution import (
    goal_was_completed_before,
    goal_was_paused_at,
    resolve_contribution_goal,
)


def _goal(**kwargs):
    base = dict(id='g1', paused=False, completed_at=None, pause_intervals=[])
    base.update(kwargs)
    return SimpleNamespace(**base)


def _interval(paused_at, resumed_at=None):
    return SimpleNamespace(paused_at=paused_at, resumed_at=resumed_at)


NOW = datetime(2026, 6, 16, 12, 0, tzinfo=timezone.utc)


class TestGoalWasCompletedBefore:
    def test_activity_after_completion_is_excluded(self):
        goal = _goal(completed_at=NOW - timedelta(days=2))
        assert goal_was_completed_before(goal, NOW) is True

    def test_activity_before_completion_is_included(self):
        goal = _goal(completed_at=NOW + timedelta(days=2))
        assert goal_was_completed_before(goal, NOW) is False

    def test_no_completion_is_included(self):
        assert goal_was_completed_before(_goal(), NOW) is False


class TestGoalWasPausedAt:
    def test_timestamp_inside_open_interval_excluded(self):
        goal = _goal(pause_intervals=[_interval(NOW - timedelta(days=1))])
        assert goal_was_paused_at(goal, NOW) is True

    def test_timestamp_inside_closed_interval_excluded(self):
        goal = _goal(pause_intervals=[
            _interval(NOW - timedelta(days=2), NOW - timedelta(hours=1)),
        ])
        assert goal_was_paused_at(goal, NOW - timedelta(days=1)) is True

    def test_timestamp_after_resume_included(self):
        goal = _goal(pause_intervals=[
            _interval(NOW - timedelta(days=2), NOW - timedelta(days=1)),
        ])
        assert goal_was_paused_at(goal, NOW) is False

    def test_timestamp_before_pause_included(self):
        goal = _goal(pause_intervals=[_interval(NOW)])
        assert goal_was_paused_at(goal, NOW - timedelta(days=1)) is False

    def test_no_intervals_included(self):
        assert goal_was_paused_at(_goal(), NOW) is False


class TestResolveContributionGoal:
    def test_active_goal_resolves(self):
        assert resolve_contribution_goal(_goal(), NOW) is not None

    def test_currently_paused_flag_suppressed(self):
        assert resolve_contribution_goal(_goal(paused=True), NOW) is None

    def test_completed_before_activity_suppressed(self):
        goal = _goal(completed_at=NOW - timedelta(days=1))
        assert resolve_contribution_goal(goal, NOW) is None

    def test_activity_during_past_pause_suppressed_after_resume(self):
        goal = _goal(pause_intervals=[
            _interval(NOW - timedelta(days=3), NOW - timedelta(days=1)),
        ])
        # Activity happened mid-pause; goal is now resumed but it must not count.
        assert resolve_contribution_goal(goal, NOW - timedelta(days=2)) is None
