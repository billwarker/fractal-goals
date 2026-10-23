/**
 * Reading a goal off an analytics chart at a pointer position. Each supported chart tags its
 * dataset with the ids needed (metricId, metricX/metricY, activityIds/measure); the values come
 * from the chart's scales, and utils/chartGoalPrefill.js turns them into a condition.
 */
import {
    goalFromActivityTotal, goalFromMetricProgress, goalFromMetricTrend, goalFromScatterPoint,
} from '../../utils/chartGoalPrefill';
import { buildMetricTrendData } from './visualizations/activities/MetricTrends';

export const GOAL_CHART_IDS = new Set(['metricTrends', 'metricProgress', 'scatterPlot', 'activityFrequency']);

function pointerOnChart(chart, clientX, clientY) {
    const rect = chart.canvas.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const area = chart.chartArea;
    if (!area || x < area.left || x > area.right || y < area.top || y > area.bottom) return null;
    return { x, y };
}

function latestValue(context, activity, metricId) {
    const { datasets } = buildMetricTrendData({
        instances: context.scopedData.activityInstances?.[activity.id] || [],
        metricDefinitions: activity.metric_definitions || [],
        selectedMetrics: [metricId],
    });
    const values = (datasets[0]?.data || []).filter((value) => value != null);
    return values.length ? values[values.length - 1] : null;
}

/**
 * @returns {{ activity, conditionDraft, summary } | { unsupported: string } | null}
 *   null when the point isn't on a chart that can suggest a goal.
 */
export function readChartGoalTarget({ visualizationId, chart, nativeEvent, context }) {
    if (!chart || !GOAL_CHART_IDS.has(visualizationId)) return null;
    const point = pointerOnChart(chart, nativeEvent.clientX, nativeEvent.clientY);
    if (!point) return null;
    const datasets = chart.data?.datasets || [];
    const activity = context.effectiveSelectedActivity;
    let target = null;

    if (visualizationId === 'metricTrends') {
        const [nearest] = chart.getElementsAtEventForMode(nativeEvent, 'nearest', { intersect: false, axis: 'xy' }, false);
        const dataset = datasets[nearest?.datasetIndex ?? 0];
        if (!activity || !dataset?.metricId) return null;
        const value = chart.scales[dataset.yAxisID]?.getValueForPixel(point.y);
        target = goalFromMetricTrend({ activity, metricId: dataset.metricId, value });
    } else if (visualizationId === 'scatterPlot') {
        const dataset = datasets[0];
        if (!activity || !dataset?.metricX || !dataset?.metricY) return null;
        target = goalFromScatterPoint({
            activity,
            metricX: dataset.metricX, x: chart.scales.x.getValueForPixel(point.x),
            metricY: dataset.metricY, y: chart.scales.y.getValueForPixel(point.y),
        });
    } else if (visualizationId === 'metricProgress') {
        const dataset = datasets[0];
        if (!activity || !dataset?.metricId) return null;
        target = goalFromMetricProgress({
            activity,
            metricId: dataset.metricId,
            percent: chart.scales.y.getValueForPixel(point.y),
            latestValue: latestValue(context, activity, dataset.metricId),
        });
    } else if (visualizationId === 'activityFrequency') {
        const dataset = datasets[0];
        const index = Math.round(chart.scales.y.getValueForPixel(point.y));
        const totalsActivity = (context.scopedData.activities || [])
            .find((item) => String(item.id) === String(dataset?.activityIds?.[index]));
        if (!totalsActivity) return null;
        if (dataset.measure === 'duration') return { unsupported: 'Time totals can’t become a goal condition yet' };
        target = goalFromActivityTotal({
            activity: totalsActivity, measure: dataset.measure, value: chart.scales.x.getValueForPixel(point.x),
        });
        return target ? { ...target, activity: totalsActivity } : null;
    }
    return target ? { ...target, activity } : null;
}
