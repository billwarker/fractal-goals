import React from 'react';

import CompletionCheckIcon from '../atoms/CompletionCheckIcon';
import styles from './CompletionCheckBadge.module.css';

function CompletionCheckBadge({
    checked = true,
    label,
    className = '',
}) {
    const accessibleLabel = label || (checked ? 'Completed' : 'Incomplete');

    return (
        <span
            className={`${styles.badge} ${checked ? styles.checked : styles.unchecked} ${className}`.trim()}
            aria-label={accessibleLabel}
        >
            <CompletionCheckIcon checked={checked} className={styles.mark} />
        </span>
    );
}

export default CompletionCheckBadge;
