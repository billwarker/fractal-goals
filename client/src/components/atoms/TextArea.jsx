import React, { forwardRef } from 'react';
import styles from './Input.module.css';

/**
 * Standardized TextArea Component
 * Reuses Input styles for consistency
 */
const TextArea = forwardRef(({
    label,
    error,
    fullWidth = false,
    className = '',
    id,
    rows = 4,
    ...props
}, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substr(2, 9);

    return (
        <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
            {label && (
                <label htmlFor={inputId} className={styles.label}>
                    {label}
                </label>
            )}
            <textarea
                ref={ref}
                id={inputId}
                rows={rows}
                className={`${styles.input} ${error ? styles.hasError : ''}`}
                style={{ resize: 'vertical' }}
                {...props}
            />
            {error && <span className={styles.errorMessage}>{error}</span>}
        </div>
    );
});

TextArea.displayName = 'TextArea';

export default TextArea;
