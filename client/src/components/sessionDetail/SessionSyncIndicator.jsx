import React, { useEffect, useState } from 'react';

import { useOutbox, useOutboxStatus } from '../../offline/OutboxContext';
import { SESSION_OP } from '../../offline/opKinds';
import { STALLED_AFTER_MS, describeQueueForSupport } from '../../offline/outboxQueue';
import { REJECTED_TTL_MS } from '../../offline/outboxReview';
import notify from '../../utils/notify';
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
        case SESSION_OP.CIRCUIT_CREATE: return 'Added circuit';
        case SESSION_OP.CIRCUIT_ROUND_ADD: return 'Added circuit round';
        case SESSION_OP.CIRCUIT_ROUND_REMOVE: return 'Removed circuit round';
        case SESSION_OP.CIRCUIT_CASCADE: return 'Circuit values';
        case SESSION_OP.CIRCUIT_TAG: return 'Circuit tags';
        case SESSION_OP.INSTANCE_TAGS: return 'Activity tags';
        case SESSION_OP.SET_TAGS: return 'Set tags';
        case SESSION_OP.PROGRESS_COMPARISON: return 'Progress comparison';
        case SESSION_OP.PROGRESS_CHART: return 'Progress chart';
        case SESSION_OP.INSTANCE_GOAL_LINK: return op.meta?.remove ? 'Removed goal link' : 'Linked goal';
        case SESSION_OP.QUICK_COMPLETE: return 'Completed quick session';
        default: return 'Change';
    }
}

const plural = (count, word) => `${count} ${word}${count === 1 ? '' : 's'}`;

const DAY_MS = 24 * 60 * 60 * 1000;
// The server refuses action times older than 7 days, so queued changes this old need signal soon.
const OLD_PENDING_MS = 5 * DAY_MS;

/** When an unreviewed refused change is discarded, in words. */
export function describeExpiry(op, now) {
    const left = (op.rejectedAt || Date.parse(op.createdAt || '')) + REJECTED_TTL_MS - now;
    const days = Math.ceil(left / DAY_MS);
    return days <= 1 ? 'Discarded within a day' : `Discarded in ${days} days`;
}

/** Why a change is waiting to be sent again, in a few words. */
export function describeRetryReason(error) {
    if (!error?.status) return 'no answer from the server';
    if (error.code === 'idempotency_in_flight') return 'the server is still saving it';
    if (error.status === 429) return 'the server asked to slow down';
    return `server error ${error.status}`;
}

async function copyDiagnostics(outbox) {
    try {
        await navigator.clipboard.writeText(JSON.stringify(describeQueueForSupport(outbox.getSnapshot(), Date.now()), null, 2));
        notify.success('Sync details copied');
    } catch {
        notify.error("Couldn't copy the sync details");
    }
}

/** The current time, ticking each second while `active`. */
function useNow(active) {
    const [now, setNow] = useState(() => Date.now());
    useEffect(() => {
        if (!active) return undefined;
        const timer = window.setInterval(() => setNow(Date.now()), 1000);
        return () => window.clearInterval(timer);
    }, [active]);
    return now;
}

/**
 * Where queued changes are: on the device, syncing, synced, or needing review.
 * With a ``sessionId`` it covers that session; without one, every queued change.
 */
export default function SessionSyncIndicator({
    sessionId = null,
    fallback = null,
    className = '',
    idleOfflineLabel = 'Offline · changes will save on this device',
}) {
    const outbox = useOutbox();
    const status = useOutboxStatus(sessionId);
    const [reviewOpen, setReviewOpen] = useState(false);
    const [dismissedSyncAt, setDismissedSyncAt] = useState(null);
    const showSynced = Boolean(status.lastSyncedAt) && status.lastSyncedAt !== dismissedSyncAt;
    const isReviewOpen = reviewOpen && status.rejected.length > 0;
    const now = useNow(status.enabled && status.pendingCount > 0);

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
    let detail = null;
    let offerRetryNow = false;
    const changes = plural(status.pendingCount, 'change');
    const stalled = Boolean(status.oldestPendingAt) && now - status.oldestPendingAt > STALLED_AFTER_MS;
    if (status.rejected.length > 0) {
        tone = 'danger';
        label = `${plural(status.rejected.length, 'change')} couldn't sync`;
    } else if (status.pausedForAuth && status.pendingCount > 0) {
        tone = 'warning';
        label = `Sign in again to sync ${plural(status.pendingCount, 'change')}`;
    } else if (!status.online) {
        tone = 'warning';
        if (status.pendingCount === 0) label = idleOfflineLabel;
        else label = `Offline · ${changes} saved ${status.volatile ? 'in this tab only' : 'on this device'}`;
        if (status.pendingCount > 0 && now - status.oldestPendingAt > OLD_PENDING_MS) {
            detail = 'connect soon: timings older than 7 days can’t be saved';
        }
    } else if (status.pendingCount > 0 && status.volatile) {
        tone = 'warning';
        label = `${changes} saved in this tab only · keep it open`;
    } else if (status.pendingCount > 0 && status.retryAt > now) {
        tone = stalled ? 'warning' : 'muted';
        label = `Retrying ${changes} in ${Math.max(1, Math.ceil((status.retryAt - now) / 1000))} s`;
        detail = describeRetryReason(status.lastError);
        offerRetryNow = true;
    } else if (status.pendingCount > 0) {
        label = status.waitingForTab ? `Syncing ${changes} from another tab…` : `Syncing ${changes}…`;
        if (stalled) {
            tone = 'warning';
            label = `Still syncing ${changes}…`;
            offerRetryNow = true;
        }
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
                                    <span className={styles.reviewReason}>{describeExpiry(op, now)}</span>
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
                    <button type="button" className={styles.reviewToggle} onClick={() => void copyDiagnostics(outbox)}>
                        Copy sync details for support
                    </button>
                </div>
            )}
            <div className={`${styles.pill} ${styles[tone]}`} role="status" aria-live="polite">
                <span className={styles.dot} aria-hidden="true" />
                <span>{label}</span>
                {detail && <span className={styles.detail}>· {detail}</span>}
                {offerRetryNow && (
                    <button type="button" className={styles.reviewToggle} onClick={() => void outbox.retryNow()}>
                        Retry now
                    </button>
                )}
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
