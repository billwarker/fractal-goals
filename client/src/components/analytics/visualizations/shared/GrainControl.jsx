import React from 'react';

const GRAIN_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
];

/**
 * Bucket size for time charts. Auto picks days, weeks or months from the range; a size too fine
 * for the range is coarsened so the chart stays readable (utils/chartGrain.js).
 */
export default function GrainControl({ context }) {
    const value = context.visualizationState.grain || 'auto';
    return (
        <div className="sessions-query-field" style={{ marginTop: 12 }}>
            <span id="analytics-grain-label">Bucket size</span>
            <div className="sessions-query-chip-group" role="group" aria-labelledby="analytics-grain-label">
                {GRAIN_OPTIONS.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${value === option.value ? 'active' : ''}`}
                        aria-pressed={value === option.value}
                        onClick={() => context.updateVisualizationState({ grain: option.value })}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </div>
    );
}
