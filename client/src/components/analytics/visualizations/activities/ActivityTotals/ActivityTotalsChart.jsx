import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { chartDefaults, DISABLED_CHART_ANIMATION } from '../../../ChartJSWrapper';

const palette = {
    instances: '#3b82f6',
    duration: '#22c55e',
};

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

function EmptyChart({ title, children = 'No data available yet' }) {
    return (
        <div style={{ height: '100%', display: 'flex', flexDirection: 'column', gap: 12 }}>
            {title && <h3 style={{ margin: 0, fontSize: 14, color: 'var(--color-text-secondary)' }}>{title}</h3>}
            <div style={{ flex: 1, display: 'grid', placeItems: 'center', color: 'var(--color-text-muted)', fontSize: 13, textAlign: 'center' }}>
                {children}
            </div>
        </div>
    );
}

function buildOptions({ metric, showGroupNames }) {
    const xAxisLabel = metric === 'duration' ? 'Minutes' : 'Completed instances';
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        ...DISABLED_CHART_ANIMATION,
        scales: {
            x: {
                type: 'linear',
                beginAtZero: true,
                title: { display: true, text: xAxisLabel, color: chartDefaults.textColor },
                ticks: {
                    color: chartDefaults.textColor,
                    precision: 0,
                    stepSize: metric === 'instances' ? 1 : undefined,
                    callback: (value) => value,
                },
                grid: { color: chartDefaults.gridColor },
            },
            y: {
                type: 'category',
                ticks: { color: chartDefaults.textColor },
                grid: { color: chartDefaults.gridColor },
            },
        },
        plugins: {
            legend: {
                display: true,
                position: 'top',
                labels: { color: chartDefaults.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } },
            },
            title: { display: true, text: 'Activity Totals', color: chartDefaults.textColor },
            tooltip: {
                backgroundColor: 'rgba(30, 30, 30, 0.95)',
                titleColor: '#fff',
                bodyColor: '#ddd',
                padding: 12,
                callbacks: {
                    afterTitle: (ctx) => {
                        if (!showGroupNames) return [];
                        const groupName = ctx[0]?.dataset?.groupNames?.[ctx[0]?.dataIndex];
                        return groupName ? [`Group: ${groupName}`] : [];
                    },
                    label: (ctx) => metric === 'duration'
                        ? `Duration: ${formatDuration((ctx.raw || 0) * 60)}`
                        : `Completed instances: ${ctx.raw}`,
                },
            },
        },
    };
}

export default function ActivityTotalsChart({
    activities = [],
    activityInstances = {},
    activityGroups = [],
    chartRef,
    metric = 'instances',
    showGroupNames = false,
    limit = 15,
}) {
    const data = useMemo(() => {
        const normalizedLimit = Math.min(50, Math.max(1, Number(limit) || 15));
        const groupNamesById = new Map(activityGroups.map((group) => [group.id, group.name]));
        const rows = activities
            .map((activity) => {
                const completedInstances = (activityInstances[activity.id] || []).filter(isCompletedActivityInstance);
                const seconds = completedInstances.reduce((sum, instance) => sum + (instance.duration_seconds || 0), 0);
                return {
                    label: activity.name,
                    groupName: activity.group_id ? groupNamesById.get(activity.group_id) || 'Ungrouped' : 'Ungrouped',
                    count: completedInstances.length,
                    minutes: Math.round(seconds / 60),
                };
            })
            .map((row) => ({
                ...row,
                value: metric === 'duration' ? row.minutes : row.count,
            }))
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, normalizedLimit);

        return {
            labels: rows.map((row) => row.label),
            datasets: [{
                label: metric === 'duration' ? 'Minutes' : 'Completed instances',
                data: rows.map((row) => row.value),
                backgroundColor: metric === 'duration' ? palette.duration : palette.instances,
                groupNames: rows.map((row) => row.groupName),
            }],
        };
    }, [activities, activityGroups, activityInstances, limit, metric]);

    if (!data.labels.length) return <EmptyChart title="Activity Totals" />;

    return <Bar ref={chartRef} data={data} options={buildOptions({ metric, showGroupNames })} />;
}
