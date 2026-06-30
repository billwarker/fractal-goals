import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import EmptyState from '../../../common/EmptyState';
import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../../ChartJSWrapper';

const METRIC_OPTIONS = [
    { value: 'instances', label: 'Instances', color: '#3b82f6', type: 'bar' },
    { value: 'duration', label: 'Duration', color: '#22c55e', type: 'line' },
];

function getActivityInstanceDate(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function dayKey(date) {
    return [
        date.getFullYear(),
        String(date.getMonth() + 1).padStart(2, '0'),
        String(date.getDate()).padStart(2, '0'),
    ].join('-');
}

function formatDayLabel(key) {
    const [year, month, day] = key.split('-').map(Number);
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds = 0) {
    const total = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function isCompletedActivityInstance(instance) {
    const completed = instance?.completed ?? instance?.attributes?.completed;
    if (typeof completed === 'boolean') return completed;
    return Boolean(
        instance?.completed_at
        || instance?.time_stop
        || (instance?.duration_seconds || 0) > 0
        || (Array.isArray(instance?.metrics) && instance.metrics.length > 0)
        || (Array.isArray(instance?.sets) && instance.sets.length > 0)
    );
}

function EmptyActivityTrends() {
    return <EmptyState compact description="Activity trends appear once activity instances have dates in the selected scope." />;
}

export function getActivityTrendRows(activityInstances = {}) {
    const rowsByKey = new Map();

    Object.values(activityInstances).flat().forEach((instance) => {
        if (!isCompletedActivityInstance(instance)) return;

        const date = getActivityInstanceDate(instance);
        if (!date) return;

        const key = dayKey(date);
        const row = rowsByKey.get(key) || {
            key,
            label: formatDayLabel(key),
            instances: 0,
            durationSeconds: 0,
        };
        row.instances += 1;
        row.durationSeconds += instance.duration_seconds || 0;
        rowsByKey.set(key, row);
    });

    return Array.from(rowsByKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function ActivityTrendsChart({ activityInstances = {}, chartRef, metrics = ['instances', 'duration'] }) {
    const chartTheme = useChartThemeDefaults();
    const selectedMetrics = useMemo(() => (metrics.length ? metrics : ['instances']), [metrics]);
    const rows = useMemo(() => getActivityTrendRows(activityInstances), [activityInstances]);

    const chartData = useMemo(() => ({
        labels: rows.map((row) => row.label),
        datasets: METRIC_OPTIONS
            .filter((metric) => selectedMetrics.includes(metric.value))
            .map((metric) => ({
                type: metric.type,
                label: metric.label,
                data: rows.map((row) => metric.value === 'duration'
                    ? Math.round(row.durationSeconds / 60)
                    : row.instances),
                backgroundColor: metric.type === 'bar' ? `${metric.color}cc` : `${metric.color}33`,
                borderColor: metric.color,
                borderWidth: metric.type === 'bar' ? 1 : 2,
                borderRadius: 0,
                borderSkipped: false,
                order: metric.type === 'line' ? 1 : 2,
                pointRadius: metric.type === 'line' ? 3 : 0,
                pointHoverRadius: metric.type === 'line' ? 4 : 0,
                tension: metric.type === 'line' ? 0.2 : 0,
                yAxisID: metric.value,
            })),
    }), [rows, selectedMetrics]);

    if (!rows.length || chartData.datasets.length === 0) {
        return <EmptyActivityTrends />;
    }

    return (
        <Bar
            ref={chartRef}
            data={chartData}
            options={{
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                interaction: { mode: 'index', intersect: false },
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                        labels: {
                            color: chartTheme.textColor,
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 11 },
                        },
                    },
                    title: { display: true, text: 'Activity Trends', color: chartTheme.textColor },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        titleColor: chartTheme.tooltipText,
                        bodyColor: chartTheme.tooltipBody,
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.dataset.yAxisID === 'duration') {
                                    return `${ctx.dataset.label}: ${formatDuration((ctx.parsed.y || 0) * 60)}`;
                                }
                                return `${ctx.dataset.label}: ${ctx.parsed.y || 0}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: chartTheme.textColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: chartTheme.gridColor },
                    },
                    instances: {
                        type: 'linear',
                        beginAtZero: true,
                        position: 'left',
                        display: selectedMetrics.includes('instances'),
                        ticks: { color: chartTheme.textColor, precision: 0 },
                        grid: { color: chartTheme.gridColor },
                        title: { display: true, text: 'Instances', color: chartTheme.textColor },
                    },
                    duration: {
                        type: 'linear',
                        beginAtZero: true,
                        position: selectedMetrics.includes('instances') ? 'right' : 'left',
                        display: selectedMetrics.includes('duration'),
                        ticks: { color: chartTheme.textColor },
                        grid: {
                            drawOnChartArea: !selectedMetrics.includes('instances'),
                            color: chartTheme.gridColor,
                        },
                        title: { display: true, text: 'Minutes', color: chartTheme.textColor },
                    },
                },
            }}
        />
    );
}

export function ActivityTrendsControls({ context }) {
    const state = context.visualizationState || {};
    const selectedMetrics = state.metrics?.length ? state.metrics : ['instances', 'duration'];

    const toggleMetric = (metric) => {
        const nextMetrics = selectedMetrics.includes(metric)
            ? selectedMetrics.filter((value) => value !== metric)
            : [...selectedMetrics, metric];
        context.updateVisualizationState({ metrics: nextMetrics.length ? nextMetrics : selectedMetrics });
    };

    return (
        <>
            <div className="sessions-query-sidebar-section-header">
                <h4>Metrics</h4>
            </div>
            <div className="sessions-query-chip-group">
                {METRIC_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${selectedMetrics.includes(option.value) ? 'active' : ''}`}
                        onClick={() => toggleMetric(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </>
    );
}
