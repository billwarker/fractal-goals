import React from 'react';

import styles from './CompactChartFrame.module.css';

/** A compact chart with its one-line caption (in place of the title and legend). */
export default function CompactChartFrame({ caption, children }) {
    if (!caption) return children;
    return (
        <div className={styles.frame}>
            <div className={styles.chart}>{children}</div>
            <p className={styles.caption}>{caption}</p>
        </div>
    );
}
