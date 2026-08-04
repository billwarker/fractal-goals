import React from 'react';

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
    const allowedValues = getAllowedMetricValues(metricDef);
    const displayValue = isDraft ? String(value ?? '') : formatMetricValueForInput(metricDef, value);
    const selectedAllowedValue = normalizeMetricValueForStorage(metricDef, value);

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
                        id={inputId}
                        className={inputClassName}
                        value={displayValue}
                        disabled={disabled}
                        onChange={(event) => onDraftChange(event.target.value)}
                        onBlur={(event) => onCommit(event.target.value)}
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
