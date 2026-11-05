import React, { useCallback, useMemo, useRef } from 'react';
import { Line } from 'react-chartjs-2';

import { DISABLED_CHART_ANIMATION, applyChartDensity, useChartThemeDefaults } from '../analytics/ChartJSWrapper';
import { GoalMarkerHost } from '../analytics/GoalMarkerLayer';
import useActiveChartPoint from '../analytics/useActiveChartPoint';
import { goalChartMarkers, goalLineAnnotations, isMarkedThreshold } from '../../utils/goalConditionLines';
import { OPERATOR_SYMBOLS } from '../../utils/goalConditions';
import { formatConditionNumber } from '../../utils/goalConditionText';
import { buildConditionSeries, conditionLine } from '../../utils/goalConditionSeries';
import styles from './ConditionProgressChart.module.css';

const SERIES_PALETTE = ['#3b82f6', '#22c55e'];

/** A line for each threshold no goal marker stands on (the marker brings its own guide line). */
function thresholdAnnotations(series, chartTheme, markers) {
    return Object.fromEntries(series.flatMap((row, index) => (
        row.threshold == null || isMarkedThreshold(markers, `y${index}`, row.threshold) ? [] : [[`threshold-${row.id}`, {
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
        }]]
    )));
}

/**
 * A goal's activity threshold over time: each contributing session against the threshold line.
 * Compact density (goal details) keeps only the series and the threshold, with a one-line caption.
 * With `goalLines` (the activity's goals), the goal (`goalId`) and any others on these axes are marked
 * on the chart; each series carries its `metricId` for setting a goal from a point on it.
 */
function ConditionProgressChart({
    condition, instances, activity, density = 'full', highlightInstanceId = null, hoverInstanceId = null,
    chartRef, goalLines = [], goalId = null, onOpenGoal = null,
}) {
    const chartTheme = useChartThemeDefaults();
    const compact = density === 'compact';
    const ownChartRef = useRef(null);
    // Ours for the hover highlight and the markers, and the caller's (the goal surface) too.
    const setChartRef = useCallback((chart) => {
        ownChartRef.current = chart;
        if (chartRef) chartRef.current = chart;
    }, [chartRef]);
    const { points, series } = useMemo(() => buildConditionSeries(condition, instances, {
        metricsById: new Map((activity?.metric_definitions || []).map((metric) => [metric.id, metric])),
        yieldMetricIds: activity?.yield_metric_ids || [],
    }), [activity, condition, instances]);
    // An instance hovered elsewhere (e.g. a past session in a list) shows as the chart's active
    // point, with its tooltip on full-size charts, as if the pointer were on it.
    const hoverIndex = hoverInstanceId ? points.findIndex((point) => point.instanceId === hoverInstanceId) : -1;
    const activePoints = hoverIndex < 0 ? [] : series
        .map((row, datasetIndex) => ({ datasetIndex, index: hoverIndex, value: row.data[hoverIndex] }))
        .filter((element) => element.value != null);
    useActiveChartPoint(ownChartRef, activePoints, { tooltip: !compact });
    // A running total or count shares no axis with a goal on one session.
    const goalScales = useMemo(() => (condition?.kind === 'single_session'
        ? Object.fromEntries(series.map((row, index) => [row.id, `y${index}`]))
        : {}), [condition?.kind, series]);
    const yieldLine = conditionLine(condition)?.setsHandling;
    const markers = useMemo(
        () => goalChartMarkers(goalLines, goalId, goalScales, yieldLine, series),
        [goalId, goalLines, goalScales, series, yieldLine],
    );

    if (points.length === 0) {
        return <p className={styles.empty}>No contributing sessions yet.</p>;
    }
    const data = {
        labels: points.map((point) => point.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })),
        datasets: series.map((row, index) => ({
            label: row.label,
            metricId: row.id, // read when setting a goal from the chart
            data: row.data,
            unit: row.unit,
            borderColor: SERIES_PALETTE[index],
            backgroundColor: `${SERIES_PALETTE[index]}33`,
            borderWidth: 2,
            spanGaps: true,
            tension: 0.2,
            // The highlighted instance (e.g. the session being edited) stands out.
            pointRadius: points.map((point) => (point.instanceId === highlightInstanceId ? 5 : compact ? 2 : 3)),
            pointHoverRadius: compact ? 5 : 7,
            pointHoverBorderWidth: 3,
            pointHoverBorderColor: chartTheme.tooltipText,
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
            annotation: {
                annotations: { ...goalLineAnnotations(goalLines, goalScales, yieldLine), ...thresholdAnnotations(series, chartTheme, markers) },
            },
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
                <GoalMarkerHost chartRef={ownChartRef} markers={markers} onOpenGoal={onOpenGoal}>
                    <Line ref={setChartRef} data={data} options={options} />
                </GoalMarkerHost>
            </div>
            {caption ? <p className={styles.caption}>{caption}</p> : null}
        </div>
    );
}

export default ConditionProgressChart;
