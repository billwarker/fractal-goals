from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from services.goal_target_service import GoalTargetService


@pytest.mark.unit
def test_target_summary_preserves_canonical_best_set_tuple():
    speed = SimpleNamespace(
        id='speed', deleted_at=None, is_best_set_metric=True, higher_is_better=True,
    )
    quality = SimpleNamespace(
        id='quality', deleted_at=None, is_best_set_metric=False, higher_is_better=True,
    )
    conditions = [
        SimpleNamespace(metric_definition_id='speed', operator='>=', target_value=100, metric=speed),
        SimpleNamespace(metric_definition_id='quality', operator='>=', target_value=8, metric=quality),
    ]
    target = SimpleNamespace(
        created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        metric_conditions=conditions,
        completed=False,
        completed_at=None,
        completed_session_id=None,
        completed_instance_id=None,
    )
    instances = [{
        'id': 'instance-1',
        'session_date': '2026-07-11T12:00:00Z',
        'session_id': 'session-1',
        'sets': [
            {'metrics': [{'metric_definition_id': 'speed', 'value': 50}, {'metric_definition_id': 'quality', 'value': 8}]},
            {'metrics': [{'metric_definition_id': 'speed', 'value': 80}, {'metric_definition_id': 'quality', 'value': 5}]},
        ],
    }]

    summary = GoalTargetService(None)._build_target_summary(
        target,
        instances,
        SimpleNamespace(metric_definitions=[speed, quality]),
    )

    assert [condition['best_value'] for condition in summary['conditions']] == [80.0, 5.0]
    assert [condition['met_count'] for condition in summary['conditions']] == [0, 0]


@pytest.mark.unit
def test_target_summary_best_set_respects_lower_is_better_anchor():
    duration = SimpleNamespace(
        id='duration', deleted_at=None, is_best_set_metric=True, higher_is_better=False,
    )
    quality = SimpleNamespace(
        id='quality', deleted_at=None, is_best_set_metric=False, higher_is_better=True,
    )
    target = SimpleNamespace(
        created_at=datetime(2026, 7, 1, tzinfo=timezone.utc),
        metric_conditions=[
            SimpleNamespace(metric_definition_id='duration', operator='<=', target_value=30, metric=duration),
            SimpleNamespace(metric_definition_id='quality', operator='>=', target_value=8, metric=quality),
        ],
        completed=False, completed_at=None, completed_session_id=None, completed_instance_id=None,
    )
    instances = [{
        'id': 'instance-1', 'session_date': '2026-07-11T12:00:00Z', 'session_id': 'session-1',
        'sets': [
            {'metrics': [{'metric_definition_id': 'duration', 'value': 28}, {'metric_definition_id': 'quality', 'value': 7}]},
            {'metrics': [{'metric_definition_id': 'duration', 'value': 32}, {'metric_definition_id': 'quality', 'value': 9}]},
        ],
    }]

    summary = GoalTargetService(None)._build_target_summary(
        target, instances, SimpleNamespace(metric_definitions=[duration, quality]),
    )

    assert [condition['best_value'] for condition in summary['conditions']] == [28.0, 7.0]
