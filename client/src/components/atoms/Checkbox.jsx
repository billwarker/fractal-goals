import React from 'react';
import styles from './Checkbox.module.css';

/**
 * Standardized Checkbox Component
 */
const Checkbox = ({
    label,
    checked,
    onChange,
    disabled = false,
    className = '',
    id,
    ...props
}) => {
    const inputId = id || Math.random().toString(36).substr(2, 9);

    return (
        <label
            htmlFor={inputId}
            className={`${styles.container} ${disabled ? styles.disabled : ''} ${className}`}
        >
            <input
                id={inputId}
                type="checkbox"
                className={styles.input}
                checked={checked}
                onChange={onChange}
                disabled={disabled}
                {...props}
            />
            <span className={styles.checkmark}></span>
            {label && <span className={styles.label}>{label}</span>}
        </label>
    );
};

export default Checkbox;
