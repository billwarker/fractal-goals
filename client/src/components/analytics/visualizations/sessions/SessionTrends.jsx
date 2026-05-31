import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from '../../ChartJSWrapper';

const GRAIN_OPTIONS = [
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
    { value: 'year', label: 'Year' },
];

const METRIC_OPTIONS = [
    { value: 'sessions', label: '# of sessions', color: '#3b82f6' },
    { value: 'duration', label: 'Sum of Session Duration', color: '#f59e0b' },
];

function getSessionDate(session) {
    const value = session?.session_start || session?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function startOfWeek(date) {
    const next = new Date(date);
    const day = next.getDay();
    const diff = day === 0 ? -6 : 1 - day;
    next.setDate(next.getDate() + diff);
    next.setHours(0, 0, 0, 0);
    return next;
}

function bucketDate(date, grain) {
    const bucket = new Date(date);
    bucket.setHours(0, 0, 0, 0);

    if (grain === 'week') {
        return startOfWeek(bucket);
    }

    if (grain === 'month') {
        bucket.setDate(1);
        return bucket;
    }

    if (grain === 'year') {
        bucket.setMonth(0, 1);
        return bucket;
    }

    return bucket;
}

function bucketKey(date, grain) {
    const bucket = bucketDate(date, grain);
    if (grain === 'year') return String(bucket.getFullYear());
    if (grain === 'month') return `${bucket.getFullYear()}-${String(bucket.getMonth() + 1).padStart(2, '0')}`;
    return [
        bucket.getFullYear(),
        String(bucket.getMonth() + 1).padStart(2, '0'),
        String(bucket.getDate()).padStart(2, '0'),
    ].join('-');
}

function formatBucketLabel(key, grain) {
    const [year, month, day] = key.split('-').map(Number);
    if (grain === 'year') return key;
    if (grain === 'month') {
        return new Date(year, month - 1, 1).toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
    }
    if (grain === 'week') {
        return `Week of ${new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
    }
    return new Date(year, month - 1, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatDuration(seconds = 0) {
    const total = Math.max(0, Math.round(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.round((total % 3600) / 60);
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

function EmptySessionTrends() {
    return (
        <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>
            Session trends appear once sessions have dates in the selected scope.
        </div>
    );
}

export function getSessionTrendRows(sessions = [], grain = 'week') {
    const rowsByKey = new Map();

    sessions.forEach((session) => {
        const date = getSessionDate(session);
        if (!date) return;

        const key = bucketKey(date, grain);
        const row = rowsByKey.get(key) || { key, label: formatBucketLabel(key, grain), sessions: 0, durationSeconds: 0 };
        row.sessions += 1;
        row.durationSeconds += session.total_duration_seconds || 0;
        rowsByKey.set(key, row);
    });

    return Array.from(rowsByKey.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function SessionTrendsChart({ sessions = [], chartRef, grain = 'week', metrics = ['sessions', 'duration'] }) {
    const selectedMetrics = useMemo(() => (metrics.length ? metrics : ['sessions']), [metrics]);
    const rows = useMemo(() => getSessionTrendRows(sessions, grain), [grain, sessions]);

    const chartData = useMemo(() => ({
        labels: rows.map((row) => row.label),
        datasets: METRIC_OPTIONS
            .filter((metric) => selectedMetrics.includes(metric.value))
            .map((metric) => ({
                label: metric.label,
                data: rows.map((row) => metric.value === 'duration'
                    ? Math.round(row.durationSeconds / 60)
                    : row.sessions),
                backgroundColor: `${metric.color}cc`,
                borderColor: metric.color,
                borderWidth: 1,
                borderRadius: 0,
                borderSkipped: false,
                yAxisID: metric.value === 'duration' ? 'duration' : 'sessions',
            })),
    }), [rows, selectedMetrics]);

    if (!rows.length || chartData.datasets.length === 0) {
        return <EmptySessionTrends />;
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
                            color: chartDefaults.textColor,
                            usePointStyle: true,
                            boxWidth: 8,
                            font: { size: 11 },
                        },
                    },
                    tooltip: {
                        backgroundColor: 'rgba(30, 30, 30, 0.95)',
                        titleColor: '#fff',
                        bodyColor: '#ddd',
                        padding: 12,
                        callbacks: {
                            label: (ctx) => {
                                if (ctx.dataset.yAxisID === 'duration') {
                                    return `${ctx.dataset.label}: ${formatDuration((ctx.parsed.y || 0) * 60)}`;
                                }
                                const count = ctx.parsed.y || 0;
                                return `${ctx.dataset.label}: ${count}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: chartDefaults.textColor, maxRotation: 45, minRotation: 0 },
                        grid: { color: chartDefaults.gridColor },
                    },
                    sessions: {
                        type: 'linear',
                        beginAtZero: true,
                        position: 'left',
                        display: selectedMetrics.includes('sessions'),
                        ticks: { color: chartDefaults.textColor, precision: 0 },
                        grid: { color: chartDefaults.gridColor },
                        title: { display: true, text: 'Sessions', color: chartDefaults.textColor },
                    },
                    duration: {
                        type: 'linear',
                        beginAtZero: true,
                        position: selectedMetrics.includes('sessions') ? 'right' : 'left',
                        display: selectedMetrics.includes('duration'),
                        ticks: { color: chartDefaults.textColor },
                        grid: { drawOnChartArea: !selectedMetrics.includes('sessions'), color: chartDefaults.gridColor },
                        title: { display: true, text: 'Minutes', color: chartDefaults.textColor },
                    },
                },
            }}
        />
    );
}

export function SessionTrendsControls({ context }) {
    const state = context.visualizationState || {};
    const selectedMetrics = state.metrics?.length ? state.metrics : ['sessions', 'duration'];
    const selectedGrain = state.grain || 'week';

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

            <div className="sessions-query-sidebar-section-header" style={{ marginTop: 14 }}>
                <h4>Grain</h4>
            </div>
            <div className="sessions-query-chip-group">
                {GRAIN_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${selectedGrain === option.value ? 'active' : ''}`}
                        onClick={() => context.updateVisualizationState({ grain: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </>
    );
}
