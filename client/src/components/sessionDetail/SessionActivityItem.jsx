import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { useActiveSessionData, useActiveSessionActions } from '../../contexts/ActiveSessionContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import { getGroupBreadcrumb } from '../../utils/manageActivities';
import { playCompletionSound } from '../../utils/playCompletionSound';
import ActivityCompletionButton from '../common/ActivityCompletionButton';
import MetaField from '../common/MetaField';
import Linkify from '../atoms/Linkify';
import Button from '../atoms/Button';

import { DeletedBadge } from '../ui/DeletedEntityFallback';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './SessionActivityItem.module.css';
import useMetricDrafts from './useMetricDrafts';
import { useProgressComparison } from '../../hooks/useProgressComparison';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import {
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
    resolveAutoAggregationMode,
} from '../../utils/progressAggregations';
import { getAverageDurationStat } from '../../utils/durationStats';

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseMMSS(value) {
    const trimmed = value?.trim();
    if (!trimmed) return null;
    const match = trimmed.match(/^(\d+):(\d{1,2})$/);
    if (!match) return null;
    const mins = Number(match[1]);
    const secs = Number(match[2]);
    if (!Number.isInteger(mins) || !Number.isInteger(secs) || secs > 59) return null;
    const totalSeconds = mins * 60 + secs;
    return totalSeconds > 0 ? totalSeconds : null;
}

function formatMetricNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue)) {
        return String(numericValue);
    }
    return numericValue.toFixed(1).replace(/\.0$/, '');
}

function formatInlineProgressValue(comparison, displayMode = 'percent') {
    if (!comparison) return null;

    if (displayMode === 'absolute') {
        if (comparison.delta == null) return null;
        const delta = Number(comparison.delta);
        const magnitude = formatMetricNumber(Math.abs(delta));
        if (delta > 0) return `+${magnitude}`;
        if (delta < 0) return `-${magnitude}`;
        return '0';
    }

    if (comparison.pct_change != null) {
        const magnitude = formatMetricNumber(Math.abs(comparison.pct_change));
        if (comparison.improved) return `▲${magnitude}%`;
        if (comparison.regressed) return `▼${magnitude}%`;
        return '0%';
    }

    if (comparison.delta == null) return null;
    const delta = Number(comparison.delta);
    const magnitude = formatMetricNumber(Math.abs(delta));
    if (delta > 0) return `+${magnitude}`;
    if (delta < 0) return `-${magnitude}`;
    return '0';
}


function getBestSetIndexes(sets, anchorMetricId, higherIsBetter, getMetricValue) {
    if (!Array.isArray(sets) || !anchorMetricId) {
        return [];
    }

    let bestValue = null;
    const bestIndexes = [];

    sets.forEach((set, setIndex) => {
        const rawValue = getMetricValue(set.metrics, anchorMetricId);
        if (rawValue == null || String(rawValue).trim() === '') {
            return;
        }

        const numericValue = Number(rawValue);
        if (Number.isNaN(numericValue)) {
            return;
        }

        if (
            bestValue == null
            || (higherIsBetter && numericValue > bestValue)
            || (!higherIsBetter && numericValue < bestValue)
        ) {
            bestValue = numericValue;
            bestIndexes.length = 0;
            bestIndexes.push(setIndex);
            return;
        }

        if (numericValue === bestValue) {
            bestIndexes.push(setIndex);
        }
    });

    return bestIndexes;
}

/**
 * Progress summary shown below sets: additive totals, yield, best set.
 */
function SessionActivityProgressSummary({ sets, metricDefs, activeProgress, displayMode = 'percent' }) {
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(metricDefs), [metricDefs]);
    const autoAgg = useMemo(() => {
        const fromRecord = activeProgress?.derived_summary?.auto_aggregations;
        if (fromRecord) return fromRecord;
        if (!sets || sets.length === 0) return null;
        if (trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(sets, trackedMetricDefs);
    }, [activeProgress, sets, trackedMetricDefs]);

    if (!autoAgg) return null;

    const multDefs = trackedMetricDefs.filter((md) => md.is_multiplicative);
    const hasYield = multDefs.length >= 2 && autoAgg.total_yield != null;
    const hasAdditive = Object.keys(autoAgg.additive_totals).length > 0;
    const hasBestSet = autoAgg.best_set_index != null;

    if (!hasYield && !hasAdditive && !hasBestSet) return null;

    // Previous total yield for delta display
    const prevYield = (() => {
        if (!activeProgress?.metric_comparisons) return null;
        const yieldComp = activeProgress.metric_comparisons.find((mc) => mc.type === 'yield');
        return yieldComp?.previous_value ?? null;
    })();

    const isFirstInstance = activeProgress?.is_first_instance;

    const bestSetLabel = hasBestSet
        ? (hasYield && autoAgg.best_set_yield != null
            ? `= ${formatAggValue(autoAgg.best_set_yield)}`
            : trackedMetricDefs
                .filter((md) => autoAgg.best_set_values[md.id] != null)
                .map((md) => `${formatAggValue(autoAgg.best_set_values[md.id])} ${md.unit}`)
                .join(' × ')
        )
        : null;

    return (
        <div className={styles.progressSummary}>
            {hasAdditive && trackedMetricDefs
                .filter((md) => md.is_additive !== false && !md.is_multiplicative && autoAgg.additive_totals[md.id] != null)
                .map((md) => (
                    <div key={md.id} className={`${styles.progressSummaryRow} ${styles.progressSummaryTotal}`}>
                        <span className={styles.progressSummaryLabel}>Total {md.name}:</span>
                        <span className={styles.progressSummaryValue}>
                            {formatAggValue(autoAgg.additive_totals[md.id])} {md.unit}
                        </span>
                    </div>
                ))
            }

            {/* Total yield + best set on one line */}
            {(hasYield || hasBestSet) && (
                <div className={`${styles.progressSummaryRow} ${styles.progressSummaryTotal}`}>
                    {hasYield && (
                        <>
                            <span className={styles.progressSummaryLabel}>Total yield:</span>
                            <span className={styles.progressSummaryValue}>
                                {formatAggValue(autoAgg.total_yield)}
                                {!isFirstInstance && prevYield != null && autoAgg.total_yield != null && (
                                    <SummaryDelta current={autoAgg.total_yield} previous={prevYield} higherIsBetter styles={styles} displayMode={displayMode} />
                                )}
                            </span>
                        </>
                    )}
                    {hasBestSet && bestSetLabel && (
                        <span className={styles.progressSummaryBestSetInline}>
                            · Best: Set {autoAgg.best_set_index + 1} {bestSetLabel}
                        </span>
                    )}
                </div>
            )}
        </div>
    );
}

function SummaryDelta({ current, previous, higherIsBetter = true, styles, displayMode = 'percent' }) {
    if (previous == null || current == null) return null;
    const delta = current - previous;
    if (delta === 0) return null;
    const improved = (delta > 0 && higherIsBetter) || (delta < 0 && !higherIsBetter);
    let label;
    if (displayMode === 'absolute') {
        label = `${delta > 0 ? '+' : ''}${formatAggValue(delta)}`;
    } else {
        const pct = previous !== 0 ? Math.abs(delta / previous * 100) : null;
        label = pct != null
            ? `${improved ? '▲' : '▼'}${formatAggValue(pct)}%`
            : `${delta > 0 ? '+' : ''}${formatAggValue(delta)}`;
    }
    const cls = improved ? styles.metricInlineProgressImproved : styles.metricInlineProgressRegressed;
    return <span className={`${styles.metricInlineProgress} ${cls}`}> ({label})</span>;
}

function buildEmptySet(definition, hasSplits) {
    if (!Array.isArray(definition?.metric_definitions)) {
        return { instance_id: crypto.randomUUID(), completed: false, metrics: [] };
    }

    const metrics = hasSplits && Array.isArray(definition?.split_definitions)
        ? definition.split_definitions.flatMap((split) => definition.metric_definitions.map((metric) => ({
            metric_id: metric.id,
            split_id: split.id,
            value: '',
        })))
        : definition.metric_definitions.map((metric) => ({
            metric_id: metric.id,
            value: '',
        }));

    return {
        instance_id: crypto.randomUUID(),
        completed: false,
        metrics,
    };
}

/**
 * SessionActivityItem
 * Renders an activity within a session section. 
 * Handles displaying/editing sets and metrics.
 */
function SessionActivityItem({
    exercise,
    onFocus, // Called with (instance, setIndex) to update context
    isSelected,
    onReorder,
    canMoveUp,
    canMoveDown,
    showReorderButtons,
    onNoteCreated,
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    isDragging,
    activityDefinition: activityDefinitionProp = null,
    activityNotes: activityNotesProp = null,
    quickMode = false,
    onOpenActivityBuilder = null,
}) {
    // Context
    const {
        rootId,
        sessionId,
        activities,
        activityGroups,
        session,
    } = useActiveSessionData();

    const {
        updateInstance,
        updateTimer,
        removeActivity,
    } = useActiveSessionActions();

    const activityDefinition = activityDefinitionProp
        || (Array.isArray(activities) ? activities.find(a => a.id === exercise.activity_definition_id) : null);
    const averageDuration = getAverageDurationStat(
        session?.stats?.activity_durations?.[exercise.activity_definition_id]
    );
    const onDelete = () => removeActivity(exercise.id);
    const onUpdate = useCallback((key, value, extraData = {}) => {
        if (key === 'timer_action') {
            updateTimer(exercise.id, value, extraData);
        } else {
            updateInstance(exercise.id, { [key]: value });
        }
    }, [exercise.id, updateInstance, updateTimer]);

    // Get timezone from context
    const { timezone } = useTimezone();
    const handleUpdateSets = useCallback((newSets) => {
        onUpdate('sets', newSets);
    }, [onUpdate]);

    const resolveMetricId = useCallback((metric) => (
        metric?.metric_id || metric?.metric_definition_id || null
    ), []);

    const resolveSplitId = useCallback((metric) => (
        metric?.split_id || metric?.split_definition_id || null
    ), []);

    // Local draft state for editing datetime fields. `null` means "show current query value".
    const [startTimeDraft, setStartTimeDraft] = useState(null);
    const [stopTimeDraft, setStopTimeDraft] = useState(null);
    // Progress comparison: stored from completion mutation response or fetched live
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [realtimeDuration, setRealtimeDuration] = useState(() => exercise.duration_seconds ?? 0);
    // Pre-start duration input (MM:SS) — if set before Start, enables countdown mode
    const [targetDurationInput, setTargetDurationInput] = useState('');
    const [targetDurationError, setTargetDurationError] = useState('');
    const autoCompletedRef = React.useRef(false);
    const hasTargetDurationInput = Boolean(targetDurationInput.trim());
    const parsedTargetDuration = useMemo(() => parseMMSS(targetDurationInput), [targetDurationInput]);
    const countdownPreview = !exercise.time_start
        && hasTargetDurationInput
        && parsedTargetDuration
        && !targetDurationError
        ? `Countdown ${formatDuration(parsedTargetDuration)}`
        : null;


    // Real-time timer effect
    useEffect(() => {
        let intervalId;

        const updateTimerLocal = () => {
            if (exercise.time_start && !exercise.time_stop) {
                const start = new Date(exercise.time_start).getTime();
                const now = Date.now();

                const totalPaused = exercise.total_paused_seconds || 0;

                const isSessionPaused = session?.is_paused || session?.attributes?.is_paused || false;
                const sessionLastPausedAt = session?.last_paused_at || session?.attributes?.last_paused_at;

                let currentPausedStraggler = 0;
                if (isSessionPaused && sessionLastPausedAt) {
                    const pausedTime = new Date(sessionLastPausedAt).getTime();
                    if (pausedTime > start) {
                        currentPausedStraggler = Math.floor((now - pausedTime) / 1000);
                    }
                }

                const diffSeconds = Math.floor((now - start) / 1000);
                const activeSeconds = Math.max(0, diffSeconds - totalPaused - currentPausedStraggler);
                setRealtimeDuration(activeSeconds);

                // Auto-complete when countdown hits 0
                const target = exercise.target_duration_seconds;
                if (target && activeSeconds >= target && !autoCompletedRef.current) {
                    autoCompletedRef.current = true;
                    playCompletionSound();
                    onUpdate('timer_action', 'complete');
                }
            }
        };

        if (exercise.time_start && !exercise.time_stop) {
            updateTimerLocal();

            const isSessionPaused = session?.is_paused || session?.attributes?.is_paused || false;
            if (!isSessionPaused) {
                intervalId = setInterval(updateTimerLocal, 1000);
            }
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [
        exercise.time_start,
        exercise.time_stop,
        exercise.duration_seconds,
        exercise.total_paused_seconds,
        exercise.target_duration_seconds,
        session?.is_paused,
        session?.attributes?.is_paused,
        session?.last_paused_at,
        session?.attributes?.last_paused_at,
        onUpdate,
    ]);
    const isRunning = Boolean(exercise.time_start && !exercise.time_stop);
    const effectiveTarget = exercise.target_duration_seconds;
    const isCountingDown = isRunning && Boolean(effectiveTarget);
    const countdownRemaining = isCountingDown ? Math.max(0, effectiveTarget - realtimeDuration) : null;
    const displayedDuration = isRunning ? realtimeDuration : (exercise.duration_seconds ?? 0);

    // Filter notes for this activity
    const activityNotes = Array.isArray(activityNotesProp)
        ? activityNotesProp
        : (allNotes?.filter(n => n.activity_instance_id === exercise.id) || []);

    const handleAddNote = async (content) => {
        if (!content.trim() || !onAddNote || !exercise.id) return;

        try {
            await onAddNote({
                context_type: 'activity_instance',
                context_id: exercise.id,
                session_id: sessionId || exercise.session_id,
                activity_instance_id: exercise.id,
                activity_definition_id: activityDefinition?.id,
                set_index: selectedSetIndex,
                content: content.trim(),
            });
            if (onNoteCreated) onNoteCreated();
        } catch (err) {
            console.error("Failed to create note", err);
        }
    };

    const localStartTime = startTimeDraft ?? (exercise.time_start ? formatForInput(exercise.time_start, timezone) : '');
    const localStopTime = stopTimeDraft ?? (exercise.time_stop ? formatForInput(exercise.time_stop, timezone) : '');
    // If we don't have definition, we can't render much (maybe just name)
    // But we should have it passed in from parent lookups
    const def = activityDefinition || { name: exercise.name || 'Unknown Activity', metric_definitions: [], split_definitions: [] };
    const hasSets = exercise.has_sets ?? def.has_sets; // Snapshot or definition default
    const hasSplits = def.has_splits && def.split_definitions && def.split_definitions.length > 0;
    // Check if metrics exist by looking at the definition, not just the flag
    const hasMetrics = def.metric_definitions && def.metric_definitions.length > 0;
    const {
        getMetricValue,
        getSetMetricDisplayValue,
        getSingleMetricDisplayValue,
        handleSetMetricDraftChange,
        handleSingleMetricDraftChange,
        commitSetMetricChange,
        commitSingleMetricChange,
        applyAllSetDrafts,
        clearSetDrafts,
        latestSetsRef,
    } = useMetricDrafts({
        exercise,
        updateExercise: onUpdate,
    });
    // Fetch live progress comparison while the activity is incomplete and no completion result yet
    const isCompleted = Boolean(exercise.time_stop);
    const activityProgress = exercise?.progress_comparison || null;
    const { progressComparison: liveProgressComparison } = useProgressComparison(
        rootId,
        exercise.id,
        { enabled: Boolean(rootId && exercise.id && hasMetrics && !activityProgress) }
    );

    // The displayed progress: prefer completion result, fall back to live query
    const activeProgress = activityProgress || liveProgressComparison;
    const { progressSettings } = useRootProgressSettings(rootId);
    const deltaDisplayMode = useEffectiveDeltaDisplayMode(activityDefinition, progressSettings);
    const trackedMetricDefs = useMemo(() => filterTrackedMetricDefs(def.metric_definitions || []), [def.metric_definitions]);
    const metricProgressById = useMemo(() => {
        const items = activeProgress?.metric_comparisons || [];
        return new Map(
            items
                .flatMap((item) => {
                    const metricId = item?.metric_id || item?.metric_definition_id;
                    return metricId ? [[metricId, item]] : [];
                })
        );
    }, [activeProgress]);
    const setProgressVisibility = useMemo(() => {
        if (!hasSets || !Array.isArray(exercise.sets)) {
            return new Map();
        }

        const visibilityMap = new Map();

        for (const metric of (def.metric_definitions || [])) {
            const comparison = metricProgressById.get(metric.id);
            if (!comparison) continue;

            const aggregation = comparison.aggregation
                || resolveAutoAggregationMode(metric, trackedMetricDefs, { hasSets });

            const presentSetValues = exercise.sets
                .map((set, setIndex) => {
                    const rawValue = getMetricValue(set.metrics, metric.id);
                    if (rawValue == null || String(rawValue).trim() === '') return null;
                    const numericValue = Number(rawValue);
                    if (Number.isNaN(numericValue)) return null;
                    return { setIndex, value: numericValue };
                })
                .filter(Boolean);

            if (presentSetValues.length === 0) {
                visibilityMap.set(metric.id, new Set(exercise.sets.map((_, index) => index)));
                continue;
            }

            if (aggregation === 'last') {
                visibilityMap.set(metric.id, new Set([presentSetValues[presentSetValues.length - 1].setIndex]));
                continue;
            }

            if (aggregation === 'max') {
                const anchorMetric = (def.metric_definitions || []).find((candidate) => candidate.is_best_set_metric) || metric;
                const bestIndexes = getBestSetIndexes(
                    exercise.sets,
                    anchorMetric?.id,
                    anchorMetric?.higher_is_better !== false,
                    getMetricValue
                );
                visibilityMap.set(
                    metric.id,
                    new Set(bestIndexes)
                );
                continue;
            }

            visibilityMap.set(metric.id, new Set([presentSetValues[presentSetValues.length - 1].setIndex]));
        }

        return visibilityMap;
    }, [def.metric_definitions, exercise.sets, getMetricValue, hasSets, metricProgressById, trackedMetricDefs]);

    // Compute auto-aggregations for set-level display (yield per set, best set highlight)
    const liveAutoAgg = useMemo(() => {
        if (!hasSets || !Array.isArray(exercise.sets) || exercise.sets.length === 0) return null;
        if (trackedMetricDefs.length === 0) return null;
        return computeAutoAggregations(exercise.sets, trackedMetricDefs);
    }, [hasSets, exercise.sets, trackedMetricDefs]);
    const bestSetIndex = liveAutoAgg?.best_set_index ?? null;
    const yieldBySetIndex = useMemo(() => {
        if (!liveAutoAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of liveAutoAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [liveAutoAgg]);

    const prevYieldBySetIndex = useMemo(() => {
        const prevAgg = activeProgress?.derived_summary?.prev_auto_aggregations;
        if (!prevAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of prevAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [activeProgress]);

    const renderMetricProgress = useCallback((metricId, options = {}) => {
        if (!metricId || !activeProgress || activeProgress.is_first_instance) {
            return null;
        }

        const comparison = metricProgressById.get(metricId);
        if (!comparison) {
            return null;
        }

        // For set-based activities, use per-set comparison data if available
        if (hasSets && options.setIndex != null) {
            const setComps = comparison.set_comparisons;
            if (Array.isArray(setComps) && setComps.length > 0) {
                const setComp = setComps.find((sc) => sc.set_index === options.setIndex);
                if (!setComp || setComp.previous_value == null) {
                    return null;
                }
                if (isCompleted) {
                    const inlineValue = formatInlineProgressValue(setComp, deltaDisplayMode);
                    if (!inlineValue) return null;
                    const progressClassName = setComp.improved
                        ? styles.metricInlineProgressImproved
                        : setComp.regressed
                            ? styles.metricInlineProgressRegressed
                            : styles.metricInlineProgressNeutral;
                    return (
                        <span className={`${styles.metricInlineProgress} ${progressClassName}`}>
                            ({inlineValue})
                        </span>
                    );
                }
                return (
                    <span className={styles.metricInlinePrevious}>
                        (last {formatMetricNumber(setComp.previous_value)})
                    </span>
                );
            }

            const visibleIndexes = setProgressVisibility.get(metricId);

            // Keep max-style comparisons pinned to the driving set row even
            // before completion so best-set anchors stay spatially coherent.
            // Other in-progress comparisons still show references on every row.
            if (isCompleted || comparison.aggregation === 'max') {
                if (visibleIndexes && !visibleIndexes.has(options.setIndex)) {
                    return null;
                }
            }
        }

        if (isCompleted) {
            const inlineValue = formatInlineProgressValue(comparison, deltaDisplayMode);
            if (!inlineValue) {
                return null;
            }

            const progressClassName = comparison.improved
                ? styles.metricInlineProgressImproved
                : comparison.regressed
                    ? styles.metricInlineProgressRegressed
                    : styles.metricInlineProgressNeutral;

            return (
                <span className={`${styles.metricInlineProgress} ${progressClassName}`}>
                    ({inlineValue})
                </span>
            );
        }

        if (comparison.previous_value == null) {
            return null;
        }

        return (
            <span className={styles.metricInlinePrevious}>
                (last {formatMetricNumber(comparison.previous_value)})
            </span>
        );
    }, [activeProgress, deltaDisplayMode, hasSets, isCompleted, metricProgressById, setProgressVisibility]);

    const groupLabel = useMemo(() => {
        const groupId = activityDefinition?.group_id || exercise.group_id || null;
        if (groupId && Array.isArray(activityGroups) && activityGroups.length > 0) {
            const breadcrumb = getGroupBreadcrumb(groupId, activityGroups);
            if (breadcrumb) return breadcrumb;
        }
        return exercise.group_name || null;
    }, [activityDefinition?.group_id, activityGroups, exercise.group_id, exercise.group_name]);
    const handleAddSet = () => {
        const newSet = buildEmptySet(def, hasSplits);
        const newSets = [...applyAllSetDrafts(latestSetsRef.current), newSet];
        handleUpdateSets(newSets);
        clearSetDrafts();
    };

    const handleRemoveSet = (setIndex) => {
        const newSets = [...applyAllSetDrafts(latestSetsRef.current)];
        newSets.splice(setIndex, 1);
        handleUpdateSets(newSets);
        clearSetDrafts();
    };

    const handleCascade = (metricId, value, splitId = null, sourceIndex = 0) => {
        const newSets = [...applyAllSetDrafts(latestSetsRef.current)];
        let hasChanges = false;

        // Iterate through all sets after the source set
        for (let i = sourceIndex + 1; i < newSets.length; i++) {
            const set = { ...newSets[i] };

            // Should we update this set? Only if the value is empty
            const metricIdx = set.metrics.findIndex(m =>
                resolveMetricId(m) === metricId && (splitId ? resolveSplitId(m) === splitId : !resolveSplitId(m))
            );

            // Get current value to check if empty
            const currentVal = metricIdx >= 0 ? set.metrics[metricIdx].value : '';

            // If empty (null, undefined, or empty string), update it
            if (currentVal === '' || currentVal === null || currentVal === undefined) {
                if (metricIdx >= 0) {
                    set.metrics[metricIdx] = { ...set.metrics[metricIdx], value };
                } else {
                    const newMetric = { metric_id: metricId, value };
                    if (splitId) newMetric.split_id = splitId;
                    set.metrics.push(newMetric);
                }
                newSets[i] = set;
                hasChanges = true;
            }
        }

        if (hasChanges) {
            handleUpdateSets(newSets);
            clearSetDrafts();
        }
    };

    // Helper to check if the IMMEDIATE next set has an empty value for a metric
    const isNextSetEmpty = (currentIndex, metricId, splitId = null) => {
        if (!exercise.sets || currentIndex >= exercise.sets.length - 1) return false;

        const nextSet = exercise.sets[currentIndex + 1];
        const val = getMetricValue(nextSet.metrics, metricId, splitId);

        return val === '' || val === null || val === undefined;
    };

    // Handler for clicking on the activity panel (not a specific set)
    const handleActivityCardClick = (e) => {
        // Don't trigger for interactive elements
        if (e.target.closest('input, button, textarea')) return;

        // Clear set selection and focus on whole activity
        setSelectedSetIndex(null);
        if (onFocus) onFocus(exercise, null);
    };

    return (
        <div
            onClick={handleActivityCardClick}
            className={`${styles.activityCard} ${isSelected ? styles.activityCardSelected : ''} ${isDragging ? styles.activityCardDragging : ''}`}
        >
            <div className={styles.activityHeader}>
                <div className={styles.activityHeaderLeft}>
                    {/* Reorder Buttons */}
                    {showReorderButtons && (
                        <div className={styles.reorderButtons}>
                            <button
                                onClick={() => onReorder('up')}
                                disabled={!canMoveUp}
                                className={`${styles.reorderButton} ${!canMoveUp ? styles.reorderButtonDisabled : ''}`}
                                title="Move up"
                            >
                                ▲
                            </button>
                            <button
                                onClick={() => onReorder('down')}
                                disabled={!canMoveDown}
                                className={`${styles.reorderButton} ${!canMoveDown ? styles.reorderButtonDisabled : ''}`}
                                title="Move down"
                            >
                                ▼
                            </button>
                        </div>
                    )}
                    <div
                        onClick={(e) => {
                            e.stopPropagation();
                            // Clicking on activity name/header clears set selection
                            setSelectedSetIndex(null);
                            if (onFocus) onFocus(exercise, null);
                        }}
                        className={styles.activityNameContainer}
                    >
                        <div className={`${styles.activityName} ${styles.activityNameFlex}`}>
                            <span className={styles.activityNameFlex}>
                                {def.name}
                                {!activityDefinition && <DeletedBadge />}
                            </span>
                            {isSelected && onOpenActivityBuilder && activityDefinition?.id && (
                                <button
                                    type="button"
                                    className={styles.editDefinitionButton}
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onOpenActivityBuilder(activityDefinition);
                                    }}
                                    title="Edit activity definition"
                                    aria-label={`Edit ${def.name}`}
                                >
                                    ✎
                                </button>
                            )}
                        </div>
                        {(groupLabel || averageDuration) && (
                            <div className={styles.activityMetaLine}>
                                {groupLabel && (
                                    <span className={styles.activityGroupLabel}>{groupLabel}</span>
                                )}
                                {groupLabel && averageDuration && (
                                    <span className={styles.activityMetaSeparator}>•</span>
                                )}
                                {averageDuration && (
                                    <span
                                        className={styles.activityAverage}
                                        title={`Average based on ${averageDuration.sampleCount} completed activity instances`}
                                    >
                                        Avg {averageDuration.label}
                                    </span>
                                )}
                            </div>
                        )}
                        {def.description && (
                            <div className={styles.activityDescription} title={def.description}>
                                <Linkify
                                    className={styles.activityDescriptionContent}
                                    linkClassName={styles.activityDescriptionLink}
                                >
                                    {def.description}
                                </Linkify>
                            </div>
                        )}
                    </div>
                </div>

                <div className={styles.activityHeaderRight}>
                    {quickMode ? (
                        <div className={styles.actionStack}>
                            <div className={styles.quickModeStatus}>
                                <ActivityCompletionButton
                                    onClick={(event) => {
                                        event.stopPropagation();
                                        onUpdate('completed', !exercise.completed);
                                    }}
                                    completed={exercise.completed}
                                />
                            </div>
                        </div>
                    ) : (
                        <div className={styles.actionStack}>
                            <div className={styles.timerControlsGrid}>
                                <div className={styles.timerMetaColumn}>
                                    {/* DateTime Start Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <label className={styles.timerLabel}>Start</label>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStartTime}
                                            onChange={(e) => setStartTimeDraft(e.target.value)}
                                            onBlur={(e) => {
                                                if (e.target.value) {
                                                    try {
                                                        const isoValue = localToISO(e.target.value, timezone);
                                                        onUpdate('time_start', isoValue);
                                                        setStartTimeDraft(null);
                                                    } catch (err) {
                                                        console.error('Invalid date format:', err);
                                                        setStartTimeDraft(null);
                                                    }
                                                } else {
                                                    onUpdate('time_start', null);
                                                    setStartTimeDraft(null);
                                                }
                                            }}
                                            className={styles.timerInput}
                                        />
                                    </div>

                                    {/* DateTime Stop Field */}
                                    <div className={styles.timerFieldContainer}>
                                        <label className={styles.timerLabel}>Stop</label>
                                        <input
                                            type="text"
                                            placeholder="YYYY-MM-DD HH:MM:SS"
                                            value={localStopTime}
                                            onChange={(e) => setStopTimeDraft(e.target.value)}
                                            onBlur={(e) => {
                                                if (e.target.value) {
                                                    try {
                                                        const isoValue = localToISO(e.target.value, timezone);
                                                        onUpdate('time_stop', isoValue);
                                                        setStopTimeDraft(null);
                                                    } catch (err) {
                                                        console.error('Invalid date format:', err);
                                                        setStopTimeDraft(null);
                                                    }
                                                } else {
                                                    onUpdate('time_stop', null);
                                                    setStopTimeDraft(null);
                                                }
                                            }}
                                            disabled={!exercise.time_start}
                                            className={`${styles.timerInput} ${!exercise.time_start ? styles.timerInputDisabled : ''}`}
                                        />
                                    </div>

                                    {/* Duration Display / Pre-start target input */}
                                    <div className={styles.timerFieldContainer}>
                                        {!exercise.time_start ? (
                                            <>
                                                <label className={styles.timerLabel}>Duration</label>
                                                <input
                                                    type="text"
                                                    placeholder="MM:SS"
                                                    value={targetDurationInput}
                                                    onChange={(e) => {
                                                        setTargetDurationInput(e.target.value);
                                                        setTargetDurationError('');
                                                    }}
                                                    onClick={(e) => e.stopPropagation()}
                                                    className={`${styles.timerInput} ${targetDurationError ? styles.timerInputError : ''}`}
                                                    title="Optional: set a target duration to enable countdown mode"
                                                />
                                                {targetDurationError && (
                                                    <div className={styles.timerValidationError}>{targetDurationError}</div>
                                                )}
                                                {countdownPreview && (
                                                    <div className={styles.timerModeHint}>{countdownPreview}</div>
                                                )}
                                            </>
                                        ) : (
                                            <MetaField
                                                className={styles.durationMetaField}
                                                label={isCountingDown ? 'Remaining' : 'Duration'}
                                                value={isCountingDown ? formatDuration(countdownRemaining) : formatDuration(displayedDuration)}
                                                valueClassName={[
                                                    styles.durationDisplay,
                                                    isRunning ? styles.durationActive : styles.durationInactive,
                                                    isCountingDown && countdownRemaining <= 10 ? styles.durationCountdownAlert : '',
                                                ].join(' ')}
                                            />
                                        )}
                                    </div>
                                </div>

                                <div className={styles.timerActionColumn}>
                                    {!exercise.time_start ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    const extras = {};
                                                    if (hasTargetDurationInput && !parsedTargetDuration) {
                                                        setTargetDurationError('Use MM:SS, seconds 00-59');
                                                        return;
                                                    }
                                                    if (parsedTargetDuration) {
                                                        extras.target_duration_seconds = parsedTargetDuration;
                                                    }
                                                    onUpdate('timer_action', 'start', extras);
                                                }}
                                                className={styles.startButton}
                                                title="Start timer"
                                            >
                                                ▶ Start
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.completeButton}
                                                title="Instant complete (0s duration)"
                                            >
                                                ✓ Complete
                                            </button>
                                        </>
                                    ) : !exercise.time_stop ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'complete');
                                                }}
                                                className={styles.completeButton}
                                                title="Complete activity"
                                            >
                                                ✓ Complete
                                            </button>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    setTargetDurationInput('');
                                                    setTargetDurationError('');
                                                    onUpdate('timer_action', 'reset');
                                                }}
                                                className={styles.resetButton}
                                                title="Reset timer"
                                            >
                                                ↺ Reset
                                            </button>
                                        </>
                                    ) : (
                                        <>
                                            <div className={styles.completedBadge} title={`Completed at ${formatForInput(exercise.time_stop, timezone)}`}>
                                                Completed
                                            </div>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    autoCompletedRef.current = false;
                                                    setTargetDurationInput('');
                                                    setTargetDurationError('');
                                                    onUpdate('timer_action', 'reset');
                                                }}
                                                className={styles.resetButton}
                                                title="Reset timer"
                                            >
                                                ↺ Reset
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </div>
                    )}
                </div>

                {/* Delete Button */}
                {!quickMode && <button onClick={onDelete} className={styles.deleteButton} aria-label="Delete activity">×</button>}
            </div>

            {/* Content Area */}
            <div className={styles.contentArea}>

                {/* SETS VIEW */}
                {hasSets ? (
                    <div>
                        <div className={styles.setsContainer}>
                            {exercise.sets?.map((set, setIdx) => (
                                <div
                                    key={set.instance_id}
                                    onClick={(e) => {
                                        e.stopPropagation(); // Prevent card click from firing
                                        const newSetIndex = selectedSetIndex === setIdx ? null : setIdx;
                                        setSelectedSetIndex(newSetIndex);
                                        // Notify parent of set selection change
                                        if (onFocus) onFocus(exercise, newSetIndex);
                                    }}
                                    className={`${styles.setRow} ${selectedSetIndex === setIdx ? styles.setRowSelected : ''} ${bestSetIndex === setIdx ? styles.setRowBestSet : ''}`}
                                >
                                    <div className={styles.setNumber}>#{setIdx + 1}</div>

                                    <div className={styles.setMetricsContent}>
                                        {hasMetrics && (
                                            hasSplits ? (
                                                // Render metrics grouped by split
                                                def.split_definitions.map(split => (
                                                    <div key={split.id} className={styles.splitContainer}>
                                                        <span className={styles.splitLabel}>{split.name}</span>
                                                        {def.metric_definitions.map(m => (
                                                            <div key={m.id} className={styles.metricInputContainer}>
                                                                <label className={styles.metricLabel}>{m.name}</label>
                                                                <input
                                                                    type="number"
                                                                    className={`${styles.metricInput} ${styles.metricInputSmall}`}
                                                                    value={getSetMetricDisplayValue(setIdx, set.metrics, m.id, split.id)}
                                                                    onChange={(e) => handleSetMetricDraftChange(setIdx, m.id, e.target.value, split.id)}
                                                                    onBlur={() => commitSetMetricChange(setIdx, m.id, split.id)}
                                                                    onKeyDown={(e) => {
                                                                        if (e.key === 'Enter') e.currentTarget.blur();
                                                                    }}
                                                                />
                                                                <span className={styles.metricMeta}>
                                                                    <span className={styles.metricUnit}>{m.unit}</span>
                                                                    {renderMetricProgress(m.id, { setIndex: setIdx })}
                                                                </span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))
                                            ) : (
                                                // Render metrics without splits (original behavior)
                                                def.metric_definitions.map(m => (
                                                    <div key={m.id} className={styles.metricInputContainer}>
                                                        <label className={styles.metricLabelLarge}>{m.name}</label>
                                                        <input
                                                            type="number"
                                                            className={`${styles.metricInput} ${styles.metricInputLarge}`}
                                                            value={getSetMetricDisplayValue(setIdx, set.metrics, m.id)}
                                                            onChange={(e) => handleSetMetricDraftChange(setIdx, m.id, e.target.value)}
                                                            onBlur={() => commitSetMetricChange(setIdx, m.id)}
                                                            onKeyDown={(e) => {
                                                                if (e.key === 'Enter') e.currentTarget.blur();
                                                            }}
                                                        />
                                                        <span className={`${styles.metricMeta} ${styles.metricMetaLarge}`}>
                                                            <span className={styles.metricUnitLarge}>{m.unit}</span>
                                                            {renderMetricProgress(m.id, { setIndex: setIdx })}
                                                        </span>
                                                    </div>
                                                ))
                                            )
                                        )}

                                        {/* Cascade Buttons Container */}
                                        {setIdx < exercise.sets.length - 1 && (
                                            <div className={styles.cascadeButtonsContainer}>
                                                {(() => {
                                                    const buttons = [];
                                                    const checkAndAddButton = (m, splitId = null) => {
                                                        const val = getMetricValue(set.metrics, m.id, splitId);
                                                        if (val && isNextSetEmpty(setIdx, m.id, splitId)) {
                                                            const key = splitId ? `${splitId}-${m.id}` : m.id;
                                                            buttons.push(
                                                                <button
                                                                    key={key}
                                                                    className={styles.cascadeButton}
                                                                    onClick={() => handleCascade(m.id, val, splitId, setIdx)}
                                                                    title={`Copy ${val} ${m.unit || ''} to subsequent empty sets`}
                                                                >
                                                                    Cascade {m.unit || 'Value'}
                                                                </button>
                                                            );
                                                        }
                                                    };
                                                    if (hasSplits) {
                                                        def.split_definitions.forEach(split => {
                                                            def.metric_definitions.forEach(m => checkAndAddButton(m, split.id));
                                                        });
                                                    } else {
                                                        def.metric_definitions.forEach(m => checkAndAddButton(m));
                                                    }
                                                    if (buttons.length === 0) return null;
                                                    return buttons;
                                                })()}
                                            </div>
                                        )}
                                    </div>

                                    {yieldBySetIndex?.[setIdx] != null && (
                                        <span className={styles.setYield}>
                                            Yield: {formatAggValue(yieldBySetIndex[setIdx])}
                                            {!activeProgress?.is_first_instance && prevYieldBySetIndex?.[setIdx] != null && (
                                                <SummaryDelta
                                                    current={yieldBySetIndex[setIdx]}
                                                    previous={prevYieldBySetIndex[setIdx]}
                                                    higherIsBetter
                                                    styles={styles}
                                                    displayMode={deltaDisplayMode}
                                                />
                                            )}
                                        </span>
                                    )}

                                    <button onClick={() => handleRemoveSet(setIdx)} className={styles.removeSetButton} aria-label="Remove set">×</button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={handleAddSet}
                            className={styles.addSetButton}
                        >
                            + Add Set
                        </button>
                        <SessionActivityProgressSummary
                            sets={exercise.sets}
                            metricDefs={def.metric_definitions}
                            activeProgress={activeProgress}
                            displayMode={deltaDisplayMode}
                        />
                    </div>
                ) : (
                    /* SINGLE VIEW (NO SETS) */
                    hasMetrics ? (
                        hasSplits ? (
                            // Render metrics grouped by split in a grid
                            <div className={styles.singleMetricsContainerColumn}>
                                {def.split_definitions.map(split => (
                                    <div key={split.id} className={styles.singleMetricGroup}>
                                        <div className={styles.singleMetricGroupTitle}>{split.name}</div>
                                        <div className={styles.singleMetricGroupContent}>
                                            {def.metric_definitions.map(m => (
                                                <div key={m.id} className={styles.metricInputContainer}>
                                                    <label className={styles.metricLabelLarge}>{m.name}</label>
                                                    <input
                                                        type="number"
                                                        className={`${styles.metricInput} ${styles.metricInputLarge}`}
                                                        value={getSingleMetricDisplayValue(exercise.metrics, m.id, split.id)}
                                                        onChange={(e) => handleSingleMetricDraftChange(m.id, e.target.value, split.id)}
                                                        onBlur={() => commitSingleMetricChange(m.id, split.id)}
                                                        onKeyDown={(e) => {
                                                            if (e.key === 'Enter') e.currentTarget.blur();
                                                        }}
                                                    />
                                                    <span className={`${styles.metricMeta} ${styles.metricMetaLarge}`}>
                                                        <span className={styles.metricUnitLarge}>{m.unit}</span>
                                                        {renderMetricProgress(m.id)}
                                                    </span>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Render metrics without splits (original behavior)
                            <div className={styles.singleMetricsContainer}>
                                {def.metric_definitions.map(m => (
                                    <div key={m.id} className={styles.metricInputContainer}>
                                        <label className={styles.metricLabelLarge}>{m.name}</label>
                                        <input
                                            type="number"
                                            className={`${styles.metricInput} ${styles.metricInputLarge}`}
                                            value={getSingleMetricDisplayValue(exercise.metrics, m.id)}
                                            onChange={(e) => handleSingleMetricDraftChange(m.id, e.target.value)}
                                            onBlur={() => commitSingleMetricChange(m.id)}
                                            onKeyDown={(e) => {
                                                if (e.key === 'Enter') e.currentTarget.blur();
                                            }}
                                        />
                                        <span className={`${styles.metricMeta} ${styles.metricMetaLarge}`}>
                                            <span className={styles.metricUnitLarge}>{m.unit}</span>
                                            {renderMetricProgress(m.id)}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className={styles.noMetricsMessage}>
                            {quickMode ? 'Mark this activity complete when finished.' : 'Track activity based on completion checkbox above.'}
                        </div>
                    )
                )}

                {/* Quick Note Add */}
                {/* Notes Section - Timeline + Quick Add */}
                {!quickMode && (
                    <div className={styles.notesSection}>
                        {activityNotes.length > 0 && (
                            <div className={styles.notesTimelineContainer}>
                                <NoteTimeline
                                    notes={activityNotes}
                                    onUpdate={onUpdateNote}
                                    onDelete={onDeleteNote}
                                    compact={false}
                                />
                            </div>
                        )}
                        <NoteQuickAdd
                            onSubmit={handleAddNote}
                            placeholder={selectedSetIndex !== null
                                ? `Note for Set #${selectedSetIndex + 1}...`
                                : "Add a note about this activity..."
                            }
                        />
                    </div>
                )}
            </div>

        </div>
    );
}

export default SessionActivityItem;
