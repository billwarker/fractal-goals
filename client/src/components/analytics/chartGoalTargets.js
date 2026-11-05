/**
 * Reading a goal off an analytics chart at a pointer position. Each supported chart tags its
 * datasets with the ids needed (metricId, metricX/metricY, activityIds/measure, runningTotal); the
 * values come from the chart's scales, snapped to what the metric can hold, and
 * utils/chartGoalPrefill.js turns them into a condition. Alongside the goal it returns crosshair
 * guides: where the snapped values sit on the canvas and how they read.
 */
import { formatBucketRange, formatMetric, snapMetricValue } from '../../utils/chartFormat';
import {
    goalFromActivityTotal, goalFromMetricProgress, goalFromMetricTrend, goalFromRunningTotal, goalFromScatterPoint, goalFromYieldTrend,
    withChartScope,
} from '../../utils/chartGoalPrefill';
import { activeMetricDefinitions } from '../../utils/goalConditions';
import { activityYieldIds, buildMetricTrendData, getSelectedMetricDefs, YIELD_METRIC_ID } from './visualizations/activities/MetricTrends';

export const GOAL_CHART_IDS = new Set(['metricTrends', 'metricProgress', 'scatterPlot', 'activityFrequency', 'activityTrends']);

/**
 * Whether goals can be set from this chart. Metric Trends draws each metric on its own axis, so only
 * with one showing does a point name one goal; two metrics together belong on the scatter plot.
 */
export function canSetGoalFromChart(visualizationId, activity, metrics = []) {
    if (!GOAL_CHART_IDS.has(visualizationId)) return false;
    if (visualizationId !== 'metricTrends') return true;
    return getSelectedMetricDefs(activity?.metric_definitions || [], metrics, activityYieldIds(activity)).length <= 1;
}

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

const findMetric = (activity, metricId) => activeMetricDefinitions(activity)
    .find((metric) => String(metric.id) === String(metricId)) || null;

/** A guide on a metric axis: the snapped value, where it sits, and how it reads. */
function metricGuide(scale, metric, rawValue) {
    const value = snapMetricValue(metric, rawValue);
    if (value == null) return null;
    return { value, pixel: scale.getPixelForValue(value), label: formatMetric(metric, value) };
}

/** A guide on a category axis: the nearest category under the pointer. */
function categoryGuide(chart, scale, pixel) {
    const index = Math.round(scale.getValueForPixel(pixel));
    const labels = chart.data?.labels || [];
    if (index < 0 || index >= labels.length) return null;
    return { index, pixel: scale.getPixelForValue(index), label: String(labels[index]) };
}

/** A whole-number guide (counts). */
function countGuide(scale, rawValue) {
    const value = Math.max(0, Math.round(rawValue));
    return { value, pixel: scale.getPixelForValue(value), label: String(value) };
}

/** The last day of the bucket that starts on `key`, as "YYYY-MM-DD". */
function bucketEnd(key, grain) {
    const [year, month, day] = key.split('-').map(Number);
    const end = grain === 'month' ? new Date(Date.UTC(year, month, 0))
        : new Date(Date.UTC(year, month - 1, day + (grain === 'week' ? 6 : 0)));
    return end.toISOString().slice(0, 10);
}

function readRunningTotal({ chart, point }) {
    const dataset = chart.data?.datasets?.find((item) => item.runningTotal) || null;
    const meta = dataset?.runningTotal;
    if (!meta) return { unsupported: 'Turn on Running total to set a goal from Activity Trends', guides: {} };
    const x = categoryGuide(chart, chart.scales.x, point.x);
    const y = countGuide(chart.scales.y, chart.scales.y.getValueForPixel(point.y));
    const guides = { x, y };
    if (!meta.activity) return { unsupported: 'Filter to one activity to set a goal here', guides };
    if (!x || x.index <= meta.todayIndex) return { unsupported: 'Pick a future date for a running total goal', guides };
    const key = meta.bucketKeys[x.index];
    const end = bucketEnd(key, meta.grain);
    const target = goalFromRunningTotal({
        activity: meta.activity, total: y.value, current: meta.current, deadline: end, deadlineLabel: formatBucketRange(end, 'day'),
    });
    return target ? { ...target, activity: meta.activity, guides } : null;
}

/**
 * @returns {{ activity, conditionDraft, summary, deadline?, notes, guides } | { unsupported: string, guides } | null}
 *   null when the point isn't on a chart that can suggest a goal.
 */
export function readChartGoalTarget({ visualizationId, chart, nativeEvent, context }) {
    if (!chart || !GOAL_CHART_IDS.has(visualizationId)) return null;
    const point = pointerOnChart(chart, nativeEvent.clientX, nativeEvent.clientY);
    if (!point) return null;
    const datasets = chart.data?.datasets || [];
    const activity = context.effectiveSelectedActivity;
    let target = null;
    let guides = {};

    if (visualizationId === 'activityTrends') {
        target = readRunningTotal({ chart, point });
    } else if (visualizationId === 'metricTrends') {
        // One height reads a different value on each metric's axis, so it can't name one goal.
        const charted = datasets.filter((dataset) => dataset.metricId);
        if (charted.length > 1) return null;
        const dataset = charted[0];
        if (activity && dataset?.metricId === YIELD_METRIC_ID) {
            const scale = chart.scales[dataset.yAxisID];
            const value = Math.max(0, Math.round(scale.getValueForPixel(point.y)));
            guides = { y: { value, pixel: scale.getPixelForValue(value), label: String(value) } };
            target = goalFromYieldTrend({ activity, value, setsHandling: context.visualizationState?.setsHandling });
        } else {
            const metric = activity && dataset ? findMetric(activity, dataset.metricId) : null;
            if (!metric) return null;
            const y = metricGuide(chart.scales[dataset.yAxisID], metric, chart.scales[dataset.yAxisID]?.getValueForPixel(point.y));
            // A rule holds in any session, so the date under the pointer plays no part.
            guides = { y };
            target = y ? goalFromMetricTrend({ activity, metricId: metric.id, value: y.value }) : null;
        }
    } else if (visualizationId === 'scatterPlot') {
        const dataset = datasets[0];
        const metricX = activity && dataset?.metricX ? findMetric(activity, dataset.metricX) : null;
        const metricY = activity && dataset?.metricY ? findMetric(activity, dataset.metricY) : null;
        if (!metricX || !metricY) return null;
        const x = metricGuide(chart.scales.x, metricX, chart.scales.x.getValueForPixel(point.x));
        const y = metricGuide(chart.scales.y, metricY, chart.scales.y.getValueForPixel(point.y));
        guides = { x, y };
        target = x && y ? goalFromScatterPoint({ activity, metricX: metricX.id, x: x.value, metricY: metricY.id, y: y.value }) : null;
    } else if (visualizationId === 'metricProgress') {
        const dataset = datasets[0];
        if (!activity || !dataset?.metricId) return null;
        const percent = Math.round(chart.scales.y.getValueForPixel(point.y));
        // Measured from the latest session, whichever bar is under the pointer.
        guides = { y: { pixel: chart.scales.y.getPixelForValue(percent), label: `${percent > 0 ? '+' : ''}${percent}%` } };
        target = goalFromMetricProgress({
            activity, metricId: dataset.metricId, percent, latestValue: latestValue(context, activity, dataset.metricId),
        });
    } else if (visualizationId === 'activityFrequency') {
        const dataset = datasets[0];
        const y = categoryGuide(chart, chart.scales.y, point.y);
        const totalsActivity = (context.scopedData.activities || [])
            .find((item) => String(item.id) === String(dataset?.activityIds?.[y?.index]));
        if (!totalsActivity) return null;
        if (dataset.measure === 'duration') {
            return { unsupported: 'Time totals can’t become a goal condition yet', guides: { y } };
        }
        const x = countGuide(chart.scales.x, chart.scales.x.getValueForPixel(point.x));
        guides = { x, y };
        target = goalFromActivityTotal({ activity: totalsActivity, measure: dataset.measure, value: x.value });
        target = target ? { ...target, activity: totalsActivity } : null;
    }

    if (!target) return guides.x || guides.y ? { unsupported: 'No goal at this point', guides } : null;
    if (target.unsupported) return { ...target, guides: target.guides || guides };
    const scoped = withChartScope({ activity, ...target }, context.globalFilters?.filters || null);
    return { ...scoped, guides: target.guides || guides };
}
