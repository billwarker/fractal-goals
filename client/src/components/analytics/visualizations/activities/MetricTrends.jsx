import React, { useCallback, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';

import EmptyState from '../../../common/EmptyState';
import { activityUsesSets } from '../../../../utils/goalConditions';
import { goalLineAnnotations, goalMarkers } from '../../../../utils/goalConditionLines';
import { aggregateMetric, aggregateYield, yieldMetricIds } from '../../../../utils/setAggregation';
import CompactChartFrame from '../../CompactChartFrame';
import { GoalMarkerHost } from '../../GoalMarkerLayer';
import { useAlignedAxis, useAlignedRanges } from '../../alignedAxes/AlignedAxesContext';
import { valuesOnSlots } from '../../alignedAxes/slots';
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

function buildYAxis(metric, index, chartTheme, sharedRange = null) {
    return {
        type: 'linear',
        beginAtZero: false,
        // Shared with a panel beside this one: the same limits give the same ticks.
        ...(sharedRange ? { suggestedMin: sharedRange.min, suggestedMax: sharedRange.max } : {}),
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

    const instanceTimes = sortedInstances.map((instance) => getInstanceDate(instance)?.getTime() || 0);
    return { labels, datasets, selectedMetricDefs, instanceIds, instanceTimes };
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
    const axisPoints = useMemo(() => chartData.instanceIds.map((key, index) => ({
        key, at: chartData.instanceTimes[index], label: chartData.labels[index],
    })), [chartData]);
    const slots = useAlignedAxis({
        chartRef: ownChartRef,
        identity: activity && chartData.datasets.length ? `sessions:${activity.id}` : null,
        points: axisPoints,
    });
    const shown = useMemo(() => (slots ? {
        labels: slots.map((slot) => slot.label),
        instanceIds: slots.map((slot) => slot.key),
        datasets: chartData.datasets.map((dataset) => ({
            ...dataset,
            data: valuesOnSlots(chartData.instanceIds, dataset.data, slots),
        })),
    } : chartData), [chartData, slots]);
    // Each charted metric has its own y axis, metric1, metric2, …
    // Without sets, the Yield line plots one value per session, whichever handling is chosen.
    const yieldLine = activityUsesSets(activity) ? setsHandling : 'total';
    const goalScales = useMemo(() => Object.fromEntries(
        chartData.selectedMetricDefs.map((metric, index) => [metric.id, `metric${index + 1}`]),
    ), [chartData.selectedMetricDefs]);
    const markers = useMemo(() => goalMarkers(goalLines, goalScales, yieldLine), [goalLines, goalScales, yieldLine]);
    // What each axis must hold: its values and goal thresholds. Panels beside it showing the same metric share them.
    const valueAxes = useMemo(() => chartData.selectedMetricDefs.flatMap((metric, index) => {
        const scaleId = `metric${index + 1}`;
        const values = [
            ...chartData.datasets.filter((dataset) => dataset.yAxisID === scaleId).flatMap((dataset) => dataset.data),
            ...markers.flatMap((marker) => marker.rules.filter((rule) => rule.scaleID === scaleId).map((rule) => rule.value)),
        ].filter((value) => value != null);
        if (!values.length) return [];
        const measure = metric.id === YIELD_METRIC_ID ? `yield:${activity?.id}` : metric.fractal_metric_id || metric.id;
        return [{ scaleId, identity: `metric:${measure}:${setsHandling}:${selectedSplit}`, min: Math.min(...values), max: Math.max(...values) }];
    }), [activity?.id, chartData, markers, selectedSplit, setsHandling]);
    const ranges = useAlignedRanges({ chartRef: ownChartRef, axes: valueAxes });
    // A session hovered elsewhere becomes the active point on each line.
    const hoverIndex = hoverInstanceId ? shown.instanceIds.indexOf(hoverInstanceId) : -1;
    useActiveChartPoint(ownChartRef, hoverIndex < 0 ? [] : shown.datasets
        .map((dataset, datasetIndex) => ({ datasetIndex, index: hoverIndex, value: dataset.data[hoverIndex] }))
        .filter((element) => element.value != null), { tooltip: density !== 'compact' });
    const hiddenCount = selectedDefs.length - chartData.selectedMetricDefs.length;
    const caption = density === 'compact' && chartData.selectedMetricDefs[0]
        ? `${chartData.selectedMetricDefs[0].name} · ${chartData.labels.length} session${chartData.labels.length === 1 ? '' : 's'}${hiddenCount > 0 ? ` · +${hiddenCount} more` : ''}`
        : null;

    if (!activity) return <EmptyMetricTrends>Select an activity in the filters panel.</EmptyMetricTrends>;
    if (!chartData.datasets.length) return <EmptyMetricTrends />;
    return (
        <CompactChartFrame caption={caption}>
        <GoalMarkerHost chartRef={ownChartRef} markers={markers} onOpenGoal={onOpenGoal}>
            <Line
                ref={setChartRef}
                data={{
                    labels: shown.labels,
                    datasets: shown.datasets,
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
                            // Aligned with a bar chart: its bars sit at slot centres, so these points do too.
                            ...(slots ? { offset: true } : {}),
                            ticks: { color: chartTheme.textColor, maxRotation: 45, minRotation: 0 },
                            grid: { color: chartTheme.gridColor },
                        },
                        ...Object.fromEntries(chartData.selectedMetricDefs.map((metric, index) => [
                            `metric${index + 1}`,
                            buildYAxis(metric, index, chartTheme, ranges?.[`metric${index + 1}`]),
                        ])),
                    },
                }, density)}
            />
        </GoalMarkerHost>
        </CompactChartFrame>
    );
}
