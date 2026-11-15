import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, createOutbox } from '../../offline/outbox';
import { SESSION_OP } from '../../offline/sessionOpHandlers';
import { hasQuickSessionInput, useQuickSessionPersistence } from '../useQuickSessionPersistence';

const { kv, outboxRef } = vi.hoisted(() => ({ kv: new Map(), outboxRef: { current: null } }));
vi.mock('../../offline/idbKeyValue', () => ({
    idbGet: async (key) => kv.get(key),
    idbSet: async (key, value) => {
        kv.set(key, value);
    },
    idbDelete: async (key) => {
        kv.delete(key);
    },
}));
vi.mock('../../offline/OutboxContext', () => ({ useOutbox: () => outboxRef.current }));

const emptyDraft = { version: 3, items: [] };
const chosenDraft = { version: 3, items: [{ key: 'a', activity_definition_id: 'act', value: null }] };

describe('hasQuickSessionInput', () => {
    it('counts a chosen activity as input, even before any value is entered', () => {
        expect(hasQuickSessionInput(null)).toBe(false);
        expect(hasQuickSessionInput(emptyDraft)).toBe(false);
        expect(hasQuickSessionInput(chosenDraft)).toBe(true);
    });
});

describe('useQuickSessionPersistence', () => {
    beforeEach(() => {
        kv.clear();
        outboxRef.current = null;
        vi.useRealTimers();
    });

    it('saves a draft with activities and restores it after a reload', async () => {
        const first = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: chosenDraft,
        }));
        await waitFor(() => expect(kv.size).toBe(1));
        first.unmount();

        const reloaded = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: null,
        }));
        await waitFor(() => expect(reloaded.result.current.savedDraft).not.toBeNull());
        expect(reloaded.result.current.savedDraft).toMatchObject({ draft: chosenDraft });

        await act(() => reloaded.result.current.clearDraft());
        expect(reloaded.result.current.savedDraft).toBeNull();
        expect(kv.size).toBe(0);
    });

    it('forgets the saved draft once its last activity is removed', async () => {
        vi.useFakeTimers();
        const { rerender } = renderHook(({ draft }) => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft,
        }), { initialProps: { draft: chosenDraft } });
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(kv.size).toBe(1);

        rerender({ draft: emptyDraft });
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(kv.size).toBe(0);
    });

    it('leaves a saved draft alone until the user changes something', async () => {
        kv.set('quick-draft:user-1:root-1', { draft: chosenDraft, savedAt: Date.now() });
        vi.useFakeTimers();
        renderHook(() => useQuickSessionPersistence({ rootId: 'root-1', userId: 'user-1', draft: null }));
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(kv.size).toBe(1);
    });

    it('reports a completion confirmed by the server as synced', async () => {
        outboxRef.current = createOutbox({
            store: createMemoryStore(), send: vi.fn(async () => ({ status: 201, data: {} })),
            isOnline: () => true, lock: (fn) => fn(),
        });
        const { result } = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: chosenDraft,
        }));
        let queued;
        await act(async () => {
            queued = await result.current.queueCompletion({ name: 'Quick Session' });
        });
        expect(queued).toEqual({ outcome: 'synced', id: expect.any(String) });
    });

    it('queues completion with a client id so it can sync later', async () => {
        const store = createMemoryStore();
        outboxRef.current = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
        const { result } = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: chosenDraft,
        }));

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
