import React, { useCallback, useMemo, useRef } from 'react';
import { Bar } from 'react-chartjs-2';

import EmptyState from '../../../common/EmptyState';
import { useAlignedAxis } from '../../alignedAxes/AlignedAxesContext';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../ChartJSWrapper';

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
    const record = instance?.progress_comparison;
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

function EmptyMetricProgress({ children = 'Metric progress appears once two included activity instances can be compared.' }) {
    return <EmptyState compact description={children} />;
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
                key: instance.id,
                at: getInstanceDate(instance)?.getTime() || 0,
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
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const metricDefinitions = activity?.metric_definitions || [];
    const selectedMetricId = metric?.id || metric || metricDefinitions.find((item) => item.track_progress !== false)?.id || null;
    const rows = useMemo(() => buildMetricProgressRows({
        instances: activity ? activityInstances[activity.id] || [] : [],
        selectedMetricId,
    }), [activity, activityInstances, selectedMetricId]);
    const ownChartRef = useRef(null);
    const setChartRef = useCallback((chart) => {
        ownChartRef.current = chart;
        if (chartRef) chartRef.current = chart;
    }, [chartRef]);
    const slots = useAlignedAxis({ chartRef: ownChartRef, identity: activity && rows.length ? `sessions:${activity.id}` : null, points: rows });
    // Aligned with other charts: a slot for each of their sessions, empty where this one has no comparison.
    const shownRows = useMemo(() => {
        if (!slots) return rows;
        const byKey = new Map(rows.map((row) => [row.key, row]));
        return slots.map((slot) => byKey.get(slot.key) || { key: slot.key, label: slot.label, value: null });
    }, [rows, slots]);

    if (!activity) return <EmptyMetricProgress>Select an activity in the filters panel.</EmptyMetricProgress>;
    if (activity.track_progress === false || !metricDefinitions.some((item) => item.track_progress !== false)) {
        return <EmptyMetricProgress>Progress tracking is disabled for this activity.</EmptyMetricProgress>;
    }
    if (!rows.length) return <EmptyMetricProgress />;

    return (
        <Bar
            ref={setChartRef}
            data={{
                labels: shownRows.map((row) => row.label),
                datasets: [{
                    label: '% improvement',
                    metricId: selectedMetricId, // read by the chart's "Set goal here…" menu
                    data: shownRows.map((row) => row.value),
                    backgroundColor: shownRows.map((row) => (row.improved ? improvedColor : row.regressed ? regressedColor : neutralColor)),
                    borderColor: shownRows.map((row) => (row.improved ? improvedColor : row.regressed ? regressedColor : neutralColor)),
                    borderWidth: 1,
                    borderRadius: 0,
                    borderSkipped: false,
                    metricNames: shownRows.map((row) => row.metricName),
                }],
            }}
            options={applyChartDensity({
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: { color: chartTheme.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
                    },
                    title: { display: true, text: 'Metric Progress', color: chartTheme.textColor },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        titleColor: chartTheme.tooltipText,
                        bodyColor: chartTheme.tooltipBody,
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
                        ticks: { color: chartTheme.textColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: chartTheme.gridColor },
                    },
                    y: {
                        type: 'linear',
                        beginAtZero: true,
                        ticks: { color: chartTheme.textColor },
                        grid: { color: chartTheme.gridColor },
                        title: { display: true, text: '% improvement', color: chartTheme.textColor },
                    },
                },
            }, density)}
        />
    );
}
