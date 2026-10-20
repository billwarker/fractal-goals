import React from 'react';

import { describeGoalDue } from '../../utils/goalDueFormat';
import styles from './GoalDueText.module.css';

/**
 * A goal's due date as inline text, e.g. "Due: 2.4mo": green when there's time, amber within a
 * week, red once overdue. Renders nothing without a due date.
 */
export default function GoalDueText({ deadline, today, className = '' }) {
    const due = describeGoalDue(deadline, today);
    if (!due) return null;
    return (
        <span className={`${styles.due} ${className}`.trim()} data-due-tone={due.tone} title={due.description}>
            <span aria-hidden="true">Due: {due.label}</span>
            <span className={styles.assistive}>{due.description}</span>
        </span>
    );
}
