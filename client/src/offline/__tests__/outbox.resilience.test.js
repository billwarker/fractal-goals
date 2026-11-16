// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { createDrainLiveness } from '../drainLiveness';
import { OP_STATE, createMemoryStore, createOutbox } from '../outbox';

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

function setup({ online = true, send } = {}) {
    let counter = 0;
    const store = createMemoryStore();
    const sent = [];
    const sender = send || vi.fn(async () => ({ status: 200, data: {} }));
    const outbox = createOutbox({
        store,
        send: async (op) => {
            sent.push(op);
            return sender(op);
        },
        isOnline: () => online,
        lock: (callback) => callback(),
        random: () => 0.5,
        createId: () => `id-${++counter}`,
    });
    return { outbox, store, sent };
}

const op = (overrides = {}) => ({
    scope: 'session-1',
    kind: 'instance.update',
    method: 'put',
    url: '/root/sessions/session-1/activities/a',
    body: { value: 1 },
    ...overrides,
});

describe('outbox resilience', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it.each([
        ['an outage', () => httpError(503)],
        ['rate limiting', () => httpError(429)],
        ['a claim from a request that died', () => httpError(409, { code: 'idempotency_in_flight' })],
    ])('keeps a change through %s, sending nothing behind it', async (_label, failure) => {
        let failing = true;
        const sender = vi.fn(async () => {
            if (failing) throw failure();
            return { status: 200, data: {} };
        });
        const { outbox, sent } = setup({ send: sender });
        await outbox.submit(op({ url: '/head' }));
        await outbox.submit(op({ url: '/behind' }));

        await vi.advanceTimersByTimeAsync(10 * 60 * 1000);

        expect(sent.length).toBeGreaterThan(8);
        expect(sent.every((entry) => entry.url === '/head')).toBe(true);
        expect(outbox.getSnapshot().ops.map((entry) => entry.state)).toEqual([OP_STATE.PENDING, OP_STATE.PENDING]);

        failing = false;
        await vi.runAllTimersAsync();
        expect(sent.at(-1).url).toBe('/behind');
        expect(outbox.getSnapshot().ops).toHaveLength(0);
    });

    it('still holds a repeatedly failing change until the 10 minute minimum', async () => {
        const sender = vi.fn().mockRejectedValue(httpError(500, { error: 'boom' }));
        const { outbox } = setup({ send: sender });
        await outbox.submit(op({ url: '/poison' }));

        await vi.advanceTimersByTimeAsync(9 * 60 * 1000);
        expect(outbox.getSnapshot().ops[0].state).toBe(OP_STATE.PENDING);

        await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
        expect(outbox.getSnapshot().ops[0]).toMatchObject({ state: OP_STATE.REJECTED, error: expect.objectContaining({ code: 'retry_exhausted' }) });
    });

    it('waits at least as long as Retry-After asks', async () => {
        const failure = Object.assign(httpError(429), { response: { status: 429, data: {}, headers: { 'retry-after': '120' } } });
        const sender = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue({ status: 200, data: {} });
        const { outbox } = setup({ send: sender });
        await outbox.submit(op());

        await vi.advanceTimersByTimeAsync(119 * 1000);
        expect(sender).toHaveBeenCalledTimes(1);
        await vi.advanceTimersByTimeAsync(2 * 1000);
        expect(sender).toHaveBeenCalledTimes(2);
    });

    it('saves and shows a change while an earlier request is stuck on the network', async () => {
        // Real Web Locks queue in order; a pass-through lock can't show this.
        const fifo = () => {
            let tail = Promise.resolve();
            return (callback) => {
                const run = tail.then(() => callback());
                tail = run.catch(() => {});
                return run;
            };
        };
        let release;
        const store = createMemoryStore();
        const send = vi.fn(() => new Promise((resolve) => { release = () => resolve({ status: 200, data: {} }); }));
        const outbox = createOutbox({ store, send, lock: fifo(), drainLock: fifo(), createId: (() => { let n = 0; return () => `id-${++n}`; })() });
        await outbox.submit(op({ url: '/stuck' }));
        await vi.waitFor(() => expect(send).toHaveBeenCalledTimes(1));

        const shown = vi.fn();
        await outbox.submit(op({ url: '/tapped' , kind: 'later' }));
        outbox.registerHandler('later', { optimistic: shown });
        await outbox.submit(op({ url: '/tapped-2', kind: 'later' }));

        expect(shown).toHaveBeenCalledTimes(1);
        expect((await store.getAll()).map((entry) => entry.url)).toEqual(expect.arrayContaining(['/tapped', '/tapped-2']));
        release();
    });

    it('never coalesces or cancels an op another tab is sending', async () => {
        const store = createMemoryStore();
        const outbox = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn(), createId: (() => { let n = 0; return () => `id-${++n}`; })() });
        await outbox.submit(op({ url: '/create', creates: ['inst-1'] }));
        const [sending] = await store.getAll();
        await store.put({ ...sending, sendingUntil: Date.now() + 10000 });

        await outbox.submit(op({ url: '/remove', method: 'delete', entityIds: ['inst-1'], supersedes: ['inst-1'] }));

        expect((await store.getAll()).map((entry) => entry.url).sort()).toEqual(['/create', '/remove']);
    });

    it('sends the body fixed on the first attempt for every retry', async () => {
        let offset = 0;
        const sender = vi.fn().mockRejectedValueOnce(networkError()).mockResolvedValue({ status: 200, data: {} });
        const store = createMemoryStore();
        const bodies = [];
        const outbox = createOutbox({
            store,
            send: async (entry) => {
                bodies.push(JSON.stringify(entry.body));
                return sender(entry);
            },
            lock: (fn) => fn(),
            prepareBody: (body) => ({ ...body, offset }),
        });
        await outbox.submit(op());
        offset = 90000;
        await vi.runAllTimersAsync();

        expect(bodies).toHaveLength(2);
        expect(bodies[1]).toBe(bodies[0]);
    });

    it('takes over from a frozen tab once its lease lapses, but not before', async () => {
        const store = createMemoryStore();
        const drainLock = vi.fn((callback) => callback());
        const outbox = createOutbox({ store, send: vi.fn(async () => ({ status: 200, data: {} })), isOnline: () => false, lock: (fn) => fn(), drainLock });
        await outbox.submit(op());
        const [held] = await store.getAll();
        await store.put({ ...held, sendingUntil: Date.now() + 5000 });
        drainLock.mockClear();

        await outbox.reclaimStalledDrain();
        expect(drainLock).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(6000);
        await outbox.reclaimStalledDrain();
        expect(drainLock).toHaveBeenCalledWith(expect.any(Function), { steal: true });
    });

    it('stops waiting for a drain at the timeout', async () => {
        const { outbox } = setup({ online: false });
        await outbox.submit(op());
        const waiting = outbox.whenDrained('session-1', { timeoutMs: 1000 });
        const expectation = expect(waiting).rejects.toThrow(/still syncing/);
        await vi.advanceTimersByTimeAsync(1001);
        await expectation;
    });

    // A store whose next calls throw, like an IndexedDB connection the browser dropped.
    const flakyStore = () => {
        const store = createMemoryStore();
        const failing = { getAll: 0, put: 0 };
        for (const method of ['getAll', 'put']) {
            const original = store[method].bind(store);
            store[method] = async (...args) => {
                if (failing[method] > 0) {
                    failing[method] -= 1;
                    throw Object.assign(new Error('Connection to Indexed Database server lost'), { name: 'UnknownError' });
                }
                return original(...args);
            };
        }
        return { store, failing };
    };

    it('keeps syncing after a store failure part-way through a drain', async () => {
        const { store, failing } = flakyStore();
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        send.mockImplementationOnce(async () => {
            failing.put = 1;
            throw networkError();
        });
        const onEvent = vi.fn();
        const outbox = createOutbox({ store, send, lock: (fn) => fn(), random: () => 0.5, onEvent });
        await outbox.submit(op());
        await vi.advanceTimersByTimeAsync(0);
        expect(outbox.pendingOps()).toHaveLength(1);
        expect(onEvent).toHaveBeenCalledWith('drain_error', expect.objectContaining({ name: 'UnknownError' }));

        await vi.advanceTimersByTimeAsync(5000);
        expect(outbox.pendingOps()).toHaveLength(0);
        expect(send).toHaveBeenCalledTimes(2);
    });

    it('still saves changes when the store could not be read at start-up', async () => {
        const { store, failing } = flakyStore();
        failing.getAll = 1;
        await store.put({ ...op(), opId: 'queued-earlier', idempotencyKey: 'k', seq: 1, state: OP_STATE.PENDING, entityIds: [], creates: [], createdAt: new Date().toISOString() });
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const outbox = createOutbox({ store, send, lock: (fn) => fn(), random: () => 0.5 });

        await expect(outbox.submit(op({ url: '/after-boot-failure' }))).resolves.toEqual(expect.objectContaining({ opId: expect.any(String) }));
        await vi.advanceTimersByTimeAsync(5000);

        expect(send.mock.calls.map(([sent]) => sent.url)).toEqual([op().url, '/after-boot-failure']);
        expect(outbox.pendingOps()).toHaveLength(0);
    });

    it('sends again at once, not pausing, when sign-in was renewed while the request was out', async () => {
        let generation = 1;
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        send.mockImplementationOnce(async () => {
            generation += 1;
            throw httpError(401, { error: 'Token expired' });
        });
        const outbox = createOutbox({
            store: createMemoryStore(), send, lock: (fn) => fn(), authGeneration: () => generation,
        });
        await outbox.submit(op());
        await vi.advanceTimersByTimeAsync(0);

        expect(send).toHaveBeenCalledTimes(2);
        expect(outbox.getSnapshot().pausedForAuth).toBe(false);
        expect(outbox.pendingOps()).toHaveLength(0);
    });

    it('still pauses for sign-in when the 401 is current', async () => {
        const send = vi.fn(async () => { throw httpError(401, { error: 'Token expired' }); });
        const outbox = createOutbox({ store: createMemoryStore(), send, lock: (fn) => fn(), authGeneration: () => 1 });
        await outbox.submit(op());
        await vi.advanceTimersByTimeAsync(0);

        expect(send).toHaveBeenCalledTimes(1);
        expect(outbox.getSnapshot().pausedForAuth).toBe(true);
    });

    it('wakes a pending change that nothing was due to send', async () => {
        let online = false;
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const onEvent = vi.fn();
        const outbox = createOutbox({ store: createMemoryStore(), send, isOnline: () => online, lock: (fn) => fn(), onEvent });
        await outbox.submit(op());
        await vi.advanceTimersByTimeAsync(0);
        // Back online with no connectivity event: only the watchdog notices.
        online = true;
        await vi.advanceTimersByTimeAsync(10000);

        expect(onEvent).toHaveBeenCalledWith('watchdog_flush', { pending: 1 });
        expect(send).toHaveBeenCalledTimes(1);
        expect(outbox.pendingOps()).toHaveLength(0);
    });

    it("sends other sessions' changes while one session's change keeps failing", async () => {
        const sender = vi.fn(async (sent) => {
            if (sent.url === '/poison') throw httpError(500, { error: 'boom' });
            return { status: 200, data: {} };
        });
        const { outbox, sent } = setup({ send: sender });
        await outbox.submit(op({ url: '/poison' }));
        await outbox.submit(op({ url: '/same-session-behind' }));
        await outbox.submit(op({ scope: 'session-2', url: '/other-session' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(sent.map((entry) => entry.url)).toEqual(['/poison', '/other-session']);
        expect(outbox.pendingOps('session-2')).toHaveLength(0);
        expect(outbox.pendingOps('session-1').map((entry) => entry.url)).toEqual(['/poison', '/same-session-behind']);
    });

    it('holds every session during an outage instead of trying each one', async () => {
        const sender = vi.fn(async () => { throw httpError(503); });
        const { outbox, sent } = setup({ send: sender });
        await outbox.submit(op({ url: '/first' }));
        await outbox.submit(op({ scope: 'session-2', url: '/second' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(sent.map((entry) => entry.url)).toEqual(['/first']);
    });

    // Two tabs' BroadcastChannels: a message from one reaches the other.
    const channelPair = () => {
        const here = { postMessage: (data) => queueMicrotask(() => there.onmessage?.({ data })) };
        const there = { postMessage: (data) => queueMicrotask(() => here.onmessage?.({ data })) };
        return { here, there };
    };

    const waitingOnAnotherTab = ({ holderAnswers }) => {
        const { here, there } = channelPair();
        const otherTab = createDrainLiveness({ channel: there, createId: () => 'n', setTimer: setTimeout, clearTimer: clearTimeout });
        otherTab.setHolding(true);
        there.onmessage = holderAnswers ? (event) => otherTab.handle(event.data) : null;
        // The other tab holds the drain lock, so a normal request here never gets it.
        const drainLock = vi.fn((callback, options) => (options?.steal ? callback() : new Promise(() => {})));
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const onEvent = vi.fn();
        const outbox = createOutbox({ store: createMemoryStore(), send, lock: (fn) => fn(), drainLock, channel: here, onEvent });
        return { outbox, drainLock, send, onEvent };
    };

    it('takes over from a tab frozen between changes once it stops answering', async () => {
        const { outbox, send, onEvent } = waitingOnAnotherTab({ holderAnswers: false });
        await outbox.submit(op());
        expect(send).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(10000 + 3000);

        expect(onEvent).toHaveBeenCalledWith('lock_reclaimed', { reason: 'no_answer' });
        expect(send).toHaveBeenCalledTimes(1);
        expect(outbox.pendingOps()).toHaveLength(0);
    });

    it('leaves the drain with a tab that is still answering', async () => {
        const { outbox, drainLock, send } = waitingOnAnotherTab({ holderAnswers: true });
        await outbox.submit(op());

        await vi.advanceTimersByTimeAsync(30000);

        expect(drainLock).not.toHaveBeenCalledWith(expect.any(Function), { steal: true });
        expect(send).not.toHaveBeenCalled();
    });

    it('sends at once when the user asks, skipping the backoff', async () => {
        let failing = true;
        const sender = vi.fn(async () => {
            if (failing) throw httpError(503);
            return { status: 200, data: {} };
        });
        const { outbox } = setup({ send: sender });
        await outbox.submit(op());
        await outbox.submit(op({ scope: 'session-2' }));
        await vi.advanceTimersByTimeAsync(0);
        expect(outbox.pendingOps()[0].nextAttemptAt).toBeGreaterThan(Date.now());

        failing = false;
        await outbox.retryNow();
        await vi.advanceTimersByTimeAsync(0);

        expect(outbox.pendingOps()).toHaveLength(0);
    });

    it('reports once why a change has waited minutes with signal', async () => {
        const onEvent = vi.fn();
        const outbox = createOutbox({
            store: createMemoryStore(), send: vi.fn(async () => { throw httpError(503); }), lock: (fn) => fn(), random: () => 0.5, onEvent,
        });
        await outbox.submit(op());
        await vi.advanceTimersByTimeAsync(5 * 60 * 1000);

        const stalls = onEvent.mock.calls.filter(([type]) => type === 'stalled');
        expect(stalls).toHaveLength(1);
        expect(stalls[0][1]).toMatchObject({ reason: 'retrying', status: 503 });
    });

    it('records a pause for sign-in', async () => {
        const onEvent = vi.fn();
        const outbox = createOutbox({
            store: createMemoryStore(), send: vi.fn(async () => { throw httpError(401); }), lock: (fn) => fn(), onEvent,
        });
        await outbox.submit(op({ kind: 'timer' }));
        await vi.advanceTimersByTimeAsync(0);

        expect(onEvent).toHaveBeenCalledWith('auth_paused', { kind: 'timer', status: 401 });
    });

    it('sends a change saved by a newer build to review instead of sending it', async () => {
        const store = createMemoryStore();
        await store.put({
            ...op(), v: 99, opId: 'from-newer-build', idempotencyKey: 'k', seq: 1, state: OP_STATE.PENDING,
            entityIds: [], creates: [], createdAt: new Date().toISOString(),
        });
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const outbox = createOutbox({ store, send, lock: (fn) => fn() });
        await outbox.flush();

        expect(send).not.toHaveBeenCalled();
        expect(outbox.getSnapshot().ops[0]).toMatchObject({ state: OP_STATE.REJECTED, error: expect.objectContaining({ code: 'unsupported_version' }) });
    });

    it('keeps the earlier value when saving a newer edit of it fails', async () => {
        const { store, failing } = flakyStore();
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const outbox = createOutbox({ store, send, isOnline: () => false, lock: (fn) => fn() });
        const first = await outbox.submit(op({ body: { value: 1 }, coalesceKey: 'a:value' }));
        failing.put = 1;

        await expect(outbox.submit(op({ body: { value: 2 }, coalesceKey: 'a:value' }))).rejects.toThrow();

        expect((await store.getAll()).map((entry) => entry.body)).toEqual([{ value: 1 }]);
        expect(outbox.pendingOps().map((entry) => entry.opId)).toEqual([first.opId]);
    });

    it('keeps queued edits when saving the delete that supersedes them fails', async () => {
        const { store, failing } = flakyStore();
        const outbox = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
        await outbox.submit(op({ entityIds: ['inst-1'] }));
        failing.put = 1;

        await expect(outbox.submit(op({ method: 'delete', entityIds: ['inst-1'], supersedes: ['inst-1'] }))).rejects.toThrow();

        expect(await store.getAll()).toHaveLength(1);
    });

    it('reports a change as saved, and sends it, when only the re-read after saving fails', async () => {
        const { store, failing } = flakyStore();
        const send = vi.fn(async () => ({ status: 200, data: {} }));
        const outbox = createOutbox({ store, send, lock: (fn) => fn(), random: () => 0.5 });
        await outbox.ready();
        const getAll = store.getAll;
        let reads = 0;
        // The lock's read succeeds; the read after the put fails.
        store.getAll = async () => {
            reads += 1;
            if (reads === 2) failing.getAll = 1;
            return getAll();
        };

        await expect(outbox.submit(op())).resolves.toEqual(expect.objectContaining({ opId: expect.any(String) }));
        await vi.advanceTimersByTimeAsync(5000);

        expect(send).toHaveBeenCalledTimes(1);
        expect(outbox.pendingOps()).toHaveLength(0);
    });
});
