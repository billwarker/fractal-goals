import React from 'react';

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

                <div style={{ display: 'flex', gap: '10px' }}>
                    {/* Add any top level controls here */}
                    <button onClick={onDelete} style={{ background: 'none', border: 'none', color: '#f44336', cursor: 'pointer', fontSize: '18px' }}>×</button>
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
