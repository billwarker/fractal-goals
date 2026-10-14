// The offline sync engine, loaded on demand by OutboxProvider so no route's
// initial bundle pays for it. Everything here runs only for a signed-in user.

import notify from '../utils/notify';
import { API_BASE, axios } from '../utils/api/core';
import { trackEvent } from '../utils/telemetry';
import { getClockOffsetMs, isOnline } from './connectivity';
import { createIndexedDbStore } from './indexedDbStore';
import { createOutbox } from './outbox';

export { registerSessionOpHandlers } from './sessionOpHandlers';
export { restoreQueryCache, startQueryPersistence } from './queryPersistence';

// Dead connections should be noticed quickly; the op stays queued, so a short
// timeout costs nothing but a retry.
const OUTBOX_REQUEST_TIMEOUT_MS = 8000;

/** Shift a queued action time by this device's measured clock error, so the server sees true time. */
export function correctActionTime(body, offsetMs = getClockOffsetMs()) {
    if (!offsetMs || !body?.occurred_at) return body;
    const corrected = Date.parse(body.occurred_at) + offsetMs;
    return Number.isNaN(corrected) ? body : { ...body, occurred_at: new Date(corrected).toISOString() };
}

export function sendOutboxOp(op) {
    return axios.request({
        method: op.method,
        url: `${API_BASE}${op.url}`,
        data: correctActionTime(op.body) ?? undefined,
        headers: { 'Idempotency-Key': op.idempotencyKey },
        timeout: OUTBOX_REQUEST_TIMEOUT_MS,
    });
}

const HEALTH_EVENTS = {
    drained: 'offline_sync_drained',
    rejected: 'offline_op_rejected',
    expired: 'offline_ops_expired',
};

export function createUserOutbox(userId) {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`fractal-outbox:${userId}`);
    return createOutbox({
        store: createIndexedDbStore(userId),
        send: sendOutboxOp,
        isOnline,
        channel,
        onEvent: (type, props) => {
            if (HEALTH_EVENTS[type]) trackEvent(HEALTH_EVENTS[type], { props });
            if (type === 'expired') {
                notify.warning(`${props.count} change${props.count === 1 ? '' : 's'} that couldn't sync `
                    + `${props.count === 1 ? 'was' : 'were'} discarded after 7 days.`);
            }
        },
    });
}
