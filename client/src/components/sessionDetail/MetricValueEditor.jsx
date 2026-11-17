import React, { useEffect, useId, useMemo, useRef, useState } from 'react';

import MathKeyBar, { hasCoarsePointer, MathKeysToggle } from '../common/MathKeyBar';
import mathStyles from '../common/MathKeyBar.module.css';
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
    onFocus,
    progress = null,
    isDraft = false,
    disabled = false,
    readOnly = false,
    inputId,
    placeholder,
    ariaLabel,
}) {
    const allowedValues = useMemo(() => getAllowedMetricValues(metricDef), [metricDef]);
    const formattedValue = isDraft ? String(value ?? '') : formatMetricValueForInput(metricDef, value);
    const inputRef = useRef(null);
    const unitId = useId();
    const selectedAllowedValue = allowedValues.length > 0
        ? normalizeMetricValueForStorage(metricDef, value)
        : null;
    // Number fields take arithmetic ("2.5*4"). Touch keypads have no operators, so on touch screens
    // a +− button beside the field opens them beneath it.
    const [coarsePointer] = useState(hasCoarsePointer);
    const offersMathKeys = coarsePointer && metricDef?.input_type !== 'duration' && !disabled && !readOnly;
    const [showMathKeys, setShowMathKeys] = useState(false);

    useEffect(() => {
        const input = inputRef.current;
        if (!input || document.activeElement === input || input.value === formattedValue) return;
        input.value = formattedValue;
    }, [formattedValue]);

    const valueInput = (
        <input
            {...getMetricInputProps(metricDef)}
            {...(placeholder != null ? { placeholder } : {})}
            ref={inputRef}
            id={inputId}
            aria-label={ariaLabel || metricDef.name}
            aria-describedby={unitId}
            className={inputClassName}
            defaultValue={formattedValue}
            disabled={disabled}
            readOnly={readOnly}
            onFocus={onFocus}
            onChange={(event) => {
                const nextValue = event.target.value;
                onDraftChange(nextValue);
            }}
            onBlur={(event) => {
                setShowMathKeys(false);
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
    );

    return (
        <>
            <div className={styles.metricValueControl}>
                {allowedValues.length > 0 ? (
                    <select
                        id={inputId}
                        aria-label={ariaLabel || metricDef.name}
                        aria-describedby={unitId}
                        className={`${inputClassName} ${styles.metricSelect}`}
                        value={allowedValues.includes(String(selectedAllowedValue)) ? String(selectedAllowedValue) : ''}
                        disabled={disabled || readOnly}
                        onFocus={onFocus}
                        onChange={(event) => {
                            const nextValue = allowedValues.includes(event.target.value) ? event.target.value : '';
                            onDraftChange(nextValue);
                            onCommit(nextValue);
                        }}
                    >
                        <option value="">{placeholder ?? '--'}</option>
                        {allowedValues.map((allowedValue) => (
                            <option key={`${metricDef.id}-${allowedValue}`} value={allowedValue}>
                                {formatAllowedMetricValueLabel(metricDef, allowedValue)}
                            </option>
                        ))}
                    </select>
                ) : offersMathKeys ? (
                    <div className={mathStyles.field}>
                        {valueInput}
                        <MathKeysToggle
                            open={showMathKeys}
                            onToggle={() => {
                                setShowMathKeys((open) => !open);
                                inputRef.current?.focus();
                            }}
                        />
                        {showMathKeys ? <MathKeyBar inputRef={inputRef} /> : null}
                    </div>
                ) : valueInput}
            </div>
            <span className={metaClassName}>
                <span id={unitId} className={unitClassName}>{metricDef.unit}</span>
                <span className={styles.metricHints}>{progress}</span>
            </span>
        </>
    );
}
