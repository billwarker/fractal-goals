import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, createOutbox } from '../../offline/outbox';
import { SESSION_OP } from '../../offline/sessionOpHandlers';
import { hasQuickSessionInput, useQuickSessionCompletion } from '../useQuickSessionCompletion';

const { outboxRef } = vi.hoisted(() => ({ outboxRef: { current: null } }));
vi.mock('../../offline/OutboxContext', () => ({ useOutbox: () => outboxRef.current }));

describe('hasQuickSessionInput', () => {
    it('counts a chosen activity as input, even before any value is entered', () => {
        expect(hasQuickSessionInput(null)).toBe(false);
        expect(hasQuickSessionInput({ items: [] })).toBe(false);
        expect(hasQuickSessionInput({ items: [{ key: 'a' }] })).toBe(true);
    });
});

describe('useQuickSessionCompletion', () => {
    beforeEach(() => {
        outboxRef.current = null;
    });

    it('has nothing to queue through when offline sync is unavailable', async () => {
        const { result } = renderHook(() => useQuickSessionCompletion({ rootId: 'root-1' }));
        let queued;
        await act(async () => {
            queued = await result.current.queueCompletion({ name: 'Quick Session' });
        });
        expect(queued).toBeNull();
    });

    it('reports a completion confirmed by the server as synced', async () => {
        outboxRef.current = createOutbox({
            store: createMemoryStore(), send: vi.fn(async () => ({ status: 201, data: {} })),
            isOnline: () => true, lock: (fn) => fn(),
        });
        const { result } = renderHook(() => useQuickSessionCompletion({ rootId: 'root-1' }));
        let queued;
        await act(async () => {
            queued = await result.current.queueCompletion({ name: 'Quick Session' });
        });
        expect(queued).toEqual({ outcome: 'synced', id: expect.any(String) });
    });

    it('queues completion with a client id so it can sync later', async () => {
        const store = createMemoryStore();
        outboxRef.current = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
        const { result } = renderHook(() => useQuickSessionCompletion({ rootId: 'root-1' }));

        let queued;
        await act(async () => {
            queued = await result.current.queueCompletion({ name: 'Quick Session', activity_instances: [] }, { waitMs: 10 });
        });

        expect(queued.outcome).toBe('queued');
        const [op] = await store.getAll();
        expect(op).toMatchObject({
            kind: SESSION_OP.QUICK_COMPLETE,
            method: 'post',
            url: '/root-1/sessions/quick-complete',
            body: { name: 'Quick Session', id: queued.id },
        });
        expect(op.scope).toBe(op.body.id);
    });
});
