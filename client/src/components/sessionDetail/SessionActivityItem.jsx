import React, { useState, useEffect, useCallback } from 'react';
import Linkify from '../atoms/Linkify';
import { useTimezone } from '../../contexts/TimezoneContext';
import GoalIcon from '../atoms/GoalIcon';
import { useTheme } from '../../contexts/ThemeContext';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './SessionActivityItem.module.css';

import { useActiveSessionData, useActiveSessionActions } from '../../contexts/ActiveSessionContext';

/**
 * Format duration in seconds to MM:SS format
 */
function formatDuration(seconds) {
    if (seconds == null) return '--:--';
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
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
    onOpenGoals,
    isDragging,
    activityDefinition: activityDefinitionProp = null,
    activityNotes: activityNotesProp = null,
}) {
    // Context
    const {
        sessionId,
        activities,
        parentGoals,
        immediateGoals,
        microGoals,
        session,
    } = useActiveSessionData();

    const {
        updateInstance,
        updateTimer,
        removeActivity,
        createGoal,
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
    const { getGoalColor, getGoalSecondaryColor, getScopedCharacteristics } = useTheme();

    const setMetricDraftKey = useCallback((setIndex, metricId, splitId = null) => (
        `${setIndex}:${metricId}:${splitId || ''}`
    ), []);
    const singleMetricDraftKey = useCallback((metricId, splitId = null) => (
        `${metricId}:${splitId || ''}`
    ), []);

    const [setMetricDrafts, setSetMetricDrafts] = useState({});
    const [singleMetricDrafts, setSingleMetricDrafts] = useState({});

    const resolveMetricId = useCallback((metric) => (
        metric?.metric_id || metric?.metric_definition_id || null
    ), []);

    const resolveSplitId = useCallback((metric) => (
        metric?.split_id || metric?.split_definition_id || null
    ), []);

    useEffect(() => {
        setSetMetricDrafts({});
        setSingleMetricDrafts({});
    }, [exercise.id]);

    const clearSetMetricDraft = useCallback((setIndex, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        setSetMetricDrafts((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, [setMetricDraftKey]);

    const clearSingleMetricDraft = useCallback((metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        setSingleMetricDrafts((prev) => {
            if (!(key in prev)) return prev;
            const next = { ...prev };
            delete next[key];
            return next;
        });
    }, [singleMetricDraftKey]);

    const getMetricValue = useCallback((metricsList, metricId, splitId = null) => {
        const m = metricsList?.find(x =>
            resolveMetricId(x) === metricId && (splitId ? resolveSplitId(x) === splitId : !resolveSplitId(x))
        );
        return m ? m.value : '';
    }, [resolveMetricId, resolveSplitId]);

    const getSetMetricDisplayValue = useCallback((setIndex, metricsList, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(setMetricDrafts, key)) {
            return setMetricDrafts[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, setMetricDraftKey, setMetricDrafts]);

    const getSingleMetricDisplayValue = useCallback((metricsList, metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        if (Object.prototype.hasOwnProperty.call(singleMetricDrafts, key)) {
            return singleMetricDrafts[key];
        }
        return getMetricValue(metricsList, metricId, splitId);
    }, [getMetricValue, singleMetricDraftKey, singleMetricDrafts]);

    const commitSetMetricChange = useCallback((setIndex, metricId, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        if (!Object.prototype.hasOwnProperty.call(setMetricDrafts, key)) return;
        const value = setMetricDrafts[key];

        const newSets = [...(exercise.sets || [])];
        const set = { ...newSets[setIndex] };
        const metrics = Array.isArray(set.metrics) ? [...set.metrics] : [];
        const metricIdx = metrics.findIndex(m =>
            resolveMetricId(m) === metricId && (splitId ? resolveSplitId(m) === splitId : !resolveSplitId(m))
        );
        if (metricIdx >= 0) {
            metrics[metricIdx] = { ...metrics[metricIdx], value };
        } else {
            const newMetric = { metric_id: metricId, value };
            if (splitId) newMetric.split_id = splitId;
            metrics.push(newMetric);
        }
        set.metrics = metrics;
        newSets[setIndex] = set;
        onUpdate('sets', newSets);
        clearSetMetricDraft(setIndex, metricId, splitId);
    }, [exercise.sets, onUpdate, resolveMetricId, resolveSplitId, setMetricDraftKey, setMetricDrafts, clearSetMetricDraft]);

    const commitSingleMetricChange = useCallback((metricId, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        if (!Object.prototype.hasOwnProperty.call(singleMetricDrafts, key)) return;
        const value = singleMetricDrafts[key];

        const currentMetrics = [...(exercise.metrics || [])];
        const metricIdx = currentMetrics.findIndex(m =>
            resolveMetricId(m) === metricId && (splitId ? resolveSplitId(m) === splitId : !resolveSplitId(m))
        );
        if (metricIdx >= 0) {
            currentMetrics[metricIdx] = { ...currentMetrics[metricIdx], value };
        } else {
            const newMetric = { metric_id: metricId, value };
            if (splitId) newMetric.split_id = splitId;
            currentMetrics.push(newMetric);
        }
        onUpdate('metrics', currentMetrics);
        clearSingleMetricDraft(metricId, splitId);
    }, [exercise.metrics, onUpdate, resolveMetricId, resolveSplitId, singleMetricDraftKey, singleMetricDrafts, clearSingleMetricDraft]);

    const handleSetMetricDraftChange = useCallback((setIndex, metricId, value, splitId = null) => {
        const key = setMetricDraftKey(setIndex, metricId, splitId);
        setSetMetricDrafts((prev) => ({ ...prev, [key]: value }));
    }, [setMetricDraftKey]);

    const handleSingleMetricDraftChange = useCallback((metricId, value, splitId = null) => {
        const key = singleMetricDraftKey(metricId, splitId);
        setSingleMetricDrafts((prev) => ({ ...prev, [key]: value }));
    }, [singleMetricDraftKey]);

    // Find active micro goal for this activity in the current session
    const activeMicroGoal = microGoals.find(mg =>
        !mg.completed &&
        mg.attributes?.session_id === sessionId &&
        activityDefinition?.associated_goal_ids?.includes(mg.parent_id)
    );

    const onCreateNanoGoal = async (parentId, name) => {
        return await createGoal({
            name,
            type: 'NanoGoal',
            parent_id: parentId,
            attributes: { session_id: sessionId }
        });
    };

    // Characteristics for goal icons
    const microChars = getScopedCharacteristics('MicroGoal');
    const nanoChars = getScopedCharacteristics('NanoGoal');
    const immediateChars = getScopedCharacteristics('ImmediateGoal');
    const [nanoMode, setNanoMode] = useState(false);

    // Helper: Determine the next goal action based on activity's current associations
    const getNextGoalContext = () => {
        if (!activityDefinition) {
            return null;
        }

        const associatedGoalIds = activityDefinition.associated_goal_ids || [];
        const associatedGoals = activityDefinition.associated_goals || [];

        // Check if associated with any Short-Term or Immediate goals
        // We use associatedGoals directly check the types of associated goals, regardless of current session context
        const hasShortTermGoal = (Array.isArray(associatedGoals) && associatedGoals.some(g => g.type === 'ShortTermGoal')) || (Array.isArray(parentGoals) && parentGoals.some(g => associatedGoalIds.includes(g.id)));
        const iGoals = Array.isArray(session?.immediate_goals) ? session.immediate_goals : (Array.isArray(immediateGoals) ? immediateGoals : []);
        const hasImmediateGoal = iGoals.some(g => associatedGoalIds.includes(g.id));

        // Case 1: Not associated with STG or IG -> need to associate
        // Case 1 & 2: No longer prompting for association here. 
        // Association is handled in the sidepane.
        // Fall through to Micro/Nano goal creation.

        // Case 3: Has IG but no active micro -> create Micro Goal
        // Check if there's an active micro goal for this activity in the session
        if (!activeMicroGoal) {
            return null;
        }

        // Case 4: Has active micro -> create Nano Goal (toggle mode)
        return {
            type: 'NanoGoal',
            label: nanoMode ? 'Cancel Nano Note' : 'Add Nano Goal Note',
            icon: nanoChars.icon || 'star',
            color: getGoalColor('NanoGoal'),
            secondaryColor: getGoalSecondaryColor('NanoGoal')
        };
    };

    const goalContext = getNextGoalContext();

    // Local state for editing datetime fields
    const [localStartTime, setLocalStartTime] = useState('');
    const [localStopTime, setLocalStopTime] = useState('');
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [realtimeDuration, setRealtimeDuration] = useState(0);

    // Reset nano mode when active micro goal changes (e.g. completes or switch activity)
    useEffect(() => {
        if (!activeMicroGoal) setNanoMode(false);
    }, [activeMicroGoal]);

    // Real-time timer effect
    useEffect(() => {
        let intervalId;

        const updateTimerLocal = () => {
            if (exercise.time_start && !exercise.time_stop) {
                const start = new Date(exercise.time_start);
                const now = new Date();
                const seconds = Math.floor((now - start) / 1000);
                setRealtimeDuration(seconds >= 0 ? seconds : 0);
            }
        };

        if (exercise.time_start && !exercise.time_stop) {
            // Initial update
            updateTimerLocal();
            // Start interval
            intervalId = setInterval(updateTimerLocal, 1000);
        } else if (exercise.duration_seconds != null) {
            // Use stored duration if available (completed)
            setRealtimeDuration(exercise.duration_seconds);
        } else {
            setRealtimeDuration(0);
        }

        return () => {
            if (intervalId) clearInterval(intervalId);
        };
    }, [exercise.time_start, exercise.time_stop, exercise.duration_seconds]);

    // Filter notes for this activity
    const activityNotes = Array.isArray(activityNotesProp)
        ? activityNotesProp
        : (allNotes?.filter(n => n.activity_instance_id === exercise.id) || []);

    const handleAddNote = async (content, imageData = null) => {
        // Either content or image is required
        if ((!content.trim() && !imageData) || !onAddNote || !exercise.id) return;

        // NEW: Check if in nano mode
        if (nanoMode && activeMicroGoal) {
            await handleAddNanoNote(content, imageData);
            return;
        }

        try {
            await onAddNote({
                context_type: 'activity_instance',
                context_id: exercise.id,
                session_id: sessionId || exercise.session_id,

                activity_instance_id: exercise.id,
                activity_definition_id: activityDefinition?.id,
                set_index: selectedSetIndex,
                content: content.trim() || (imageData ? '[Image]' : ''),
                image_data: imageData
            });
            if (onNoteCreated) onNoteCreated();

            // Optional: Deselect set after adding note?
            // setSelectedSetIndex(null); 
        } catch (err) {
            console.error("Failed to create note", err);
        }
    };

    const handleAddNanoNote = async (content, imageData = null) => {
        if (!content.trim() && !imageData) return;

        try {
            // 1. Create the NanoGoal (goal hierarchy)
            let newNanoGoalId = null;
            if (onCreateNanoGoal && content.trim()) {
                // Expect onCreateNanoGoal to return the created goal object
                const res = await onCreateNanoGoal(activeMicroGoal.id, content.trim());
                if (res && res.id) newNanoGoalId = res.id;
            }

            // 2. Create the Note (note timeline)
            await onAddNote({
                context_type: 'activity_instance',
                context_id: exercise.id,
                session_id: sessionId || exercise.session_id,

                activity_instance_id: exercise.id,
                activity_definition_id: activityDefinition?.id,
                set_index: selectedSetIndex,
                content: content.trim() || (imageData ? '[Nano Image]' : ''),
                image_data: imageData,
                nano_goal_id: newNanoGoalId, // Link note to the nano goal
                is_nano_goal: true
            });

            if (onNoteCreated) onNoteCreated();
        } catch (err) {
            console.error("Failed to create nano note", err);
        }
    };

    // Sync local state when exercise times change
    useEffect(() => {
        setLocalStartTime(exercise.time_start ? formatForInput(exercise.time_start, timezone) : '');
    }, [exercise.time_start, timezone]);

    useEffect(() => {
        setLocalStopTime(exercise.time_stop ? formatForInput(exercise.time_stop, timezone) : '');
    }, [exercise.time_stop, timezone]);
    // If we don't have definition, we can't render much (maybe just name)
    // But we should have it passed in from parent lookups
    const def = activityDefinition || { name: exercise.name || 'Unknown Activity', metric_definitions: [], split_definitions: [] };
    const hasSets = exercise.has_sets ?? def.has_sets; // Snapshot or definition default
    const hasSplits = def.has_splits && def.split_definitions && def.split_definitions.length > 0;
    // Check if metrics exist by looking at the definition, not just the flag
    const hasMetrics = def.metric_definitions && def.metric_definitions.length > 0;

    const handleAddSet = () => {
        const newSet = {
            instance_id: crypto.randomUUID(),
            completed: false,
            metrics: def.metric_definitions.map(m => ({ metric_id: m.id, value: '' }))
        };

        const newSets = [...(exercise.sets || []), newSet];
        onUpdate('sets', newSets);
    };

    const handleRemoveSet = (setIndex) => {
        const newSets = [...(exercise.sets || [])];
        newSets.splice(setIndex, 1);
        onUpdate('sets', newSets);
    };

    const handleCascade = (metricId, value, splitId = null, sourceIndex = 0) => {
        const newSets = [...(exercise.sets || [])];
        let hasChanges = false;

        // Iterate through all sets after the source set
        for (let i = sourceIndex + 1; i < newSets.length; i++) {
            const set = { ...newSets[i] };

            // Should we update this set? Only if the value is empty
            const metricIdx = set.metrics.findIndex(m =>
                m.metric_id === metricId && (splitId ? m.split_id === splitId : !m.split_id)
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
            onUpdate('sets', newSets);
        }
    };

    // Helper to check if the IMMEDIATE next set has an empty value for a metric
    const isNextSetEmpty = (currentIndex, metricId, splitId = null) => {
        if (!exercise.sets || currentIndex >= exercise.sets.length - 1) return false;

        const nextSet = exercise.sets[currentIndex + 1];
        const val = getMetricValue(nextSet.metrics, metricId, splitId);

        return val === '' || val === null || val === undefined;
    };

    // Helper to check if subsequent sets have empty values for a metric
    const hasSubsequentEmptySets = (metricId, splitId = null) => {
        if (!exercise.sets || exercise.sets.length <= 1) return false;

        for (let i = 1; i < exercise.sets.length; i++) {
            const set = exercise.sets[i];
            const val = getMetricValue(set.metrics, metricId, splitId);
            if (val === '' || val === null || val === undefined) return true;
        }
        return false;
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
                        <div className={styles.activityName}>
                            {def.name}
                        </div>
                        {exercise.group_name && (
                            <div className={styles.activityGroupLabel}>{exercise.group_name}</div>
                        )}
                        {def.description && <div className={styles.activityDescription}><Linkify>{def.description}</Linkify></div>}
                    </div>
                </div>

                <div className={styles.activityHeaderRight}>
                    {/* Smart Goal Creator Button */}
                    {/* Smart Goal Creator Button */}
                    {goalContext && (
                        <button
                            onClick={(e) => {
                                e.stopPropagation();

                                if (goalContext.type === 'NanoGoal') {
                                    // Toggle nano mode for existing behavior
                                    setNanoMode(!nanoMode);
                                } else {
                                    // Open goals panel with context for creating IG or Micro
                                    if (onOpenGoals) {
                                        onOpenGoals(exercise, {
                                            suggestedType: goalContext.type,
                                            activityDefinition: activityDefinition
                                        });
                                    }
                                }
                            }}
                            className={`${styles.microGoalActionButton} ${goalContext.type === 'NanoGoal' && nanoMode ? styles.activeNanoMode : ''}`}
                            title={goalContext.label}
                            style={{
                                borderColor: goalContext.color,
                                color: goalContext.color
                            }}
                        >
                            <GoalIcon
                                shape={goalContext.icon}
                                color={goalContext.color}
                                secondaryColor={goalContext.secondaryColor}
                                size={14}
                            />
                            <span>{goalContext.label}</span>
                        </button>
                    )}

                    {/* Timer Controls - New Design */}
                    {exercise.id && (
                        <div className={styles.timerControlsGrid}>
                            <div className={styles.timerMetaColumn}>
                                {/* DateTime Start Field */}
                                <div className={styles.timerFieldContainer}>
                                    <label className={styles.timerLabel}>Start</label>
                                    <input
                                        type="text"
                                        placeholder="YYYY-MM-DD HH:MM:SS"
                                        value={localStartTime}
                                        onChange={(e) => setLocalStartTime(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value) {
                                                try {
                                                    const isoValue = localToISO(e.target.value, timezone);
                                                    onUpdate('time_start', isoValue);
                                                } catch (err) {
                                                    console.error('Invalid date format:', err);
                                                    // Reset to previous value
                                                    setLocalStartTime(exercise.time_start ? formatForInput(exercise.time_start, timezone) : '');
                                                }
                                            } else {
                                                onUpdate('time_start', null);
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
                                        onChange={(e) => setLocalStopTime(e.target.value)}
                                        onBlur={(e) => {
                                            if (e.target.value) {
                                                try {
                                                    const isoValue = localToISO(e.target.value, timezone);
                                                    onUpdate('time_stop', isoValue);
                                                } catch (err) {
                                                    console.error('Invalid date format:', err);
                                                    // Reset to previous value
                                                    setLocalStopTime(exercise.time_stop ? formatForInput(exercise.time_stop, timezone) : '');
                                                }
                                            } else {
                                                onUpdate('time_stop', null);
                                            }
                                        }}
                                        disabled={!exercise.time_start}
                                        className={`${styles.timerInput} ${!exercise.time_start ? styles.timerInputDisabled : ''}`}
                                    />
                                </div>

                                {/* Duration Display */}
                                <div className={styles.timerFieldContainer}>
                                    <label className={styles.timerLabel}>Duration</label>
                                    <div className={`${styles.durationDisplay} ${(exercise.time_start && !exercise.time_stop) ? styles.durationActive : styles.durationInactive}`}>
                                        {formatDuration(realtimeDuration)}
                                    </div>
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
                    )}
                </div>

                {/* Delete Button */}
                <button onClick={onDelete} className={styles.deleteButton}>×</button>
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
                                                            <span className={styles.metricUnit}>{m.unit}</span>
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
                                                    <span className={styles.metricUnitLarge}>{m.unit}</span>
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


                                    <button onClick={() => handleRemoveSet(setIdx)} className={styles.removeSetButton}>×</button>
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
                                                    <span className={styles.metricUnitLarge}>{m.unit}</span>
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
                                        <span className={styles.metricUnitLarge}>{m.unit}</span>
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div className={styles.noMetricsMessage}>
                            Track activity based on completion checkbox above.
                        </div>
                    )
                )}

                {/* Quick Note Add */}
                {/* Notes Section - Timeline + Quick Add */}
                <div className={styles.notesSection}>
                    {activityNotes.length > 0 && (
                        <div className={styles.notesTimelineContainer}>
                            <NoteTimeline
                                notes={activityNotes}
                                onUpdate={onUpdateNote}
                                onDelete={onDeleteNote}
                                compact={false}
                                selectedNoteId={selectedNoteId} // Use local state
                                onNoteSelect={setSelectedNoteId}
                            />
                        </div>
                    )}
                    <NoteQuickAdd
                        onSubmit={handleAddNote}
                        placeholder={nanoMode
                            ? "Add a nano goal / sub-step..."
                            : (selectedSetIndex !== null
                                ? `Note for Set #${selectedSetIndex + 1}...`
                                : "Add a note about this activity...")
                        }
                        buttonLabel={nanoMode ? "Add Nano" : "Add Note"}
                        isNanoMode={nanoMode}
                    />
                </div>
            </div>
        </div>
    );
}

export default SessionActivityItem;
