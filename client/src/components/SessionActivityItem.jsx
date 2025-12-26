import React from 'react';

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
    onDelete
}) {
    // If we don't have definition, we can't render much (maybe just name)
    // But we should have it passed in from parent lookups
    const def = activityDefinition || { name: exercise.name || 'Unknown Activity', metric_definitions: [] };
    const hasSets = exercise.has_sets; // Snapshot from creation
    const hasMetrics = exercise.has_metrics;

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

    const handleSetMetricChange = (setIndex, metricId, value) => {
        const newSets = [...(exercise.sets || [])];
        const set = { ...newSets[setIndex] };

        // Find existing metric entry or add it
        const metricIdx = set.metrics.findIndex(m => m.metric_id === metricId);
        if (metricIdx >= 0) {
            set.metrics[metricIdx] = { ...set.metrics[metricIdx], value };
        } else {
            set.metrics.push({ metric_id: metricId, value });
        }

        newSets[setIndex] = set;
        onUpdate('sets', newSets);
    };

    const handleSingleMetricChange = (metricId, value) => {
        const currentMetrics = [...(exercise.metrics || [])];
        const metricIdx = currentMetrics.findIndex(m => m.metric_id === metricId);

        if (metricIdx >= 0) {
            currentMetrics[metricIdx] = { ...currentMetrics[metricIdx], value };
        } else {
            currentMetrics.push({ metric_id: metricId, value });
        }

        onUpdate('metrics', currentMetrics);
    };

    // Helper to get value for input
    const getMetricValue = (metricsList, metricId) => {
        const m = metricsList?.find(x => x.metric_id === metricId);
        return m ? m.value : '';
    };

    return (
        <div style={{
            background: '#2a2a2a',
            border: '1px solid #4caf50', // Green border to distinguish Activity vs regular Exercise
            borderRadius: '6px',
            padding: '16px'
        }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                <div style={{ display: 'flex', gap: '12px', alignItems: 'center' }}>
                    <div>
                        <div style={{ fontWeight: 'bold', fontSize: '16px', color: '#4caf50' }}>
                            {exercise.name} <span style={{ fontSize: '11px', color: '#888', fontWeight: 'normal' }}>(Activity)</span>
                        </div>
                        {exercise.description && <div style={{ fontSize: '12px', color: '#aaa' }}>{exercise.description}</div>}
                    </div>
                </div>

                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                    {/* Timer Controls - New Design */}
                    {exercise.instance_id && (
                        <>
                            {/* DateTime Start Field */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Start</label>
                                <input
                                    type="datetime-local"
                                    value={exercise.time_start ? new Date(exercise.time_start).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            onUpdate('time_start', new Date(e.target.value).toISOString());
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
                                        width: '140px',
                                        fontFamily: 'monospace'
                                    }}
                                />
                            </div>

                            {/* DateTime Stop Field */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                <label style={{ fontSize: '9px', color: '#888', textTransform: 'uppercase' }}>Stop</label>
                                <input
                                    type="datetime-local"
                                    value={exercise.time_stop ? new Date(exercise.time_stop).toISOString().slice(0, 16) : ''}
                                    onChange={(e) => {
                                        if (e.target.value) {
                                            onUpdate('time_stop', new Date(e.target.value).toISOString());
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
                                        width: '140px',
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
                                <div key={set.instance_id} style={{ display: 'flex', gap: '10px', alignItems: 'center', background: '#222', padding: '8px', borderRadius: '4px' }}>
                                    <div style={{ width: '30px', color: '#666', fontSize: '12px', fontWeight: 'bold' }}>#{setIdx + 1}</div>

                                    {hasMetrics && def.metric_definitions.map(m => (
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
                                    ))}

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
                    ) : (
                        <div style={{ color: '#666', fontSize: '13px', fontStyle: 'italic' }}>
                            Track activity based on completion checkbox above.
                        </div>
                    )
                )}

                {/* Notes for Activity */}
                <div style={{ marginTop: '15px' }}>
                    <input
                        type="text"
                        placeholder="Notes..."
                        value={exercise.notes || ''}
                        onChange={(e) => onUpdate('notes', e.target.value)}
                        style={{ width: '100%', background: 'transparent', border: 'none', borderBottom: '1px solid #444', color: '#ccc', fontSize: '13px', padding: '4px' }}
                    />
                </div>
            </div>
        </div>
    );
}

export default SessionActivityItem;
