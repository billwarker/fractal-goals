"""Which chart the Progress pane draws for an activity, and remembering the choice.

Kinds:

- ``goal``: the in-scope goal condition's chart (with its threshold), when there is one;
- ``activity_trend``: one series over time, a tracked metric or the activity's yield;
- ``scatter``: one tracked metric against another, a point per session;
- ``metric_trend``: two tracked metrics over time on two axes.

A choice is saved per activity in the session's template and program day (both None for
sessions with neither, which is also the fallback). Reads never fail: a saved field that no
longer applies (a deleted metric, a goal that went out of scope) falls back to the default.
"""

from __future__ import annotations

from models import ActivityInstance, ActivityProgressChart, Goal
from services.events import Event, Events, event_bus
from services.goal_condition_service import active_metric_definitions, yield_metric_ids

FIELDS = ('kind', 'trend_series', 'metric_id', 'x_metric_id', 'y_metric_id', 'set_aggregation')


def tracked_metrics(activity) -> list:
    """The activity's tracked metrics, in display order."""
    return sorted(
        (metric for metric in active_metric_definitions(activity) if metric.track_progress is not False),
        key=lambda metric: (metric.sort_order or 0, str(metric.id)),
    )


def availability(activity, has_goal: bool) -> dict:
    """The kinds, metrics and series this activity can chart."""
    metric_ids = [metric.id for metric in tracked_metrics(activity)]
    kinds = [
        kind for kind, ok in (
            ('goal', has_goal),
            ('activity_trend', bool(metric_ids)),
            ('scatter', len(metric_ids) >= 2),
            ('metric_trend', len(metric_ids) >= 2),
        ) if ok
    ]
    return {
        'kinds': kinds,
        'metric_ids': metric_ids,
        'yield': bool(yield_metric_ids(activity)),
        'has_sets': bool(activity.has_sets),
    }


def _headline_metric_id(activity):
    metrics = tracked_metrics(activity)
    best = next((metric for metric in metrics if metric.is_best_set_metric is True), None)
    return (best or metrics[0]).id if metrics else None


def _axis_metric_ids(activity):
    """Default (x, y): the first two tracked metrics, with a best-set metric on y."""
    metrics = tracked_metrics(activity)
    best = next((metric for metric in metrics if metric.is_best_set_metric is True), None)
    if best is not None:
        others = [metric for metric in metrics if metric.id != best.id]
        return (others[0].id if others else None), best.id
    return metrics[0].id, metrics[1].id


def default_settings(activity, available: dict) -> dict | None:
    """Goal progress when a goal applies; else a scatter for 2+ metrics; else a trend."""
    kinds = available['kinds']
    settings = dict.fromkeys(FIELDS)
    settings['set_aggregation'] = 'top'
    if 'goal' in kinds:
        settings['kind'] = 'goal'
    elif 'scatter' in kinds:
        settings['kind'] = 'scatter'
        settings['x_metric_id'], settings['y_metric_id'] = _axis_metric_ids(activity)
    elif 'activity_trend' in kinds:
        settings['kind'] = 'activity_trend'
        if available['yield']:
            settings['trend_series'] = 'yield'
        else:
            settings['trend_series'] = 'metric'
            settings['metric_id'] = _headline_metric_id(activity)
    else:
        return None
    return settings


def _fill_for_kind(activity, settings: dict, available: dict) -> dict:
    """Keep the fields a kind uses (falling back per field), clear the rest."""
    metric_ids = available['metric_ids']
    kind = settings['kind']
    filled = dict.fromkeys(FIELDS)
    filled['kind'] = kind
    if kind == 'activity_trend':
        series = settings.get('trend_series')
        if series == 'yield' and available['yield']:
            filled['trend_series'] = 'yield'
        else:
            filled['trend_series'] = 'metric'
            metric_id = settings.get('metric_id')
            filled['metric_id'] = metric_id if metric_id in metric_ids else _headline_metric_id(activity)
    elif kind in ('scatter', 'metric_trend'):
        x_id, y_id = settings.get('x_metric_id'), settings.get('y_metric_id')
        if x_id not in metric_ids or y_id not in metric_ids or x_id == y_id:
            x_id, y_id = _axis_metric_ids(activity)
        filled['x_metric_id'], filled['y_metric_id'] = x_id, y_id
    aggregation = settings.get('set_aggregation') or 'top'
    if aggregation == 'total' and filled['trend_series'] != 'yield':
        aggregation = 'top'
    filled['set_aggregation'] = aggregation if kind != 'goal' else 'top'
    return filled


def _context_keys(session):
    return getattr(session, 'template_id', None), getattr(session, 'program_day_id', None)


def _matches_context(query, template_id, program_day_id):
    return query.filter(
        ActivityProgressChart.session_template_id.is_(None) if template_id is None
        else ActivityProgressChart.session_template_id == template_id,
        ActivityProgressChart.program_day_id.is_(None) if program_day_id is None
        else ActivityProgressChart.program_day_id == program_day_id,
    )


class ProgressChartSettingsService:
    def __init__(self, db_session):
        self.db = db_session

    def _saved_rows(self, activity, session):
        """The exact row for the session's template/program day, then the activity-wide row."""
        template_id, program_day_id = _context_keys(session)
        rows = self.db.query(ActivityProgressChart).filter(
            ActivityProgressChart.activity_definition_id == activity.id,
            (
                (ActivityProgressChart.session_template_id.is_(None) & ActivityProgressChart.program_day_id.is_(None))
                | (
                    ActivityProgressChart.session_template_id.isnot_distinct_from(template_id)
                    & ActivityProgressChart.program_day_id.isnot_distinct_from(program_day_id)
                )
            ),
        ).all()
        exact = next((
            row for row in rows
            if row.session_template_id == template_id and row.program_day_id == program_day_id
        ), None)
        wide = next((row for row in rows if row.session_template_id is None and row.program_day_id is None), None)
        return exact, wide

    def resolve(self, activity, session, *, has_goal: bool) -> dict | None:
        """The chart to draw: the saved choice (validated) or the default; None if nothing charts."""
        available = availability(activity, has_goal)
        default = default_settings(activity, available)
        if default is None:
            return None
        exact, wide = self._saved_rows(activity, session)
        saved = exact or wide
        settings, source = default, 'default'
        if saved is not None and saved.kind in available['kinds']:
            settings = _fill_for_kind(activity, {field: getattr(saved, field) for field in FIELDS}, available)
            source = 'saved'
        return {
            **settings,
            'source': source,
            # The version the pane sends back: the row a save would replace (exact context only).
            'version': exact.version if exact is not None else None,
            'available': available,
        }

    def save(self, root_id, instance_id, user_id, data):
        """Remember a chart for the instance's activity in its template/program day."""
        from services.progress_chart_spec import chart_spec

        owned = self.db.query(Goal.id).filter(
            Goal.id == root_id, Goal.owner_id == user_id, Goal.deleted_at.is_(None),
        ).first()
        instance = self.db.query(ActivityInstance).filter(
            ActivityInstance.id == instance_id,
            ActivityInstance.root_id == root_id,
            ActivityInstance.deleted_at.is_(None),
        ).first() if owned else None
        if instance is None or instance.definition is None:
            return None, 'Activity instance not found', 404
        activity = instance.definition
        session = instance.session
        spec = chart_spec(self.db, activity, instance.session_id)
        has_goal = bool(spec and spec.get('source') == 'goal_condition')
        available = availability(activity, has_goal)
        error = self._unavailable(data, available)
        if error:
            return {'code': 'chart_unavailable', 'available': available}, error, 422
        template_id, program_day_id = _context_keys(session)
        row = _matches_context(self.db.query(ActivityProgressChart).filter(
            ActivityProgressChart.activity_definition_id == activity.id,
        ), template_id, program_day_id).with_for_update().first()
        version = data.get('version')
        if version is not None and (row.version if row is not None else None) != version:
            current = self.resolve(activity, session, has_goal=has_goal)
            return {'current': current}, 'The chart was changed elsewhere', 409
        values = _fill_for_kind(activity, data, available)
        if row is None:
            row = ActivityProgressChart(
                root_id=activity.root_id,
                activity_definition_id=activity.id,
                session_template_id=template_id,
                program_day_id=program_day_id,
                **values,
            )
            self.db.add(row)
        else:
            for field, value in values.items():
                setattr(row, field, value)
            row.version += 1
        self.db.commit()
        event_bus.emit(Event(Events.ACTIVITY_PROGRESS_CHART_UPDATED, {
            'root_id': root_id,
            'activity_id': activity.id,
            'instance_id': instance.id,
            'kind': values['kind'],
        }, source='progress_chart_settings'))
        return {'chart_settings': self.resolve(activity, session, has_goal=has_goal)}, None, 200

    @staticmethod
    def _unavailable(data, available) -> str | None:
        kind = data.get('kind')
        metric_ids = available['metric_ids']
        if kind not in available['kinds']:
            return 'That chart isn’t available for this activity'
        if kind == 'activity_trend':
            series = data.get('trend_series')
            if series == 'yield' and not available['yield']:
                return 'This activity has no yield'
            if series == 'metric' and data.get('metric_id') not in metric_ids:
                return 'Choose one of the activity’s tracked metrics'
        if kind in ('scatter', 'metric_trend'):
            x_id, y_id = data.get('x_metric_id'), data.get('y_metric_id')
            if x_id not in metric_ids or y_id not in metric_ids or x_id == y_id:
                return 'Choose two different tracked metrics'
        if data.get('set_aggregation') == 'total' and not (kind == 'activity_trend' and data.get('trend_series') == 'yield'):
            return 'Total applies to yield only'
        return None
