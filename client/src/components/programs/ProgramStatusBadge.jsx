import React from 'react';
import PropTypes from 'prop-types';

import styles from './ProgramStatusBadge.module.css';

const LABELS = {
    active: 'Active',
    upcoming: 'Upcoming',
    completed: 'Completed',
    inactive: 'Inactive',
};

// Blocks report current/finished; they read the same as a program's active/completed.
const ALIASES = { current: 'active', finished: 'completed' };

/** The status pill shared by programs and their blocks: Active, Upcoming, Completed, or Inactive. */
export default function ProgramStatusBadge({ status, className = '' }) {
    const normalized = ALIASES[status] || status;
    const variant = LABELS[normalized] ? normalized : 'inactive';
    return (
        <span className={`${styles.badge} ${styles[variant]} ${className}`.trim()} data-status={variant}>
            {LABELS[variant]}
        </span>
    );
}

ProgramStatusBadge.propTypes = {
    status: PropTypes.string,
    className: PropTypes.string,
};
