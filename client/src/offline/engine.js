// The offline sync engine, loaded on demand by OutboxProvider so no route's
// initial bundle pays for it. Everything here runs only for a signed-in user.

import notify from '../utils/notify';
import { API_BASE, axios, getAuthGeneration } from '../utils/api/core';
import { trackEvent } from '../utils/telemetry';
import { getClockOffsetMs, getOfflineReason, isOnline, subscribeConnectivity } from './connectivity';
import { createIndexedDbStore } from './indexedDbStore';
import { createOutbox } from './outbox';

// Loaded with the engine, so that queueing needs no fetch once there is no signal.
export * as recordOps from './recordOps';
export { registerRecordOpHandlers } from './recordOpHandlers';
export { registerSessionOpHandlers } from './sessionOpHandlers';
export { startChangeListener } from '../sync/changeListener';
export { restoreQueryCache, startQueryPersistence } from './queryPersistence';

// Dead connections should be noticed quickly, but a busy server must not read as one.
const OUTBOX_REQUEST_TIMEOUT_MS = 15000;

/** Shift a queued action time by this device's measured clock error, so the server sees true time. */
export function correctActionTime(body, offsetMs = getClockOffsetMs()) {
    if (!offsetMs || !body) return body;
    return ['occurred_at', '_edited_at'].reduce((result, field) => {
        const corrected = Date.parse(result[field]) + offsetMs;
        return Number.isNaN(corrected) ? result : { ...result, [field]: new Date(corrected).toISOString() };
    }, body);
}

/** A create the server already holds (its answer was lost longer ago than it remembers retries). */
const isAlreadyCreated = (error) => error?.response?.status === 409
    && error.response.data?.code === 'client_id_taken' && error.response.data.already_created;

export function sendOutboxOp(op) {
    const sent = axios.request({
        method: op.method,
        url: `${API_BASE}${op.url}`,
        data: op.body ?? undefined,
        headers: { 'Idempotency-Key': op.idempotencyKey },
        timeout: OUTBOX_REQUEST_TIMEOUT_MS,
    });
    return sent.catch((error) => {
        if (isAlreadyCreated(error)) return { data: null };
        throw error;
    });
}

/** Records why the app went offline, so false alarms show up in sync health. Returns a cleanup function. */
export function trackOfflineTransitions() {
    return subscribeConnectivity((online) => {
        if (!online) trackEvent('offline_detected', { props: { reason: getOfflineReason() } });
    });
}

const HEALTH_EVENTS = {
    drained: 'offline_sync_drained',
    rejected: 'offline_op_rejected',
    expired: 'offline_ops_expired',
    drain_error: 'offline_drain_error',
    hydrate_error: 'offline_hydrate_error',
    watchdog_flush: 'offline_watchdog_flush',
    store_volatile: 'offline_store_volatile',
    store_reopened: 'offline_store_reopened',
    lock_reclaimed: 'offline_lock_reclaimed',
    stalled: 'offline_queue_stalled',
    auth_paused: 'offline_auth_paused',
};

/** Asks the browser not to evict the queue under storage pressure. Best effort, once per load. */
let persistRequested = false;
export function requestPersistentStorage(storage = typeof navigator === 'undefined' ? null : navigator.storage) {
    if (persistRequested || !storage?.persist) return;
    persistRequested = true;
    void Promise.resolve()
        .then(() => storage.persisted?.())
        .then((already) => (already ? true : storage.persist()))
        .catch(() => {});
}

export function createUserOutbox(userId) {
    const channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(`fractal-outbox:${userId}`);
    const track = (type, props) => {
        if (HEALTH_EVENTS[type]) trackEvent(HEALTH_EVENTS[type], { props });
    };
    const outbox = createOutbox({
        store: createIndexedDbStore(userId, { onEvent: track }),
        send: sendOutboxOp,
        // Once per op: the server compares a retry's body with the first attempt's.
        prepareBody: (body) => correctActionTime(body),
        isOnline,
        authGeneration: getAuthGeneration,
        channel,
        onEvent: (type, props) => {
            track(type, props);
            if (type === 'expired') {
                notify.warning(`${props.count} change${props.count === 1 ? '' : 's'} that couldn't sync `
                    + `${props.count === 1 ? 'was' : 'were'} discarded after 7 days.`);
            }
        },
    });
    return {
        ...outbox,
        // Asked when there is first something to keep, not at load (Firefox may ask the user).
        submit: async (op) => {
            requestPersistentStorage();
            try {
                return await outbox.submit(op);
            } catch (error) {
                // Not saved anywhere, so never shown: say so instead of letting the tap vanish.
                notify.error("Couldn't save that change on this device. Please try again.");
                trackEvent('offline_submit_failed', { props: { kind: op.kind, name: error?.name || 'Error' } });
                throw error;
            }
        },
    };
}
