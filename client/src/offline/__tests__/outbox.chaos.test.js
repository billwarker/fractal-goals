// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OP_STATE, createMemoryStore, createOutbox } from '../outbox';

// Seeded fault injection: random changes across sessions while the store, the network and
// the server misbehave. Once the faults stop, every change that was saved must be settled
// (delivered, folded into a newer edit, or in review with a reason), deliveries must be in
// order within each session, and nothing may be left waiting.

const SEEDS = 500;
const SESSIONS = ['s1', 's2', 's3'];

function mulberry32(seed) {
    let state = seed >>> 0;
    return () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

const failure = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });
const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const lostConnection = () => Object.assign(new Error('Connection to Indexed Database server lost'), { name: 'UnknownError' });

/** A server that applies each idempotency key at most once and replays it after. */
function modelServer(random, faults) {
    const appliedKeys = new Set();
    const appliedOrder = new Map(SESSIONS.map((scope) => [scope, []]));
    const send = async (op) => {
        await Promise.resolve();
        if (faults.on) {
            const roll = random();
            if (roll < 0.1) throw networkError();
            if (roll < 0.15) throw failure(503);
            if (roll < 0.2) throw failure(500, { error: 'boom' });
            if (roll < 0.23) throw failure(409, { code: 'idempotency_in_flight' });
        }
        if (!appliedKeys.has(op.idempotencyKey)) {
            appliedKeys.add(op.idempotencyKey);
            appliedOrder.get(op.scope).push(op.seq);
        }
        // The write is saved, but the answer never arrives.
        if (faults.on && random() < 0.08) throw networkError();
        return { status: 200, data: {} };
    };
    return { send, appliedKeys, appliedOrder };
}

function flakyStore(random, faults) {
    const store = createMemoryStore();
    for (const method of ['getAll', 'put', 'delete']) {
        const original = store[method].bind(store);
        store[method] = async (...args) => {
            if (faults.on && random() < 0.04) throw lostConnection();
            return original(...args);
        };
    }
    return store;
}

async function runSchedule(seed) {
    const random = mulberry32(seed);
    const faults = { on: true };
    let online = true;
    const server = modelServer(random, faults);
    const store = flakyStore(random, faults);
    let counter = 0;
    const outbox = createOutbox({
        store,
        send: server.send,
        isOnline: () => online,
        lock: (callback) => callback(),
        random,
        createId: () => `${seed}-${++counter}`,
    });

    const saved = [];
    for (let step = 0; step < 30; step += 1) {
        const scope = SESSIONS[Math.floor(random() * SESSIONS.length)];
        // Some edits to the same value coalesce, as instance updates do.
        const coalesceKey = random() < 0.3 ? `${scope}:value` : null;
        try {
            const { settled } = await outbox.submit({ scope, kind: 'k', method: 'put', url: `/${scope}`, body: { step }, coalesceKey });
            const entry = { outcome: null };
            settled.then(() => { entry.outcome = 'delivered'; }, (error) => { entry.outcome = error.outboxError?.code || 'rejected'; });
            saved.push(entry);
        } catch {
            // Not saved, and the caller is told so: never part of the promise below.
        }
        if (random() < 0.15) online = !online;
        await vi.advanceTimersByTimeAsync(Math.floor(random() * 4000));
    }

    faults.on = false;
    online = true;
    // Nothing nudges the outbox here: the watchdog and the scheduled retries must finish the job.
    await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

    const finalOps = await store.getAll();
    return { outbox, server, saved, finalOps };
}

describe('outbox under random faults', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.restoreAllMocks();
    });

    it(`keeps every promise across ${SEEDS} seeded schedules`, async () => {
        for (let seed = 1; seed <= SEEDS; seed += 1) {
            const { server, saved, finalOps } = await runSchedule(seed);
            const context = `seed ${seed}`;

            // Every change that was saved has an answer.
            expect(saved.filter((entry) => entry.outcome === null), context).toEqual([]);
            // Nothing is left waiting once the faults stop.
            expect(finalOps.filter((op) => op.state === OP_STATE.PENDING), context).toEqual([]);
            // Anything not sent is in review, with a reason.
            finalOps.forEach((op) => {
                expect(op.state, context).toBe(OP_STATE.REJECTED);
                expect(op.error?.code || op.error?.status, context).toBeTruthy();
            });
            // Deliveries arrive in the order the changes were made, within each session.
            server.appliedOrder.forEach((seqs, scope) => {
                expect(seqs, `${context} ${scope}`).toEqual([...seqs].sort((left, right) => left - right));
            });
        }
    }, 120000);
});
