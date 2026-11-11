import React from 'react';

import styles from './ActivityPlanNote.module.css';

/**
 * The plan's note for this activity, at the top of its card. Set-level plan notes stay beside their
 * sets; notes pinned from earlier sessions lead the card's notes instead.
 */
export default function ActivityPlanNote({ planNote = null }) {
    if (!planNote) return null;
    return (
        <div className={styles.item}>
            <span className={styles.source}>From plan</span>
            <p className={styles.text}>{planNote}</p>
        </div>
    );
}
