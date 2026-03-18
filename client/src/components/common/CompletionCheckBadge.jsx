import React from 'react';

import styles from './CompletionCheckBadge.module.css';

function CompletionCheckBadge({ label = 'Completed session', className = '' }) {
    return (
        <span className={`${styles.badge} ${className}`.trim()} aria-label={label}>
            <span className={styles.mark}>✓</span>
        </span>
    );
}

export default CompletionCheckBadge;
