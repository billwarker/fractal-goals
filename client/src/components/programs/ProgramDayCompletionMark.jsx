import React from 'react';
import PropTypes from 'prop-types';

import styles from './ProgramDayCompletionMark.module.css';

export default function ProgramDayCompletionMark({ complete, label, size = 'md', className = '' }) {
    return (
        <span
            className={`${styles.mark} ${styles[size]} ${complete ? styles.complete : styles.incomplete} ${className}`.trim()}
            role="img"
            aria-label={label}
            data-program-day-complete={complete ? 'true' : 'false'}
        >
            {complete ? '✓' : '✗'}
        </span>
    );
}

ProgramDayCompletionMark.propTypes = {
    complete: PropTypes.bool.isRequired,
    label: PropTypes.string.isRequired,
    size: PropTypes.oneOf(['sm', 'md']),
    className: PropTypes.string,
};
