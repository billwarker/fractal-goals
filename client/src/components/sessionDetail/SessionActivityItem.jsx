import React, { useState, useEffect } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import { fractalApi } from '../../utils/api';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';
import styles from './SessionActivityItem.module.css';

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
    activityDefinition,
    onUpdate,
    onToggleComplete,
    onDelete,
    onReorder,
    canMoveUp,
    canMoveDown,
    showReorderButtons,
    rootId,
    onNoteCreated, // Optional callback to trigger refresh
    sessionId, // Explicit session ID
    onFocus, // Added prop - called with (instance, setIndex) to update context
    isSelected, // Added prop for styling
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote,
    // Drag and drop props
    isDragging,
    dragHandleProps
}) {
    // Get timezone from context
    const { timezone } = useTimezone();

    // Local state for editing datetime fields
    const [localStartTime, setLocalStartTime] = useState('');
    const [localStopTime, setLocalStopTime] = useState('');
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);
    const [selectedNoteId, setSelectedNoteId] = useState(null);
    const [realtimeDuration, setRealtimeDuration] = useState(0);

    // Real-time timer effect
    useEffect(() => {
        let intervalId;

        const updateTimer = () => {
            if (exercise.time_start && !exercise.time_stop) {
                const start = new Date(exercise.time_start);
                const now = new Date();
                const seconds = Math.floor((now - start) / 1000);
                setRealtimeDuration(seconds >= 0 ? seconds : 0);
            }
        };

        if (exercise.time_start && !exercise.time_stop) {
            // Initial update
            updateTimer();
            // Start interval
            intervalId = setInterval(updateTimer, 1000);
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
    const activityNotes = allNotes?.filter(n => n.activity_instance_id === exercise.id) || [];

    const handleAddNote = async (content, imageData = null) => {
        // Either content or image is required
        if ((!content.trim() && !imageData) || !onAddNote || !exercise.id) return;

        try {
            await onAddNote({
                context_type: 'activity_instance',
                context_id: exercise.id,
                session_id: sessionId || exercise.practice_session_id,
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
            console.error('Failed to create note', err);
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

    const handleSetMetricChange = (setIndex, metricId, value, splitId = null) => {
        const newSets = [...(exercise.sets || [])];
        const set = { ...newSets[setIndex] };

        // Find existing metric entry or add it
        const metricIdx = set.metrics.findIndex(m =>
            m.metric_id === metricId && (splitId ? m.split_id === splitId : !m.split_id)
        );

        if (metricIdx >= 0) {
            set.metrics[metricIdx] = { ...set.metrics[metricIdx], value };
        } else {
            const newMetric = { metric_id: metricId, value };
            if (splitId) newMetric.split_id = splitId;
            set.metrics.push(newMetric);
        }

        newSets[setIndex] = set;
        onUpdate('sets', newSets);
    };

    const handleSingleMetricChange = (metricId, value, splitId = null) => {
        const currentMetrics = [...(exercise.metrics || [])];
        const metricIdx = currentMetrics.findIndex(m =>
            m.metric_id === metricId && (splitId ? m.split_id === splitId : !m.split_id)
        );

        if (metricIdx >= 0) {
            currentMetrics[metricIdx] = { ...currentMetrics[metricIdx], value };
        } else {
            const newMetric = { metric_id: metricId, value };
            if (splitId) newMetric.split_id = splitId;
            currentMetrics.push(newMetric);
        }

        onUpdate('metrics', currentMetrics);
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

    // Helper to get value for input
    const getMetricValue = (metricsList, metricId, splitId = null) => {
        const m = metricsList?.find(x =>
            x.metric_id === metricId && (splitId ? x.split_id === splitId : !x.split_id)
        );
        return m ? m.value : '';
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
                    {/* Drag Handle */}
                    {dragHandleProps && (
                        <div
                            {...dragHandleProps}
                            className={styles.dragHandle}
                            title="Drag to reorder"
                        >
                            ⋮⋮
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
                            {def.name} <span className={styles.activityLabel}>{exercise.group_name ? `(${exercise.group_name})` : ''}</span>
                        </div>
                        {def.description && <div className={styles.activityDescription}>{def.description}</div>}
                    </div>
                </div>

                <div className={styles.activityHeaderRight}>
                    {/* Timer Controls - New Design */}
                    {exercise.id && (
                        <>
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

                            {/* Start/Complete Button Flow */}
                            {!exercise.time_start ? (
                                <div style={{ display: 'flex', gap: '8px', marginTop: '14px' }}>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdate('timer_action', 'start');
                                        }}
                                        className={styles.startButton}
                                        style={{ marginTop: 0 }}
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
                                        style={{ marginTop: 0 }}
                                        title="Instant complete (0s duration)"
                                    >
                                        ✓ Complete
                                    </button>
                                </div>
                            ) : !exercise.time_stop ? (
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
                            ) : (
                                <div className={styles.completedBadge} title={`Completed at ${formatForInput(exercise.time_stop, timezone)}`}>
                                    Completed
                                </div>
                            )}

                            {/* Reset Button - Only show if started */}
                            {exercise.time_start && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdate('timer_action', 'reset');
                                    }}
                                    className={styles.resetButton}
                                    title="Reset timer"
                                >
                                    ↺
                                </button>
                            )}
                        </>
                    )}

                    {/* Delete Button */}
                    <button onClick={onDelete} className={styles.deleteButton}>×</button>
                </div>
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
                                                                value={getMetricValue(set.metrics, m.id, split.id)}
                                                                onChange={(e) => handleSetMetricChange(setIdx, m.id, e.target.value, split.id)}
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
                                                        value={getMetricValue(set.metrics, m.id)}
                                                        onChange={(e) => handleSetMetricChange(setIdx, m.id, e.target.value)}
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
                                                        value={getMetricValue(exercise.metrics, m.id, split.id)}
                                                        onChange={(e) => handleSingleMetricChange(m.id, e.target.value, split.id)}
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
                                            value={getMetricValue(exercise.metrics, m.id)}
                                            onChange={(e) => handleSingleMetricChange(m.id, e.target.value)}
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
                        placeholder={selectedSetIndex !== null
                            ? `Note for Set #${selectedSetIndex + 1}...`
                            : "Add a note about this activity..."
                        }
                    />
                </div>
            </div>
        </div>
    );
}

export default SessionActivityItem;
