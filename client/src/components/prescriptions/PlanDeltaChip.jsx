import React from 'react';

import Badge from '../atoms/Badge';
import { formatCopyDate } from '../../utils/planCopy';
import styles from './PlanComparison.module.css';

/**
 * A set's or value's change from the compared plan, inline as on the session page: `new` for a
 * set it didn't have, else each change (▲/▼ for better/worse, `0%` muted when equal).
 */
export const deltaTone = (change) => {
    if (change.improved == null) return styles.unchanged;
    return change.improved ? styles.improved : styles.regressed;
};

const describeChange = (change) => {
    if (change.improved == null) return 'unchanged';
    return `${change.improved ? 'up' : 'down'} ${change.label.replace(/[▲▼]/, '')}`;
};

export default function PlanDeltaChip({ deltas = [], isNew = false, subject, comparisonDate }) {
    const from = comparisonDate ? ` from ${formatCopyDate(comparisonDate)}` : '';
    if (isNew) {
        return <Badge size="sm" aria-label={`${subject} is new${from}`}>new</Badge>;
    }
    if (!deltas.length) return null;
    return (
        <span className={styles.deltas}>
            {deltas.map((change) => (
                <span
                    key={change.key}
                    className={`${styles.delta} ${deltaTone(change)}`}
                    aria-label={`${subject} ${change.metric} ${describeChange(change)}${from}`}
                    title={`${change.metric}${from}`}
                >
                    ({change.label})
                </span>
            ))}
        </span>
    );
}
