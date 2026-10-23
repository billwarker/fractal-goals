"""What the Progress pane's chart plots when no goal condition applies."""

from models import ActivityDefinition, FractalMetricDefinition, MetricDefinition
from services.goal_condition_service import yield_metric_ids
from services.progress_chart_spec import synthesize_condition


def _metric(name, *, own_multiplicative=True, fractal_multiplicative=None, best=False, sort_order=0):
    metric = MetricDefinition(
        id=f'metric-{name}', name=name, unit='u', is_active=True, track_progress=True,
        is_multiplicative=own_multiplicative, is_best_set_metric=best, sort_order=sort_order,
    )
    if fractal_multiplicative is not None:
        metric.fractal_metric = FractalMetricDefinition(
            id=f'fractal-{name}', name=name, unit='u', is_multiplicative=fractal_multiplicative,
        )
    return metric


def _activity(*metrics):
    return ActivityDefinition(id='activity', name='Pike push ups', has_sets=True, metric_definitions=list(metrics))


def test_yield_needs_every_metric_multiplicative():
    activity = _activity(_metric('reps', sort_order=0), _metric('weight', sort_order=1))
    assert yield_metric_ids(activity) == ('metric-reps', 'metric-weight')
    assert synthesize_condition(activity)['measure'] == 'yield'


def test_the_linked_fractal_metric_decides_over_a_stale_activity_copy():
    # The activity's own column still says multiplicative (its default); the shared metric says not.
    distance = _metric('distance', own_multiplicative=True, fractal_multiplicative=False, sort_order=0)
    reps = _metric('reps', fractal_multiplicative=True, sort_order=1)
    activity = _activity(distance, reps)
    assert distance.multiplies is False
    assert yield_metric_ids(activity) == ()
    condition = synthesize_condition(activity)
    assert condition['measure'] == 'sets'
    assert condition['rules'][0]['metric_definition_id'] == 'metric-distance'
