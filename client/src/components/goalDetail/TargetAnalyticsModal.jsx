import React, { Suspense, useCallback, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Line, Scatter } from 'react-chartjs-2';

import ModalBackdrop from '../atoms/ModalBackdrop';
import CloseButton from '../atoms/CloseButton';
import DeleteButton from '../atoms/DeleteButton';
import ChevronIcon from '../atoms/ChevronIcon';
import { AlertTriangleIcon, EditPencilIcon } from '../atoms/AppIcons';
import DeleteConfirmModal from '../modals/DeleteConfirmModal';
import { ActivityTimelineCard } from '../common/ActivityTimeline';
import { DISABLED_CHART_ANIMATION, useChartThemeDefaults } from '../analytics/ChartJSWrapper';
import { withScatterPointDensity } from '../analytics/scatterPointProfile';
import { useTargetAnalytics, useGoalActivityInstances } from '../../hooks/useTargetQueries';
import { useGoalLevels } from '../../contexts/GoalLevelsContext';
import { lazyWithRetry } from '../../utils/lazyWithRetry';
import { computeAutoAggregations } from '../../utils/progressAggregations';
import { themedTooltipOptions, thresholdLineAnnotations } from './targetAnalyticsChartOptions';
import { selectTargetAnalyticsData } from './targetAnalyticsSnapshot';
import styles from './TargetAnalyticsModal.module.css';

const TargetManager = lazyWithRetry(
    () => import('./TargetManager'),
    'components/goalDetail/TargetManager'
);

const SERIES_PALETTE = ['#3b82f6', '#22c55e'];
const SELECTED_COLOR = '#4f9cf9';
const EMPTY_METRIC_DEFINITIONS = [];

function getInstanceDate(instance) {
    const value = instance?.session_date || instance?.time_start || instance?.created_at;
    const date = value ? new Date(value) : null;
    return date && !Number.isNaN(date.getTime()) ? date : null;
}

function formatLabel(instance, index) {
    const date = getInstanceDate(instance);
    if (!date) return `#${index + 1}`;
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function coerceNumber(value) {
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
        return null;
    }
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : null;
}

// Project one coherent metric tuple per instance. Set-based activities must use
// every value from the same canonical best set; combining per-metric maxima can
// manufacture a performance that never occurred. Direct metrics are only the
// fallback for instances without a usable set.
function resolveInstanceMetricTuple(instance, metricDefinitions) {
    const sets = instance?.sets || [];
    if (sets.length) {
        const { best_set_index: bestSetIndex } = computeAutoAggregations(sets, metricDefinitions);
        if (bestSetIndex != null) {
            return new Map((sets[bestSetIndex]?.metrics || []).map((metric) => [
                metric?.metric_id || metric?.metric_definition_id,
                coerceNumber(metric?.value),
            ]));
        }
    }

    return new Map((instance?.metrics || instance?.metric_values || []).map((metric) => [
        metric?.metric_id || metric?.metric_definition_id,
        coerceNumber(metric?.value),
    ]));
}

function operatorIsHigherBetter(operator = '>=') {
    return ['>=', '>', '==', '='].includes(operator);
}

function thresholdScalePadding(metricDef, index, conditionByMetric) {
    const condition = conditionByMetric.get(metricDef.id);
    const targetValue = coerceNumber(condition?.target_value);
    if (targetValue == null) return {};

    const paddingRatio = 0.06 + (index * 0.05);
    const padding = Math.max(Math.abs(targetValue) * paddingRatio, 0.25);
    if (operatorIsHigherBetter(condition.operator)) {
        return { suggestedMax: targetValue + padding };
    }
    return { suggestedMin: targetValue - padding };
}

function metricScaleBounds(metricDef) {
    const min = coerceNumber(metricDef?.min_value);
    const max = coerceNumber(metricDef?.max_value);
    return {
        ...(min != null ? { min } : {}),
        ...(max != null ? { max } : {}),
    };
}

function metricScaleDomain(metricDef, index, conditionByMetric) {
    const bounds = metricScaleBounds(metricDef);
    const thresholdPadding = thresholdScalePadding(metricDef, index, conditionByMetric);
    if (bounds.min != null) delete thresholdPadding.suggestedMin;
    if (bounds.max != null) delete thresholdPadding.suggestedMax;
    return {
        ...thresholdPadding,
        ...bounds,
    };
}

// Minimal one-line metadata beneath the header: creation, age, activity count,
// and target completion status.
function TargetMeta({ summary, now }) {
    if (!summary) return null;
    const created = summary.created_at ? new Date(summary.created_at) : null;
    const lastAt = summary.last_instance_at ? new Date(summary.last_instance_at) : null;
    const daysSinceLast = lastAt ? Math.floor((now - lastAt.getTime()) / 86400000) : null;
    const stalled = !summary.completed && daysSinceLast != null && daysSinceLast > 14;

    let status = null;
    let statusClass = styles.metaStatusPending;
    if (summary.completed && summary.completed_at) {
        status = `✓ Completed on ${new Date(summary.completed_at).toLocaleDateString()}`;
        statusClass = styles.metaStatusSuccess;
    } else if (summary.completed) {
        status = '✓ Completed';
        statusClass = styles.metaStatusSuccess;
    } else {
        status = 'Not yet reached';
    }

    const parts = [];
    if (created) parts.push(`Created ${created.toLocaleDateString()}`);
    if (summary.days_since_created != null) parts.push(`${summary.days_since_created}d old`);
    parts.push(`${summary.total_count} ${summary.total_count === 1 ? 'instance' : 'instances'}`);
    if (daysSinceLast != null) parts.push(`last ${daysSinceLast === 0 ? 'today' : `${daysSinceLast}d ago`}`);

    return (
        <div className={styles.meta}>
            <span className={statusClass}>{status}</span>
            <span className={styles.metaDot}>·</span>
            <span className={styles.metaDetails}>{parts.join(' · ')}</span>
            {stalled && (
                <span className={styles.metaStalled}>
                    <span className={styles.metaDot}>·</span>
                    <AlertTriangleIcon size={13} />
                    <span>Stalled</span>
                </span>
            )}
        </div>
    );
}

function TargetAnalyticsModal({
    rootId,
    goalId,
    target,
    goalColor,
    goalType,
    goalCompleted = false,
    activityDefinitions = [],
    // Builder props (present in add/edit mode)
    mode = 'view', // 'view' | 'add' | 'edit'
    targets,
    setTargets,
    associatedActivities = [],
    initialActivityId = null,
    lockActivitySelection = false,
    onSave,
    onSaved,
    onDelete, // (target) => void — delete the target (view mode only)
    onClose,
    analyticsData = null,
    readOnly = false,
    portalTarget = null,
    overlayClassName = '',
}) {
    // The modal can switch from view → edit in place when the user clicks Edit.
    const [activeMode, setActiveMode] = useState(mode);
    const startedInView = mode === 'view';
    const isBuilding = activeMode === 'add' || activeMode === 'edit';
    const { getGoalColor } = useGoalLevels();
    const chartTheme = useChartThemeDefaults();
    const completedColor = getGoalColor?.('Completed') || '#22c55e';
    const [viewMode, setViewMode] = useState('trend'); // 'trend' | 'scatter'
    const [graphTypeMenuOpen, setGraphTypeMenuOpen] = useState(false);
    const [selectedInstanceId, setSelectedInstanceId] = useState(null);
    const [showAllHistory, setShowAllHistory] = useState(true); // default to full activity history
    const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
    const [renderNow] = useState(() => Date.now());
    const chartRef = useRef(null);

    // Live builder draft (activity + thresholds) — drives the graph in add/edit.
    const [draft, setDraft] = useState(null);
    const handleDraftChange = useCallback((next) => setDraft(next), []);
    const setGraphType = useCallback((nextViewMode) => {
        setViewMode(nextViewMode);
        setGraphTypeMenuOpen(false);
    }, []);

    // View/edit of a saved target: analytics read model (respects since-toggle).
    const { data: remoteData, isLoading: remoteLoading, error: remoteError } = useTargetAnalytics(
        rootId,
        target?.id,
        { since: showAllHistory ? 'all' : 'creation', enabled: !analyticsData && Boolean(target?.id) }
    );
    const data = useMemo(
        () => selectTargetAnalyticsData(analyticsData, remoteData, showAllHistory),
        [analyticsData, remoteData, showAllHistory]
    );
    const analyticsLoading = analyticsData ? false : remoteLoading;
    const analyticsError = analyticsData ? null : remoteError;

    // Add mode (or live activity-history preview): instances for the draft activity.
    const draftActivityId = isBuilding ? (draft?.activity_id || initialActivityId) : null;
    const { data: previewData, isLoading: previewLoading } = useGoalActivityInstances(
        rootId,
        goalId,
        draftActivityId,
        { enabled: Boolean(isBuilding && draftActivityId) }
    );

    // In add mode the instances come from the preview endpoint; in view/edit from
    // the target analytics endpoint. Edit mode prefers the live preview once the
    // user has changed the activity, but falls back to the saved target's set.
    const isLoading = isBuilding ? previewLoading : analyticsLoading;
    const error = isBuilding ? null : analyticsError;

    const activityDef = useMemo(() => {
        if (isBuilding) {
            return previewData?.activity_definition
                || activityDefinitions.find((a) => a.id === draftActivityId)
                || null;
        }
        return data?.activity_definition
            || activityDefinitions.find((a) => a.id === target?.activity_id)
            || null;
    }, [isBuilding, previewData, data, activityDefinitions, draftActivityId, target]);

    const metricDefinitions = activityDef?.metric_definitions || EMPTY_METRIC_DEFINITIONS;

    // In add/edit mode the thresholds come from the live draft; in view mode from
    // the saved target. This is what makes the graph update as the user types.
    const conditionByMetric = useMemo(() => {
        const map = new Map();
        const source = isBuilding
            ? (draft?.metrics || [])
            : (data?.target?.metrics || target?.metrics || []);
        for (const condition of source) {
            const mid = condition.metric_definition_id || condition.metric_id;
            if (mid) map.set(mid, condition);
        }
        return map;
    }, [isBuilding, draft, data, target]);

    // Default-select the metrics referenced by the target's conditions (max 2).
    const conditionMetricIds = useMemo(
        () => Array.from(conditionByMetric.keys()).slice(0, 2),
        [conditionByMetric]
    );
    const defaultMetricIds = useMemo(() => (
        conditionMetricIds.length
            ? conditionMetricIds
            : metricDefinitions.slice(0, 2).map((metricDef) => metricDef.id)
    ), [conditionMetricIds, metricDefinitions]);
    const [selectedMetricIds, setSelectedMetricIds] = useState(null);
    const effectiveMetricIds = (selectedMetricIds ?? defaultMetricIds).slice(0, 2);

    const selectedMetricDefs = effectiveMetricIds
        .map((id) => metricDefinitions.find((m) => m.id === id))
        .filter(Boolean);
    const primaryMetricId = effectiveMetricIds[0] || metricDefinitions[0]?.id || '';
    const secondaryMetricId = effectiveMetricIds[1] || '';

    const instances = useMemo(
        () => (isBuilding ? (previewData?.instances || []) : (data?.instances || [])),
        [isBuilding, previewData, data]
    );
    const summary = isBuilding ? null : data?.summary;
    const metricTuplesByInstanceId = useMemo(() => new Map(
        instances.map((instance) => [
            instance.id,
            resolveInstanceMetricTuple(instance, metricDefinitions),
        ])
    ), [instances, metricDefinitions]);

    const updateMetricSlot = (slotIndex, metricId) => {
        const currentPrimary = effectiveMetricIds[0] || metricDefinitions[0]?.id || '';
        const currentSecondary = effectiveMetricIds[1] || '';

        if (slotIndex === 0) {
            const nextPrimary = metricId || currentPrimary;
            const nextSecondary = currentSecondary && currentSecondary !== nextPrimary ? currentSecondary : '';
            setSelectedMetricIds([nextPrimary, nextSecondary].filter(Boolean));
            return;
        }

        if (!metricId || metricId === currentPrimary) {
            setSelectedMetricIds([currentPrimary].filter(Boolean));
            return;
        }

        setSelectedMetricIds([currentPrimary, metricId].filter(Boolean));
    };

    // ---- Trend (line over time) ----
    const trendData = useMemo(() => {
        const sorted = [...instances].sort(
            (a, b) => (getInstanceDate(a)?.getTime() || 0) - (getInstanceDate(b)?.getTime() || 0)
        );
        const labels = sorted.map(formatLabel);
        const datasets = selectedMetricDefs.map((metricDef, index) => {
            const data = sorted.map((inst) => metricTuplesByInstanceId.get(inst.id)?.get(metricDef.id) ?? null);
            return {
                type: 'line',
                label: metricDef.name,
                data,
                unit: metricDef.unit || '',
                borderColor: SERIES_PALETTE[index],
                backgroundColor: `${SERIES_PALETTE[index]}33`,
                borderWidth: 2,
                spanGaps: true,
                tension: 0.2,
                order: selectedMetricDefs.length - index,
                yAxisID: `metric${index + 1}`,
                pointRadius: sorted.map((inst) => (inst.id === selectedInstanceId ? 7 : 3)),
                // Selected point gets a contrasting white ring so it stays visible
                // while the fill stays tied to the metric line color.
                pointBorderColor: sorted.map((inst) => (inst.id === selectedInstanceId ? '#ffffff' : 'transparent')),
                pointBorderWidth: sorted.map((inst) => (inst.id === selectedInstanceId ? 2 : 0)),
                pointBackgroundColor: SERIES_PALETTE[index],
                pointHoverBackgroundColor: SERIES_PALETTE[index],
            };
        });
        return { labels, datasets, sorted };
    }, [instances, selectedMetricDefs, metricTuplesByInstanceId, selectedInstanceId]);

    const trendOptions = useMemo(() => ({
        responsive: true,
        maintainAspectRatio: false,
        ...DISABLED_CHART_ANIMATION,
        layout: {
            padding: {
                top: 8,
                right: selectedMetricDefs.length > 1 ? 30 : 12,
                bottom: 8,
                left: 8,
            },
        },
        interaction: { mode: 'index', intersect: false },
        plugins: {
            legend: { display: true, position: 'top', labels: { color: chartTheme.textColor, usePointStyle: true, boxWidth: 8, font: { size: 11 } } },
            tooltip: {
                ...themedTooltipOptions(chartTheme),
                callbacks: {
                    label: (ctx) => {
                        const rawValue = ctx.dataset.rawData?.[ctx.dataIndex] ?? ctx.parsed.y;
                        return `${ctx.dataset.label}: ${rawValue}${ctx.dataset.unit ? ` ${ctx.dataset.unit}` : ''}`;
                    },
                },
            },
            annotation: { annotations: thresholdLineAnnotations(selectedMetricDefs, conditionByMetric, chartTheme, SERIES_PALETTE) },
        },
        scales: {
            x: { ticks: { color: chartTheme.textColor, maxRotation: 45 }, grid: { color: chartTheme.gridColor } },
            ...Object.fromEntries(selectedMetricDefs.map((metricDef, index) => [
                `metric${index + 1}`,
                {
                    type: 'linear',
                    position: index === 0 ? 'left' : 'right',
                    ticks: {
                        display: true,
                        color: chartTheme.textColor,
                        padding: 8,
                    },
                    grid: { drawOnChartArea: index === 0, color: chartTheme.gridColor },
                    title: { display: true, text: metricDef.unit || metricDef.name, color: chartTheme.textColor },
                    ...metricScaleDomain(metricDef, index, conditionByMetric),
                },
            ])),
        },
    }), [selectedMetricDefs, conditionByMetric, chartTheme]);

    // ---- Scatter (metric X vs metric Y, or value vs index for single metric) ----
    const scatterData = useMemo(() => {
        const [xDef, yDef] = selectedMetricDefs;
        if (!xDef) return null;
        const xCond = conditionByMetric.get(xDef.id);
        const yCond = yDef ? conditionByMetric.get(yDef.id) : null;
        const points = [];
        instances.forEach((inst, idx) => {
            const tuple = metricTuplesByInstanceId.get(inst.id);
            const x = tuple?.get(xDef.id) ?? null;
            const y = yDef ? (tuple?.get(yDef.id) ?? null) : idx + 1;
            if (x == null || y == null) return;
            points.push({ x, y, instanceId: inst.id, label: inst.session_name || formatLabel(inst, idx) });
        });
        const densityPoints = withScatterPointDensity(points, { baseRadius: 7 });

        const datasets = [{
            label: yDef ? `${xDef.name} vs ${yDef.name}` : xDef.name,
            data: densityPoints,
            backgroundColor: densityPoints.map((p) => (
                p.instanceId === selectedInstanceId ? SELECTED_COLOR : 'rgba(59,130,246,0.7)'
            )),
            // Selected points get a ring while size remains driven by coordinate density.
            pointRadius: densityPoints.map((p) => p.pointRadius),
            pointBorderColor: densityPoints.map((p) => (p.instanceId === selectedInstanceId ? '#ffffff' : 'transparent')),
            pointBorderWidth: densityPoints.map((p) => (p.instanceId === selectedInstanceId ? 3 : 0)),
            pointHoverRadius: densityPoints.map((p) => p.pointHoverRadius),
        }];

        // Single target point at the X/Y threshold values (completed-goal color).
        const targetX = xCond?.target_value;
        const targetY = yDef ? yCond?.target_value : null;
        if (targetX != null && (!yDef || targetY != null)) {
            datasets.push({
                label: 'Target',
                data: [{ x: targetX, y: yDef ? targetY : (densityPoints.length + 1), isTarget: true, label: 'Target' }],
                backgroundColor: completedColor,
                pointStyle: 'rectRot',
                pointRadius: 11,
                pointHoverRadius: 13,
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
            });
        }

        return { datasets, xDef, yDef };
    }, [instances, selectedMetricDefs, conditionByMetric, metricTuplesByInstanceId, selectedInstanceId, completedColor]);

    const scatterOptions = useMemo(() => {
        if (!scatterData) return {};
        const { xDef, yDef } = scatterData;
        return {
            responsive: true,
            maintainAspectRatio: false,
            ...DISABLED_CHART_ANIMATION,
            plugins: {
                legend: { display: false },
                tooltip: {
                    ...themedTooltipOptions(chartTheme),
                    callbacks: {
                        title: (ctx) => ctx[0]?.raw?.label || '',
                        label: (ctx) => {
                            const p = ctx.raw;
                            if (p.isTarget) {
                                const lines = [`Target ${xDef.name}: ${p.x} ${xDef.unit || ''}`];
                                if (yDef) lines.push(`Target ${yDef.name}: ${p.y} ${yDef.unit || ''}`);
                                return lines;
                            }
                            const lines = [`${xDef.name}: ${p.x} ${xDef.unit || ''}`];
                            if (yDef) lines.push(`${yDef.name}: ${p.y} ${yDef.unit || ''}`);
                            if (p.densityCount > 1) lines.push(`${p.densityCount} entries at this point`);
                            return lines;
                        },
                    },
                },
            },
            scales: {
                x: {
                    ticks: { color: chartTheme.textColor }, grid: { color: chartTheme.gridColor },
                    title: { display: true, text: `${xDef.name} (${xDef.unit || ''})`, color: chartTheme.textColor },
                },
                y: {
                    ticks: { color: chartTheme.textColor }, grid: { color: chartTheme.gridColor },
                    title: { display: true, text: yDef ? `${yDef.name} (${yDef.unit || ''})` : 'Instance #', color: chartTheme.textColor },
                },
            },
        };
    }, [scatterData, chartTheme]);

    const accent = goalColor || 'var(--color-primary)';
    const draftName = draft?.name;
    const targetName = isBuilding
        ? (draftName || (activeMode === 'edit' ? (target?.name || 'Edit Target') : 'New Target'))
        : (data?.target?.name || target?.name || 'Target');
    // The eyebrow always shows the activity name (theme-aware muted subtext, like
    // activity names elsewhere), in both view and build modes.
    const eyebrow = activityDef?.name || (isBuilding ? 'New Target' : 'Target Analytics');
    const handleConfirmDelete = () => {
        setShowDeleteConfirm(false);
        onDelete?.(target);
        onClose?.();
    };

    return createPortal(
        <>
            <ModalBackdrop className={`${styles.overlay} ${overlayClassName}`} onClose={onClose}>
                <div
                    className={styles.content}
                    style={{ borderTop: `4px solid ${accent}` }}
                    onClick={(e) => e.stopPropagation()}
                >
                {/* Left column: header + minimal meta + graph */}
                <div className={styles.mainColumn}>
                    <div className={styles.header} style={{ borderBottom: `2px solid ${accent}` }}>
                        <div className={styles.headerText}>
                            <div className={styles.activityEyebrow}>{eyebrow}</div>
                            <h2 className={styles.title} style={{ color: accent }}>{targetName}</h2>
                            {!isBuilding && <TargetMeta summary={summary} now={renderNow} />}
                        </div>
                        {!readOnly && !isBuilding && target?.id && (
                            <div className={styles.headerActions}>
                                <button
                                    type="button"
                                    className={styles.headerIconButton}
                                    onClick={() => { setActiveMode('edit'); setDraft(null); }}
                                    title="Edit target"
                                    aria-label="Edit target"
                                >
                                    <EditPencilIcon size={15} />
                                </button>
                                <DeleteButton onClick={() => setShowDeleteConfirm(true)} />
                            </div>
                        )}
                    </div>

                    <div className={styles.graphPane}>
                        <div className={styles.graphControls}>
                            <div
                                className={`${styles.metricField} ${styles.viewModeField}`}
                                onBlur={(event) => {
                                    if (!event.currentTarget.contains(event.relatedTarget)) {
                                        setGraphTypeMenuOpen(false);
                                    }
                                }}
                            >
                                <span>Graph Type</span>
                                <button
                                    type="button"
                                    className={styles.graphTypeTrigger}
                                    aria-label="Graph Type"
                                    aria-haspopup="listbox"
                                    aria-expanded={graphTypeMenuOpen}
                                    onClick={() => setGraphTypeMenuOpen((open) => !open)}
                                >
                                    <span>{viewMode === 'scatter' ? 'Scatter' : 'Trend'}</span>
                                    <ChevronIcon
                                        className={styles.graphTypeChevron}
                                        size={16}
                                        direction="down"
                                    />
                                </button>
                                {graphTypeMenuOpen && (
                                    <div className={styles.graphTypeMenu} role="listbox" aria-label="Graph Type">
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={viewMode === 'trend'}
                                            className={styles.graphTypeOption}
                                            onClick={() => setGraphType('trend')}
                                        >
                                            <span className={styles.graphTypeCheck}>{viewMode === 'trend' ? '✓' : ''}</span>
                                            Trend
                                        </button>
                                        <button
                                            type="button"
                                            role="option"
                                            aria-selected={viewMode === 'scatter'}
                                            className={styles.graphTypeOption}
                                            onClick={() => setGraphType('scatter')}
                                        >
                                            <span className={styles.graphTypeCheck}>{viewMode === 'scatter' ? '✓' : ''}</span>
                                            Scatter
                                        </button>
                                    </div>
                                )}
                            </div>
                            {metricDefinitions.length > 0 && (
                                <div className={styles.metricControls}>
                                    <label className={styles.metricField}>
                                        <span>{viewMode === 'scatter' ? 'X Axis' : 'Primary Metric'}</span>
                                        <select
                                            value={primaryMetricId}
                                            onChange={(event) => updateMetricSlot(0, event.target.value)}
                                        >
                                            {metricDefinitions.map((metricDef) => (
                                                <option key={metricDef.id} value={metricDef.id}>
                                                    {metricDef.name}{metricDef.unit ? ` (${metricDef.unit})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                    <label className={styles.metricField}>
                                        <span>{viewMode === 'scatter' ? 'Y Axis' : 'Secondary Metric'}</span>
                                        <select
                                            value={secondaryMetricId}
                                            onChange={(event) => updateMetricSlot(1, event.target.value)}
                                        >
                                            <option value="">None</option>
                                            {metricDefinitions.map((metricDef) => (
                                                <option key={metricDef.id} value={metricDef.id} disabled={metricDef.id === primaryMetricId}>
                                                    {metricDef.name}{metricDef.unit ? ` (${metricDef.unit})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    </label>
                                </div>
                            )}
                        </div>

                        <div className={styles.chartArea}>
                            {isLoading && <div className={styles.placeholder}>Loading…</div>}
                            {error && <div className={styles.placeholder}>Failed to load analytics.</div>}
                            {!isLoading && !error && !activityDef && (
                                <div className={styles.placeholder}>
                                    {isBuilding ? 'Select an activity to preview its history.' : 'No activity recorded for this target yet.'}
                                </div>
                            )}
                            {!isLoading && !error && activityDef && !instances.length && (
                                <div className={styles.placeholder}>
                                    {isBuilding ? 'No history yet for this activity.' : 'No activity recorded for this target yet.'}
                                </div>
                            )}
                            {!isLoading && !error && instances.length > 0 && !selectedMetricDefs.length && (
                                <div className={styles.placeholder}>Select a metric to plot.</div>
                            )}
                            {!isLoading && !error && instances.length > 0 && selectedMetricDefs.length > 0 && (
                                viewMode === 'trend'
                                    ? <Line ref={chartRef} data={{ labels: trendData.labels, datasets: trendData.datasets }} options={trendOptions} />
                                    : (scatterData
                                        ? <Scatter ref={chartRef} data={{ datasets: scatterData.datasets }} options={scatterOptions} />
                                        : <div className={styles.placeholder}>No scatter data.</div>)
                            )}
                        </div>
                    </div>
                </div>

                {/* Right column: builder (add/edit) or activity timeline (view) */}
                <div className={styles.timelinePane}>
                    <div className={styles.timelineHeaderRow}>
                        {isBuilding ? (
                            <div className={styles.builderTitle}>
                                {activeMode === 'edit' ? 'Edit Target' : 'Add Target'}
                            </div>
                        ) : (
                            <div className={styles.timelineTitle}>Activity Timeline</div>
                        )}
                        <CloseButton onClick={onClose} />
                    </div>

                    {isBuilding ? (
                        <div className={styles.builderScroll}>
                            <Suspense fallback={<div className={styles.placeholder}>Loading…</div>}>
                                <TargetManager
                                    targets={targets}
                                    setTargets={setTargets}
                                    activityDefinitions={activityDefinitions}
                                    associatedActivities={associatedActivities}
                                    goalId={goalId}
                                    rootId={rootId}
                                    isEditing={false}
                                    viewMode="builder"
                                    initialTarget={activeMode === 'edit' ? target : null}
                                    initialActivityId={initialActivityId}
                                    lockActivitySelection={lockActivitySelection}
                                    headerColor="var(--color-text-muted)"
                                    goalType={goalType}
                                    goalCompleted={goalCompleted}
                                    hideBuilderHeader
                                    stickyFooter
                                    onDraftChange={handleDraftChange}
                                    onSaved={onSaved}
                                    onCloseBuilder={startedInView ? () => { setActiveMode('view'); setDraft(null); } : onClose}
                                    onSave={(newTargets) => {
                                        onSave?.(newTargets);
                                        if (startedInView) {
                                            setActiveMode('view');
                                            setDraft(null);
                                        }
                                    }}
                                />
                            </Suspense>
                        </div>
                    ) : (
                        <>
                            <label className={styles.timelineToggleRow}>
                                <input
                                    type="checkbox"
                                    checked={!showAllHistory}
                                    onChange={(e) => setShowAllHistory(!e.target.checked)}
                                />
                                Since target creation
                            </label>
                            <div className={styles.timelineScroll}>
                                {instances.length > 0 && activityDef ? (
                                    [...instances].reverse().map((inst) => {
                                        const isSelected = inst.id === selectedInstanceId;
                                        return (
                                            <div
                                                key={inst.id}
                                                className={`${styles.timelineItem} ${isSelected ? styles.timelineItemSelected : ''}`}
                                                onClick={() => setSelectedInstanceId(isSelected ? null : inst.id)}
                                                role="button"
                                                tabIndex={0}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' || e.key === ' ') {
                                                        e.preventDefault();
                                                        setSelectedInstanceId(isSelected ? null : inst.id);
                                                    }
                                                }}
                                            >
                                                <ActivityTimelineCard
                                                    instance={inst}
                                                    activityDef={activityDef}
                                                    progressRecord={inst.progress_comparison || null}
                                                    formatDate={(iso) => (iso ? new Date(iso).toLocaleString() : '')}
                                                    showActivityName={false}
                                                />
                                            </div>
                                        );
                                    })
                                ) : (
                                    <div className={styles.placeholder}>No contributing instances yet.</div>
                                )}
                            </div>
                        </>
                    )}
                </div>
                </div>
            </ModalBackdrop>
            <DeleteConfirmModal
                isOpen={!readOnly && showDeleteConfirm}
                onClose={() => setShowDeleteConfirm(false)}
                onConfirm={handleConfirmDelete}
                title="Delete Target"
                message={`Delete "${targetName}"? This will remove the target from this goal.`}
                confirmText="Delete Target"
                overlayClassName={styles.deleteConfirmOverlay}
            />
        </>,
        portalTarget || document.body
    );
}

export default TargetAnalyticsModal;
