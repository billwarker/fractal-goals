import React from 'react';
import PropTypes from 'prop-types';

import ProgramDayStatusMark from './ProgramDayStatusMark';
import styles from './ProgramDayStatusCounts.module.css';

// The scheduled mark counts every scheduled date, not just those still to come.
const STATUSES = [
    ['complete', 'completed'],
    ['missed', 'missed'],
    ['rest', 'rest'],
    ['scheduled', 'scheduled in total'],
];

/**
 * Scheduled program-day dates by status symbol (the same marks as the calendar), as on block
 * cards and each Days-tab program day.
 */
export default function ProgramDayStatusCounts({ counts, label, size = 'md', className = '' }) {
    return (
        <ul className={`${styles.statuses} ${styles[size]} ${className}`.trim()} aria-label={label}>
            {STATUSES.map(([status, text]) => {
                const count = counts[status] ?? 0;
                return (
                    <li key={status} className={styles.status} title={`${count} ${text}`}>
                        <ProgramDayStatusMark status={status} size={size} label={`${count} ${text}`} />
                        <span className={styles.count} aria-hidden="true">{count}</span>
                    </li>
                );
            })}
        </ul>
    );
}

ProgramDayStatusCounts.propTypes = {
    counts: PropTypes.object.isRequired,
    label: PropTypes.string.isRequired,
    size: PropTypes.oneOf(['sm', 'md']),
    className: PropTypes.string,
};
