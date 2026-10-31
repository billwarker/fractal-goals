import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OP_STATE, classifyFailure, createMemoryStore, createOutbox } from '../outbox';

const networkError = () => Object.assign(new Error('Network Error'), { code: 'ERR_NETWORK' });
const httpError = (status, data = {}) => Object.assign(new Error(`HTTP ${status}`), { response: { status, data } });

function setup({ online = true, initial = [], send } = {}) {
    let isUp = online;
    let counter = 0;
    const store = createMemoryStore(initial);
    const sent = [];
    const sender = send || vi.fn(async (op) => ({ status: 200, data: { echo: op.body } }));
    const outbox = createOutbox({
        store,
        send: async (op) => {
            sent.push(op);
            return sender(op);
        },
        isOnline: () => isUp,
        lock: (callback) => callback(),
        random: () => 0.5,
        createId: () => `id-${++counter}`,
    });
    return {
        outbox,
        store,
        sent,
        sender,
        goOnline: () => {
            isUp = true;
            return outbox.flush();
        },
    };
}

const op = (overrides = {}) => ({
    scope: 'session-1',
    kind: 'instance.update',
    method: 'put',
    url: '/root/sessions/session-1/activities/a',
    body: { value: 1 },
    ...overrides,
});

describe('classifyFailure', () => {
    it.each([
        [networkError(), 'retry'],
        [httpError(500), 'retry'],
        [httpError(429), 'retry'],
        [httpError(409, { code: 'idempotency_in_flight' }), 'retry'],
        [httpError(401), 'auth'],
        [httpError(400), 'reject'],
        [httpError(409, { code: 'active_work_exists' }), 'reject'],
    ])('classifies %s as %s', (error, verdict) => {
        expect(classifyFailure(error)).toBe(verdict);
    });
});

describe('outbox', () => {
    beforeEach(() => {
        vi.useFakeTimers();
    });

    afterEach(() => {
        vi.useRealTimers();
    });

    it('persists, sends with an idempotency key, and acks', async () => {
        const { outbox, store, sent } = setup();
        const onAck = vi.fn();
        outbox.registerHandler('instance.update', { onAck });

        const { settled } = await outbox.submit(op());
        await expect(settled).resolves.toMatchObject({ status: 200 });

        expect(sent).toHaveLength(1);
        expect(sent[0].idempotencyKey).toBeTruthy();
        expect(onAck).toHaveBeenCalledWith(expect.objectContaining({ kind: 'instance.update' }), expect.anything());
        expect(await store.getAll()).toEqual([]);
    });

    it('keeps ops while offline and replays them in submission order', async () => {
        const { outbox, sent, goOnline } = setup({ online: false });

        await outbox.submit(op({ url: '/first' }));
        await outbox.submit(op({ url: '/second' }));
        await outbox.submit(op({ url: '/third' }));
        expect(sent).toHaveLength(0);
        expect(outbox.getSnapshot().ops).toHaveLength(3);

        await goOnline();

        expect(sent.map((entry) => entry.url)).toEqual(['/first', '/second', '/third']);
        expect(outbox.getSnapshot().ops).toHaveLength(0);
    });

    it('retries transport failures with backoff and reuses the idempotency key', async () => {
        const sender = vi.fn()
            .mockRejectedValueOnce(networkError())
            .mockResolvedValueOnce({ status: 200, data: {} });
        const { outbox, sent } = setup({ send: sender });

        const { settled } = await outbox.submit(op());
        await vi.runAllTimersAsync();
        await settled;

        expect(sent).toHaveLength(2);
        expect(sent[1].idempotencyKey).toBe(sent[0].idempotencyKey);
    });

    it('rejects on a definitive 4xx, keeps it for review, and continues the queue', async () => {
        const sender = vi.fn()
            .mockRejectedValueOnce(httpError(400, { error: 'Session already completed' }))
            .mockResolvedValueOnce({ status: 200, data: {} });
        const { outbox, sent, goOnline } = setup({ send: sender, online: false });
        const onReject = vi.fn();
        outbox.registerHandler('instance.update', { onReject });

        const first = await outbox.submit(op({ url: '/bad' }));
        const second = await outbox.submit(op({ url: '/good', kind: 'note.create' }));
        await goOnline();

        await expect(first.settled).rejects.toThrow('Session already completed');
        await expect(second.settled).resolves.toBeTruthy();
        expect(sent.map((entry) => entry.url)).toEqual(['/bad', '/good']);
        expect(onReject).toHaveBeenCalledWith(
            expect.objectContaining({ url: '/bad' }),
            expect.objectContaining({ status: 400 }),
        );
        expect(outbox.getSnapshot().ops).toEqual([
            expect.objectContaining({ url: '/bad', state: OP_STATE.REJECTED }),
        ]);
    });

    it('cascades a rejected create to dependent writes without sending them', async () => {
        const sender = vi.fn(async (entry) => {
            if (entry.kind === 'activity.add') throw httpError(404, { error: 'Activity definition not found' });
            return { status: 200, data: {} };
        });
        const { outbox, sent, goOnline } = setup({ send: sender, online: false });

        await outbox.submit(op({ kind: 'activity.add', url: '/add', creates: ['inst-1'] }));
        const dependent = await outbox.submit(op({ url: '/metrics', entityIds: ['inst-1'] }));
        await outbox.submit(op({ url: '/unrelated', entityIds: ['inst-2'] }));
        await goOnline();

        await expect(dependent.settled).rejects.toThrow(/depends on/);
        expect(sent.map((entry) => entry.url)).toEqual(['/add', '/unrelated']);
        const rejected = outbox.getSnapshot().ops.filter((entry) => entry.state === OP_STATE.REJECTED);
        expect(rejected.map((entry) => entry.url)).toEqual(['/add', '/metrics']);
    });

    it('coalesces queued writes to the same field, keeping only the latest', async () => {
        const { outbox, sent, goOnline } = setup({ online: false });

        const first = await outbox.submit(op({ coalesceKey: 'instance:a:metrics', body: { value: 1 } }));
        await outbox.submit(op({ url: '/other' }));
        const second = await outbox.submit(op({ coalesceKey: 'instance:a:metrics', body: { value: 3 } }));
        await goOnline();

        await expect(first.settled).resolves.toBeTruthy();
        await expect(second.settled).resolves.toBeTruthy();
        expect(sent.map((entry) => entry.url)).toEqual(['/other', op().url]);
        expect(sent.filter((entry) => entry.coalesceKey)).toHaveLength(1);
        expect(sent.at(-1).body).toEqual({ value: 3 });
    });

    it('pauses on auth failure until the session is refreshed', async () => {
        const sender = vi.fn()
            .mockRejectedValueOnce(httpError(401))
            .mockResolvedValue({ status: 200, data: {} });
        const { outbox, sent } = setup({ send: sender });

        await outbox.submit(op());
        await outbox.flush();
        expect(outbox.getSnapshot().pausedForAuth).toBe(true);
        await vi.advanceTimersByTimeAsync(120000);
        expect(sent).toHaveLength(1);

        outbox.resumeAfterAuth();
        await vi.runAllTimersAsync();
        await outbox.flush();

        expect(sent).toHaveLength(2);
        expect(outbox.getSnapshot().ops).toHaveLength(0);
    });

    it('replays ops persisted by an earlier page load', async () => {
        const persisted = [{
            ...op({ url: '/from-before-reload' }),
            opId: 'old-1',
            idempotencyKey: 'key-1',
            seq: 1,
            attempts: 2,
            nextAttemptAt: 0,
            state: OP_STATE.PENDING,
            entityIds: [],
            creates: [],
        }];
        const { outbox, sent } = setup({ initial: persisted });

        await outbox.flush();

        expect(sent).toHaveLength(1);
        expect(sent[0].idempotencyKey).toBe('key-1');
    });

    it('resolves whenDrained once the scope has no pending ops', async () => {
        const { outbox, goOnline } = setup({ online: false });
        await outbox.submit(op());
        const drained = vi.fn();
        void outbox.whenDrained('session-1').then(drained);

        await Promise.resolve();
        expect(drained).not.toHaveBeenCalled();
        expect(outbox.hasPending('session-1')).toBe(true);

        await goOnline();
        await Promise.resolve();
        expect(drained).toHaveBeenCalled();
        expect(outbox.hasPending('session-1')).toBe(false);
    });

    it('reports drain and rejection health without content', async () => {
        const onEvent = vi.fn();
        let isUp = false;
        const sender = vi.fn()
            .mockRejectedValueOnce(httpError(409, { code: 'active_work_exists', error: 'secret detail' }))
            .mockResolvedValue({ status: 200, data: {} });
        const outbox = createOutbox({
            store: createMemoryStore(),
            send: sender,
            isOnline: () => isUp,
            lock: (callback) => callback(),
            onEvent,
        });

        await outbox.submit(op({ kind: 'session.timer', url: '/rejected', body: { note: 'private' } }));
        await outbox.submit(op({ url: '/a' }));
        await outbox.submit(op({ url: '/b' }));
        isUp = true;
        await outbox.flush();

        expect(onEvent).toHaveBeenCalledWith('rejected', { kind: 'session.timer', status: 409, code: 'active_work_exists' });
        expect(onEvent).toHaveBeenCalledWith('drained', expect.objectContaining({ ops: 2, retries: 0 }));
        expect(JSON.stringify(onEvent.mock.calls)).not.toMatch(/private|secret/);
    });

    it('lets a rejected op be retried or discarded', async () => {
        const sender = vi.fn()
            .mockRejectedValueOnce(httpError(400))
            .mockResolvedValue({ status: 200, data: {} });
        const { outbox } = setup({ send: sender });

        await outbox.submit(op({ url: '/a' }));
        await outbox.flush();
        const [rejected] = outbox.getSnapshot().ops;
        expect(rejected.state).toBe(OP_STATE.REJECTED);

        await outbox.retry(rejected.opId);
        await outbox.flush();
        expect(outbox.getSnapshot().ops).toHaveLength(0);

        sender.mockRejectedValueOnce(httpError(400));
        await outbox.submit(op({ url: '/b' }));
        await outbox.flush();
        const [again] = outbox.getSnapshot().ops;
        await outbox.discard(again.opId);
        expect(outbox.getSnapshot().ops).toHaveLength(0);
    });

    it('gives up on a change the server keeps failing so later changes still sync', async () => {
        const sender = vi.fn(async (entry) => {
            if (entry.url === '/poison') throw httpError(500, { error: 'boom' });
            return { status: 200, data: {} };
        });
        const { outbox, sent, goOnline } = setup({ send: sender, online: false });
        const poison = await outbox.submit(op({ url: '/poison' }));
        await outbox.submit(op({ url: '/after' }));

        await goOnline();
        await vi.runAllTimersAsync();

        await expect(poison.settled).rejects.toThrow(/kept failing/);
        expect(sent.filter((entry) => entry.url === '/poison')).toHaveLength(8);
        expect(sent.at(-1).url).toBe('/after');
        expect(outbox.getSnapshot().ops).toEqual([
            expect.objectContaining({ url: '/poison', state: OP_STATE.REJECTED, error: expect.objectContaining({ code: 'retry_exhausted' }) }),
        ]);
    });

    it('gives a manually retried change a fresh failure budget', async () => {
        let failing = true;
        const sender = vi.fn(async (entry) => {
            if (entry.url === '/flaky' && failing) throw httpError(500, { error: 'boom' });
            return { status: 200, data: {} };
        });
        const { outbox } = setup({ send: sender });
        const flaky = await outbox.submit(op({ url: '/flaky' }));
        await vi.runAllTimersAsync();
        await expect(flaky.settled).rejects.toThrow(/kept failing/);
        const [rejected] = outbox.getSnapshot().ops;

        await outbox.retry(rejected.opId);
        await outbox.flush();

        // One more failure must not exhaust the budget spent before the rejection.
        expect(outbox.getSnapshot().ops[0]).toMatchObject({ state: OP_STATE.PENDING, serverFailures: 1 });
        failing = false;
        await vi.runAllTimersAsync();
        expect(outbox.getSnapshot().ops).toHaveLength(0);
    });

    it('never gives up while the device simply has no connection', async () => {
        const sender = vi.fn().mockRejectedValue(networkError());
        const { outbox, sent } = setup({ send: sender });

        await outbox.submit(op({ url: '/waiting' }));
        await vi.advanceTimersByTimeAsync(30 * 60 * 1000);

        expect(sent.length).toBeGreaterThan(8);
        expect(outbox.getSnapshot().ops[0]).toMatchObject({ state: OP_STATE.PENDING, serverFailures: 0 });
    });

    it('drops queued edits to a deleted record, and cancels a create that never left the device', async () => {
        const { outbox, sent, goOnline } = setup({ online: false });
        const create = await outbox.submit(op({ kind: 'activity.add', url: '/add', creates: ['inst-1'] }));
        const edit = await outbox.submit(op({ url: '/edit', entityIds: ['inst-1'] }));
        await outbox.submit(op({ url: '/other', entityIds: ['inst-2'] }));
        const remove = await outbox.submit(op({ url: '/remove', method: 'delete', entityIds: ['inst-1'], supersedes: ['inst-1'] }));

        await expect(create.settled).resolves.toEqual({ superseded: true });
        await expect(edit.settled).resolves.toEqual({ superseded: true });
        await expect(remove.settled).resolves.toEqual({ superseded: true });
        await goOnline();
        expect(sent.map((entry) => entry.url)).toEqual(['/other']);
    });

    it('still sends a delete when the record already reached the server', async () => {
        const { outbox, sent, goOnline } = setup({ online: false });
        await outbox.submit(op({ url: '/edit', entityIds: ['saved-1'] }));
        await outbox.submit(op({ url: '/remove', method: 'delete', entityIds: ['saved-1'], supersedes: ['saved-1'] }));

        await goOnline();
        expect(sent.map((entry) => entry.url)).toEqual(['/remove']);
    });

    it('gives each change a unique position even across tabs sharing one queue', async () => {
        const store = createMemoryStore();
        let chain = Promise.resolve();
        const sharedLock = (callback) => {
            const run = chain.then(callback);
            chain = run.catch(() => {});
            return run;
        };
        const make = () => createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: sharedLock, now: () => 1000 });
        const [tabA, tabB] = [make(), make()];

        await Promise.all([
            tabA.submit(op({ url: '/a1' })), tabB.submit(op({ url: '/b1' })),
            tabA.submit(op({ url: '/a2' })), tabB.submit(op({ url: '/b2' })),
        ]);

        const seqs = (await store.getAll()).map((entry) => entry.seq);
        expect(new Set(seqs).size).toBe(4);
    });

    it('discards rejected changes after 7 days and says so', async () => {
        const onEvent = vi.fn();
        const day = 24 * 60 * 60 * 1000;
        const base = { kind: 'k', method: 'put', url: '/x', entityIds: [], creates: [], state: OP_STATE.REJECTED };
        const store = createMemoryStore([
            { ...base, opId: 'old', seq: 1, rejectedAt: Date.now() - 8 * day },
            { ...base, opId: 'recent', seq: 2, rejectedAt: Date.now() - day },
        ]);
        const outbox = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn(), onEvent });

        await outbox.ready();

        expect(outbox.getSnapshot().ops.map((entry) => entry.opId)).toEqual(['recent']);
        expect(onEvent).toHaveBeenCalledWith('expired', { count: 1 });
    });
});

