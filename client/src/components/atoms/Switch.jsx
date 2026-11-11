import React from 'react';

import styles from './Switch.module.css';

/**
 * An on/off control for settings that apply immediately. `onChange` receives the new value.
 * Name it with a visible <label htmlFor={id}> or `aria-label`.
 */
function Switch({ checked, onChange, disabled = false, id, className = '', ...props }) {
    return (
        <button
            type="button"
            role="switch"
            id={id}
            aria-checked={Boolean(checked)}
            disabled={disabled}
            className={`${styles.switch} ${className}`.trim()}
            onClick={() => onChange(!checked)}
            {...props}
        >
            <span className={styles.thumb} aria-hidden="true" />
        </button>
    );
}

export default Switch;
