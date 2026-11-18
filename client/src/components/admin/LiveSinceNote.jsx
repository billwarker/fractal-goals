import React from 'react';

import styles from '../../pages/Admin.module.css';

/**
 * Exported analytics leave Postgres after the live window, so a chart reaching further
 * back than the oldest row left says where the earlier days are.
 */
function LiveSinceNote({ liveSince, windowStart }) {
    const since = liveSince?.slice(0, 10);
    if (!since || !windowStart || since <= windowStart) return null;
    return (
        <p className={styles.muted}>
            Postgres holds these events from {since}; earlier days, if any, are in BigQuery (fractal_analytics).
        </p>
    );
}

export default LiveSinceNote;
