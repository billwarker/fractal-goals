import React, { useState } from 'react';

/**
 * A chart control's number. The field can be emptied and retyped: the chart takes each whole number
 * in range as it's typed, and the default while the field is empty. Leaving the field settles it:
 * empty shows the default, and anything out of range comes back in range.
 *
 * @param {{ label: string, value: number, defaultValue: number, min: number, max: number,
 *   onChange: (value: number) => void, style?: React.CSSProperties }} props
 */
export default function ChartNumberField({ label, value, defaultValue, min, max, onChange, style }) {
    const [draft, setDraft] = useState(null);

    const handleChange = (event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (raw === '') {
            onChange(defaultValue);
            return;
        }
        const next = Number(raw);
        if (Number.isInteger(next) && next >= min && next <= max) onChange(next);
    };
    const settle = () => {
        if (draft) onChange(Math.min(max, Math.max(min, Math.round(Number(draft)))));
        setDraft(null);
    };

    return (
        <label className="sessions-query-field" style={style}>
            <span>{label}</span>
            <input
                type="number"
                inputMode="numeric"
                min={min}
                max={max}
                step="1"
                value={draft ?? value}
                onChange={handleChange}
                onBlur={settle}
                onKeyDown={(event) => {
                    if (event.key === 'Enter') event.currentTarget.blur();
                }}
            />
        </label>
    );
}
