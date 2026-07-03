import React, { forwardRef, useId } from 'react';

import styles from './Radio.module.css';

/**
 * Radio - shared labeled radio input primitive.
 */
const Radio = forwardRef(({
    id,
    label,
    className = '',
    inputClassName = '',
    ...props
}, ref) => {
    const generatedId = useId();
    const inputId = id || generatedId;

    return (
        <label className={`${styles.field} ${className}`.trim()} htmlFor={inputId}>
            <input
                ref={ref}
                id={inputId}
                type="radio"
                className={`${styles.radio} ${inputClassName}`.trim()}
                {...props}
            />
            {label}
        </label>
    );
});

Radio.displayName = 'Radio';

export default Radio;
