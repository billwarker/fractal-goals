import React, { useState, useEffect, useCallback, useMemo } from 'react';

import { useActiveSessionData, useActiveSessionActions } from '../../contexts/ActiveSessionContext';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import { getGroupBreadcrumb } from '../../utils/manageActivities';
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

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function formatMetricNumber(value) {
    if (value == null || Number.isNaN(Number(value))) return null;
    const numericValue = Number(value);
    if (Number.isInteger(numericValue)) {
        return String(numericValue);
    }
    return numericValue.toFixed(1).replace(/\.0$/, '');
}

function formatInlineProgressValue(comparison) {
    if (!comparison) return null;

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
    const onDelete = () => removeActivity(exercise.id);
    const onUpdate = useCallback((key, value) => {
        if (key === 'timer_action') {
            updateTimer(exercise.id, value);
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
    const [realtimeDuration, setRealtimeDuration] = useState(0);



    // Real-time timer effect
    useEffect(() => {
        let intervalId;

        const updateTimerLocal = () => {
            if (exercise.time_start && !exercise.time_stop) {
                const start = new Date(exercise.time_start).getTime();
                const now = Date.now();

                // Account for paused time tied to the activity instance
                const totalPaused = exercise.total_paused_seconds || 0;

                // Also account for session-level pause state if it relates to this activity
                // Note: If the session pauses, we probably just stop this local timer from advancing.
                const isSessionPaused = session?.is_paused || session?.attributes?.is_paused || false;
                const sessionLastPausedAt = session?.last_paused_at || session?.attributes?.last_paused_at;

                let currentPausedStraggler = 0;
                if (isSessionPaused && sessionLastPausedAt) {
                    const pausedTime = new Date(sessionLastPausedAt).getTime();
                    // Has to be after activity start
                    if (pausedTime > start) {
                        currentPausedStraggler = Math.floor((now - pausedTime) / 1000);
                    }
                }

                const diffSeconds = Math.floor((now - start) / 1000);
                const activeSeconds = Math.max(0, diffSeconds - totalPaused - currentPausedStraggler);
                setRealtimeDuration(activeSeconds);
            }
        };

        if (exercise.time_start && !exercise.time_stop) {
            // Initial update
            updateTimerLocal();

            // Only tick if not paused
            const isSessionPaused = session?.is_paused || session?.attributes?.is_paused || false;
            if (!isSessionPaused) {
                // Start interval
                intervalId = setInterval(updateTimerLocal, 1000);
            }
        } else if (exercise.duration_seconds != null) {
            // Use stored duration if available (completed)
            setRealtimeDuration(exercise.duration_seconds);
        } else {
            setRealtimeDuration(0);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [
        exercise.time_start,
        exercise.time_stop,
        exercise.duration_seconds,
        exercise.total_paused_seconds,
        session?.is_paused,
        session?.attributes?.is_paused,
        session?.last_paused_at,
        session?.attributes?.last_paused_at
    ]);

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
    const metricDefinitionsById = useMemo(() => new Map(
        (def.metric_definitions || []).map((metric) => [metric.id, metric])
    ), [def.metric_definitions]);
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
                || metric.progress_aggregation
                || metric.default_progress_aggregation
                || 'last';

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
    }, [def.metric_definitions, exercise.sets, getMetricValue, hasSets, metricProgressById]);

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
                    const inlineValue = formatInlineProgressValue(setComp);
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

            // Fallback: only show hint on the driving set row
            const visibleIndexes = setProgressVisibility.get(metricId);
            if (visibleIndexes && !visibleIndexes.has(options.setIndex)) {
                return null;
            }
        }

        if (isCompleted) {
            const inlineValue = formatInlineProgressValue(comparison);
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
    }, [activeProgress, hasSets, isCompleted, metricProgressById, setProgressVisibility]);

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
                        </div>
                        {groupLabel && (
                            <div className={styles.activityGroupLabel}>{groupLabel}</div>
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

                                    {/* Duration Display */}
                                    <div className={styles.timerFieldContainer}>
                                        <MetaField
                                            className={styles.durationMetaField}
                                            label="Duration"
                                            value={formatDuration(realtimeDuration)}
                                            valueClassName={[
                                                styles.durationDisplay,
                                                (exercise.time_start && !exercise.time_stop) ? styles.durationActive : styles.durationInactive,
                                            ].join(' ')}
                                        />
                                    </div>
                                </div>

                                <div className={styles.timerActionColumn}>
                                    {!exercise.time_start ? (
                                        <>
                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    onUpdate('timer_action', 'start');
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
                                    className={`${styles.setRow} ${selectedSetIndex === setIdx ? styles.setRowSelected : ''}`}
                                >
                                    <div className={styles.setNumber}>#{setIdx + 1}</div>

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
                                    {/* Show IF: not the last set AND next set is empty for at least one metric */}
                                    {setIdx < exercise.sets.length - 1 && (
                                        <div className={styles.cascadeButtonsContainer}>
                                            {/* Logic to render buttons for all applicable metrics */}
                                            {(() => {
                                                const buttons = [];

                                                // Helper to check and add button
                                                const checkAndAddButton = (m, splitId = null) => {
                                                    // Must have a value in CURRENT set
                                                    const val = getMetricValue(set.metrics, m.id, splitId);

                                                    // AND next set must be empty for this metric
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

                                                // Only render container if we have buttons
                                                if (buttons.length === 0) return null;

                                                return buttons;
                                            })()}
                                        </div>
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
