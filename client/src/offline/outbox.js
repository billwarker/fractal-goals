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

export const OP_STATE = Object.freeze({
    PENDING: 'pending',
    REJECTED: 'rejected',
});

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
        const rejected = { ...op, state: OP_STATE.REJECTED, error };
        await store.put(rejected);
        ops = ops.map((entry) => (entry.opId === op.opId ? rejected : entry));
        runHandler(rejected, 'onReject', error);
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
                const attempts = (op.attempts || 0) + 1;
                const nextAttemptAt = now() + backoff(attempts);
                await store.put({ ...op, attempts, nextAttemptAt, lastError: describeError(error) });
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

    const nextSeq = () => {
        const highest = ops.reduce((max, op) => Math.max(max, op.seq || 0), 0);
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
            seq: nextSeq(),
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

        await lock(async () => {
            if (coalesceKey) {
                for (const existing of await store.getAll()) {
                    if (existing.coalesceKey !== coalesceKey || existing.state !== OP_STATE.PENDING) continue;
                    // The server may already be applying it; let the newer value follow it.
                    if (existing.opId === inFlightOpId) continue;
                    await store.delete(existing.opId);
                    const superseded = settlers.get(existing.opId) || [];
                    settlers.delete(existing.opId);
                    settlers.get(opId).push(...superseded);
                }
            }
            await store.put(op);
        });

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

    hydrated = refresh();

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
