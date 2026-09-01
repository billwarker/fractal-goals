import React, { useEffect, useMemo, useRef } from 'react';

import {
    formatAllowedMetricValueLabel,
    formatMetricValueForInput,
    getAllowedMetricValues,
    getMetricInputProps,
    normalizeMetricValueForStorage,
} from '../../utils/sessionActivityMetrics';
import styles from './SessionActivityItem.module.css';


export default function MetricValueEditor({
    metricDef,
    value,
    inputClassName,
    metaClassName,
    unitClassName,
    onDraftChange,
    onCommit,
    progress = null,
    isDraft = false,
    disabled = false,
    inputId,
}) {
    const allowedValues = useMemo(() => getAllowedMetricValues(metricDef), [metricDef]);
    const formattedValue = isDraft ? String(value ?? '') : formatMetricValueForInput(metricDef, value);
    const inputRef = useRef(null);
    const selectedAllowedValue = allowedValues.length > 0
        ? normalizeMetricValueForStorage(metricDef, value)
        : null;

    useEffect(() => {
        const input = inputRef.current;
        if (!input || document.activeElement === input || input.value === formattedValue) return;
        input.value = formattedValue;
    }, [formattedValue]);

    return (
        <>
            <div className={styles.metricValueControl}>
                {allowedValues.length > 0 ? (
                    <select
                        id={inputId}
                        className={`${inputClassName} ${styles.metricSelect}`}
                        value={allowedValues.includes(String(selectedAllowedValue)) ? String(selectedAllowedValue) : ''}
                        disabled={disabled}
                        onChange={(event) => {
                            const nextValue = allowedValues.includes(event.target.value) ? event.target.value : '';
                            onDraftChange(nextValue);
                            onCommit(nextValue);
                        }}
                    >
                        <option value="">--</option>
                        {allowedValues.map((allowedValue) => (
                            <option key={`${metricDef.id}-${allowedValue}`} value={allowedValue}>
                                {formatAllowedMetricValueLabel(metricDef, allowedValue)}
                            </option>
                        ))}
                    </select>
                ) : (
                    <input
                        {...getMetricInputProps(metricDef)}
                        ref={inputRef}
                        id={inputId}
                        className={inputClassName}
                        defaultValue={formattedValue}
                        disabled={disabled}
                        onChange={(event) => {
                            const nextValue = event.target.value;
                            onDraftChange(nextValue);
                        }}
                        onBlur={(event) => {
                            const didCommit = onCommit(event.target.value);
                            if (didCommit !== false) {
                                const normalizedValue = normalizeMetricValueForStorage(metricDef, event.target.value);
                                if (normalizedValue != null) {
                                    event.currentTarget.value = formatMetricValueForInput(metricDef, normalizedValue);
                                }
                            }
                        }}
                        onKeyDown={(event) => {
                            if (event.key === 'Enter') event.currentTarget.blur();
                        }}
                    />
                )}
            </div>
            <span className={metaClassName}>
                <span className={unitClassName}>{metricDef.unit}</span>
                {progress}
            </span>
        </>
    );
}
