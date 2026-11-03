import React, { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';

import { formatBucketLabel, formatBucketRange, formatDuration } from '../../utils/chartFormat';
import { bucketStarts } from '../../utils/chartGrain';
import EmptyState from '../common/EmptyState';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from './ChartJSWrapper';
import { useReportShownGrain } from './ChartStates';
import { buildSeries, seriesColor } from './series/buildSeries';
import ChartLegendPanel from './series/ChartLegendPanel';
import styles from './GoalTimeDistribution.module.css';

/** "#rrggbb" at an opacity, for dimming the series that aren't highlighted. */
function withAlpha(hex, alpha) {
    if (!/^#[0-9a-f]{6}$/i.test(hex)) return hex;
    const channel = (offset) => parseInt(hex.slice(offset, offset + 2), 16);
    return `rgba(${channel(1)}, ${channel(3)}, ${channel(5)}, ${alpha})`;
}

const GRAIN_LABELS = { day: 'Daily', week: 'Weekly', month: 'Monthly' };

/** "LongTermGoal" -> "Long Term Goal" */
const levelLabel = (type) => String(type || 'Goals').replace(/([a-z])([A-Z])/g, '$1 $2');

/**
 * Time Spent Per Goal: time per calendar bucket, stacked by the goals at one level (or a focused
 * goal's children). The server rolls the series up from the evidence itself, so a goal is never
 * stacked with its ancestor (services/goal_time_rollup.py), and sends each bucket's total with
 * every session counted once. Clicking a goal with sub-goals drills into it; the breadcrumb steps
 * back out.
 */
function GoalTimeDistribution({ timeRollup, chartRef, onFocusGoal = null, requestedGrain = 'auto' }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
    const [hoverKey, setHoverKey] = useState(null);
    const grain = timeRollup?.grain || 'day';
    useReportShownGrain(timeRollup?.grain || null);

    const { series, bucketTotals, uniqueTotals, buckets, breadcrumb } = useMemo(() => {
        const items = timeRollup?.series || [];
        const entities = items.map((item) => ({
            key: item.key,
            label: item.remainder ? `${item.name} · other` : item.name,
            group: item.remainder ? 'Not in a sub-goal' : levelLabel(item.type),
            meta: { goalId: item.goal_id, drillable: item.drillable },
        }));
        const rows = items.flatMap((item) => item.buckets.map((bucket) => ({
            key: item.key, bucket: bucket.date, value: bucket.duration_seconds,
        })));
        // The axis spans the whole range (or all evidence), not just the dates these goals have time on.
        const axis = timeRollup?.first_bucket && timeRollup?.last_bucket
            ? bucketStarts(timeRollup.first_bucket, timeRollup.last_bucket, grain)
            : [];
        const unique = new Map((timeRollup?.unique_totals || []).map((total) => [total.date, total.duration_seconds]));
        return {
            ...buildSeries({ entities, rows, buckets: axis }),
            uniqueTotals: axis.map((bucket) => unique.get(bucket) || 0),
            buckets: axis,
            breadcrumb: timeRollup?.breadcrumb || [],
        };
    }, [grain, timeRollup]);

    const colorOf = (item) => seriesColor(item, chartTheme);
    const chartData = useMemo(() => ({
        labels: buckets.map((bucket) => formatBucketLabel(bucket, grain)),
        datasets: series.map((item) => {
            const color = seriesColor(item, chartTheme);
            const dimmed = hoverKey && hoverKey !== item.key;
            return {
                label: item.label,
                data: item.data.map((seconds) => seconds / 3600),
                rawData: item.data,
                seriesKey: item.key,
                meta: item.meta,
                hidden: hiddenKeys.has(item.key),
                backgroundColor: dimmed ? withAlpha(color, 0.2) : color,
                hoverBackgroundColor: color,
                // A transparent top border leaves a 2px gap between stacked segments.
                borderColor: 'transparent',
                borderWidth: { top: 2, right: 0, bottom: 0, left: 0 },
                borderSkipped: 'start',
            };
        }),
    }), [buckets, chartTheme, grain, hiddenKeys, hoverKey, series]);

    const chartOptions = useMemo(() => ({
        indexAxis: 'x',
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        onClick: (_event, elements) => {
            const dataset = elements[0] ? chartData.datasets[elements[0].datasetIndex] : null;
            if (dataset?.meta?.drillable && onFocusGoal) onFocusGoal(dataset.meta.goalId);
        },
        onHover: (event, elements) => {
            const dataset = elements[0] ? chartData.datasets[elements[0].datasetIndex] : null;
            if (event.native?.target) event.native.target.style.cursor = dataset?.meta?.drillable && onFocusGoal ? 'pointer' : 'default';
        },
        plugins: {
            legend: { display: false },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                footerColor: chartTheme.tooltipText,
                padding: 12,
                filter: (item) => (item.dataset.rawData?.[item.dataIndex] || 0) > 0,
                itemSort: (left, right) => right.raw - left.raw,
                callbacks: {
                    title: (items) => (items[0] ? formatBucketRange(buckets[items[0].dataIndex], grain) : ''),
                    label: (item) => `${item.dataset.label}: ${formatDuration(item.dataset.rawData[item.dataIndex])}`,
                    footer: (items) => {
                        if (!items[0]) return '';
                        const index = items[0].dataIndex;
                        const lines = [`Total: ${formatDuration(uniqueTotals[index])}`];
                        if (bucketTotals[index] - uniqueTotals[index] >= 60) {
                            lines.push(`Stacked: ${formatDuration(bucketTotals[index])} (shared sessions count for each goal)`);
                        }
                        return lines;
                    },
                },
            },
        },
        scales: {
            x: {
                stacked: true,
                ticks: { color: chartTheme.textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                grid: { display: false },
            },
            y: {
                stacked: true,
                beginAtZero: true,
                title: { display: true, text: 'Hours', color: chartTheme.textColor, font: { size: 12 } },
                ticks: { color: chartTheme.textColor, callback: (value) => `${value}h` },
                grid: { color: chartTheme.gridColor },
            },
        },
    }), [bucketTotals, buckets, chartData.datasets, chartTheme, grain, onFocusGoal, uniqueTotals]);

    const crumbs = breadcrumb.length ? (
        <nav className={styles.breadcrumb} aria-label="Goal drill-down">
            <button type="button" onClick={() => onFocusGoal?.(null)}>All goals</button>
            {breadcrumb.map((crumb, index) => (
                <React.Fragment key={crumb.id}>
                    <span aria-hidden="true">›</span>
                    {index === breadcrumb.length - 1
                        ? <span aria-current="page">{crumb.name}</span>
                        : <button type="button" onClick={() => onFocusGoal?.(crumb.id)}>{crumb.name}</button>}
                </React.Fragment>
            ))}
        </nav>
    ) : null;

    const coarsened = requestedGrain !== 'auto' && requestedGrain !== grain;
    const caption = buckets.length ? (
        <p className={styles.caption}>
            {GRAIN_LABELS[grain]} · {formatBucketRange(buckets[0], grain).split(' – ')[0]} – {formatBucketRange(buckets[buckets.length - 1], grain).split(' – ').pop()}
            {coarsened ? ` · ${GRAIN_LABELS[requestedGrain]} buckets would be too many for this range` : ''}
        </p>
    ) : null;

    if (!series.length) {
        return (
            <div className={styles.root}>
                {crumbs}
                <EmptyState
                    compact
                    title="No time recorded"
                    description={breadcrumb.length ? 'No time on this goal in the selected range.' : 'Work on goals to see where your time goes.'}
                />
            </div>
        );
    }

    const compact = density === 'compact';
    return (
        <div className={styles.root}>
            {crumbs}
            {compact ? null : caption}
            <div className={compact ? styles.bodyCompact : styles.body}>
                <div className={styles.chart}>
                    <Bar ref={chartRef} data={chartData} options={applyChartDensity(chartOptions, density)} />
                </div>
                <ChartLegendPanel
                    series={series}
                    colorOf={colorOf}
                    formatValue={formatDuration}
                    hiddenKeys={hiddenKeys}
                    onHiddenKeysChange={setHiddenKeys}
                    onHoverKeyChange={setHoverKey}
                    compact={compact}
                    title="Goals"
                />
            </div>
            {!compact && series.length > 1 ? (
                <p className={styles.footnote}>A session linked to several goals counts toward each of them.</p>
            ) : null}
        </div>
    );
}

export default GoalTimeDistribution;
