import React, { useMemo } from 'react';
import { Line } from 'react-chartjs-2';

import { DISABLED_CHART_ANIMATION, applyChartDensity, useChartThemeDefaults } from '../analytics/ChartJSWrapper';
import { OPERATOR_SYMBOLS, formatConditionNumber } from '../../utils/goalConditions';
import { buildConditionSeries } from '../../utils/goalConditionSeries';
import styles from './ConditionProgressChart.module.css';

const SERIES_PALETTE = ['#3b82f6', '#22c55e'];

function thresholdAnnotations(series, chartTheme) {
    return Object.fromEntries(series
        .filter((row) => row.threshold != null)
        .map((row, index) => [`threshold-${row.id}`, {
            type: 'line',
            yMin: row.threshold,
            yMax: row.threshold,
            yScaleID: `y${index}`,
            borderColor: SERIES_PALETTE[index],
            borderWidth: 2,
            borderDash: [6, 4],
            label: {
                display: true,
                content: `${OPERATOR_SYMBOLS[row.operator] ?? ''} ${formatConditionNumber(row.threshold)}${row.unit ? ` ${row.unit}` : ''}`,
                position: index === 0 ? 'start' : 'end',
                backgroundColor: chartTheme.tooltipBg,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                color: SERIES_PALETTE[index],
                font: { size: 10 },
            },
        }]));
}

/**
 * A goal's activity threshold over time: each contributing session against the threshold line.
 * Compact density (goal details) keeps only the series and the threshold, with a one-line caption.
 */
function ConditionProgressChart({ condition, instances, activity, density = 'full' }) {
    const chartTheme = useChartThemeDefaults();
    const compact = density === 'compact';
    const { points, series } = useMemo(() => buildConditionSeries(condition, instances, {
        metricsById: new Map((activity?.metric_definitions || []).map((metric) => [metric.id, metric])),
        yieldMetricIds: activity?.yield_metric_ids || [],
    }), [activity, condition, instances]);

    if (points.length === 0) {
        return <p className={styles.empty}>No contributing sessions yet.</p>;
    }
    const data = {
        labels: points.map((point) => point.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: series.map((row, index) => ({
            label: row.label,
            data: row.data,
            unit: row.unit,
            borderColor: SERIES_PALETTE[index],
            backgroundColor: `${SERIES_PALETTE[index]}33`,
            borderWidth: 2,
            spanGaps: true,
            tension: 0.2,
            pointRadius: compact ? 2 : 3,
            yAxisID: `y${index}`,
        })),
    };
    const options = applyChartDensity({
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: series.length > 1, labels: { color: chartTheme.textColor, usePointStyle: true, boxWidth: 8 } },
            tooltip: {
                backgroundColor: chartTheme.tooltipBg,
                titleColor: chartTheme.tooltipText,
                bodyColor: chartTheme.tooltipBody,
                borderColor: chartTheme.tooltipBorder,
                borderWidth: 1,
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatConditionNumber(ctx.parsed.y)}${ctx.dataset.unit ? ` ${ctx.dataset.unit}` : ''}`,
                },
            },
            annotation: { annotations: thresholdAnnotations(series, chartTheme) },
        },
        scales: {
            x: { ticks: { color: chartTheme.textColor, maxRotation: 45 }, grid: { color: chartTheme.gridColor } },
            ...Object.fromEntries(series.map((row, index) => [`y${index}`, {
                type: 'linear',
                position: index === 0 ? 'left' : 'right',
                ticks: { color: chartTheme.textColor },
                grid: { drawOnChartArea: index === 0, color: chartTheme.gridColor },
                title: { display: Boolean(row.unit || row.label), text: row.unit || row.label, color: chartTheme.textColor },
                ...(row.threshold != null ? (row.operator === '<=' || row.operator === '<'
                    ? { suggestedMin: row.threshold * 0.9 }
                    : { suggestedMax: row.threshold * 1.1 }) : {}),
            }])),
        },
    }, density);
    const first = series[0];
    const caption = compact && first
        ? `${first.label}${first.threshold != null ? ` · goal ${OPERATOR_SYMBOLS[first.operator] ?? ''} ${formatConditionNumber(first.threshold)}${first.unit ? ` ${first.unit}` : ''}` : ''} · ${points.length} session${points.length === 1 ? '' : 's'}`
        : null;
    return (
        <div className={styles.frame} data-density={density}>
            <div className={styles.chart} data-testid="condition-evidence-chart">
                <Line data={data} options={options} />
            </div>
            {caption ? <p className={styles.caption}>{caption}</p> : null}
        </div>
    );
}

export default ConditionProgressChart;
