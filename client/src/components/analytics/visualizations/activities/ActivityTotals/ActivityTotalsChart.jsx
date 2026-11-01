import React, { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';

import { GROUP_DIMENSION_LABELS, instanceGroups } from '../../../../../utils/analyticsGroupBy';
import { formatDuration } from '../../../../../utils/chartFormat';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../../ChartJSWrapper';
import { ChartEmpty } from '../../../ChartStates';
import { buildSeries, seriesColor } from '../../../series/buildSeries';
import ChartLegendPanel from '../../../series/ChartLegendPanel';
import layout from '../../shared/BucketBarChart.module.css';

export const ACTIVITY_TOTALS_GROUPS = ['activityGroup', 'tag', 'template', 'programDay'];

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

/** An instance's share of a bar: one time done, or its hours. */
const instanceValue = (instance, metric) => (metric === 'duration' ? (instance.duration_seconds || 0) / 3600 : 1);

export default function ActivityTotalsChart({
    activities = [],
    activityInstances = {},
    activityGroups = [],
    chartRef,
    metric = 'instances',
    showGroupNames = false,
    limit = 15,
    groupBy = null,
    lookups = null,
    overlap = false,
}) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const [hiddenKeys, setHiddenKeys] = useState(() => new Set());

    const { rows, series } = useMemo(() => {
        // Compact charts show the top five.
        const normalizedLimit = density === 'compact' ? 5 : Math.min(50, Math.max(1, Number(limit) || 15));
        const groupNamesById = new Map(activityGroups.map((group) => [group.id, group.name]));
        const top = activities
            .map((activity) => {
                const completedInstances = (activityInstances[activity.id] || []).filter(isCompletedActivityInstance);
                return {
                    activity,
                    activityId: activity.id,
                    label: activity.name,
                    groupName: activity.group_id ? groupNamesById.get(activity.group_id) || 'Ungrouped' : 'Ungrouped',
                    instances: completedInstances,
                    value: completedInstances.reduce((sum, instance) => sum + instanceValue(instance, metric), 0),
                };
            })
            .filter((row) => row.value > 0)
            .sort((a, b) => b.value - a.value)
            .slice(0, normalizedLimit);
        if (!groupBy) return { rows: top, series: null };

        // Each activity's bar splits by group: an instance counts in each of its groups.
        const labels = new Map();
        const values = [];
        top.forEach((row) => row.instances.forEach((instance) => {
            instanceGroups(instance, groupBy, {
                activity: row.activity, groupsById: lookups?.groupsById, session: lookups?.sessionsById.get(instance.session_id),
            }).forEach((group) => {
                labels.set(group.key, group.label);
                values.push({ key: group.key, bucket: row.activityId, value: instanceValue(instance, metric) });
            });
        }));
        const entities = [...labels.entries()].map(([key, label]) => ({ key, label })).sort((a, b) => a.label.localeCompare(b.label));
        return { rows: top, series: buildSeries({ entities, rows: values, buckets: top.map((row) => row.activityId) }).series };
    }, [activities, activityGroups, activityInstances, density, groupBy, limit, lookups, metric]);

    if (!rows.length) return <ChartEmpty description="Activity totals appear once activities have been done in this scope." />;

    // Read by the chart's "Set goal here…" menu.
    const goalTarget = { groupNames: rows.map((row) => row.groupName), activityIds: rows.map((row) => row.activityId), measure: metric };
    const datasets = series
        ? series.map((item) => ({
            ...goalTarget,
            label: item.label,
            data: item.data,
            hidden: hiddenKeys.has(item.key),
            backgroundColor: seriesColor(item, chartTheme),
            ...(overlap ? { borderRadius: 4, borderSkipped: 'start' } : {
                borderColor: 'transparent', borderWidth: { top: 0, right: 2, bottom: 0, left: 0 }, borderSkipped: 'start',
            }),
        }))
        : [{
            ...goalTarget,
            label: metric === 'duration' ? 'Time' : 'Times done',
            data: rows.map((row) => row.value),
            backgroundColor: chartTheme.seriesColors[0],
            borderRadius: 4,
            borderSkipped: 'start',
            maxBarThickness: 32,
        }];
    const options = buildOptions({ metric, showGroupNames, chartTheme });
    if (series && !overlap) {
        options.scales.x.stacked = true;
        options.scales.y.stacked = true;
    }
    const chart = <Bar ref={chartRef} data={{ labels: rows.map((row) => row.label), datasets }} options={applyChartDensity(options, density)} />;
    if (!series) return chart;

    const compact = density === 'compact';
    const formatValue = (value) => (metric === 'duration' ? formatDuration(value * 3600) : `${value} times`);
    return (
        <div className={layout.root}>
            <div className={compact ? layout.bodyCompact : layout.body}>
                <div className={layout.chart}>{chart}</div>
                <ChartLegendPanel
                    series={series}
                    colorOf={(item) => seriesColor(item, chartTheme)}
                    formatValue={formatValue}
                    hiddenKeys={hiddenKeys}
                    onHiddenKeysChange={setHiddenKeys}
                    onHoverKeyChange={() => {}}
                    compact={compact}
                    title={GROUP_DIMENSION_LABELS[groupBy.dimension]}
                />
            </div>
            {!compact && overlap ? (
                <p className={layout.footnote}>Items with several tags count once for each tag, so bars sit side by side rather than stacked.</p>
            ) : null}
        </div>
    );
}
