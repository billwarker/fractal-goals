import React, { useMemo, useState } from 'react';
import { Line } from 'react-chartjs-2';

import Modal from '../atoms/Modal';
import ViewToggleTabs from '../common/ViewToggleTabs';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../analytics/ChartJSWrapper';
import { useGoalConditionEvidence } from '../../hooks/useGoalConditionQueries';
import {
    OPERATOR_SYMBOLS,
    describeCondition,
    describeProgress,
    formatConditionNumber,
    progressFraction,
} from '../../utils/goalConditions';
import { buildConditionSeries } from '../../utils/goalConditionSeries';
import ConditionProgressBar from './ConditionProgressBar';
import styles from './ConditionEvidenceModal.module.css';

const SERIES_PALETTE = ['#3b82f6', '#22c55e'];
const RECENT_LIMIT = 12;

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

function ConditionEvidenceChart({ condition, instances, activity }) {
    const chartTheme = useChartThemeDefaults();
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
            pointRadius: 3,
            yAxisID: `y${index}`,
        })),
    };
    const options = {
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
    };
    return (
        <div className={styles.chart} data-testid="condition-evidence-chart">
            <Line data={data} options={options} />
        </div>
    );
}

/**
 * The evidence behind a goal's activity threshold: progress, a chart against the threshold, and the
 * most recent contributing sessions. `snapshot` renders published landing data without any fetch.
 */
function ConditionEvidenceModal({
    isOpen, onClose, rootId, goalId, goalName, accentColor, snapshot = null, portalContainer = null, overlayClassName = '',
}) {
    const [since, setSince] = useState('active');
    const query = useGoalConditionEvidence(rootId, goalId, { since, enabled: isOpen && !snapshot });
    const payload = snapshot || query.data;
    const condition = payload?.condition || null;
    const activity = payload?.activity_definition || null;
    const instances = useMemo(() => payload?.instances || [], [payload?.instances]);
    const progress = payload?.progress || null;
    const recent = [...instances].reverse().slice(0, RECENT_LIMIT);

    return (
        <Modal
            isOpen={isOpen}
            onClose={onClose}
            title={goalName || 'Completion'}
            size="lg"
            layer="top"
            portalContainer={portalContainer}
            overlayClassName={overlayClassName}
        >
            <div className={styles.body} style={{ '--condition-accent': accentColor || 'var(--color-brand-primary)' }}>
                {condition ? <p className={styles.sentence}>{describeCondition(condition, activity)}</p> : null}
                {progress ? (
                    <ConditionProgressBar
                        fraction={progressFraction(progress)}
                        label={describeProgress(progress, condition)}
                        met={Boolean(progress.met || progress.completed)}
                        accentColor={accentColor}
                    />
                ) : null}
                {!snapshot ? (
                    <ViewToggleTabs
                        items={[{ value: 'active', label: 'Active period' }, { value: 'all', label: 'All history' }]}
                        value={since}
                        onChange={setSince}
                        ariaLabel="Evidence range"
                        className={styles.rangeTabs}
                    />
                ) : null}
                {query.isLoading && !snapshot ? <p className={styles.empty} role="status">Loading evidence…</p> : null}
                {query.error && !snapshot ? <p className={styles.empty} role="alert">Couldn’t load evidence. Try again.</p> : null}
                {condition ? <ConditionEvidenceChart condition={condition} instances={instances} activity={activity} /> : null}
                {recent.length > 0 ? (
                    <div className={styles.recent}>
                        <h3 className={styles.recentTitle}>Recent sessions</h3>
                        {recent.map((instance) => (
                            <ActivityTimelineCard
                                key={instance.id}
                                instance={instance}
                                activityDef={activity}
                                progressRecord={instance.progress_comparison || null}
                                formatDate={(iso) => (iso ? new Date(iso).toLocaleString() : '')}
                            />
                        ))}
                    </div>
                ) : null}
            </div>
        </Modal>
    );
}

export default ConditionEvidenceModal;
