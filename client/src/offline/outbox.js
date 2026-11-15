import { createDrainLiveness } from './drainLiveness';
import { OP_STATE } from './opKinds';
import {
    OP_VERSION, createDrainStats, createStallReporter, dropReplaced, isSupportedVersion, nextSeq, oldestPending,
    pickNextReady, planReplacements,
} from './outboxQueue';
import { createDrainWaiters, planRetry } from './outboxRetry';
import { createReviewActions } from './outboxReview';
import { createWakeups } from './outboxWakeups';
import {
    classifyFailure, defaultDrainLock, defaultId, defaultLock, describeError, isLockStolen, isOpSpecificFailure,
} from './outboxTransport';
export { classifyFailure } from './outboxTransport';
export { createMemoryStore } from './memoryStore';

// Durable, ordered queue for in-session writes.
//
// Every op is persisted before it is sent, carries an Idempotency-Key, and is replayed strictly
// in submission order within its scope (a session). Transport failures keep the op and retry
// with backoff; only a definitive server rejection (4xx) removes it from the queue, and even
// then it stays visible as "rejected" until reviewed.
//
// The store is the source of truth. Two cross-tab locks keep the network out of every tap: `lock`
// guards short store changes; `drainLock`, held while sending, stops two tabs sending at once.

// Must outlast a request's timeout: other tabs won't coalesce or cancel an op while this holds.
const SEND_LEASE_MS = 30000;

export { OP_STATE };

/** @typedef {import('./outboxTypes').OutboxOp} OutboxOp */
/** @typedef {import('./outboxTypes').OutboxSnapshot} OutboxSnapshot */

/** @param {import('./outboxTypes').OutboxOptions} [options] `store` and `send` are required (checked below). */
export function createOutbox({
    store,
    send,
    isOnline = () => true,
    lock = defaultLock,
    drainLock = defaultDrainLock,
    // Fixes what a request sends, once: a retry must repeat the first attempt byte for byte.
    prepareBody = (body) => body,
    channel = null,
    now = () => Date.now(),
    random = Math.random,
    createId = defaultId,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
    // Changes whenever sign-in is renewed: a 401 to a request sent before then says nothing now.
    authGeneration = () => 0,
    // Health events for telemetry: ('drained', stats), ('rejected', details), ('drain_error', ...), ...
    onEvent = () => {},
} = {}) {
    if (!store || typeof send !== 'function') {
        throw new Error('createOutbox requires a store and a send function');
    }

    const handlers = new Map();
    const settlers = new Map();
    const listeners = new Set();
    let ops = [];
    const syncedAt = {};
    /** @type {OutboxSnapshot} */
    let snapshot = { ops, syncing: false, pausedForAuth: false, volatile: false, waitingForTab: false, syncedAt: {} };
    let syncing = false;
    let pausedForAuth = false;
    let flushing = null;
    let flushAgain = false;
    // Until then, nothing is sent: the connection or the whole server failed, not one change.
    let holdUntil = 0;
    const drainStats = createDrainStats();
    let hydrated = null;

    const emit = () => {
        const volatile = Boolean(store.isVolatile?.());
        const waitingForTab = Boolean(flushing) && !liveness.isHolding();
        snapshot = { ops, syncing, pausedForAuth, volatile, waitingForTab, syncedAt: { ...syncedAt } };
        listeners.forEach((listener) => listener());
        wakeups.armWatchdog();
    };

    const refresh = async () => {
        ops = (await store.getAll()).sort((left, right) => left.seq - right.seq);
        emit();
        drainWaiters.resolve();
    };

    const announce = (message) => {
        try {
            channel?.postMessage(message);
        } catch {
            // A closed channel only costs other tabs a stale indicator.
        }
    };

    const pendingFor = (scope) => ops.filter((op) => op.state === OP_STATE.PENDING && (!scope || op.scope === scope));
    const drainWaiters = createDrainWaiters({ hasPending: (scope) => pendingFor(scope).length > 0, setTimer, clearTimer });

    const settle = (opId, outcome) => {
        const entry = settlers.get(opId);
        if (!entry) return;
        settlers.delete(opId);
        entry.forEach(({ resolve, reject }) => (outcome.ok ? resolve(outcome.value) : reject(outcome.error)));
    };

    const safeEmit = (type, payload) => {
        try {
            onEvent(type, payload);
        } catch {
            // Telemetry must never affect syncing.
        }
    };

    const runHandler = (op, phase, payload) => {
        const handler = handlers.get(op.kind)?.[phase];
        if (!handler) return;
        try {
            handler(op, payload);
        } catch (error) {
            // A cache-update bug must never wedge the queue.
            console.error(`[outbox] ${op.kind}.${phase} handler failed`, error);
        }
    };

    const liveness = createDrainLiveness({ channel, createId, setTimer, clearTimer });
    const wakeups = createWakeups({
        wake: () => void flush(),
        hasPending: () => pendingFor(null).length > 0,
        check: (retryScheduled) => {
            reportStall({ ops, online: isOnline(), pausedForAuth, volatile: snapshot.volatile, waitingForTab: snapshot.waitingForTab });
            if (flushing) {
                // Waiting on another tab's drain lock: take over if that tab stopped.
                if (!liveness.isHolding()) void reclaimStalledDrain();
            } else if (!retryScheduled && !pausedForAuth && isOnline()) {
                safeEmit('watchdog_flush', { pending: pendingFor(null).length });
                void flush();
            }
        },
        setTimer,
        clearTimer,
        now,
        emit: safeEmit,
    });
    const scheduleRetry = wakeups.scheduleAt;

    const reportStall = createStallReporter({ now, emit: safeEmit });
    const retryAfterStoreFailure = wakeups.storeFailed;

    const { discard, retry, clear, expireRejected, rejectOp } = createReviewActions({
        store, now, settle, settlers, announce, refresh, flush, emit: safeEmit,
        onRejected: (rejected, error) => {
            ops = ops.map((entry) => (entry.opId === rejected.opId ? rejected : entry));
            runHandler(rejected, 'onReject', error);
        },
    });

    const nextPending = async () => oldestPending(await store.getAll());
    const nextReady = async () => pickNextReady(await store.getAll(), now());

    const isBeingSent = (op) => Boolean(op.sendingUntil) && op.sendingUntil > now();

    /** Marks the op as being sent and fixes its body; null when it changed while waiting for the lock. */
    const claimForSending = (opId) => lock(async () => {
        const current = (await store.getAll()).find((entry) => entry.opId === opId);
        if (!current || current.state !== OP_STATE.PENDING) return null;
        const body = current.bodyPrepared ? current.body : prepareBody(current.body);
        const claimed = { ...current, body, bodyPrepared: true, sendingUntil: now() + SEND_LEASE_MS };
        await store.put(claimed);
        return claimed;
    });

    const drainOnce = async (run = {}) => {
        // Re-read the heads each time: cascades, discards and other tabs change the queue.
        for (;;) {
            if (pausedForAuth || !isOnline() || run.stolen) return;
            if (holdUntil > now()) {
                scheduleRetry(holdUntil);
                return;
            }
            const { head, wakeAt } = await nextReady();
            if (!head) {
                if (wakeAt) scheduleRetry(wakeAt);
                return;
            }
            if (!isSupportedVersion(head)) {
                const message = 'Saved by a newer version of the app. Reload, then retry.';
                await rejectOp(head, { status: null, code: 'unsupported_version', message });
                await refresh();
                continue;
            }
            const op = /** @type {OutboxOp | null} */ (await claimForSending(head.opId));
            if (!op) continue;

            let response;
            const sentWithAuth = authGeneration();
            try {
                response = await send(op);
            } catch (error) {
                const verdict = classifyFailure(error);
                if (verdict === 'auth' && authGeneration() !== sentWithAuth && !run.retriedAfterAuth) {
                    // Sign-in was renewed while this was in flight; send it again now, once.
                    run.retriedAfterAuth = true;
                    await store.put({ ...op, sendingUntil: 0 });
                    continue;
                }
                if (verdict === 'reject') {
                    await rejectOp(op, describeError(error));
                    await refresh();
                    continue;
                }
                const described = describeError(error);
                const retry = planRetry(op, error, verdict, now(), random);
                if (retry.giveUp) {
                    await rejectOp(op, {
                        ...described,
                        code: 'retry_exhausted',
                        message: `The server kept failing to save this change (${described.message})`,
                    });
                    await refresh();
                    continue;
                }
                const { nextAttemptAt } = retry;
                await store.put({ ...op, ...retry.fields, nextAttemptAt, lastError: described, sendingUntil: 0 });
                if (verdict === 'auth') {
                    pausedForAuth = true;
                    safeEmit('auth_paused', { kind: op.kind, status: described.status });
                    return;
                }
                // The connection or the whole server is down: everything waits. Otherwise only this session does.
                if (!isOpSpecificFailure(error)) {
                    holdUntil = nextAttemptAt;
                    scheduleRetry(nextAttemptAt);
                    return;
                }
                continue;
            }

            run.retriedAfterAuth = false;
            holdUntil = 0;
            // Another tab may have discarded it while it was in flight.
            await store.delete(op.opId);
            // Handlers ask "is anything newer still queued?"; this op no longer is.
            ops = ops.filter((entry) => entry.opId !== op.opId);
            runHandler(op, 'onAck', response);
            settle(op.opId, { ok: true, value: response });
            announce({ type: 'acked', opId: op.opId });
            if (op.scope && !ops.some((entry) => entry.scope === op.scope && entry.state === OP_STATE.PENDING)) {
                syncedAt[op.scope] = now();
            }
            drainStats.record(op, now());
            if (!ops.some((entry) => entry.state === OP_STATE.PENDING)) safeEmit('drained', drainStats.take());
            await refresh();
        }
    };

    /**
     * A stolen lock means another tab took over: this drain stops at its next step.
     * Any other failure (the store, usually) is retried later; a drain never just stops.
     */
    const runDrain = async (options) => {
        const run = { stolen: false, retriedAfterAuth: false };
        try {
            await drainLock(async () => {
                liveness.setHolding(true);
                emit();
                try {
                    return await drainOnce(run);
                } finally {
                    liveness.setHolding(false);
                }
            }, options);
            wakeups.storeRecovered();
        } catch (error) {
            if (isLockStolen(error)) {
                run.stolen = true;
                return;
            }
            retryAfterStoreFailure('drain_error', error);
        }
    };

    /**
     * A frozen background tab keeps its drain lock forever. The visible tab takes over once
     * that tab's lease on the head op lapses, or once it fails to answer a ping while a drain
     * here waits for the lock. Idempotency covers a request the frozen tab had sent.
     */
    async function reclaimStalledDrain() {
        await hydrated;
        if (liveness.isHolding()) return;
        const head = await nextPending();
        if (!head) return;
        const leaseLapsed = Boolean(head.sendingUntil) && !isBeingSent(head);
        if (!leaseLapsed) {
            if (!flushing || (await liveness.isHolderAlive()) !== false) return;
            // The lock may have come here while the ping waited.
            if (liveness.isHolding()) return;
        }
        safeEmit('lock_reclaimed', { reason: leaseLapsed ? 'lease' : 'no_answer' });
        await runDrain({ steal: true });
    }

    async function flush() {
        await hydrated;
        if (flushing) {
            flushAgain = true;
            return flushing;
        }
        syncing = true;
        emit();
        flushing = (async () => {
            try {
                do {
                    flushAgain = false;
                    await runDrain();
                } while (flushAgain && !pausedForAuth && isOnline());
            } finally {
                flushing = null;
                syncing = false;
                await refresh().catch((error) => retryAfterStoreFailure('drain_error', error));
            }
        })();
        return flushing;
    }

    async function submit({
        scope,
        kind,
        method,
        url,
        body = null,
        coalesceKey = null,
        entityIds = [],
        creates = [],
        meta = {},
        // Deleting these entities makes queued, unsent edits to them pointless.
        supersedes = [],
        // Runs once the op is durable and before it can be sent: shown means saved.
        onPersisted = null,
    }) {
        await hydrated;
        const opId = createId();
        const op = {
            v: OP_VERSION,
            opId,
            idempotencyKey: createId(),
            scope: scope || null,
            kind,
            method,
            url,
            body,
            coalesceKey,
            entityIds: [...new Set([...entityIds, ...creates])],
            creates,
            meta,
            seq: 0,
            attempts: 0,
            nextAttemptAt: 0,
            state: OP_STATE.PENDING,
            createdAt: new Date(now()).toISOString(),
        };

        const settled = new Promise((resolve, reject) => {
            settlers.set(opId, [{ resolve, reject }]);
        });
        // Callers that only care about durability may ignore the promise.
        settled.catch(() => {});

        let cancelled = false;
        await lock(async () => {
            const stored = await store.getAll();
            const replaced = planReplacements(stored, op, { supersedes, isBeingSent });
            cancelled = replaced.cancelled;
            op.seq = nextSeq(stored, now());
            // Durable first: nothing it replaces is dropped unless this is saved.
            if (!cancelled) await store.put(op);
            await dropReplaced(store, op, replaced, { settlers, settle });
        });
        // Shown means saved: the kind's optimistic patch runs only once the op is durable.
        runHandler(op, 'optimistic');
        onPersisted?.(op);
        if (cancelled) settle(opId, { ok: true, value: { superseded: true } });
        // Saved already, so a failed re-read must not fail the save: the store retry re-reads and sends it.
        await refresh().catch((error) => retryAfterStoreFailure('drain_error', error));
        announce({ type: 'changed' });
        if (!cancelled) void flush();
        return { opId, settled };
    }

    /** The user asked: send what is waiting now, skipping any backoff. */
    async function retryNow() {
        holdUntil = 0;
        await lock(async () => {
            for (const op of await store.getAll()) {
                if (op.state === OP_STATE.PENDING && op.nextAttemptAt > now()) await store.put({ ...op, nextAttemptAt: 0 });
            }
        });
        await refresh();
        void reclaimStalledDrain();
        void flush();
    }

    function resumeAfterAuth() {
        if (!pausedForAuth) return;
        pausedForAuth = false;
        emit();
        void flush();
    }

    if (channel) {
        channel.onmessage = (event) => {
            if (liveness.handle(event?.data)) return;
            void refresh();
        };
    }

    // Never left rejected: everything awaits it. If the store can't be read yet, start empty
    // (submit reads the store itself) and let the retry's flush load what is queued.
    hydrated = expireRejected().then(refresh).catch((error) => retryAfterStoreFailure('hydrate_error', error));

    return {
        submit,
        flush,
        reclaimStalledDrain,
        discard,
        retry,
        retryNow,
        clear,
        resumeAfterAuth,
        whenDrained: drainWaiters.whenDrained,
        hasPending: (scope = null) => pendingFor(scope).length > 0,
        hasPendingEntity: (entityId) => ops.some((op) => (
            op.state === OP_STATE.PENDING && (op.entityIds || []).includes(entityId)
        )),
        pendingOps: (scope = null) => pendingFor(scope),
        registerHandler(kind, handler) {
            handlers.set(kind, handler);
            return () => {
                if (handlers.get(kind) === handler) handlers.delete(kind);
            };
        },
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        getSnapshot: () => snapshot,
        ready: () => hydrated,
    };
}
