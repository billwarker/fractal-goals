import React from 'react';

const METRIC_OPTIONS = [
    { value: 'instances', label: 'Instances' },
    { value: 'duration', label: 'Duration' },
];

export default function ActivityTotalsControls({ selectedWindowState, updateSelectedWindow }) {
    const selectedMetric = selectedWindowState?.activityTotalsMetric || 'instances';
    const selectedLimit = selectedWindowState?.activityTotalsLimit || 15;

    return (
        <>
            <div className="sessions-query-chip-group">
                {METRIC_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${selectedMetric === option.value ? 'active' : ''}`}
                        onClick={() => updateSelectedWindow({ activityTotalsMetric: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
            <label className="sessions-query-checkbox-row">
                <input
                    type="checkbox"
                    checked={Boolean(selectedWindowState?.activityTotalsShowGroups)}
                    onChange={(event) => updateSelectedWindow({ activityTotalsShowGroups: event.target.checked })}
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
                        updateSelectedWindow({ activityTotalsLimit: nextLimit });
                    }}
                />
            </label>
        </>
    );
}
