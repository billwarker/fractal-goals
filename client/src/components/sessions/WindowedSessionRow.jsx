import React from 'react';

import styles from './WindowedSessionRow.module.css';

/** Keep cards available while the browser defers offscreen layout and paint. */
export default function WindowedSessionRow({ children, pinned = false }) {
    return (
        <div
            className={`${styles.row} ${pinned ? styles.pinned : ''}`.trim()}
            data-session-window-row
        >
            {children}
        </div>
    );
}
