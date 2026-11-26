import { OP_STATE } from './opKinds';

// Reads of the queue (what to send next, where a new op goes, what a drain did), and what
// a new op replaces before it is stored.

// The shape of a stored op. An op from a newer build (after a rollback) is sent to review,
// never sent in a form this build may misread.
export const OP_VERSION = 1;
export const isSupportedVersion = (op) => (op.v ?? 1) <= OP_VERSION;

// Online and still unsent after this: the change is stalled, and telemetry hears why.
export const STALLED_AFTER_MS = 2 * 60 * 1000;

function stallReason({ head, pausedForAuth, volatile, waitingForTab }) {
    if (pausedForAuth) return 'auth';
    if (volatile) return 'volatile';
    if (head.lastError) return 'retrying';
    return waitingForTab ? 'other_tab' : 'sending';
}

/** Reports, once per change, that the oldest one has waited minutes with signal, and why. */
export function createStallReporter({ now, emit }) {
    const reported = new Set();
    return ({ ops, online, pausedForAuth, volatile, waitingForTab }) => {
        const head = oldestPending(ops);
        const ageMs = head ? now() - Date.parse(head.createdAt || '') : 0;
        if (!head || !online || reported.has(head.opId) || !(ageMs >= STALLED_AFTER_MS)) return;
        reported.add(head.opId);
        emit('stalled', {
            reason: stallReason({ head, pausedForAuth, volatile, waitingForTab }),
            status: head.lastError?.status ?? null,
            age_s: Math.round(ageMs / 1000),
        });
    };
}

const pendingInOrder = (stored) => stored
    .filter((op) => op.state === OP_STATE.PENDING)
    .sort((left, right) => left.seq - right.seq);

/** The oldest pending op of each scope, oldest first. */
export function scopeHeads(stored) {
    const heads = new Map();
    pendingInOrder(stored).forEach((op) => {
        if (!heads.has(op.scope ?? '')) heads.set(op.scope ?? '', op);
    });
    return [...heads.values()];
}

export const oldestPending = (stored) => pendingInOrder(stored)[0];

/**
 * The first change due to send, taking only the oldest of each scope: order holds within
 * a session, and one session's failing change never holds up another's. `wakeAt` is when
 * the next one that is backing off becomes due.
 */
export function pickNextReady(stored, now) {
    const heads = scopeHeads(stored);
    const due = (op) => !(op.nextAttemptAt > now);
    const waits = heads.filter((op) => !due(op)).map((op) => op.nextAttemptAt);
    const isWaiting = waitsForAnotherScope(pendingInOrder(stored));
    const free = heads.filter((op) => !isWaiting(op));
    // Two scopes waiting for each other would wait forever: then the order they were made in decides.
    const head = free.length ? free.find(due) : heads.find(due);
    return { head, wakeAt: waits.length ? Math.min(...waits) : null };
}

/** A change that mentions something another scope has still to create waits for it: a session using a new activity. */
function waitsForAnotherScope(pending) {
    const createdIn = new Map();
    pending.forEach((op) => (op.creates || []).forEach((id) => createdIn.set(id, op.scope ?? '')));
    if (createdIn.size === 0) return () => false;
    return (op) => {
        const text = `${op.url} ${JSON.stringify(op.body ?? null)}`;
        return [...createdIn].some(([id, scope]) => scope !== (op.scope ?? '') && text.includes(id));
    };
}

/** Read inside the cross-tab lock, so two tabs never hand out the same position. */
export function nextSeq(stored, now) {
    const highest = stored.reduce((max, op) => Math.max(max, op.seq || 0), 0);
    return Math.max(highest + 1, now);
}

/**
 * What a new op makes pointless among the unsent ones: the same coalesce key (`coalesced`, a
 * newer value of the same thing) and queued edits to records it deletes (`superseded`).
 * `cancelled` when it deletes a record the server never saw, so nothing needs sending at all.
 */
export function planReplacements(stored, op, { supersedes = [], isBeingSent }) {
    // The server may already be applying an in-flight one; the newer value follows it.
    const unsent = (existing) => existing.state === OP_STATE.PENDING && !isBeingSent(existing);
    const touches = (existing) => (existing.entityIds || []).some((id) => supersedes.includes(id));
    const coalesced = op.coalesceKey ? stored.filter((existing) => unsent(existing) && existing.coalesceKey === op.coalesceKey) : [];
    const superseded = supersedes.length ? stored.filter((existing) => unsent(existing) && touches(existing)) : [];
    const cancelled = superseded.some((existing) => (existing.creates || []).some((id) => supersedes.includes(id)));
    return { coalesced, superseded, cancelled };
}

/**
 * Drops what `op` replaced, only once `op` itself is stored (or needs no sending), so a
 * failed save never loses the change it was replacing. An op left behind by a failed delete
 * is harmless: it is sent first, and the newer value or the delete follows it. Newest first,
 * so a create is the last thing removed.
 */
export async function dropReplaced(store, op, { coalesced, superseded }, { settlers, settle }) {
    const newestFirst = (list) => [...list].sort((left, right) => right.seq - left.seq);
    for (const existing of newestFirst(coalesced)) {
        if (!(await deleteQuietly(store, existing.opId))) continue;
        settlers.get(op.opId).push(...(settlers.get(existing.opId) || []));
        settlers.delete(existing.opId);
    }
    for (const existing of newestFirst(superseded)) {
        if (await deleteQuietly(store, existing.opId)) settle(existing.opId, { ok: true, value: { superseded: true } });
    }
}

async function deleteQuietly(store, opId) {
    try {
        await store.delete(opId);
        return true;
    } catch (error) {
        console.error('[outbox] could not drop a replaced change; it will be sent first', error);
        return false;
    }
}

/** What support needs to see why changes aren't syncing: kinds, states, codes and ages, never content. */
export function describeQueueForSupport(snapshot, now) {
    const ageSeconds = (time) => (Number.isNaN(time) ? null : Math.round((now - time) / 1000));
    return {
        at: new Date(now).toISOString(),
        syncing: snapshot.syncing,
        paused_for_auth: snapshot.pausedForAuth,
        volatile: snapshot.volatile,
        waiting_for_tab: snapshot.waitingForTab,
        ops: snapshot.ops.map((op) => ({
            kind: op.kind,
            state: op.state,
            v: op.v ?? 1,
            attempts: op.attempts || 0,
            server_failures: op.serverFailures || 0,
            age_s: ageSeconds(Date.parse(op.createdAt || '')),
            next_attempt_in_s: op.nextAttemptAt > now ? Math.round((op.nextAttemptAt - now) / 1000) : 0,
            sending: Boolean(op.sendingUntil && op.sendingUntil > now),
            error: op.error || op.lastError ? {
                status: (op.error || op.lastError).status ?? null,
                code: (op.error || op.lastError).code ?? null,
            } : null,
        })),
    };
}

/** Counts for the `drained` health event, reported once the whole queue is empty. */
export function createDrainStats() {
    let stats = { ops: 0, maxAgeMs: 0, retries: 0 };
    return {
        record(op, now) {
            stats.ops += 1;
            stats.retries += op.attempts || 0;
            stats.maxAgeMs = Math.max(stats.maxAgeMs, now - Date.parse(op.createdAt || ''));
        },
        take() {
            const taken = { ops: stats.ops, max_age_s: Math.round(stats.maxAgeMs / 1000), retries: stats.retries };
            stats = { ops: 0, maxAgeMs: 0, retries: 0 };
            return taken;
        },
    };
}
