import { OP_STATE } from './opKinds';

// Changes the server refused: sending one to review (with whatever depended on it), and
// what the review list does with them: retry, discard, clear, and the expiry that stops
// a refused change lingering forever.

// Rejected changes wait for review this long, then are discarded so they can't linger forever.
export const REJECTED_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export function createReviewActions({ store, now, settle, settlers, announce, refresh, flush, emit, onRejected }) {
    async function rejectOp(op, error) {
        const rejected = { ...op, state: OP_STATE.REJECTED, error, rejectedAt: now() };
        await store.put(rejected);
        onRejected(rejected, error);
        emit('rejected', { kind: op.kind, status: error.status ?? null, code: error.code ?? null });
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
        // A manual retry is a fresh start: the give-up budget counts from now, not from
        // the failures that led to the rejection.
        await store.put({
            ...op, state: OP_STATE.PENDING, error: null, lastError: null,
            attempts: 0, nextAttemptAt: 0, serverFailures: 0, firstServerFailureAt: undefined, sendingUntil: 0,
        });
        announce({ type: 'changed' });
        await refresh();
        void flush();
    }

    async function clear() {
        await store.clear();
        settlers.forEach((_, opId) => settle(opId, { ok: false, error: new Error('Outbox cleared') }));
        announce({ type: 'changed' });
        await refresh();
    }

    async function expireRejected() {
        const expired = (await store.getAll()).filter((op) => (
            op.state === OP_STATE.REJECTED && now() - (op.rejectedAt || Date.parse(op.createdAt || '')) >= REJECTED_TTL_MS
        ));
        for (const op of expired) await store.delete(op.opId);
        if (expired.length) {
            announce({ type: 'changed' });
            emit('expired', { count: expired.length });
        }
    }

    return { rejectOp, discard, retry, clear, expireRejected };
}
