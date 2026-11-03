import React from 'react';

import styles from './ChartTitle.module.css';

/** The chart's number and name, styled the same in the pane header and the sidebar. */
export default function ChartTitle({ number, name, active = true, className = '' }) {
    return (
        <span className={`${styles.title} ${active ? styles.active : ''} ${className}`.trim()}>
            {number ? <span className={styles.number} aria-hidden="true">{number}</span> : null}
            <span className={styles.name}>{name}</span>
        </span>
    );
}
