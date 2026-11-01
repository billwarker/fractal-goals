import React from 'react';
import { Bar } from 'react-chartjs-2';

import { formatBucketLabel, formatBucketRange, formatDuration } from '../../../../utils/chartFormat';
import { applyChartDensity, DISABLED_CHART_ANIMATION, useChartDensity, useChartThemeDefaults } from '../../ChartJSWrapper';
import { ChartEmpty } from '../../ChartStates';

/**
 * A count or time per calendar bucket, one measure on one axis (two measures of different scale on
 * one chart would need two y-axes, which can't be compared). Rows come from utils/chartGrain.js
 * `bucketRows`, so empty periods show as gaps.
 *
 * @param {{ rows: Array<{ key: string, count: number, seconds: number }>, grain: 'day' | 'week' | 'month',
 *   byTime: boolean, countLabel: (count: number) => string, seriesLabel: string, chartRef?: any,
 *   emptyDescription: string }} props
 */
export default function BucketBarChart({ rows, grain, byTime, countLabel, seriesLabel, chartRef, emptyDescription }) {
    const chartTheme = useChartThemeDefaults();
    const density = useChartDensity();
    if (!rows.some((row) => row.count > 0)) return <ChartEmpty description={emptyDescription} />;
    return (
        <Bar
            ref={chartRef}
            data={{
                labels: rows.map((row) => formatBucketLabel(row.key, grain)),
                datasets: [{
                    label: seriesLabel,
                    data: rows.map((row) => (byTime ? row.seconds / 3600 : row.count)),
                    backgroundColor: chartTheme.seriesColors[0],
                    borderRadius: 4,
                    borderSkipped: 'start',
                    maxBarThickness: 48,
                }],
            }}
            options={applyChartDensity({
                responsive: true,
                maintainAspectRatio: false,
                ...DISABLED_CHART_ANIMATION,
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        backgroundColor: chartTheme.tooltipBg,
                        titleColor: chartTheme.tooltipText,
                        bodyColor: chartTheme.tooltipBody,
                        padding: 12,
                        callbacks: {
                            title: (items) => (items[0] ? formatBucketRange(rows[items[0].dataIndex].key, grain) : ''),
                            label: (ctx) => {
                                const row = rows[ctx.dataIndex];
                                return byTime ? `${formatDuration(row.seconds)} across ${countLabel(row.count)}` : countLabel(row.count);
                            },
                        },
                    },
                },
                scales: {
                    x: {
                        ticks: { color: chartTheme.textColor, maxRotation: 0, autoSkip: true, maxTicksLimit: 12 },
                        grid: { display: false },
                    },
                    y: {
                        beginAtZero: true,
                        ticks: { color: chartTheme.textColor, ...(byTime ? { callback: (value) => `${value}h` } : { precision: 0 }) },
                        grid: { color: chartTheme.gridColor },
                        title: { display: true, text: byTime ? 'Hours' : seriesLabel, color: chartTheme.textColor },
                    },
                },
            }, density)}
        />
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
