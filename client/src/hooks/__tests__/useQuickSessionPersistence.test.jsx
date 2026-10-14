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

const template = { id: 'template-1', name: 'Daily Weight' };
const emptyDraft = { activityInstances: [{ id: 'a', metrics: [{ metric_id: 'm', value: '' }], sets: [], notes: '' }] };
const filledDraft = { activityInstances: [{ id: 'a', metrics: [{ metric_id: 'm', value: '82.4' }], sets: [], notes: '' }] };

describe('hasQuickSessionInput', () => {
    it('ignores an untouched draft and notices any entered value', () => {
        expect(hasQuickSessionInput(emptyDraft)).toBe(false);
        expect(hasQuickSessionInput(filledDraft)).toBe(true);
        expect(hasQuickSessionInput({ activityInstances: [{ sets: [{ completed: true, metrics: [] }] }] })).toBe(true);
    });
});

describe('useQuickSessionPersistence', () => {
    beforeEach(() => {
        kv.clear();
        outboxRef.current = null;
        vi.useRealTimers();
    });

    it('saves an entered draft and restores it after a reload', async () => {
        const first = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: filledDraft, template,
        }));
        await waitFor(() => expect(kv.size).toBe(1));
        first.unmount();

        const reloaded = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: null, template: null,
        }));
        await waitFor(() => expect(reloaded.result.current.savedDraft).not.toBeNull());
        expect(reloaded.result.current.savedDraft).toMatchObject({ draft: filledDraft, template });

        await act(() => reloaded.result.current.clearDraft());
        expect(reloaded.result.current.savedDraft).toBeNull();
        expect(kv.size).toBe(0);
    });

    it('never saves an untouched draft', async () => {
        vi.useFakeTimers();
        renderHook(() => useQuickSessionPersistence({ rootId: 'root-1', userId: 'user-1', draft: emptyDraft, template }));
        await act(() => vi.advanceTimersByTimeAsync(1000));
        expect(kv.size).toBe(0);
    });

    it('reports a completion confirmed by the server as synced', async () => {
        outboxRef.current = createOutbox({
            store: createMemoryStore(), send: vi.fn(async () => ({ status: 201, data: {} })),
            isOnline: () => true, lock: (fn) => fn(),
        });
        const { result } = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: filledDraft, template,
        }));
        let outcome;
        await act(async () => {
            outcome = await result.current.queueCompletion({ name: 'Daily Weight' });
        });
        expect(outcome).toBe('synced');
    });

    it('queues completion with a client id so it can sync later', async () => {
        const store = createMemoryStore();
        outboxRef.current = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
        const { result } = renderHook(() => useQuickSessionPersistence({
            rootId: 'root-1', userId: 'user-1', draft: filledDraft, template,
        }));

        let outcome;
        await act(async () => {
            outcome = await result.current.queueCompletion({ name: 'Daily Weight', activity_instances: [] }, { waitMs: 10 });
        });

        expect(outcome).toBe('queued');
        const [op] = await store.getAll();
        expect(op).toMatchObject({
            kind: SESSION_OP.QUICK_COMPLETE,
            method: 'post',
            url: '/root-1/sessions/quick-complete',
            body: { name: 'Daily Weight' },
        });
        expect(op.scope).toBe(op.body.id);
    });
});
