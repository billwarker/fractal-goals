import json
from datetime import datetime, timezone
from uuid import uuid4

import pytest

from models import (
    ActivityDefinition,
    ActivityInstance,
    FractalMetricDefinition,
    MetricDefinition,
    MetricValue,
    Session,
)
from services.progress_service import ProgressService


def _build_activity_with_metrics(db_session, root_id, *, metric_specs):
    activity = ActivityDefinition(
        id=str(uuid4()),
        root_id=root_id,
        name='Progress Test Activity',
        description='',
        has_sets=False,
        has_metrics=True,
        created_at=datetime.now(timezone.utc),
    )
    db_session.add(activity)
    db_session.flush()

    metrics = []
    for index, spec in enumerate(metric_specs):
        fractal_metric_id = None
        if spec.get('fractal_metric'):
            fractal_metric = spec['fractal_metric']
            db_session.add(fractal_metric)
            db_session.flush()
            fractal_metric_id = fractal_metric.id

        metric = MetricDefinition(
            id=str(uuid4()),
            activity_id=activity.id,
            root_id=root_id,
            fractal_metric_id=fractal_metric_id,
            name=spec['name'],
            unit=spec['unit'],
            is_best_set_metric=spec.get('is_best_set_metric', False),
            is_multiplicative=spec.get('is_multiplicative', True),
            track_progress=spec.get('track_progress', True),
            progress_aggregation=spec.get('progress_aggregation'),
            sort_order=index,
            is_active=True,
            created_at=datetime.now(timezone.utc),
        )
        db_session.add(metric)
        metrics.append(metric)

    db_session.flush()
    return activity, metrics


def _build_session(db_session, root_id, name, created_at):
    session = Session(
        id=str(uuid4()),
        name=name,
        description='',
        root_id=root_id,
        session_start=created_at,
        created_at=created_at,
        attributes=json.dumps({}),
    )
    db_session.add(session)
    db_session.flush()
    return session


def _build_instance(db_session, *, root_id, session_id, activity_id, created_at, completed=True, values, data=None):
    instance = ActivityInstance(
        id=str(uuid4()),
        root_id=root_id,
        session_id=session_id,
        activity_definition_id=activity_id,
        created_at=created_at,
        time_start=created_at,
        time_stop=created_at if completed else None,
        duration_seconds=0 if completed else None,
        completed=completed,
        data=json.dumps(data or {}),
    )
    db_session.add(instance)
    db_session.flush()

    for metric_definition_id, value in values.items():
        db_session.add(MetricValue(
            activity_instance_id=instance.id,
            metric_definition_id=metric_definition_id,
            value=value,
        ))

    db_session.flush()
    return instance


@pytest.mark.unit
class TestProgressService:
    def test_does_not_auto_switch_to_yield_without_explicit_request(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Weight', 'unit': 'lbs', 'is_multiplicative': True, 'progress_aggregation': 'last'},
                {'name': 'Reps', 'unit': 'reps', 'is_multiplicative': True, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 1, 1, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 1, 2, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 1, 1, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 100, metrics[1].id: 5},
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 1, 2, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 105, metrics[1].id: 5},
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['comparison_type'] == 'flat_metrics'
        assert len(result['metric_comparisons']) == 2
        assert all(item.get('type') != 'yield' for item in result['metric_comparisons'])

    def test_uses_yield_only_when_explicitly_requested(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Weight', 'unit': 'lbs', 'is_multiplicative': True, 'progress_aggregation': 'yield'},
                {'name': 'Reps', 'unit': 'reps', 'is_multiplicative': True, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 2, 1, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 2, 2, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 2, 1, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 100, metrics[1].id: 5},
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 2, 2, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 105, metrics[1].id: 5},
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['comparison_type'] == 'yield'
        assert result['metric_comparisons'][0]['type'] == 'yield'
        assert result['metric_comparisons'][0]['current_value'] == 525.0
        assert result['metric_comparisons'][0]['previous_value'] == 500.0

    def test_respects_lower_is_better_and_skips_untracked_metrics(self, db_session, sample_ultimate_goal):
        duration_metric = FractalMetricDefinition(
            id=str(uuid4()),
            root_id=sample_ultimate_goal.id,
            name='Duration',
            unit='seconds',
            higher_is_better=False,
            default_progress_aggregation='last',
            created_at=datetime.now(timezone.utc),
        )
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {
                    'name': 'Duration',
                    'unit': 'seconds',
                    'is_multiplicative': False,
                    'fractal_metric': duration_metric,
                    'track_progress': True,
                },
                {
                    'name': 'Internal Counter',
                    'unit': 'count',
                    'is_multiplicative': False,
                    'track_progress': False,
                },
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 3, 1, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 3, 2, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 3, 1, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 60, metrics[1].id: 10},
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 3, 2, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 55, metrics[1].id: 11},
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['comparison_type'] == 'flat_metrics'
        assert len(result['metric_comparisons']) == 1
        assert result['metric_comparisons'][0]['metric_name'] == 'Duration'
        assert result['metric_comparisons'][0]['improved'] is True
        assert result['has_improvement'] is True

    def test_keeps_previous_metric_baseline_when_current_value_is_empty(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Quality', 'unit': 'rating', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 1, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 2, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 1, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 11},
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 2, 10, 0, tzinfo=timezone.utc),
            completed=False,
            values={},
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['comparison_type'] == 'flat_metrics'
        assert len(result['metric_comparisons']) == 1
        assert result['metric_comparisons'][0]['metric_name'] == 'Quality'
        assert result['metric_comparisons'][0]['current_value'] is None
        assert result['metric_comparisons'][0]['previous_value'] == 11.0
        assert result['metric_comparisons'][0]['delta'] is None
        assert result['metric_comparisons'][0]['pct_change'] is None
        assert result['has_change'] is False

    def test_reads_last_metric_value_from_sets_for_progress(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Speed', 'unit': 'BPM', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 9, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 10, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 100}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 120}]},
                ],
            },
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 110}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 130}]},
                ],
            },
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['comparison_type'] == 'set_metrics'
        assert len(result['metric_comparisons']) == 1
        assert result['metric_comparisons'][0]['metric_name'] == 'Speed'
        assert result['metric_comparisons'][0]['previous_value'] == 120.0
        assert result['metric_comparisons'][0]['current_value'] == 130.0
        assert result['metric_comparisons'][0]['delta'] == 10.0
        assert result['metric_comparisons'][0]['pct_change'] == pytest.approx(8.3, abs=0.1)

    def test_progress_history_backfills_missing_records_for_completed_instances(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Speed', 'unit': 'BPM', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 9, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 10, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            values={},
            data={'sets': [{'metrics': [{'metric_id': metrics[0].id, 'value': 100}]}]},
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            values={},
            data={'sets': [{'metrics': [{'metric_id': metrics[0].id, 'value': 120}]}]},
        )
        db_session.commit()

        history = ProgressService(db_session).get_progress_history(activity.id, sample_ultimate_goal.id, limit=10)

        assert len(history) == 2
        latest = next(item for item in history if item['activity_instance_id'] == current_instance.id)
        assert latest['metric_comparisons'][0]['metric_name'] == 'Speed'
        assert latest['metric_comparisons'][0]['previous_value'] == 100.0
        assert latest['metric_comparisons'][0]['current_value'] == 120.0

    def test_falls_back_to_incomplete_previous_instance_for_live_hints(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Speed', 'unit': 'BPM', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 9, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 10, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            completed=False,
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 100}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 120}]},
                ],
            },
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            completed=False,
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': None}]},
                ],
            },
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['is_first_instance'] is False
        assert len(result['metric_comparisons']) == 1
        assert result['metric_comparisons'][0]['previous_value'] == 120.0
        assert result['metric_comparisons'][0]['current_value'] is None

    def test_ignores_blank_set_values_when_computing_progress(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Speed', 'unit': 'BPM', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 9, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 10, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            completed=False,
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 100}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 120}]},
                ],
            },
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            completed=False,
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': ''}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': ''}]},
                ],
            },
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        assert result['is_first_instance'] is False
        assert len(result['metric_comparisons']) == 1
        assert result['metric_comparisons'][0]['previous_value'] == 120.0
        assert result['metric_comparisons'][0]['current_value'] is None

    def test_recompute_progress_for_activity_rebases_downstream_instances(self, db_session, sample_ultimate_goal):
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {'name': 'Speed', 'unit': 'BPM', 'is_multiplicative': False, 'progress_aggregation': 'last'},
            ],
        )
        session_a = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Session A',
            datetime(2026, 4, 8, tzinfo=timezone.utc),
        )
        session_b = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Session B',
            datetime(2026, 4, 9, tzinfo=timezone.utc),
        )
        session_c = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Session C',
            datetime(2026, 4, 10, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=session_a.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 8, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 100},
        )
        middle_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=session_b.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 9, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 110},
        )
        latest_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=session_c.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 10, 10, 0, tzinfo=timezone.utc),
            values={metrics[0].id: 120},
        )
        db_session.commit()

        service = ProgressService(db_session)
        service.recompute_progress_for_activity(activity.id, sample_ultimate_goal.id)

        middle_metric = next(metric for metric in middle_instance.metric_values if metric.metric_definition_id == metrics[0].id)
        middle_metric.value = 130
        db_session.commit()

        service.recompute_progress_for_activity(activity.id, sample_ultimate_goal.id)
        latest_progress = service.get_progress_for_instance(latest_instance.id)

        assert latest_progress['previous_instance_id'] == middle_instance.id
        assert latest_progress['metric_comparisons'][0]['previous_value'] == 130.0
        assert latest_progress['metric_comparisons'][0]['current_value'] == 120.0
        assert latest_progress['metric_comparisons'][0]['delta'] == -10.0

    def test_best_set_uses_lower_is_better_anchor_and_targets_only_best_row(self, db_session, sample_ultimate_goal):
        duration_metric = FractalMetricDefinition(
            id=str(uuid4()),
            root_id=sample_ultimate_goal.id,
            name='Duration',
            unit='seconds',
            higher_is_better=False,
            default_progress_aggregation='max',
            created_at=datetime.now(timezone.utc),
        )
        activity, metrics = _build_activity_with_metrics(
            db_session,
            sample_ultimate_goal.id,
            metric_specs=[
                {
                    'name': 'Duration',
                    'unit': 'seconds',
                    'fractal_metric': duration_metric,
                    'is_multiplicative': False,
                    'progress_aggregation': 'max',
                    'is_best_set_metric': True,
                },
                {
                    'name': 'Accuracy',
                    'unit': 'score',
                    'is_multiplicative': False,
                    'progress_aggregation': 'max',
                },
            ],
        )
        prev_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Previous Session',
            datetime(2026, 4, 11, tzinfo=timezone.utc),
        )
        current_session = _build_session(
            db_session,
            sample_ultimate_goal.id,
            'Current Session',
            datetime(2026, 4, 12, tzinfo=timezone.utc),
        )
        _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=prev_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 11, 10, 0, tzinfo=timezone.utc),
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 40}, {'metric_id': metrics[1].id, 'value': 70}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 30}, {'metric_id': metrics[1].id, 'value': 75}]},
                ],
            },
        )
        current_instance = _build_instance(
            db_session,
            root_id=sample_ultimate_goal.id,
            session_id=current_session.id,
            activity_id=activity.id,
            created_at=datetime(2026, 4, 12, 10, 0, tzinfo=timezone.utc),
            values={},
            data={
                'sets': [
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 28}, {'metric_id': metrics[1].id, 'value': 82}]},
                    {'metrics': [{'metric_id': metrics[0].id, 'value': 35}, {'metric_id': metrics[1].id, 'value': 78}]},
                ],
            },
        )
        db_session.commit()

        result = ProgressService(db_session).compute_live_comparison(current_instance.id)

        duration_comparison = next(item for item in result['metric_comparisons'] if item['metric_id'] == metrics[0].id)
        accuracy_comparison = next(item for item in result['metric_comparisons'] if item['metric_id'] == metrics[1].id)

        assert duration_comparison['current_value'] == 28.0
        assert duration_comparison['previous_value'] == 30.0
        assert duration_comparison['improved'] is True
        assert len(duration_comparison['set_comparisons']) == 1
        best_set_comparison = duration_comparison['set_comparisons'][0]
        assert best_set_comparison['set_index'] == 0
        assert best_set_comparison['comparison_basis'] == 'best_set'
        assert best_set_comparison['previous_set_index'] == 1
        assert best_set_comparison['current_value'] == 28.0
        assert best_set_comparison['previous_value'] == 30.0
        assert best_set_comparison['delta'] == -2.0
        assert best_set_comparison['pct_change'] == pytest.approx(-6.7, abs=0.1)
        assert best_set_comparison['improved'] is True
        assert best_set_comparison['regressed'] is False
        assert accuracy_comparison['current_value'] == 82.0
        assert accuracy_comparison['previous_value'] == 75.0
        assert accuracy_comparison['set_comparisons'][0]['set_index'] == 0
