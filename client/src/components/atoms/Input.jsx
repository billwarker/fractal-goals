import React, { forwardRef } from 'react';
import styles from './Input.module.css';

/**
 * Standardized Input Component
 */
const Input = forwardRef(({
    label,
    error,
    fullWidth = false,
    className = '',
    id,
    type = 'text',
    ...props
}, ref) => {
    const inputId = id || props.name || Math.random().toString(36).substr(2, 9);
    const errorId = error ? `${inputId}-error` : undefined;

    return (
        <div className={`${styles.container} ${fullWidth ? styles.fullWidth : ''} ${className}`}>
            {label && (
                <label htmlFor={inputId} className={styles.label}>
                    {label}
                </label>
            )}
            <input
                ref={ref}
                id={inputId}
                type={type}
                className={`${styles.input} ${error ? styles.hasError : ''}`}
                aria-invalid={!!error}
                aria-describedby={errorId}
                {...props}
            />
            {error && <span id={errorId} role="alert" className={styles.errorMessage}>{error}</span>}
        </div>
    );
});

Input.displayName = 'Input';

export default Input;
