import React from 'react';

/** The measure chips: a count or time, one at a time. */
export default function MeasureControl({ options, value, onChange }) {
    return (
        <>
            <div className="sessions-query-sidebar-section-header">
                <h4>Measure</h4>
            </div>
            <div className="sessions-query-chip-group">
                {options.map((option) => (
                    <button
                        key={option.value}
                        type="button"
                        className={`sessions-query-chip ${value === option.value ? 'active' : ''}`}
                        aria-pressed={value === option.value}
                        onClick={() => onChange(option.value)}
                    >
                        {option.label}
                    </button>
                ))}
            </div>
        </>
    );
}
