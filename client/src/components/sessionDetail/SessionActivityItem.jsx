import React, { useState, useEffect } from 'react';
import { useTimezone } from '../../contexts/TimezoneContext';
import { formatForInput, localToISO } from '../../utils/dateUtils';
import { fractalApi } from '../../utils/api';
import NoteQuickAdd from './NoteQuickAdd';
import NoteTimeline from './NoteTimeline';

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
    onFocus, // Added prop
    isSelected, // Added prop for styling
    allNotes,
    onAddNote,
    onUpdateNote,
    onDeleteNote
}) {
    // Get timezone from context
    const timezone = useTimezone();

    // Local state for editing datetime fields
    const [localStartTime, setLocalStartTime] = useState('');
    const [localStopTime, setLocalStopTime] = useState('');
    const [selectedSetIndex, setSelectedSetIndex] = useState(null);

    // Filter notes for this activity
    const activityNotes = allNotes?.filter(n => n.activity_instance_id === exercise.id) || [];

    const handleAddNote = async (content) => {
        if (!content.trim() || !onAddNote || !exercise.id) return;

        try {
            await onAddNote({
                context_type: 'activity_instance',
                context_id: exercise.id,
                session_id: sessionId || exercise.practice_session_id,
                activity_instance_id: exercise.id,
                activity_definition_id: activityDefinition?.id,
                set_index: selectedSetIndex,
                content: content.trim()
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

    // Helper to get value for input
    const getMetricValue = (metricsList, metricId, splitId = null) => {
        const m = metricsList?.find(x =>
            x.metric_id === metricId && (splitId ? x.split_id === splitId : !x.split_id)
        );
        return m ? m.value : '';
    };

    return (
        <div
            onClick={(e) => {
                // Prevent triggering when clicking interactive elements that act on their own, 
                // but inputs usually should trigger selection too.
                // We'll let it bubble unless strictly necessary.
                if (onFocus) onFocus();
            }}
            style={{
                background: isSelected ? '#333' : '#2a2a2a',
                border: isSelected ? '1px solid #4caf50' : '1px solid #333',
                // Green border legacy comment removed as we now use it for selection
                borderRadius: '6px',
                padding: '16px',
                cursor: 'default', // Don't show pointer everywhere to avoid confusion with buttons
                boxShadow: isSelected ? '0 0 0 1px rgba(76, 175, 80, 0.2)' : 'none',
                transition: 'all 0.2s ease'
            }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    {/* Reorder Buttons */}
                    {showReorderButtons && (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                            <button
                                onClick={() => onReorder('up')}
                                disabled={!canMoveUp}
                                style={{
                                    background: canMoveUp ? '#333' : 'transparent',
                                    border: '1px solid #555',
                                    borderRadius: '3px',
                                    color: canMoveUp ? '#4caf50' : '#444',
                                    cursor: canMoveUp ? 'pointer' : 'not-allowed',
                                    fontSize: '12px',
                                    padding: '2px 6px',
                                    lineHeight: '1',
                                    width: '24px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Move up"
                            >
                                ▲
                            </button>
                            <button
                                onClick={() => onReorder('down')}
                                disabled={!canMoveDown}
                                style={{
                                    background: canMoveDown ? '#333' : 'transparent',
                                    border: '1px solid #555',
                                    borderRadius: '3px',
                                    color: canMoveDown ? '#4caf50' : '#444',
                                    cursor: canMoveDown ? 'pointer' : 'not-allowed',
                                    fontSize: '12px',
                                    padding: '2px 6px',
                                    lineHeight: '1',
                                    width: '24px',
                                    height: '18px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}
                                title="Move down"
                            >
                                ▼
                            </button>
                        </div>
                    )}
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#4caf50' }}>
                            {def.name} <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>(Activity)</span>
                        </div>
                        {def.description && <div style={{ fontSize: '12px', color: '#aaa' }}>{def.description}</div>}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Timer Controls - New Design */}
                    {exercise.id && (
                        <>
                            {/* DateTime Start Field */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Start</label>
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
                                    style={{
                                        padding: '4px 6px',
                                        background: '#333',
                                        border: '1px solid #555',
                                        borderRadius: '3px',
                                        color: '#ccc',
                                        fontSize: '11px',
                                        width: '160px',
                                        fontFamily: 'monospace'
                                    }}
                                />
                            </div>

                            {/* DateTime Stop Field */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Stop</label>
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
                                    style={{
                                        padding: '4px 6px',
                                        background: exercise.time_start ? '#333' : '#222',
                                        border: '1px solid #555',
                                        borderRadius: '3px',
                                        color: exercise.time_start ? '#ccc' : '#666',
                                        fontSize: '11px',
                                        width: '160px',
                                        fontFamily: 'monospace',
                                        cursor: exercise.time_start ? 'text' : 'not-allowed'
                                    }}
                                />
                            </div>

                            {/* Duration Display */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Duration</label>
                                <div style={{
                                    padding: '4px 8px',
                                    background: '#1a1a1a',
                                    border: '1px solid #444',
                                    borderRadius: '3px',
                                    color: exercise.time_start && exercise.time_stop ? '#4caf50' : '#666',
                                    fontSize: '13px',
                                    fontWeight: 'bold',
                                    fontFamily: 'monospace',
                                    minWidth: '60px',
                                    textAlign: 'center',
                                    height: '26px',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                }}>
                                    {(() => {
                                        if (exercise.time_start && exercise.time_stop) {
                                            const start = new Date(exercise.time_start);
                                            const stop = new Date(exercise.time_stop);
                                            const seconds = Math.floor((stop - start) / 1000);
                                            return formatDuration(seconds);
                                        }
                                        return '--:--';
                                    })()}
                                </div>
                            </div>

                            {/* Start/Stop Button */}
                            {!exercise.time_start ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdate('timer_action', 'start');
                                    }}
                                    style={{
                                        background: '#4caf50',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        padding: '6px 10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginTop: '14px'
                                    }}
                                    title="Start timer"
                                >
                                    ▶ Start
                                </button>
                            ) : !exercise.time_stop ? (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdate('timer_action', 'stop');
                                    }}
                                    style={{
                                        background: '#f44336',
                                        border: 'none',
                                        borderRadius: '4px',
                                        color: 'white',
                                        cursor: 'pointer',
                                        fontSize: '14px',
                                        padding: '6px 10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginTop: '14px'
                                    }}
                                    title="Stop timer"
                                >
                                    ■ Stop
                                </button>
                            ) : null}

                            {/* Reset Button */}
                            {(exercise.time_start || exercise.time_stop) && (
                                <button
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        onUpdate('timer_action', 'reset');
                                    }}
                                    style={{
                                        background: 'transparent',
                                        border: '1px solid #666',
                                        borderRadius: '4px',
                                        color: '#888',
                                        cursor: 'pointer',
                                        fontSize: '12px',
                                        padding: '6px 10px',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '4px',
                                        marginTop: '14px'
                                    }}
                                    title="Reset timer"
                                >
                                    ↺ Reset
                                </button>
                            )}
                        </>
                    )}

                    {/* Delete Button */}
                    <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '18px', marginTop: '14px' }}>×</button>
                </div>
            </div>

            {/* Content Area */}
            <div style={{ marginTop: '15px', paddingLeft: '36px' }}>

                {/* SETS VIEW */}
                {hasSets ? (
                    <div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                            {exercise.sets?.map((set, setIdx) => (
                                <div
                                    key={set.instance_id}
                                    onClick={() => setSelectedSetIndex(selectedSetIndex === setIdx ? null : setIdx)}
                                    style={{
                                        display: 'flex',
                                        gap: '10px',
                                        alignItems: 'center',
                                        background: selectedSetIndex === setIdx ? 'rgba(76, 175, 80, 0.1)' : '#222',
                                        padding: '8px',
                                        borderRadius: '4px',
                                        border: selectedSetIndex === setIdx ? '1px solid #4caf50' : '1px solid transparent',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s'
                                    }}
                                >
                                    <div style={{ width: '30px', color: '#666', fontSize: '12px', fontWeight: 'bold' }}>#{setIdx + 1}</div>

                                    {hasMetrics && (
                                        hasSplits ? (
                                            // Render metrics grouped by split
                                            def.split_definitions.map(split => (
                                                <div key={split.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '4px 8px', background: '#1a1a1a', borderRadius: '3px', border: '1px solid #333' }}>
                                                    <span style={{ fontSize: '10px', color: '#aaa', fontWeight: 'bold', minWidth: '50px' }}>{split.name}</span>
                                                    {def.metric_definitions.map(m => (
                                                        <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                                                            <label style={{ fontSize: '10px', color: '#888' }}>{m.name}</label>
                                                            <input
                                                                type="number"
                                                                style={{ width: '50px', padding: '3px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px', fontSize: '11px' }}
                                                                value={getMetricValue(set.metrics, m.id, split.id)}
                                                                onChange={(e) => handleSetMetricChange(setIdx, m.id, e.target.value, split.id)}
                                                            />
                                                            <span style={{ fontSize: '10px', color: '#666' }}>{m.unit}</span>
                                                        </div>
                                                    ))}
                                                </div>
                                            ))
                                        ) : (
                                            // Render metrics without splits (original behavior)
                                            def.metric_definitions.map(m => (
                                                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                    <label style={{ fontSize: '11px', color: '#888' }}>{m.name}</label>
                                                    <input
                                                        type="number"
                                                        style={{ width: '60px', padding: '4px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '3px' }}
                                                        value={getMetricValue(set.metrics, m.id)}
                                                        onChange={(e) => handleSetMetricChange(setIdx, m.id, e.target.value)}
                                                    />
                                                    <span style={{ fontSize: '11px', color: '#666' }}>{m.unit}</span>
                                                </div>
                                            ))
                                        )
                                    )}

                                    <button onClick={() => handleRemoveSet(setIdx)} style={{ marginLeft: 'auto', background: 'none', border: 'none', color: '#666', cursor: 'pointer' }}>×</button>
                                </div>
                            ))}
                        </div>
                        <button
                            onClick={handleAddSet}
                            style={{ marginTop: '10px', background: '#333', border: '1px dashed #555', color: '#ccc', padding: '6px 12px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px' }}
                        >
                            + Add Set
                        </button>
                    </div>
                ) : (
                    /* SINGLE VIEW (NO SETS) */
                    hasMetrics ? (
                        hasSplits ? (
                            // Render metrics grouped by split in a grid
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                                {def.split_definitions.map(split => (
                                    <div key={split.id} style={{ background: '#222', padding: '10px', borderRadius: '4px', border: '1px solid #333' }}>
                                        <div style={{ fontSize: '12px', color: '#aaa', fontWeight: 'bold', marginBottom: '8px' }}>{split.name}</div>
                                        <div style={{ display: 'flex', gap: '15px', flexWrap: 'wrap' }}>
                                            {def.metric_definitions.map(m => (
                                                <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                                    <label style={{ fontSize: '11px', color: '#888' }}>{m.name} ({m.unit})</label>
                                                    <input
                                                        type="number"
                                                        style={{ width: '80px', padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }}
                                                        value={getMetricValue(exercise.metrics, m.id, split.id)}
                                                        onChange={(e) => handleSingleMetricChange(m.id, e.target.value, split.id)}
                                                    />
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            // Render metrics without splits (original behavior)
                            <div style={{ display: 'flex', gap: '15px' }}>
                                {def.metric_definitions.map(m => (
                                    <div key={m.id} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                        <label style={{ fontSize: '11px', color: '#888' }}>{m.name} ({m.unit})</label>
                                        <input
                                            type="number"
                                            style={{ width: '80px', padding: '6px', background: '#333', border: '1px solid #555', color: 'white', borderRadius: '4px' }}
                                            value={getMetricValue(exercise.metrics, m.id)}
                                            onChange={(e) => handleSingleMetricChange(m.id, e.target.value)}
                                        />
                                    </div>
                                ))}
                            </div>
                        )
                    ) : (
                        <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
                            Track activity based on completion checkbox above.
                        </div>
                    )
                )}

                {/* Quick Note Add */}
                {/* Notes Section - Timeline + Quick Add */}
                <div style={{ marginTop: '15px' }}>
                    {activityNotes.length > 0 && (
                        <div style={{ marginBottom: '10px' }}>
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
            </div>
        </div>
    );
}

export default SessionActivityItem;
