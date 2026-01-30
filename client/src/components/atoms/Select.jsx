import React, { forwardRef } from 'react';
import styles from './Input.module.css';

/**
 * Standardized Select Component
 * Reuses Input styles for consistency
 */
const Select = forwardRef(({
    label,
    error,
    fullWidth = false,
    className = '',
    id,
    children,
    ...props
}, ref) => {
    const selectId = id || props.name || Math.random().toString(36).substr(2, 9);

    return (
        <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
            {label && (
                <label htmlFor={selectId} className={styles.label}>
                    {label}
                </label>
            )}
            <select
                ref={ref}
                id={selectId}
                className={`${styles.input} ${error ? styles.hasError : ''}`}
                {...props}
            >
                {children}
            </select>
            {error && <span className={styles.errorMessage}>{error}</span>}
        </div>
    );
});

Select.displayName = 'Select';

export default Select;
