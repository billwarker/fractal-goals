import React from 'react';
import PropTypes from 'prop-types';

import styles from './ProgramDayStatusMark.module.css';

function RestMoon() {
    return (
        <svg className={styles.moon} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
            <path d="M10.92 5.12A8.5 8.5 0 1 0 17.78 15.41A6.2 6.2 0 0 1 10.92 5.12Z" fill="currentColor" />
            <path d="M14 8.5h3.5l-3.5 4h3.5M19 3.5h2.5l-2.5 3h2.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
    );
}

function renderSymbol(status) {
    if (status === 'complete') return '✓';
    if (status === 'missed') return '✗';
    if (status === 'rest') return <RestMoon />;
    return <span className={styles.circle} />;
}

/**
 * The one program-day status symbol: a check when met, an X when missed, a moon
 * for rest, and a blue circle while scheduled. Decorative marks rely on adjacent
 * accessible text.
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
            {renderSymbol(status)}
        </span>
    );
}

ProgramDayStatusMark.propTypes = {
    status: PropTypes.oneOf(['complete', 'rest', 'missed', 'scheduled']).isRequired,
    label: PropTypes.string,
    size: PropTypes.oneOf(['sm', 'md']),
    decorative: PropTypes.bool,
    className: PropTypes.string,
};
