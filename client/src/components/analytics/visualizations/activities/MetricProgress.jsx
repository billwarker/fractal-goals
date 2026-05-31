import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from '../../ChartJSWrapper';

const improvedColor = '#22c55e';
const regressedColor = '#ef4444';
const neutralColor = '#94a3b8';

function getInstanceDate(instance) {
    const value = instance?.session_date || instance?.time_stop || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatInstanceLabel(instance, index) {
    const date = getInstanceDate(instance);
    if (!date) return `Instance ${index + 1}`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function comparisonMetricId(comparison) {
    return comparison?.metric_id || comparison?.metric_definition_id || null;
}

function getProgressComparisons(instance) {
    const record = instance?.progress_comparison || instance?.progress_record;
    return Array.isArray(record?.metric_comparisons) ? record.metric_comparisons : [];
}

function resolveProgressComparison(instance, selectedMetricId) {
    const comparisons = getProgressComparisons(instance);
    if (!comparisons.length) return null;
    if (!selectedMetricId) {
        return comparisons.find((comparison) => comparison?.pct_change != null || comparison?.percent_delta != null) || comparisons[0];
    }
    return comparisons.find((comparison) => comparisonMetricId(comparison) === selectedMetricId) || null;
}

function progressValue(comparison) {
    const rawPct = comparison?.pct_change ?? comparison?.percent_delta;
    const pct = Number(rawPct);
    if (!Number.isFinite(pct)) return null;

    const improved = comparison.improved ?? comparison.is_improvement ?? false;
    const regressed = comparison.regressed ?? comparison.is_regression ?? false;
    if (improved) return Math.abs(pct);
    if (regressed) return -Math.abs(pct);
    return 0;
}

function EmptyMetricProgress({ children = 'Metric progress appears once persisted progress comparisons exist for this activity.' }) {
    return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>
            {children}
        </div>
    );
}

export function buildMetricProgressRows({ instances = [], selectedMetricId = null }) {
    return [...instances]
        .sort((a, b) => {
            const aDate = getInstanceDate(a);
            const bDate = getInstanceDate(b);
            return (aDate?.getTime() || 0) - (bDate?.getTime() || 0);
        })
        .map((instance, index) => {
            const comparison = resolveProgressComparison(instance, selectedMetricId);
            const value = progressValue(comparison);
            if (value == null) return null;
            return {
                label: formatInstanceLabel(instance, index),
                value,
                metricName: comparison?.metric_name || 'Metric',
                improved: comparison?.improved ?? comparison?.is_improvement ?? false,
                regressed: comparison?.regressed ?? comparison?.is_regression ?? false,
            };
        })
        .filter(Boolean);
}

export function MetricProgressChart({
    activity,
    activityInstances = {},
    chartRef,
    metric = null,
}) {
    const metricDefinitions = activity?.metric_definitions || [];
    const selectedMetricId = metric?.id || metric || metricDefinitions.find((item) => item.track_progress !== false)?.id || null;
    const rows = useMemo(() => buildMetricProgressRows({
        instances: activity ? activityInstances[activity.id] || [] : [],
        selectedMetricId,
    }), [activity, activityInstances, selectedMetricId]);

    if (!activity) return <EmptyMetricProgress>Select an activity in the filters panel.</EmptyMetricProgress>;
    if (activity.track_progress === false || !metricDefinitions.some((item) => item.track_progress !== false)) {
        return <EmptyMetricProgress>Progress tracking is disabled for this activity.</EmptyMetricProgress>;
    }
    if (!rows.length) return <EmptyMetricProgress />;

    return (
        <Bar
            ref={chartRef}
            data={{
                labels: rows.map((row) => row.label),
                datasets: [{
                    label: '% improvement',
                    data: rows.map((row) => row.value),
                    backgroundColor: rows.map((row) => (row.improved ? improvedColor : row.regressed ? regressedColor : neutralColor)),
                    borderColor: rows.map((row) => (row.improved ? improvedColor : row.regressed ? regressedColor : neutralColor)),
                    borderWidth: 1,
                    borderRadius: 0,
                    borderSkipped: false,
                    metricNames: rows.map((row) => row.metricName),
                }],
            }}
            options={{
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
                    },
                    title: { display: true, text: 'Metric Progress', color: chartDefaults.textColor },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#ddd',
                        padding: 12,
                        callbacks: {
                            afterTitle: (ctx) => {
                                const metricName = ctx[0]?.dataset?.metricNames?.[ctx[0]?.dataIndex];
                                return metricName ? [`Metric: ${metricName}`] : [];
                            },
                            label: (ctx) => `% improvement: ${ctx.raw}%`,
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: chartDefaults.textColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: chartDefaults.gridColor },
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: { color: chartDefaults.textColor },
                        grid: { color: chartDefaults.gridColor },
                        title: { display: true, text: '% improvement', color: chartDefaults.textColor },
                    },
                },
            }}
        />
    );
}
