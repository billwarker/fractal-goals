import { logError } from '../../utils/logger';
import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { useActiveSessionData, useActiveSessionActions } from '../../contexts/ActiveSessionContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput } from '../../utils/dateUtils';
import { getGroupBreadcrumb } from '../../utils/manageActivities';
import { playCompletionSound } from '../../utils/playCompletionSound';
import styles from './SessionActivityItem.module.css';
import { SummaryDelta } from './SessionActivityProgressSummary';
import SessionActivityItemView from './SessionActivityItemView';
import useMetricDrafts from './useMetricDrafts';
import { useProgressComparison } from '../../hooks/useProgressComparison';
import { useRootProgressSettings } from '../../hooks/useRootProgressSettings';
import { useEffectiveDeltaDisplayMode } from '../../hooks/useEffectiveDeltaDisplayMode';
import {
    canComputeYield,
    computeAutoAggregations,
    filterTrackedMetricDefs,
    formatAggValue,
    resolveAutoAggregationMode,
} from '../../utils/progressAggregations';
import { getAverageDurationStat } from '../../utils/durationStats';
import {
    formatDuration,
    parseMMSS,
    formatMetricNumber,
    normalizeMetricValueForStorage,
    getMetricDefaultStorageValue,
    formatMetricValueForInput,
    formatAllowedMetricValueLabel,
    getAllowedMetricValues,
    formatAllowedMetricValues,
    getMetricInputProps,
    formatInlineProgressValue,
    getBestSetIndexes,
    buildEmptySet,
} from '../../utils/sessionActivityMetrics';

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
            logError("Failed to create note", err);
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
        hasSetMetricDraft,
        hasSingleMetricDraft,
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
    const appliedMetricDefaultsRef = React.useRef('');

    useEffect(() => {
        if (!hasMetrics) return;

        const metricDefinitions = def.metric_definitions || [];
        const metricsWithDefaults = metricDefinitions.filter((metric) => getMetricDefaultStorageValue(metric) !== '');
        if (metricsWithDefaults.length === 0) return;
        const missingDefaultKeys = [];

        if (hasSets && Array.isArray(exercise.sets) && exercise.sets.length > 0) {
            let changed = false;
            const nextSets = exercise.sets.map((set) => {
                const existingMetrics = Array.isArray(set.metrics) ? set.metrics : [];
                const nextMetrics = [...existingMetrics];

                if (hasSplits && Array.isArray(def.split_definitions)) {
                    def.split_definitions.forEach((split) => {
                        metricsWithDefaults.forEach((metric) => {
                            const exists = existingMetrics.some((item) => (
                                resolveMetricId(item) === metric.id
                                && resolveSplitId(item) === split.id
                            ));
                            if (!exists) {
                                missingDefaultKeys.push(`${set.instance_id || 'set'}:${split.id}:${metric.id}`);
                                nextMetrics.push({
                                    metric_id: metric.id,
                                    split_id: split.id,
                                    value: getMetricDefaultStorageValue(metric),
                                });
                                changed = true;
                            }
                        });
                    });
                } else {
                    metricsWithDefaults.forEach((metric) => {
                        const exists = existingMetrics.some((item) => (
                            resolveMetricId(item) === metric.id && !resolveSplitId(item)
                        ));
                        if (!exists) {
                            missingDefaultKeys.push(`${set.instance_id || 'set'}:${metric.id}`);
                            nextMetrics.push({
                                metric_id: metric.id,
                                value: getMetricDefaultStorageValue(metric),
                            });
                            changed = true;
                        }
                    });
                }

                return changed ? { ...set, metrics: nextMetrics } : set;
            });

            if (changed) {
                const signature = `${exercise.id}:sets:${missingDefaultKeys.sort().join('|')}`;
                if (signature && appliedMetricDefaultsRef.current !== signature) {
                    appliedMetricDefaultsRef.current = signature;
                    onUpdate('sets', nextSets);
                }
            }
            return;
        }

        if (!hasSets) {
            const existingMetrics = Array.isArray(exercise.metrics) ? exercise.metrics : [];
            const nextMetrics = [...existingMetrics];
            let changed = false;

            if (hasSplits && Array.isArray(def.split_definitions)) {
                def.split_definitions.forEach((split) => {
                    metricsWithDefaults.forEach((metric) => {
                        const exists = existingMetrics.some((item) => (
                            resolveMetricId(item) === metric.id
                            && resolveSplitId(item) === split.id
                        ));
                        if (!exists) {
                            missingDefaultKeys.push(`${split.id}:${metric.id}`);
                            nextMetrics.push({
                                metric_id: metric.id,
                                split_id: split.id,
                                value: getMetricDefaultStorageValue(metric),
                            });
                            changed = true;
                        }
                    });
                });
            } else {
                metricsWithDefaults.forEach((metric) => {
                    const exists = existingMetrics.some((item) => (
                        resolveMetricId(item) === metric.id && !resolveSplitId(item)
                    ));
                    if (!exists) {
                        missingDefaultKeys.push(metric.id);
                        nextMetrics.push({
                            metric_id: metric.id,
                            value: getMetricDefaultStorageValue(metric),
                        });
                        changed = true;
                    }
                });
            }

            if (changed) {
                const signature = `${exercise.id}:metrics:${missingDefaultKeys.sort().join('|')}`;
                if (signature && appliedMetricDefaultsRef.current !== signature) {
                    appliedMetricDefaultsRef.current = signature;
                    onUpdate('metrics', nextMetrics);
                }
            }
        }
    }, [
        def.metric_definitions,
        def.split_definitions,
        exercise.id,
        exercise.metrics,
        exercise.sets,
        hasMetrics,
        hasSets,
        hasSplits,
        onUpdate,
        resolveMetricId,
        resolveSplitId,
    ]);
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
    const yieldEligible = canComputeYield(trackedMetricDefs);
    const yieldBySetIndex = useMemo(() => {
        if (!yieldEligible) return null;
        if (!liveAutoAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of liveAutoAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [liveAutoAgg, yieldEligible]);

    const prevYieldBySetIndex = useMemo(() => {
        if (!yieldEligible) return null;
        const prevAgg = activeProgress?.derived_summary?.prev_auto_aggregations;
        if (!prevAgg?.yield_per_set?.length) return null;
        const map = {};
        for (const { set_index, yield: y } of prevAgg.yield_per_set) {
            map[set_index] = y;
        }
        return map;
    }, [activeProgress, yieldEligible]);

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

    const commitSetMetricInput = (setIndex, metricDef, splitId = null, displayValue) => {
        const normalizedValue = normalizeMetricValueForStorage(metricDef, displayValue);
        commitSetMetricChange(setIndex, metricDef.id, splitId, normalizedValue);
    };

    const commitSingleMetricInput = (metricDef, splitId = null, displayValue) => {
        const normalizedValue = normalizeMetricValueForStorage(metricDef, displayValue);
        commitSingleMetricChange(metricDef.id, splitId, normalizedValue);
    };

    const renderMetricEditor = ({
        metricDef,
        value,
        inputClassName,
        metaClassName,
        unitClassName,
        onDraftChange,
        onCommit,
        progress,
        isDraft = false,
    }) => {
        const allowedValues = getAllowedMetricValues(metricDef);
        const allowedValuesText = formatAllowedMetricValues(metricDef);
        const displayValue = isDraft ? String(value ?? '') : formatMetricValueForInput(metricDef, value);
        const selectedAllowedValue = normalizeMetricValueForStorage(metricDef, value);
        return (
            <>
                <div className={styles.metricValueControl}>
                    {allowedValues.length > 0 ? (
                        <select
                            className={`${inputClassName} ${styles.metricSelect}`}
                            value={allowedValues.includes(String(selectedAllowedValue)) ? String(selectedAllowedValue) : ''}
                            onChange={(event) => {
                                const nextValue = allowedValues.includes(event.target.value) ? event.target.value : '';
                                onDraftChange(nextValue);
                                onCommit(nextValue);
                            }}
                        >
                            <option value="">--</option>
                            {allowedValues.map((allowedValue) => (
                                <option key={`${metricDef.id}-${allowedValue}`} value={allowedValue}>
                                    {formatAllowedMetricValueLabel(metricDef, allowedValue)}
                                </option>
                            ))}
                        </select>
                    ) : (
                        <input
                            {...getMetricInputProps(metricDef)}
                            className={inputClassName}
                            value={displayValue}
                            onChange={(event) => onDraftChange(event.target.value)}
                            onBlur={(event) => onCommit(event.target.value)}
                            onKeyDown={(event) => {
                                if (event.key === 'Enter') event.currentTarget.blur();
                            }}
                        />
                    )}
                    {allowedValuesText && (
                        <div className={styles.metricAllowedValues}>
                            Allowed: {allowedValuesText}
                        </div>
                    )}
                </div>
                <span className={metaClassName}>
                    <span className={unitClassName}>{metricDef.unit}</span>
                    {progress}
                </span>
            </>
        );
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
        <SessionActivityItemView
            handleActivityCardClick={handleActivityCardClick}
            isSelected={isSelected}
            isDragging={isDragging}
            showReorderButtons={showReorderButtons}
            onReorder={onReorder}
            canMoveUp={canMoveUp}
            canMoveDown={canMoveDown}
            setSelectedSetIndex={setSelectedSetIndex}
            onFocus={onFocus}
            exercise={exercise}
            def={def}
            activityDefinition={activityDefinition}
            onOpenActivityBuilder={onOpenActivityBuilder}
            groupLabel={groupLabel}
            averageDuration={averageDuration}
            quickMode={quickMode}
            onUpdate={onUpdate}
            localStartTime={localStartTime}
            setStartTimeDraft={setStartTimeDraft}
            timezone={timezone}
            localStopTime={localStopTime}
            setStopTimeDraft={setStopTimeDraft}
            targetDurationInput={targetDurationInput}
            setTargetDurationInput={setTargetDurationInput}
            setTargetDurationError={setTargetDurationError}
            targetDurationError={targetDurationError}
            countdownPreview={countdownPreview}
            isCountingDown={isCountingDown}
            countdownRemaining={countdownRemaining}
            displayedDuration={displayedDuration}
            isRunning={isRunning}
            autoCompletedRef={autoCompletedRef}
            hasTargetDurationInput={hasTargetDurationInput}
            parsedTargetDuration={parsedTargetDuration}
            onDelete={onDelete}
            hasSets={hasSets}
            selectedSetIndex={selectedSetIndex}
            bestSetIndex={bestSetIndex}
            hasMetrics={hasMetrics}
            hasSplits={hasSplits}
            renderMetricEditor={renderMetricEditor}
            renderMetricProgress={renderMetricProgress}
            getSetMetricDisplayValue={getSetMetricDisplayValue}
            hasSetMetricDraft={hasSetMetricDraft}
            handleSetMetricDraftChange={handleSetMetricDraftChange}
            commitSetMetricInput={commitSetMetricInput}
            getMetricValue={getMetricValue}
            isNextSetEmpty={isNextSetEmpty}
            handleCascade={handleCascade}
            yieldBySetIndex={yieldBySetIndex}
            activeProgress={activeProgress}
            prevYieldBySetIndex={prevYieldBySetIndex}
            deltaDisplayMode={deltaDisplayMode}
            handleRemoveSet={handleRemoveSet}
            handleAddSet={handleAddSet}
            getSingleMetricDisplayValue={getSingleMetricDisplayValue}
            hasSingleMetricDraft={hasSingleMetricDraft}
            handleSingleMetricDraftChange={handleSingleMetricDraftChange}
            commitSingleMetricInput={commitSingleMetricInput}
            activityNotes={activityNotes}
            onUpdateNote={onUpdateNote}
            onDeleteNote={onDeleteNote}
            handleAddNote={handleAddNote}
        />
    );
}

export default SessionActivityItem;
