import { YIELD_METRIC_ID } from '../analytics/visualizations/activities/MetricTrends';

/** The kinds the Progress pane can draw, in the order the chart picker lists them. */
export const CHART_KINDS = [
    ['goal', 'Goal progress'],
    ['activity_trend', 'Activity trend'],
    ['scatter', 'Scatter'],
    ['metric_trend', 'Metric trend'],
];

/** The activity's tracked metrics the server allows (`available.metric_ids`), in its order. */
export function chartMetrics(series) {
    const ids = series?.chart_settings?.available?.metric_ids || [];
    const byId = new Map((series?.activity_definition?.metric_definitions || []).map((metric) => [metric.id, metric]));
    return ids.map((id) => byId.get(id)).filter(Boolean);
}

const metricName = (metrics, id) => metrics.find((metric) => metric.id === id)?.name || 'Metric';

/** A short name for what the chart shows, e.g. "Reps over time" or "Reps vs Distance". */
export function progressChartTitle(series) {
    const settings = series?.chart_settings;
    if (!settings) return '';
    const metrics = chartMetrics(series);
    switch (settings.kind) {
        case 'goal':
            return `Goal: ${series.chart?.goal_name || 'progress'}`;
        case 'activity_trend':
            return `${settings.trend_series === 'yield' ? 'Yield' : metricName(metrics, settings.metric_id)} over time`;
        case 'scatter':
            return `${metricName(metrics, settings.y_metric_id)} vs ${metricName(metrics, settings.x_metric_id)}`;
        case 'metric_trend':
            return `${metricName(metrics, settings.x_metric_id)} and ${metricName(metrics, settings.y_metric_id)} over time`;
        default:
            return '';
    }
}

/** The series a trend plots: metric ids for MetricTrendsChart (yield as its pseudo-metric). */
export function trendMetricIds(settings) {
    if (settings.kind === 'activity_trend') {
        return [settings.trend_series === 'yield' ? YIELD_METRIC_ID : settings.metric_id].filter(Boolean);
    }
    return [settings.x_metric_id, settings.y_metric_id].filter(Boolean);
}

/**
 * Settings for switching to `kind`, keeping what still applies: the trend's metric or yield, the
 * axes, and the set aggregation (Total only stays on yield).
 */
export function settingsForKind(kind, current, available, metrics) {
    const ids = metrics.map((metric) => metric.id);
    const keep = (id) => (ids.includes(id) ? id : null);
    const next = { kind, trend_series: null, metric_id: null, x_metric_id: null, y_metric_id: null };
    if (kind === 'activity_trend') {
        const metricId = keep(current.metric_id) || keep(current.y_metric_id) || ids[0] || null;
        const wantsYield = current.kind === 'activity_trend' ? current.trend_series === 'yield' : !metricId;
        next.trend_series = wantsYield && available.yield ? 'yield' : 'metric';
        next.metric_id = next.trend_series === 'metric' ? metricId : null;
    } else if (kind === 'scatter' || kind === 'metric_trend') {
        const x = keep(current.x_metric_id) || ids[0];
        const y = keep(current.y_metric_id) && current.y_metric_id !== x ? current.y_metric_id : ids.find((id) => id !== x);
        next.x_metric_id = x || null;
        next.y_metric_id = y || null;
    }
    const aggregation = current.set_aggregation || 'top';
    next.set_aggregation = aggregation === 'total' && next.trend_series !== 'yield' ? 'top' : aggregation;
    return next;
}
