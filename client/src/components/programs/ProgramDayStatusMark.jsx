import React from 'react';
import PropTypes from 'prop-types';

import styles from './ProgramDayStatusMark.module.css';

/**
 * The one program-day status symbol: a check when met, an X when missed, and a
 * blue circle while scheduled. Decorative marks rely on adjacent accessible text.
 */
export default function ProgramDayStatusMark({ status, label = '', size = 'md', decorative = false, className = '' }) {
    return (
        <span
            className={`${styles.mark} ${styles[size]} ${styles[status]} ${className}`.trim()}
            role={decorative ? undefined : 'img'}
            aria-label={decorative ? undefined : label}
            aria-hidden={decorative ? 'true' : undefined}
            data-program-day-status={status}
        >
            {status === 'complete' ? '✓' : status === 'missed' ? '✗' : <span className={styles.circle} />}
        </span>
    );
}

ProgramDayStatusMark.propTypes = {
    status: PropTypes.oneOf(['complete', 'missed', 'scheduled']).isRequired,
    label: PropTypes.string,
    size: PropTypes.oneOf(['sm', 'md']),
    decorative: PropTypes.bool,
    className: PropTypes.string,
};
