import React, { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';

import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../analytics/ChartJSWrapper';
import { formatLiteralDate } from '../../utils/dateUtils';
import { LOG_DOMAIN_KEYS } from './logsRange';
import styles from './Logs.module.css';

/** The colour for each domain: series colours in a fixed order, so a domain keeps its colour when others empty. */
export function domainColor(chartTheme, domainKey) {
    if (domainKey === 'other') return chartTheme.otherSeriesColor;
    return chartTheme.seriesColors[LOG_DOMAIN_KEYS.indexOf(domainKey)] || chartTheme.otherSeriesColor;
}

const dayOf = (bucketStart) => bucketStart.slice(0, 10);

/**
 * Event activity per day, stacked by domain. Clicking a day narrows the logs to it.
 */
function LogsActivityChart({ activity, onSelectDay }) {
    const chartTheme = useChartThemeDefaults();
    const buckets = useMemo(() => activity?.buckets || [], [activity]);
    const domains = useMemo(() => activity?.domains || [], [activity]);

    const chartData = useMemo(() => {
        // Segments are separated by a hairline in the chart's own surface colour.
        const surface = getComputedStyle(document.documentElement).getPropertyValue('--color-bg-card').trim();
        return {
            labels: buckets.map((bucket) => formatLiteralDate(dayOf(bucket.start), { year: undefined, month: 'short', day: 'numeric' })),
            datasets: domains
                // Only domains with events in range get a legend entry; colours stay fixed per domain.
                .filter(({ key }) => buckets.some((bucket) => bucket.counts[key] > 0))
                .map(({ key, label }) => ({
                    label,
                    data: buckets.map((bucket) => bucket.counts[key]),
                    backgroundColor: domainColor(chartTheme, key),
                    borderColor: surface || 'transparent',
                    borderWidth: { top: 1 },
                    borderSkipped: 'bottom',
                    borderRadius: 2,
                    maxBarThickness: 28,
                })),
        };
    }, [buckets, domains, chartTheme]);

    const options = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        interaction: { mode: 'index', intersect: false },
        onClick: (_event, elements) => {
            const bucket = buckets[elements[0]?.index];
            if (bucket && onSelectDay) onSelectDay(dayOf(bucket.start));
        },
        onHover: (event, elements) => {
            if (event.native?.target) event.native.target.style.cursor = elements.length ? 'pointer' : 'default';
        },
        plugins: {
            legend: {
                position: 'top',
                align: 'start',
                labels: { color: chartTheme.textColor, boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: 'rectRounded' },
            },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                filter: (item) => item.parsed.y > 0,
                callbacks: {
                    title: (items) => formatLiteralDate(dayOf(buckets[items[0].dataIndex].start), {
                        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                    }),
                    footer: (items) => {
                        const total = buckets[items[0]?.dataIndex]?.total ?? 0;
                        return `${total} event${total === 1 ? '' : 's'} · click to show this day`;
                    },
                },
            },
        },
        scales: {
            x: {
                stacked: true,
                grid: { display: false },
                ticks: { color: chartTheme.textColor, autoSkip: true, maxTicksLimit: 10, maxRotation: 0 },
            },
            y: {
                stacked: true,
                beginAtZero: true,
                border: { display: false },
                grid: { color: chartTheme.gridColor },
                ticks: { color: chartTheme.textColor, precision: 0, maxTicksLimit: 4 },
            },
        },
    }), [buckets, chartTheme, onSelectDay]);

    const total = activity?.total ?? 0;
    return (
        <div className={styles.chart}>
            {/* react-chartjs-2 gives the canvas role="img"; the label is its text alternative. */}
            <Bar
                data={chartData}
                options={options}
                aria-label={`${total} events from ${activity?.start_date} to ${activity?.end_date}, by day and area`}
            />
        </div>
    );
}

export default LogsActivityChart;
