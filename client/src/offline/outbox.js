// Durable, ordered queue for in-session writes.
//
// Every op is persisted before it is sent, carries an Idempotency-Key, and is
// replayed strictly in submission order. Transport failures keep the op and
// retry with backoff; only a definitive server rejection (4xx) removes it from
// the queue, and even then it stays visible as "rejected" until reviewed.
//
// The store is the source of truth: each flush re-reads it under a cross-tab
// lock, so two open tabs never send the same op concurrently.

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 60000;
// A change the server keeps failing (not one waiting for signal) is given up on
// after this, so it can never block every later change behind it.
const MAX_SERVER_FAILURES = 8;
const MAX_SERVER_FAILURE_AGE_MS = 24 * 60 * 60 * 1000;
// Rejected changes wait for review this long, then are discarded so they can't linger forever.
const REJECTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

import { OP_STATE } from './opKinds';

export { OP_STATE };

function defaultId() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function defaultLock(callback) {
    if (typeof navigator !== 'undefined' && navigator.locks?.request) {
        return navigator.locks.request('fractal-outbox', callback);
    }
    return callback();
}

/** How a failed send should be handled: retry later, pause for auth, or reject. */
export function classifyFailure(error) {
    const status = error?.response?.status;
    if (!error?.response) return 'retry';
    if (status === 401) return 'auth';
    if (status === 408 || status === 429 || status >= 500) return 'retry';
    if (status === 409 && error.response.data?.code === 'idempotency_in_flight') return 'retry';
    return 'reject';
}

function describeError(error) {
    return {
        status: error?.response?.status ?? null,
        message: error?.response?.data?.error || error?.message || 'Request failed',
        code: error?.response?.data?.code ?? null,
    };
}

export function createOutbox({
    store,
    send,
    isOnline = () => true,
    lock = defaultLock,
    channel = null,
    now = () => Date.now(),
    random = Math.random,
    createId = defaultId,
    setTimer = (callback, delay) => setTimeout(callback, delay),
    clearTimer = (handle) => clearTimeout(handle),
    // Health events for telemetry: ('drained', stats) and ('rejected', details).
    onEvent = () => {},
} = {}) {
    if (!store || typeof send !== 'function') {
        throw new Error('createOutbox requires a store and a send function');
    }

    const handlers = new Map();
    const settlers = new Map();
    const drainWaiters = new Map();
    const listeners = new Set();
    let ops = [];
    const syncedAt = {};
    let snapshot = { ops, syncing: false, pausedForAuth: false, syncedAt: {} };
    let syncing = false;
    let pausedForAuth = false;
    let flushing = null;
    let flushAgain = false;
    let inFlightOpId = null;
    let drainStats = { ops: 0, maxAgeMs: 0, retries: 0 };
    let retryTimer = null;
    let hydrated = null;

    const emit = () => {
        snapshot = { ops, syncing, pausedForAuth, syncedAt: { ...syncedAt } };
        listeners.forEach((listener) => listener());
    };

    const refresh = async () => {
        ops = (await store.getAll()).sort((left, right) => left.seq - right.seq);
        emit();
        resolveDrained();
    };

    const announce = (message) => {
        try {
            channel?.postMessage(message);
        } catch {
            // A closed channel only costs other tabs a stale indicator.
        }
    };

    const pendingFor = (scope) => ops.filter((op) => op.state === OP_STATE.PENDING && (!scope || op.scope === scope));

    function resolveDrained() {
        drainWaiters.forEach((waiters, scope) => {
            if (pendingFor(scope === '*' ? null : scope).length > 0) return;
            drainWaiters.delete(scope);
            waiters.forEach((resolve) => resolve());
        });
    }

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

    const scheduleRetry = (at) => {
        if (retryTimer) clearTimer(retryTimer);
        retryTimer = setTimer(() => {
            retryTimer = null;
            void flush();
        }, Math.max(0, at - now()));
    };

    const backoff = (attempts) => {
        const base = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** Math.max(0, attempts - 1));
        return Math.round(base / 2 + random() * (base / 2));
    };

    const rejectOp = async (op, error) => {
        const rejected = { ...op, state: OP_STATE.REJECTED, error, rejectedAt: now() };
        await store.put(rejected);
        ops = ops.map((entry) => (entry.opId === op.opId ? rejected : entry));
        runHandler(rejected, 'onReject', error);
        safeEmit('rejected', { kind: op.kind, status: error.status ?? null, code: error.code ?? null });
        settle(op.opId, { ok: false, error: Object.assign(new Error(error.message), { outboxError: error }) });
        announce({ type: 'rejected', opId: op.opId });

        // Later writes that touch records this op created cannot succeed either.
        const created = op.creates || [];
        if (created.length === 0) return;
        const all = (await store.getAll()).sort((left, right) => left.seq - right.seq);
        for (const dependent of all) {
            if (dependent.seq <= op.seq || dependent.state !== OP_STATE.PENDING) continue;
            if (!(dependent.entityIds || []).some((id) => created.includes(id))) continue;
            await rejectOp(dependent, {
                status: null,
                code: 'dependency_rejected',
                message: 'An earlier change this depends on could not be saved',
            });
        }
    };

    const nextPending = async () => (await store.getAll())
        .filter((op) => op.state === OP_STATE.PENDING)
        .sort((left, right) => left.seq - right.seq)[0];

    const drainOnce = async () => {
        // Re-read the head each time: cascades, discards and other tabs change the queue.
        for (let op = await nextPending(); op; op = await nextPending()) {
            if (pausedForAuth || !isOnline()) return;
            if (op.nextAttemptAt && op.nextAttemptAt > now()) {
                scheduleRetry(op.nextAttemptAt);
                return;
            }

            let response;
            inFlightOpId = op.opId;
            try {
                response = await send(op);
            } catch (error) {
                inFlightOpId = null;
                const verdict = classifyFailure(error);
                if (verdict === 'reject') {
                    await rejectOp(op, describeError(error));
                    await refresh();
                    continue;
                }
                const described = describeError(error);
                // Only failures the server answered count toward giving up; offline waits forever.
                const answered = Boolean(error?.response) && verdict !== 'auth';
                const serverFailures = (op.serverFailures || 0) + (answered ? 1 : 0);
                const firstServerFailureAt = op.firstServerFailureAt || (answered ? now() : null);
                if (answered && (
                    serverFailures >= MAX_SERVER_FAILURES
                    || now() - firstServerFailureAt >= MAX_SERVER_FAILURE_AGE_MS
                )) {
                    await rejectOp(op, {
                        ...described,
                        code: 'retry_exhausted',
                        message: `The server kept failing to save this change (${described.message})`,
                    });
                    await refresh();
                    continue;
                }
                const attempts = (op.attempts || 0) + 1;
                const nextAttemptAt = now() + backoff(attempts);
                await store.put({
                    ...op, attempts, nextAttemptAt, serverFailures, firstServerFailureAt, lastError: described,
                });
                if (verdict === 'auth') {
                    pausedForAuth = true;
                } else {
                    scheduleRetry(nextAttemptAt);
                }
                return;
            }

            inFlightOpId = null;
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
            drainStats.ops += 1;
            drainStats.retries += op.attempts || 0;
            drainStats.maxAgeMs = Math.max(drainStats.maxAgeMs, now() - Date.parse(op.createdAt || 0));
            if (!ops.some((entry) => entry.state === OP_STATE.PENDING)) {
                safeEmit('drained', {
                    ops: drainStats.ops,
                    max_age_s: Math.round(drainStats.maxAgeMs / 1000),
                    retries: drainStats.retries,
                });
                drainStats = { ops: 0, maxAgeMs: 0, retries: 0 };
            }
            await refresh();
        }
    };

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
                    await lock(drainOnce);
                } while (flushAgain && !pausedForAuth && isOnline());
            } finally {
                flushing = null;
                syncing = false;
                await refresh();
            }
        })();
        return flushing;
    }

    // Read inside the cross-tab lock, so two tabs never hand out the same position.
    const nextSeq = (stored) => {
        const highest = stored.reduce((max, op) => Math.max(max, op.seq || 0), 0);
        return Math.max(highest + 1, now());
    };

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
            const unsent = (existing) => existing.state === OP_STATE.PENDING && existing.opId !== inFlightOpId;
            if (coalesceKey) {
                for (const existing of stored) {
                    // The server may already be applying an in-flight one; the newer value follows it.
                    if (existing.coalesceKey !== coalesceKey || !unsent(existing)) continue;
                    await store.delete(existing.opId);
                    const superseded = settlers.get(existing.opId) || [];
                    settlers.delete(existing.opId);
                    settlers.get(opId).push(...superseded);
                }
            }
            if (supersedes.length) {
                for (const existing of stored) {
                    if (!unsent(existing) || !(existing.entityIds || []).some((id) => supersedes.includes(id))) continue;
                    // Created and deleted before the server ever saw it: nothing needs sending at all.
                    if ((existing.creates || []).some((id) => supersedes.includes(id))) cancelled = true;
                    await store.delete(existing.opId);
                    settle(existing.opId, { ok: true, value: { superseded: true } });
                }
            }
            op.seq = nextSeq(await store.getAll());
            if (!cancelled) await store.put(op);
        });
        // Shown means saved: the kind's optimistic patch runs only once the op is durable.
        runHandler(op, 'optimistic');
        onPersisted?.(op);
        if (cancelled) {
            settle(opId, { ok: true, value: { superseded: true } });
            await refresh();
            announce({ type: 'changed' });
            return { opId, settled };
        }

        await refresh();
        announce({ type: 'changed' });
        void flush();
        return { opId, settled };
    }

    async function discard(opId) {
        await store.delete(opId);
        settle(opId, { ok: false, error: new Error('Change discarded') });
        announce({ type: 'changed' });
        await refresh();
    }

    async function retry(opId) {
        const op = (await store.getAll()).find((entry) => entry.opId === opId);
        if (!op) return;
        await store.put({ ...op, state: OP_STATE.PENDING, error: null, attempts: 0, nextAttemptAt: 0 });
        announce({ type: 'changed' });
        await refresh();
        void flush();
    }

    function resumeAfterAuth() {
        if (!pausedForAuth) return;
        pausedForAuth = false;
        emit();
        void flush();
    }

    function whenDrained(scope = null) {
        const key = scope || '*';
        if (pendingFor(scope).length === 0) return Promise.resolve();
        return new Promise((resolve) => {
            const waiters = drainWaiters.get(key) || [];
            waiters.push(resolve);
            drainWaiters.set(key, waiters);
        });
    }

    async function clear() {
        await store.clear();
        settlers.forEach((_, opId) => settle(opId, { ok: false, error: new Error('Outbox cleared') }));
        announce({ type: 'changed' });
        await refresh();
    }

    if (channel) {
        channel.onmessage = () => {
            void refresh();
        };
    }

    const expireRejected = async () => {
        const expired = (await store.getAll()).filter((op) => (
            op.state === OP_STATE.REJECTED && now() - (op.rejectedAt || Date.parse(op.createdAt || 0)) >= REJECTED_TTL_MS
        ));
        for (const op of expired) await store.delete(op.opId);
        if (expired.length) {
            announce({ type: 'changed' });
            safeEmit('expired', { count: expired.length });
        }
    };

    hydrated = expireRejected().then(refresh);

    return {
        submit,
        flush,
        discard,
        retry,
        clear,
        resumeAfterAuth,
        whenDrained,
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

export function createMemoryStore(initial = []) {
    const rows = new Map(initial.map((op) => [op.opId, op]));
    return {
        async getAll() {
            return [...rows.values()].map((op) => ({ ...op }));
        },
        async put(op) {
            rows.set(op.opId, { ...op });
        },
        async delete(opId) {
            rows.delete(opId);
        },
        async clear() {
            rows.clear();
        },
    };
}
