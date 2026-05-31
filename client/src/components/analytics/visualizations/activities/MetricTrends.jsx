import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from '../../ChartJSWrapper';

const palette = ['#3b82f6', '#22c55e'];

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

function coerceNumber(value) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

function metricId(metric) {
    return metric?.metric_id || metric?.metric_definition_id || null;
}

function getMetricValuesFromMetricList(metrics = [], selectedMetricId, selectedSplit = 'all') {
    return (Array.isArray(metrics) ? metrics : [])
        .filter((metric) => metricId(metric) === selectedMetricId)
        .filter((metric) => selectedSplit === 'all' || !metric.split_id || metric.split_id === selectedSplit)
        .map((metric) => coerceNumber(metric.value))
        .filter((value) => value != null);
}

function getMetricValues(instance, selectedMetricId, selectedSplit = 'all') {
    const directValues = getMetricValuesFromMetricList(instance?.metrics || instance?.metric_values || [], selectedMetricId, selectedSplit);
    const setValues = (Array.isArray(instance?.sets) ? instance.sets : [])
        .flatMap((set) => getMetricValuesFromMetricList(set?.metrics || [], selectedMetricId, selectedSplit));
    return [...directValues, ...setValues];
}

function resolveMetricValue(instance, metricDef, setsHandling = 'top', selectedSplit = 'all') {
    const values = getMetricValues(instance, metricDef?.id, selectedSplit);
    if (!values.length) return null;
    if (setsHandling === 'average') {
        return values.reduce((sum, value) => sum + value, 0) / values.length;
    }
    return metricDef?.higher_is_better === false
        ? Math.min(...values)
        : Math.max(...values);
}

function EmptyMetricTrends({ children = 'Metric trends appear once the selected activity has metric values.' }) {
    return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>
            {children}
        </div>
    );
}

function buildYAxis(metric, index) {
    return {
        type: 'linear',
        beginAtZero: false,
        position: index === 0 ? 'left' : 'right',
        ticks: { color: chartDefaults.textColor },
        grid: { drawOnChartArea: index === 0, color: chartDefaults.gridColor },
        title: {
            display: true,
            text: metric?.unit || metric?.name || 'Metric',
            color: chartDefaults.textColor,
        },
    };
}

export function getSelectedMetricDefs(metricDefinitions = [], selectedMetrics = []) {
    const metricIds = selectedMetrics.filter(Boolean);
    const fallbackIds = metricDefinitions.slice(0, 2).map((metric) => metric.id);
    const ids = (metricIds.length ? metricIds : fallbackIds).slice(0, 2);
    return ids
        .map((id) => metricDefinitions.find((metric) => metric.id === id))
        .filter(Boolean);
}

export function buildMetricTrendData({
    instances = [],
    metricDefinitions = [],
    selectedMetrics = [],
    setsHandling = 'top',
    selectedSplit = 'all',
}) {
    const sortedInstances = [...instances].sort((a, b) => {
        const aDate = getInstanceDate(a);
        const bDate = getInstanceDate(b);
        return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
    });
    const selectedMetricDefs = getSelectedMetricDefs(metricDefinitions, selectedMetrics);
    const labels = sortedInstances.map(formatInstanceLabel);
    const datasets = selectedMetricDefs.map((metric, index) => ({
        type: 'line',
        label: metric.name,
        data: sortedInstances.map((instance) => resolveMetricValue(instance, metric, setsHandling, selectedSplit)),
        borderColor: palette[index],
        backgroundColor: `${palette[index]}33`,
        borderWidth: 2,
        pointRadius: 3,
        pointHoverRadius: 4,
        spanGaps: true,
        tension: 0.2,
        yAxisID: `metric${index + 1}`,
    })).filter((dataset) => dataset.data.some((value) => value != null));

    return { labels, datasets, selectedMetricDefs };
}

export function MetricTrendsChart({
    activity,
    activityInstances = {},
    chartRef,
    metrics = [],
    setsHandling = 'top',
    selectedSplit = 'all',
}) {
    const metricDefinitions = useMemo(() => activity?.metric_definitions || [], [activity?.metric_definitions]);
    const chartData = useMemo(() => buildMetricTrendData({
        instances: activity ? activityInstances[activity.id] || [] : [],
        metricDefinitions,
        selectedMetrics: metrics,
        setsHandling,
        selectedSplit,
    }), [activity, activityInstances, metricDefinitions, metrics, selectedSplit, setsHandling]);

    if (!activity) return <EmptyMetricTrends>Select an activity in the filters panel.</EmptyMetricTrends>;
    if (!chartData.datasets.length) return <EmptyMetricTrends />;

    return (
        <Line
            ref={chartRef}
            data={{
                labels: chartData.labels,
                datasets: chartData.datasets,
            }}
            options={{
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
                    },
                    title: { display: true, text: 'Metric Trends', color: chartDefaults.textColor },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#ddd',
                        padding: 12,
                    },
                },
                scales: {
                    x: {
                        ticks: { color: chartDefaults.textColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: chartDefaults.gridColor },
                    },
                    ...Object.fromEntries(chartData.selectedMetricDefs.map((metric, index) => [
                        `metric${index + 1}`,
                        buildYAxis(metric, index),
                    ])),
                },
            }}
        />
    );
}
