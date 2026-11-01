import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { formatDuration } from '../../../../../utils/chartFormat';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../../ChartJSWrapper';
import { ChartEmpty } from '../../../ChartStates';

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

function buildOptions({ metric, showGroupNames, chartTheme }) {
    const xAxisLabel = metric === 'duration' ? 'Hours' : 'Times done';
    return {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        ...DISABLED_CHART_ANIMATION,
        scales: {
            x: {
                type: 'linear',
                beginAtZero: true,
                title: { display: true, text: xAxisLabel, color: chartTheme.textColor },
                ticks: {
                    color: chartTheme.textColor,
                    ...(metric === 'duration' ? { callback: (value) => `${value}h` } : { precision: 0, stepSize: 1 }),
                },
                grid: { color: chartTheme.gridColor },
            },
            y: {
                type: 'category',
                ticks: { color: chartTheme.textColor },
                grid: { display: false },
            },
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                padding: 12,
                callbacks: {
                    afterTitle: (ctx) => {
                        if (!showGroupNames) return [];
                        const groupName = ctx[0]?.dataset?.groupNames?.[ctx[0]?.dataIndex];
                        return groupName ? [`Group: ${groupName}`] : [];
                    },
                    label: (ctx) => metric === 'duration'
                        ? `Time: ${formatDuration((ctx.raw || 0) * 3600)}`
                        : `Times done: ${ctx.raw}`,
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
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const data = useMemo(() => {
        // Compact charts show the top five.
        const normalizedLimit = density === 'compact' ? 5 : Math.min(50, Math.max(1, Number(limit) || 15));
        const groupNamesById = new Map(activityGroups.map((group) => [group.id, group.name]));
        const rows = activities
            .map((activity) => {
                const completedInstances = (activityInstances[activity.id] || []).filter(isCompletedActivityInstance);
                const seconds = completedInstances.reduce((sum, instance) => sum + (instance.duration_seconds || 0), 0);
                return {
                    activityId: activity.id,
                    label: activity.name,
                    groupName: activity.group_id ? groupNamesById.get(activity.group_id) || 'Ungrouped' : 'Ungrouped',
                    count: completedInstances.length,
                    hours: seconds / 3600,
                };
            })
            .map((row) => ({
                ...row,
                value: metric === 'duration' ? row.hours : row.count,
            }))
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, normalizedLimit);

        return {
            labels: rows.map((row) => row.label),
            datasets: [{
                label: metric === 'duration' ? 'Time' : 'Times done',
                data: rows.map((row) => row.value),
                backgroundColor: chartTheme.seriesColors[0],
                borderRadius: 4,
                borderSkipped: 'start',
                maxBarThickness: 32,
                groupNames: rows.map((row) => row.groupName),
                // Read by the chart's "Set goal here…" menu.
                activityIds: rows.map((row) => row.activityId),
                measure: metric,
            }],
        };
    }, [activities, activityGroups, activityInstances, chartTheme.seriesColors, density, limit, metric]);

    if (!data.labels.length) return <ChartEmpty description="Activity totals appear once activities have been done in this scope." />;

    return <Bar ref={chartRef} data={data} options={applyChartDensity(buildOptions({ metric, showGroupNames, chartTheme }), density)} />;
}
