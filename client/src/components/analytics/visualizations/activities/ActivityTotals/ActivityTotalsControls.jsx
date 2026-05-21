import React from 'react';

const METRIC_OPTIONS = [
    { value: 'instances', label: 'Instances' },
    { value: 'duration', label: 'Duration' },
];

export default function ActivityTotalsControls({
    visualizationState = {},
    updateVisualizationState,
}) {
    const selectedMetric = visualizationState.metric || 'instances';
    const selectedLimit = visualizationState.limit || 15;
    const showGroups = visualizationState.showGroups;
    const updateState = (updates) => updateVisualizationState?.(updates);

    return (
        <>
            <div className="sessions-query-chip-group">
                {METRIC_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${selectedMetric === option.value ? 'active' : ''}`}
                        onClick={() => updateState({ metric: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <label className="sessions-query-checkbox-row">
                <input
                    type="checkbox"
                    checked={Boolean(showGroups)}
                    onChange={(event) => updateState({ showGroups: event.target.checked })}
                />
                <span>Show activity groups in hover</span>
            </label>
            <label className="sessions-query-field" style={{ marginTop: 12 }}>
                <span>Activity Limit</span>
                <input
                    type="number"
                    min="1"
                    max="50"
                    step="1"
                    value={selectedLimit}
                    onChange={(event) => {
                        const nextLimit = Math.min(50, Math.max(1, Number(event.target.value) || 15));
                        updateState({ limit: nextLimit });
                    }}
                />
            </label>
        </>
    );
}
