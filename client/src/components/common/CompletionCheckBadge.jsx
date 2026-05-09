import React from 'react';

import CompletionCheckIcon from '../atoms/CompletionCheckIcon';
import CompletionInProgressIcon from '../atoms/CompletionInProgressIcon';
import CompletionPauseIcon from '../atoms/CompletionPauseIcon';
import styles from './CompletionCheckBadge.module.css';

function CompletionCheckBadge({
    checked = true,
    inProgress = false,
    paused = false,
    label,
    className = '',
}) {
    let defaultLabel = 'Incomplete';
    if (paused) {
        defaultLabel = 'Paused';
    } else if (checked) {
        defaultLabel = 'Completed';
    } else if (inProgress) {
        defaultLabel = 'In progress';
    }
    const accessibleLabel = label || defaultLabel;
    let statusClass = styles.unchecked;
    if (paused) {
        statusClass = styles.paused;
    } else if (checked) {
        statusClass = styles.checked;
    } else if (inProgress) {
        statusClass = styles.inProgress;
    }

    return (
        <span
            className={`${styles.badge} ${statusClass} ${className}`.trim()}
            aria-label={accessibleLabel}
        >
            {paused ? (
                <CompletionPauseIcon className={styles.mark} />
            ) : inProgress ? (
                <CompletionInProgressIcon className={styles.mark} />
            ) : (
                <CompletionCheckIcon checked={checked} className={styles.mark} />
            )}
        </span>
    );
}

export default CompletionCheckBadge;
