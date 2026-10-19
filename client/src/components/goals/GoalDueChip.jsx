import React from 'react';

import { describeGoalDue } from '../../utils/goalDueFormat';
import Badge from '../atoms/Badge';
import styles from './GoalDueChip.module.css';

const TONE_VARIANTS = { normal: 'neutral', soon: 'warning', overdue: 'danger' };

/**
 * A goal's due date as a compact badge: relative within 30 days, amber within a week, red when
 * overdue. Renders nothing without a due date.
 */
export default function GoalDueChip({ deadline, today, className = '' }) {
    const due = describeGoalDue(deadline, today);
    if (!due) return null;
    return (
        <Badge
            variant={TONE_VARIANTS[due.tone]}
            size="sm"
            className={`${styles.due} ${className}`}
            title={due.description}
            data-due-tone={due.tone}
        >
            <span aria-hidden="true">{due.label}</span>
            <span className={styles.assistive}>{due.description}</span>
        </Badge>
    );
}
