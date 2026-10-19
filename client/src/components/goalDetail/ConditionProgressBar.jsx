import React from 'react';

import styles from './ConditionProgressBar.module.css';

/** A goal's progress toward its own completion condition. */
function ConditionProgressBar({ fraction, label, met = false, accentColor, compact = false }) {
    const percent = Math.round(Math.max(0, Math.min(1, fraction || 0)) * 100);
    return (
        <div
            className={`${styles.progress} ${compact ? styles.compact : ''}`}
            style={{ '--condition-accent': accentColor || 'var(--color-brand-primary)' }}
        >
            <div
                className={styles.track}
                role="progressbar"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={percent}
                aria-label={label ? `Progress: ${label}` : 'Progress'}
            >
                <div className={`${styles.fill} ${met ? styles.met : ''}`} style={{ width: `${percent}%` }} />
            </div>
            {label ? <span className={styles.label}>{label}</span> : null}
        </div>
    );
}

export default ConditionProgressBar;
