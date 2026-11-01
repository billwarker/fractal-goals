import React, { useMemo, useState } from 'react';
import { Bar } from 'react-chartjs-2';

import { formatBucketLabel, formatBucketRange, formatDuration } from '../../../../utils/chartFormat';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../ChartJSWrapper';
import { ChartEmpty } from '../../ChartStates';
import { buildSeries, seriesColor } from '../../series/buildSeries';
import ChartLegendPanel from '../../series/ChartLegendPanel';
import styles from './BucketBarChart.module.css';

/**
 * A count or time per calendar bucket, one measure on one axis (two measures of different scale on
 * one chart would need two y-axes, which can't be compared). Rows come from utils/chartGrain.js
 * `bucketRows`, so empty periods show as gaps.
 *
 * With `grouped` (from `groupedBucketRows`) the bars split into group series under the same rules
 * as every multi-series chart. Groups that can overlap (an item with several tags) are drawn side by
 * side rather than stacked, since a stack would count the item twice; the tooltip's total always
 * counts each item once.
 *
 * @param {{ rows: Array<{ key: string, count: number, seconds: number }>, grain: 'day' | 'week' | 'month',
 *   byTime: boolean, countLabel: (count: number) => string, seriesLabel: string, chartRef?: any,
 *   emptyDescription: string,
 *   grouped?: { groups: Array<{ key: string, label: string }>, values: Array<{ key: string, bucket: string, count: number, seconds: number }>,
 *     overlap: boolean, title: string } | null,
 *   datasetMeta?: object | null }} props  datasetMeta: extra fields on the single dataset (read by the goal surface)
 */
export default function BucketBarChart({
    rows, grain, byTime, countLabel, seriesLabel, chartRef, emptyDescription, grouped = null, datasetMeta = null,
}) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    const [hiddenKeys, setHiddenKeys] = useState(() => new Set());
    const [hoverKey, setHoverKey] = useState(null);
    // A null count is a bucket with nothing to draw (a running total's future buckets).
    const valueOf = (item) => (item.count == null ? null : byTime ? item.seconds / 3600 : item.count);
    const formatValue = (value) => (byTime ? formatDuration(value * 3600) : countLabel(value));

    const series = useMemo(() => (grouped ? buildSeries({
        entities: grouped.groups,
        rows: grouped.values.map((value) => ({ key: value.key, bucket: value.bucket, value: byTime ? value.seconds / 3600 : value.count })),
        buckets: rows.map((row) => row.key),
    }).series : null), [byTime, grouped, rows]);

    if (!rows.some((row) => row.count > 0)) return <ChartEmpty description={emptyDescription} />;
    const stacked = Boolean(series) && !grouped.overlap;
    const datasets = series
        ? series.map((item) => {
            const color = seriesColor(item, chartTheme);
            return {
                label: item.label,
                seriesKey: item.key,
                data: item.data,
                hidden: hiddenKeys.has(item.key),
                backgroundColor: hoverKey && hoverKey !== item.key ? `${color}33` : color,
                hoverBackgroundColor: color,
                ...(stacked
                    ? { borderColor: 'transparent', borderWidth: { top: 2, right: 0, bottom: 0, left: 0 }, borderSkipped: 'start' }
                    : { borderRadius: 4, borderSkipped: 'start' }),
            };
        })
        : [{
            ...datasetMeta,
            label: seriesLabel,
            data: rows.map(valueOf),
            backgroundColor: chartTheme.seriesColors[0],
            borderRadius: 4,
            borderSkipped: 'start',
            maxBarThickness: 48,
        }];

    const chart = (
        <Bar
            ref={chartRef}
            data={{ labels: rows.map((row) => formatBucketLabel(row.key, grain)), datasets }}
            options={applyChartDensity({
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                interaction: series ? { mode: 'index', intersect: false } : undefined,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        titleColor: chartTheme.tooltipText,
                        bodyColor: chartTheme.tooltipBody,
                        footerColor: chartTheme.tooltipText,
                        padding: 12,
                        ...(series ? {
                            filter: (item) => (item.raw || 0) > 0,
                            itemSort: (left, right) => right.raw - left.raw,
                        } : {}),
                        callbacks: {
                            title: (items) => (items[0] ? formatBucketRange(rows[items[0].dataIndex].key, grain) : ''),
                            label: (ctx) => {
                                if (series) return `${ctx.dataset.label}: ${formatValue(ctx.raw)}`;
                                const row = rows[ctx.dataIndex];
                                if (datasetMeta?.runningTotal) return `${seriesLabel}: ${byTime ? formatDuration(row.seconds) : countLabel(row.count)}`;
                                return byTime ? `${formatDuration(row.seconds)} across ${countLabel(row.count)}` : countLabel(row.count);
                            },
                            footer: (items) => {
                                if (!series || !items[0]) return '';
                                const row = rows[items[0].dataIndex];
                                return `Total: ${byTime ? formatDuration(row.seconds) : countLabel(row.count)}`;
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        stacked,
                        ticks: { color: chartTheme.textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                        grid: { display: false },
                    },
                    y: {
                        stacked,
                        beginAtZero: true,
                        ticks: { color: chartTheme.textColor, ...(byTime ? { callback: (value) => `${value}h` } : { precision: 0 }) },
                        grid: { color: chartTheme.gridColor },
                        title: { display: true, text: byTime ? 'Hours' : seriesLabel, color: chartTheme.textColor },
                    },
                },
            }, density)}
        />
    );
    if (!series) return chart;

    const compact = density === 'compact';
    return (
        <div className={styles.root}>
            <div className={compact ? styles.bodyCompact : styles.body}>
                <div className={styles.chart}>{chart}</div>
                <ChartLegendPanel
                    series={series}
                    colorOf={(item) => seriesColor(item, chartTheme)}
                    formatValue={formatValue}
                    hiddenKeys={hiddenKeys}
                    onHiddenKeysChange={setHiddenKeys}
                    onHoverKeyChange={setHoverKey}
                    compact={compact}
                    title={grouped.title}
                />
            </div>
            {!compact && grouped.overlap ? (
                <p className={styles.footnote}>Items with several tags count once for each tag, so bars sit side by side rather than stacked.</p>
            ) : null}
        </div>
    );
}

/** The measure chips: a count or time, one at a time. */
export function MeasureControl({ options, value, onChange }) {
    return (
        <>
            <div className="sessions-query-sidebar-section-header">
                <h4>Measure</h4>
            </div>
            <div className="sessions-query-chip-group">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${value === option.value ? 'active' : ''}`}
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </>
    );
}
