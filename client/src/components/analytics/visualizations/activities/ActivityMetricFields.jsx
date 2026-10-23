import React from 'react';

import '../../../sessions/SessionsQuerySidebar.css';

/**
 * Form fields for choosing what an activity chart plots, shared by Analytics' activity controls
 * and the Session Detail Progress pane. Styled with the sidebar's `sessions-query-*` classes.
 */

const metricLabel = (metric) => `${metric.name}${metric.unit ? ` (${metric.unit})` : ''}`;

/** How a session's sets become one value: Top set or Average (plus Total for yield). */
export function SetsHandlingField({ value = 'top', onChange, allowTotal = false, className = '' }) {
    return (
        <label className={`sessions-query-field ${className}`.trim()}>
            <span>Sets</span>
            <select value={value} onChange={(event) => onChange(event.target.value)}>
                <option value="top">Top Set</option>
                <option value="average">Average</option>
                {allowTotal ? <option value="total">Total</option> : null}
            </select>
        </label>
    );
}

/** One metric from a list; `options` may include the Yield pseudo-metric. */
export function MetricSelectField({ label, value, options = [], onChange, className = '' }) {
    return (
        <label className={`sessions-query-field ${className}`.trim()}>
            <span>{label}</span>
            <select value={value || ''} onChange={(event) => onChange(options.find((metric) => metric.id === event.target.value) || null)}>
                {options.map((metric) => <option key={metric.id} value={metric.id}>{metricLabel(metric)}</option>)}
            </select>
        </label>
    );
}

/** Up to `max` metrics as toggle chips (the last ones picked win). */
export function MetricChipsField({ label = 'Metrics', options = [], selected = [], onChange, max = 2, className = '' }) {
    const toggle = (metricId) => {
        const next = selected.includes(metricId)
            ? selected.filter((id) => id !== metricId)
            : [...selected, metricId].slice(-max);
        onChange(next.length ? next : selected);
    };
    return (
        <div className={className}>
            <div className="sessions-query-sidebar-section-header">
                <h4>{label}</h4>
            </div>
            <div className="sessions-query-chip-group">
                {options.map((metric) => (
                    <button
                        key={metric.id}
                        type="button"
                        className={`sessions-query-chip ${selected.includes(metric.id) ? 'active' : ''}`}
                        aria-pressed={selected.includes(metric.id)}
                        onClick={() => toggle(metric.id)}
                    >
                        {metric.name}
                    </button>
                ))}
            </div>
        </div>
    );
}
