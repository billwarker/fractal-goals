"""The Progress pane's chart: defaults, remembered choices per template/program day, validation."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from models import ActivityProgressChart, MetricDefinition
from tests.integration.test_progress_comparison_api import history, scoped  # noqa: F401  (fixtures)


def _series(client, root_id, activity_id, instance_id):
    response = client.get(f'/api/{root_id}/activities/{activity_id}/progress-series?instance_id={instance_id}')
    assert response.status_code == 200, response.get_json()
    return response.get_json()['chart_settings']


def _save(client, root_id, instance_id, **body):
    return client.put(f'/api/{root_id}/activity-instances/{instance_id}/progress-chart', json=body)


@pytest.fixture
def reps(db_session, scoped):
    """A second tracked metric, so the activity can scatter."""
    activity = scoped['activity']
    metric = MetricDefinition(
        id=str(uuid4()), activity_id=activity.id, root_id=activity.root_id, name='Reps', unit='reps',
        is_multiplicative=False, track_progress=True, is_active=True, sort_order=1,
    )
    db_session.add(metric)
    db_session.commit()
    return metric


@pytest.mark.integration
def test_one_metric_trends_it_and_two_metrics_default_to_a_scatter(authed_client, db_session, scoped):
    root_id, activity, weight = scoped['root_id'], scoped['activity'], scoped['metric']
    current = scoped['log_in'](0, 100)
    single = _series(authed_client, root_id, activity.id, current.id)
    assert (single['kind'], single['trend_series'], single['metric_id']) == ('activity_trend', 'metric', weight.id)
    assert single['available']['kinds'] == ['activity_trend']
    assert single['source'] == 'default'

    reps = MetricDefinition(
        id=str(uuid4()), activity_id=activity.id, root_id=root_id, name='Reps', unit='reps',
        is_multiplicative=False, track_progress=True, is_active=True, sort_order=1,
    )
    db_session.add(reps)
    db_session.commit()
    pair = _series(authed_client, root_id, activity.id, current.id)
    assert (pair['kind'], pair['x_metric_id'], pair['y_metric_id']) == ('scatter', weight.id, reps.id)
    assert pair['available']['kinds'] == ['activity_trend', 'scatter', 'metric_trend']
    assert pair['set_aggregation'] == 'top'


@pytest.mark.integration
def test_a_choice_is_remembered_per_template_and_program_day_with_an_activity_wide_fallback(
    authed_client, db_session, scoped, reps,
):
    root_id, activity = scoped['root_id'], scoped['activity']
    upper, lower = scoped['templates']
    day_a, _ = scoped['days']
    log = scoped['log_in']
    first = log(0, 100, template=upper, program_day=day_a)

    saved = _save(authed_client, root_id, first.id, kind='activity_trend', trend_series='metric',
                  metric_id=reps.id, set_aggregation='average')
    assert saved.status_code == 200, saved.get_json()
    settings = saved.get_json()['chart_settings']
    assert (settings['kind'], settings['metric_id'], settings['set_aggregation'], settings['source']) == (
        'activity_trend', reps.id, 'average', 'saved',
    )
    assert settings['version'] == 1

    # The next session in the same template and day starts from it; another template doesn't.
    again = log(1, 105, template=upper, program_day=day_a)
    assert _series(authed_client, root_id, activity.id, again.id)['metric_id'] == reps.id
    elsewhere = log(2, 95, template=lower)
    assert _series(authed_client, root_id, activity.id, elsewhere.id)['kind'] == 'scatter'

    # A session with neither saves the activity-wide choice, which other contexts fall back to.
    ad_hoc = log(3, 90)
    assert _save(authed_client, root_id, ad_hoc.id, kind='metric_trend', x_metric_id=reps.id,
                 y_metric_id=scoped['metric'].id).status_code == 200
    fallback = _series(authed_client, root_id, activity.id, elsewhere.id)
    assert (fallback['kind'], fallback['x_metric_id'], fallback['version']) == ('metric_trend', reps.id, None)
    assert _series(authed_client, root_id, activity.id, again.id)['kind'] == 'activity_trend'
    assert db_session.query(ActivityProgressChart).filter_by(activity_definition_id=activity.id).count() == 2


@pytest.mark.integration
def test_saves_are_validated_and_versioned(authed_client, scoped, reps):
    root_id = scoped['root_id']
    current = scoped['log_in'](0, 100, template=scoped['templates'][0])
    weight = scoped['metric']

    same_axis = _save(authed_client, root_id, current.id, kind='scatter', x_metric_id=weight.id, y_metric_id=weight.id)
    assert same_axis.status_code == 422
    no_yield = _save(authed_client, root_id, current.id, kind='activity_trend', trend_series='yield')
    assert no_yield.status_code == 422
    total = _save(authed_client, root_id, current.id, kind='activity_trend', trend_series='metric',
                  metric_id=weight.id, set_aggregation='total')
    assert total.status_code == 422
    goal = _save(authed_client, root_id, current.id, kind='goal')
    assert goal.status_code == 422
    assert goal.get_json()['details']['available']['kinds'] == ['activity_trend', 'scatter', 'metric_trend']

    first = _save(authed_client, root_id, current.id, kind='scatter', x_metric_id=reps.id, y_metric_id=weight.id)
    assert first.status_code == 200
    stale = _save(authed_client, root_id, current.id, kind='metric_trend', x_metric_id=reps.id,
                  y_metric_id=weight.id, version=7)
    assert stale.status_code == 409
    assert stale.get_json()['details']['current']['kind'] == 'scatter'
    fresh = _save(authed_client, root_id, current.id, kind='metric_trend', x_metric_id=reps.id,
                  y_metric_id=weight.id, version=1)
    assert fresh.get_json()['chart_settings']['version'] == 2


@pytest.mark.integration
def test_a_saved_metric_that_goes_away_falls_back_without_failing(authed_client, db_session, scoped, reps):
    root_id, activity = scoped['root_id'], scoped['activity']
    current = scoped['log_in'](0, 100)
    assert _save(authed_client, root_id, current.id, kind='activity_trend', trend_series='metric',
                 metric_id=reps.id).status_code == 200
    reps.deleted_at = datetime.now(timezone.utc)
    db_session.commit()
    settings = _series(authed_client, root_id, activity.id, current.id)
    # Scatter is no longer available with one metric, but the saved trend still applies, on Weight.
    assert (settings['kind'], settings['metric_id'], settings['source']) == ('activity_trend', scoped['metric'].id, 'saved')
