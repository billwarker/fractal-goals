import React, { useCallback, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';

import EmptyState from '../../../common/EmptyState';
import { activityUsesSets } from '../../../../utils/goalConditions';
import { goalLineAnnotations, goalMarkers } from '../../../../utils/goalConditionLines';
import { aggregateMetric, aggregateYield, yieldMetricIds } from '../../../../utils/setAggregation';
import CompactChartFrame from '../../CompactChartFrame';
import { GoalMarkerHost } from '../../GoalMarkerLayer';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../ChartJSWrapper';
import useActiveChartPoint from '../../useActiveChartPoint';

function getInstanceDate(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatInstanceLabel(instance, index) {
    const date = getInstanceDate(instance);
    if (!date) return `Instance ${index + 1}`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** The pseudo-metric for the activity's yield (the product of its multiplicative metrics). */
export const YIELD_METRIC_ID = 'yield';
const YIELD_METRIC = { id: YIELD_METRIC_ID, name: 'Yield', unit: '', higher_is_better: true };

/** The activity's yield metric ids: from the payload when present, else derived like the server. */
export function activityYieldIds(activity) {
    return activity?.yield_metric_ids || yieldMetricIds(activity);
}

/** One plotted value per instance: a metric's top set or average, or the yield (top, average, total). */
function resolveValue(instance, metric, setsHandling, selectedSplit, yieldIds) {
    if (metric.id === YIELD_METRIC_ID) return aggregateYield(instance, yieldIds, setsHandling);
    return aggregateMetric(instance, metric, setsHandling === 'average' ? 'average' : 'top', selectedSplit);
}

function EmptyMetricTrends({ children = 'Metric trends appear once the selected activity has metric values.' }) {
    return <EmptyState compact description={children} />;
}

function buildYAxis(metric, index, chartTheme) {
    return {
        type: 'linear',
        beginAtZero: false,
        position: index === 0 ? 'left' : 'right',
        ticks: { color: chartTheme.textColor },
        grid: { drawOnChartArea: index === 0, color: chartTheme.gridColor },
        title: {
            display: true,
            text: metric?.unit || metric?.name || 'Metric',
            color: chartTheme.textColor,
        },
    };
}

export function getSelectedMetricDefs(metricDefinitions = [], selectedMetrics = [], yieldIds = []) {
    const candidates = yieldIds.length >= 2 ? [...metricDefinitions, YIELD_METRIC] : metricDefinitions;
    const metricIds = selectedMetrics.filter(Boolean);
    const fallbackIds = metricDefinitions.slice(0, 2).map((metric) => metric.id);
    const ids = (metricIds.length ? metricIds : fallbackIds).slice(0, 2);
    return ids
        .map((id) => candidates.find((metric) => metric.id === id))
        .filter(Boolean);
}

export function buildMetricTrendData({
    instances = [],
    metricDefinitions = [],
    selectedMetrics = [],
    setsHandling = 'top',
    selectedSplit = 'all',
    yieldIds = [],
    highlightInstanceId = null,
    // The theme's series colours (useChartThemeDefaults().seriesColors), first two slots.
    colors = ['#3987e5', '#d95926'],
}) {
    const sortedInstances = [...instances].sort((a, b) => {
        const aDate = getInstanceDate(a);
        const bDate = getInstanceDate(b);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
    });
    const selectedMetricDefs = getSelectedMetricDefs(metricDefinitions, selectedMetrics, yieldIds);
    const instanceIds = sortedInstances.map((instance) => instance.id);
    const labels = sortedInstances.map(formatInstanceLabel);
    const datasets = selectedMetricDefs.map((metric, index) => ({
        type: 'line',
        label: metric.name,
        metricId: metric.id, // read by the chart's "Set goal here…" menu
        data: sortedInstances.map((instance) => resolveValue(instance, metric, setsHandling, selectedSplit, yieldIds)),
        borderColor: colors[index],
        backgroundColor: `${colors[index]}33`,
        borderWidth: 2,
        // The highlighted instance (e.g. the session being edited) stands out.
        pointRadius: highlightInstanceId ? instanceIds.map((id) => (id === highlightInstanceId ? 5 : 3)) : 3,
        pointHoverRadius: 6,
        pointHoverBorderWidth: 2,
        spanGaps: true,
        tension: 0.2,
        yAxisID: `metric${index + 1}`,
    })).filter((dataset) => dataset.data.some((value) => value != null));

    return { labels, datasets, selectedMetricDefs, instanceIds };
}

export function MetricTrendsChart({
    activity,
    activityInstances = {},
    chartRef,
    metrics = [],
    setsHandling = 'top',
    selectedSplit = 'all',
    goalLines = [],
    onOpenGoal = null,
    highlightInstanceId = null,
    hoverInstanceId = null,
    hideTitle = false,
}) {
    const ownChartRef = useRef(null);
    // Ours for the hover highlight, and the caller's (Analytics' chart menu) too.
    const setChartRef = useCallback((chart) => {
        ownChartRef.current = chart;
        if (chartRef) chartRef.current = chart;
    }, [chartRef]);
    const metricDefinitions = useMemo(() => activity?.metric_definitions || [], [activity?.metric_definitions]);
    const yieldIds = useMemo(() => activityYieldIds(activity), [activity]);
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    // Compact charts plot only the first selected metric; the caption says what else there is.
    const selectedDefs = useMemo(() => getSelectedMetricDefs(metricDefinitions, metrics, yieldIds), [metricDefinitions, metrics, yieldIds]);
    const shownMetrics = useMemo(() => (
        density === 'compact' && selectedDefs.length > 1 ? [selectedDefs[0].id] : metrics
    ), [density, metrics, selectedDefs]);
    const chartData = useMemo(() => buildMetricTrendData({
        instances: activity ? activityInstances[activity.id] || [] : [],
        metricDefinitions,
        selectedMetrics: shownMetrics,
        setsHandling,
        selectedSplit,
        yieldIds,
        highlightInstanceId,
        colors: chartTheme.seriesColors,
    }), [activity, activityInstances, chartTheme.seriesColors, highlightInstanceId, metricDefinitions, shownMetrics, selectedSplit, setsHandling, yieldIds]);
    // A session hovered elsewhere becomes the active point on each line.
    const hoverIndex = hoverInstanceId ? chartData.instanceIds.indexOf(hoverInstanceId) : -1;
    useActiveChartPoint(ownChartRef, hoverIndex < 0 ? [] : chartData.datasets
        .map((dataset, datasetIndex) => ({ datasetIndex, index: hoverIndex, value: dataset.data[hoverIndex] }))
        .filter((element) => element.value != null), { tooltip: density !== 'compact' });
    const hiddenCount = selectedDefs.length - chartData.selectedMetricDefs.length;
    const caption = density === 'compact' && chartData.selectedMetricDefs[0]
        ? `${chartData.selectedMetricDefs[0].name} · ${chartData.labels.length} session${chartData.labels.length === 1 ? '' : 's'}${hiddenCount > 0 ? ` · +${hiddenCount} more` : ''}`
        : null;

    if (!activity) return <EmptyMetricTrends>Select an activity in the filters panel.</EmptyMetricTrends>;
    if (!chartData.datasets.length) return <EmptyMetricTrends />;
    // Each charted metric has its own y axis, metric1, metric2, …
    // Without sets, the Yield line plots one value per session, whichever handling is chosen.
    const yieldLine = activityUsesSets(activity) ? setsHandling : 'total';
    const goalScales = Object.fromEntries(chartData.selectedMetricDefs.map((metric, index) => [metric.id, `metric${index + 1}`]));

    return (
        <CompactChartFrame caption={caption}>
        <GoalMarkerHost chartRef={ownChartRef} markers={goalMarkers(goalLines, goalScales, yieldLine)} onOpenGoal={onOpenGoal}>
            <Line
                ref={setChartRef}
                data={{
                    labels: chartData.labels,
                    datasets: chartData.datasets,
                }}
                options={applyChartDensity({
                    responsive: true,
                    maintainAspectRatio: false,
                    ...DISABLED_CHART_ANIMATION,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            display: true,
                            position: 'top',
                            labels: { color: chartTheme.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
                        },
                        title: { display: !hideTitle, text: 'Metric Trends', color: chartTheme.textColor },
                        annotation: { annotations: goalLineAnnotations(goalLines, goalScales, yieldLine) },
                        tooltip: {
                            backgroundColor: chartTheme.tooltipBg,
                            titleColor: chartTheme.tooltipText,
                            bodyColor: chartTheme.tooltipBody,
                            padding: 12,
                        },
                    },
                    scales: {
                        x: {
                            ticks: { color: chartTheme.textColor, maxRotation: 45, minRotation: 0 },
                            grid: { color: chartTheme.gridColor },
                        },
                        ...Object.fromEntries(chartData.selectedMetricDefs.map((metric, index) => [
                            `metric${index + 1}`,
                            buildYAxis(metric, index, chartTheme),
                        ])),
                    },
                }, density)}
            />
        </GoalMarkerHost>
        </CompactChartFrame>
    );
}
