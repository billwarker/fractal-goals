import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

    it('still holds a repeatedly failing change until the 30 minute minimum', async () => {
        const sender = vi.fn().mockRejectedValue(httpError(500, { error: 'boom' }));
        const { outbox } = setup({ send: sender });
        await outbox.submit(op({ url: '/poison' }));

        await vi.advanceTimersByTimeAsync(29 * 60 * 1000);
        expect(outbox.getSnapshot().ops[0].state).toBe(OP_STATE.PENDING);

        await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
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
});
