// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';

import { createIndexedDbStore } from '../indexedDbStore';

const domError = (name) => Object.assign(new Error(name), { name });

/** Just enough IndexedDB for the store: one object store, async requests, droppable connections. */
function fakeIndexedDb() {
    const rows = new Map();
    const state = { opens: 0, failOpens: 0, connections: [], durability: [] };
    const request = (run) => {
        const req = {};
        queueMicrotask(() => {
            try {
                req.result = run();
                req.onsuccess?.();
            } catch (error) {
                req.error = error;
                req.onerror?.();
            }
        });
        return req;
    };
    const connect = () => {
        const db = {
            dropped: false,
            objectStoreNames: { contains: () => true },
            close() { this.dropped = true; },
            transaction(_name, mode, options) {
                if (db.dropped) throw domError('InvalidStateError');
                state.durability.push([mode, options?.durability]);
                const tx = {};
                let pending = 0;
                const finish = () => queueMicrotask(() => tx.oncomplete?.());
                const track = (run) => {
                    pending += 1;
                    return request(() => {
                        const value = run();
                        pending -= 1;
                        if (pending === 0) finish();
                        return value;
                    });
                };
                tx.objectStore = () => ({
                    getAll: () => track(() => [...rows.values()].map((op) => ({ ...op }))),
                    put: (op) => track(() => rows.set(op.opId, { ...op })),
                    delete: (key) => track(() => rows.delete(key)),
                    clear: () => track(() => rows.clear()),
                });
                return tx;
            },
        };
        state.connections.push(db);
        return db;
    };
    const factory = {
        open() {
            state.opens += 1;
            const req = {};
            queueMicrotask(() => {
                if (state.failOpens > 0) {
                    state.failOpens -= 1;
                    req.error = domError('UnknownError');
                    req.onerror?.();
                    return;
                }
                req.result = connect();
                req.onsuccess?.();
            });
            return req;
        },
    };
    return { factory, rows, state };
}

const op = (opId) => ({ opId, seq: 1 });

describe('indexedDbStore', () => {
    it('writes with strict durability', async () => {
        const { factory, state } = fakeIndexedDb();
        const store = createIndexedDbStore('u', { factory });
        await store.put(op('a'));
        await store.getAll();

        expect(state.durability).toEqual([['readwrite', 'strict'], ['readonly', undefined]]);
    });

    it('reconnects when the browser drops the connection, without losing the write', async () => {
        const { factory, rows, state } = fakeIndexedDb();
        const store = createIndexedDbStore('u', { factory });
        await store.put(op('a'));
        state.connections[0].dropped = true;

        await store.put(op('b'));

        expect(state.opens).toBe(2);
        expect([...rows.keys()]).toEqual(['a', 'b']);
        expect(store.isVolatile()).toBe(false);
    });

    it('reopens after a connection is closed for a version change', async () => {
        const { factory, state } = fakeIndexedDb();
        const store = createIndexedDbStore('u', { factory });
        await store.getAll();
        state.connections[0].onversionchange();

        await store.getAll();

        expect(state.connections[0].dropped).toBe(true);
        expect(state.opens).toBe(2);
    });

    it('holds changes in memory when IndexedDB will not open, then moves them back', async () => {
        const { factory, rows, state } = fakeIndexedDb();
        let clock = 0;
        const onEvent = vi.fn();
        const store = createIndexedDbStore('u', { factory, now: () => clock, onEvent });
        // The first and the immediate reconnect both fail.
        state.failOpens = 2;

        await store.put(op('kept-in-memory'));
        expect(store.isVolatile()).toBe(true);
        expect(rows.size).toBe(0);
        expect(onEvent).toHaveBeenCalledWith('store_volatile', { name: 'UnknownError' });

        clock = 31000;
        await store.put(op('after-recovery'));

        expect(store.isVolatile()).toBe(false);
        expect([...rows.keys()].sort()).toEqual(['after-recovery', 'kept-in-memory']);
        expect(onEvent).toHaveBeenCalledWith('store_reopened', { moved: 1 });
    });

    it('passes on failures that a new connection would not fix', async () => {
        const { factory, state } = fakeIndexedDb();
        const store = createIndexedDbStore('u', { factory });
        await store.getAll();
        state.connections[0].transaction = () => {
            throw domError('QuotaExceededError');
        };

        await expect(store.put(op('a'))).rejects.toThrow('QuotaExceededError');
        expect(store.isVolatile()).toBe(false);
    });
});
