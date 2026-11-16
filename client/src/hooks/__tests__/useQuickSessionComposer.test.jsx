import React from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, createOutbox } from '../../offline/outbox';
import { queryKeys } from '../queryKeys';
import { useQuickSessionComposer } from '../useQuickSessionComposer';

const { kv, outboxRef, completeQuickSession } = vi.hoisted(() => ({
    kv: new Map(),
    outboxRef: { current: null },
    completeQuickSession: vi.fn(),
}));
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
vi.mock('../../utils/api', () => ({ fractalApi: { completeQuickSession: (...args) => completeQuickSession(...args) } }));

const weighIn = { id: 'weigh', name: 'Weigh-in', has_sets: false, metric_definitions: [{ id: 'weight' }] };
const pastSession = {
    id: 'past-1',
    attributes: { session_data: { activity_ids: ['p-1', 'p-2'] } },
    activity_instances: [
        { id: 'p-1', activity_definition_id: 'weigh', metrics: [{ metric_id: 'weight', value: 82 }], sets: [] },
        { id: 'p-2', activity_definition_id: 'deleted-activity', metrics: [], sets: [] },
    ],
};

function renderComposer(queryClient = new QueryClient(), activityDefinitions = [weighIn]) {
    const wrapper = ({ children }) => <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
    return renderHook(
        () => useQuickSessionComposer({ rootId: 'root-1', activityDefinitions }),
        { wrapper },
    );
}

describe('useQuickSessionComposer', () => {
    beforeEach(() => {
        kv.clear();
        outboxRef.current = null;
        completeQuickSession.mockReset();
    });

    it('keeps the draft only while the page is open: nothing is saved, and coming back starts empty', () => {
        const first = renderComposer();
        act(() => first.result.current.addActivity(weighIn));
        expect(first.result.current.draft.items).toHaveLength(1);
        first.unmount();

        const again = renderComposer();
        expect(again.result.current.draft.items).toEqual([]);
        expect(kv.size).toBe(0);
    });

    it('starts over when the fractal changes', () => {
        const { result, rerender } = renderHook(
            ({ rootId }) => useQuickSessionComposer({ rootId, activityDefinitions: [weighIn] }),
            {
                initialProps: { rootId: 'root-1' },
                wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
            },
        );
        act(() => result.current.addActivity(weighIn));
        rerender({ rootId: 'root-2' });
        expect(result.current.draft.items).toEqual([]);
    });

    it('replaces the activities with a past session\'s, with last time\'s values, leaving out deleted ones', () => {
        const { result } = renderComposer();
        act(() => result.current.addActivity(weighIn));

        let missing;
        act(() => {
            missing = result.current.repeat(pastSession);
        });

        expect(missing).toBe(1);
        expect(result.current.draft.items).toHaveLength(1);
        expect(result.current.draft.items[0].previous).toEqual({ metrics: [{ metric_id: 'weight', value: 82 }] });
    });

    it('keeps a completion made with no signal and shows it as waiting to sync', async () => {
        const queryClient = new QueryClient();
        queryClient.setQueryData(queryKeys.recentQuickSessions('root-1'), []);
        outboxRef.current = createOutbox({
            store: createMemoryStore(), send: vi.fn(), isOnline: () => false, lock: (fn) => fn(),
        });
        const { result } = renderComposer(queryClient);
        act(() => result.current.addActivity(weighIn));
        act(() => result.current.setActivityValue(
            result.current.draft.items[0].key, { metrics: [{ metric_id: 'weight', value: 81 }] },
        ));

        let outcome;
        await act(async () => {
            outcome = await result.current.complete();
        });

        expect(outcome.outcome).toBe('queued');
        expect(queryClient.getQueryData(queryKeys.recentQuickSessions('root-1'))).toEqual([
            expect.objectContaining({
                id: outcome.id,
                pending: true,
                activity_instances: [expect.objectContaining({ metrics: [{ metric_id: 'weight', value: 81 }] })],
            }),
        ]);
        expect(result.current.draft.items).toEqual([]);
        expect(kv.size).toBe(0);
    }, 10_000);

    it('completes through the API when offline sync is unavailable, leaving out deleted activities', async () => {
        completeQuickSession.mockResolvedValue({ data: { id: 'server-1', completed: true } });
        const gone = { id: 'gone', name: 'Gone', metric_definitions: [] };
        const definitions = [weighIn, gone];
        const { result, rerender } = renderHook(
            ({ defs }) => useQuickSessionComposer({ rootId: 'root-1', activityDefinitions: defs }),
            {
                initialProps: { defs: definitions },
                wrapper: ({ children }) => <QueryClientProvider client={new QueryClient()}>{children}</QueryClientProvider>,
            },
        );
        act(() => result.current.addActivity(weighIn));
        act(() => result.current.addActivity(gone));
        rerender({ defs: [weighIn] });

        let outcome;
        await act(async () => {
            outcome = await result.current.complete();
        });

        expect(outcome).toEqual({ outcome: 'synced', id: 'server-1' });
        expect(completeQuickSession).toHaveBeenCalledWith('root-1', expect.objectContaining({
            activity_instances: [expect.objectContaining({ activity_definition_id: 'weigh' })],
        }));
        expect(result.current.draft.items).toEqual([]);
    });

    it('moves and removes activities', () => {
        const other = { id: 'other', name: 'Other', metric_definitions: [] };
        const { result } = renderComposer(new QueryClient(), [weighIn, other]);
        act(() => result.current.addActivity(weighIn));
        act(() => result.current.addActivity(other));
        act(() => result.current.moveActivity(1, -1));
        expect(result.current.draft.items.map((item) => item.name)).toEqual(['Other', 'Weigh-in']);
        act(() => result.current.removeActivity(result.current.draft.items[0].key));
        expect(result.current.draft.items.map((item) => item.name)).toEqual(['Weigh-in']);
    });

    it('does nothing for an empty quick session', async () => {
        const { result } = renderComposer();
        let outcome;
        await act(async () => {
            outcome = await result.current.complete();
        });
        expect(outcome).toBeNull();
        expect(completeQuickSession).not.toHaveBeenCalled();
    });
});
