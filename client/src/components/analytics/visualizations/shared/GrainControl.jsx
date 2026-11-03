import React from 'react';

import { MAX_CHART_POINTS } from '../../../../utils/chartGrain';

const GRAIN_OPTIONS = [
    { value: 'auto', label: 'Auto' },
    { value: 'day', label: 'Day' },
    { value: 'week', label: 'Week' },
    { value: 'month', label: 'Month' },
];

const PLURAL = { day: 'days', week: 'weeks', month: 'months' };

/** What the chart drew, when that isn't simply the chip that's selected. */
export function shownGrainNote(value, shownGrain) {
    if (!PLURAL[shownGrain]) return null;
    if (value === 'auto') return `Showing ${PLURAL[shownGrain]}.`;
    if (PLURAL[value] && value !== shownGrain) {
        return `Showing ${PLURAL[shownGrain]}: ${PLURAL[value]} would be more than ${MAX_CHART_POINTS} bars for this range.`;
    }
    return null;
}

/**
 * Bucket size for time charts. Auto picks days, weeks or months from the range; a size too fine
 * for the range is coarsened to fit MAX_CHART_POINTS bars (utils/chartGrain.js). The chart reports
 * the grain it drew as `context.shownGrain`, and the note says so whenever it isn't the chip shown.
 */
export default function GrainControl({ context }) {
    const value = context.visualizationState.grain || 'auto';
    const note = shownGrainNote(value, context.shownGrain);
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
            {note ? <p className="sessions-query-empty" role="status">{note}</p> : null}
        </div>
    );
}
