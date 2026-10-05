import React from 'react';
import PropTypes from 'prop-types';

import ProgramDayStatusMark from '../ProgramDayStatusMark';
import styles from './BlockHeaderStats.module.css';

// The scheduled mark counts every scheduled program day in the block, not just those still to come.
const STATUSES = [
    ['complete', 'completed'],
    ['missed', 'missed'],
    ['rest', 'rest'],
    ['scheduled', 'scheduled in total'],
];

function consistencyFigure(consistency) {
    if (!consistency?.scheduled_days_observed || consistency.rate == null) return { value: '—', detail: '' };
    return {
        value: `${Math.round(consistency.rate * 100)}%`,
        detail: `${consistency.met_days}/${consistency.scheduled_days_observed}`,
    };
}

/**
 * A block's results at a glance: its program days by status symbol (the same marks as
 * the calendar), then consistency, how many of the program goals due in the block are
 * done, and the longest streak inside the block.
 */
export default function BlockHeaderStats({ card, compact = false }) {
    if (!card.statusCounts) return null;
    const consistency = consistencyFigure(card.consistency);
    const streak = card.longestStreak ?? 0;
    const metrics = [
        ['Consistency', consistency.value, consistency.detail],
        ['Goals completed/due', `${card.goals?.completed ?? 0}/${card.goals?.due ?? 0}`, ''],
        ['Longest streak', `${streak} ${streak === 1 ? 'day' : 'days'}`, ''],
    ];
    return (
        <div className={`${styles.stats} ${compact ? styles.compact : ''}`}>
            <ul className={styles.statuses} aria-label={`${card.name} program days by status`}>
                {STATUSES.map(([status, label]) => {
                    const count = card.statusCounts[status] ?? 0;
                    return (
                        <li key={status} className={styles.status} title={`${count} ${label}`}>
                            <ProgramDayStatusMark status={status} label={`${count} ${label}`} />
                            <span className={styles.count} aria-hidden="true">{count}</span>
                        </li>
                    );
                })}
            </ul>
            <dl className={styles.metrics}>
                {metrics.map(([label, value, detail]) => (
                    <div key={label} className={styles.metric}>
                        <dt>{label}</dt>
                        <dd>
                            <span className={styles.value}>{value}</span>
                            {detail ? <span className={styles.detail}>{detail}</span> : null}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

BlockHeaderStats.propTypes = {
    card: PropTypes.shape({
        name: PropTypes.string,
        statusCounts: PropTypes.object,
        consistency: PropTypes.object,
        goals: PropTypes.shape({ due: PropTypes.number, completed: PropTypes.number }),
        longestStreak: PropTypes.number,
    }).isRequired,
    compact: PropTypes.bool,
};
