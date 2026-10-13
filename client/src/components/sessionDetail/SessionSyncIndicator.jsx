import React, { useEffect, useState } from 'react';

import { useOutbox, useOutboxStatus } from '../../offline/OutboxContext';
import { SESSION_OP } from '../../offline/sessionOpHandlers';
import Button from '../atoms/Button';
import styles from './SessionSyncIndicator.module.css';

const SYNCED_VISIBLE_MS = 2500;

const TIMER_LABELS = { start: 'Started timer', complete: 'Completed activity', reset: 'Reset timer' };
const CIRCUIT_LABELS = { startRun: 'Started circuit', completeRun: 'Completed circuit', resetRun: 'Reset circuit', deleteRun: 'Removed circuit' };

export function describeOp(op) {
    const name = op.meta?.placeholder?.name || op.meta?.note?.content?.slice(0, 40);
    switch (op.kind) {
        case SESSION_OP.INSTANCE_UPDATE: return 'Activity values';
        case SESSION_OP.ACTIVITY_ADD: return name ? `Added ${name}` : 'Added activity';
        case SESSION_OP.ACTIVITY_REMOVE: return 'Removed activity';
        case SESSION_OP.TIMER: return TIMER_LABELS[op.meta?.action] || 'Timer change';
        case SESSION_OP.PAUSE: return 'Paused session';
        case SESSION_OP.RESUME: return 'Resumed session';
        case SESSION_OP.UPDATE:
            if (op.body?.completed === true) return 'Completed session';
            if (op.body?.completed === false) return 'Reopened session';
            return 'Session layout';
        case SESSION_OP.NOTE_CREATE: return name ? `Note: “${name}”` : 'New note';
        case SESSION_OP.NOTE_UPDATE: return 'Edited note';
        case SESSION_OP.NOTE_DELETE: return 'Deleted note';
        case SESSION_OP.CIRCUIT_RUN: return CIRCUIT_LABELS[op.meta?.action] || 'Circuit change';
        case SESSION_OP.CIRCUIT_MEMBER: return 'Circuit result';
        default: return 'Change';
    }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

/** Where this session's changes are: on the device, syncing, synced, or needing review. */
export default function SessionSyncIndicator({ sessionId, fallback = null, className = '' }) {
    const outbox = useOutbox();
    const status = useOutboxStatus(sessionId);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [dismissedSyncAt, setDismissedSyncAt] = useState(null);
    const showSynced = Boolean(status.lastSyncedAt) && status.lastSyncedAt !== dismissedSyncAt;
    const isReviewOpen = reviewOpen && status.rejected.length > 0;

    // The "synced" confirmation shows briefly after each drain.
    useEffect(() => {
        if (!showSynced) return undefined;
        const syncedAt = status.lastSyncedAt;
        const timer = window.setTimeout(() => setDismissedSyncAt(syncedAt), SYNCED_VISIBLE_MS);
        return () => window.clearTimeout(timer);
    }, [showSynced, status.lastSyncedAt]);

    if (!status.enabled) return fallback;

    let tone = 'muted';
    let label = null;
    if (status.rejected.length > 0) {
        tone = 'danger';
        label = `${plural(status.rejected.length, 'change')} couldn't sync`;
    } else if (status.pausedForAuth && status.pendingCount > 0) {
        tone = 'warning';
        label = `Sign in again to sync ${plural(status.pendingCount, 'change')}`;
    } else if (!status.online) {
        tone = 'warning';
        label = status.pendingCount > 0
            ? `Offline · ${plural(status.pendingCount, 'change')} saved on this device`
            : 'Offline · changes will save on this device';
    } else if (status.pendingCount > 0) {
        label = `Syncing ${plural(status.pendingCount, 'change')}…`;
    } else if (showSynced) {
        tone = 'success';
        label = 'All changes synced';
    }

    if (!label) return fallback;

    return (
        <div className={`${styles.wrapper} ${className}`}>
            {isReviewOpen && (
                <div className={styles.review} role="dialog" aria-label="Changes that couldn't sync">
                    <p className={styles.reviewIntro}>
                        The server didn't accept these. Retry if something has changed, or discard to keep the server's version.
                    </p>
                    <ul className={styles.reviewList}>
                        {status.rejected.map((op) => (
                            <li key={op.opId} className={styles.reviewItem}>
                                <div className={styles.reviewText}>
                                    <span className={styles.reviewTitle}>{describeOp(op)}</span>
                                    <span className={styles.reviewReason}>{op.error?.message || 'Rejected by the server'}</span>
                                </div>
                                <div className={styles.reviewActions}>
                                    <Button size="sm" variant="secondary" onClick={() => void outbox.retry(op.opId)}>
                                        Retry
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => void outbox.discard(op.opId)}>
                                        Discard
                                    </Button>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            )}
            <div className={`${styles.pill} ${styles[tone]}`} role="status" aria-live="polite">
                <span className={styles.dot} aria-hidden="true" />
                <span>{label}</span>
                {status.rejected.length > 0 && (
                    <button
                        type="button"
                        className={styles.reviewToggle}
                        onClick={() => setReviewOpen((open) => !open)}
                        aria-expanded={isReviewOpen}
                    >
                        {isReviewOpen ? 'Hide' : 'Review'}
                    </button>
                )}
            </div>
        </div>
    );
}
