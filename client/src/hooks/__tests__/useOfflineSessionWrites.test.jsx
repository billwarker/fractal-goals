import { QueryClient } from '@tanstack/react-query';
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createMemoryStore, createOutbox } from '../../offline/outbox';
import { SESSION_OP } from '../../offline/sessionOpHandlers';
import { queryKeys } from '../queryKeys';
import { useOfflineSessionWrites } from '../useOfflineSessionWrites';

const { outboxRef } = vi.hoisted(() => ({ outboxRef: { current: null } }));
vi.mock('../../offline/OutboxContext', () => ({ useOutbox: () => outboxRef.current }));
vi.mock('../../utils/notify', () => ({ default: { success: vi.fn(), error: vi.fn() } }));

const rootId = 'root-1';
const sessionId = 'session-1';
const activitiesKey = queryKeys.sessionActivities(rootId, sessionId);
const squat = { id: 'def-squat', name: 'Squat', has_sets: true, has_metrics: true, group_id: null };

function setup({ instances = [] } = {}) {
    const queryClient = new QueryClient();
    queryClient.setQueryData(activitiesKey, instances);
    queryClient.setQueryData(queryKeys.session(rootId, sessionId), { id: sessionId, is_paused: false });
    const store = createMemoryStore();
    outboxRef.current = createOutbox({ store, send: vi.fn(), isOnline: () => false, lock: (fn) => fn() });
    let draft = { sections: [{ name: 'Main', items: [] }] };
    const updateSessionDataDraft = (updater) => {
        draft = typeof updater === 'function' ? updater(draft) : updater;
    };
    const { result } = renderHook(() => useOfflineSessionWrites({
        rootId,
        sessionId,
        session: { id: sessionId, is_paused: false },
        activities: [squat],
        groupMap: {},
        queryClient,
        sessionActivitiesKey: activitiesKey,
        updateSessionDataDraft,
        setSessionDataDraft: updateSessionDataDraft,
        setShowActivitySelector: vi.fn(),
    }));
    return { result, queryClient, store, getDraft: () => draft };
}

describe('useOfflineSessionWrites', () => {
    beforeEach(() => {
        outboxRef.current = null;
    });

    it('is inert when offline sync is disabled', () => {
        const { result } = renderHook(() => useOfflineSessionWrites({ rootId, sessionId }));
        expect(result.current).toBeNull();
    });

    it('adds an activity instantly with a client id and queues the create', async () => {
        const { result, queryClient, store, getDraft } = setup();

        let placeholder;
        await act(async () => {
            placeholder = await result.current.addActivity(0, squat.id);
        });

        expect(queryClient.getQueryData(activitiesKey)).toEqual([expect.objectContaining({ id: placeholder.id, name: 'Squat' })]);
        expect(getDraft().sections[0].items).toEqual([{ type: 'activity', activity_instance_id: placeholder.id }]);
        const [op] = await store.getAll();
        expect(op).toMatchObject({
            kind: SESSION_OP.ACTIVITY_ADD,
            method: 'post',
            url: `/${rootId}/sessions/${sessionId}/activities`,
            body: { activity_definition_id: squat.id, section_index: 0, instance_id: placeholder.id },
            creates: [placeholder.id],
        });
    });

    it('starts a timer at the tap time and sends it as occurred_at', async () => {
        const instance = { id: 'i1', activity_definition_id: squat.id, time_start: null, completed: false };
        const { result, queryClient, store } = setup({ instances: [instance] });

        await act(async () => {
            await result.current.updateTimer('i1', 'start');
        });

        const [cached] = queryClient.getQueryData(activitiesKey);
        const [op] = await store.getAll();
        expect(cached.time_start).toBeTruthy();
        expect(op.body.occurred_at).toBe(cached.time_start);
        expect(op.url).toBe(`/${rootId}/activity-instances/i1/start`);
    });

    it('raises the same switch prompt as the server when another timer is running', async () => {
        const running = { id: 'i0', name: 'Row', activity_definition_id: 'def-row', time_start: '2026-10-13T10:00:00Z', time_stop: null, completed: false };
        const idle = { id: 'i1', activity_definition_id: squat.id, time_start: null, completed: false };
        const { result, store } = setup({ instances: [running, idle] });

        await expect(result.current.updateTimer('i1', 'start')).rejects.toMatchObject({
            response: { data: { code: 'active_work_exists', active_work: { activity_name: 'Row' } } },
        });
        expect(await store.getAll()).toEqual([]);
    });

    it('coalesces repeated metric edits into one queued write', async () => {
        const instance = { id: 'i1', activity_definition_id: squat.id, metrics: [] };
        const { result, store } = setup({ instances: [instance] });

        await act(async () => {
            await result.current.updateInstance('i1', { metrics: [{ metric_id: 'm1', value: '80' }] });
            await result.current.updateInstance('i1', { metrics: [{ metric_id: 'm1', value: '82.5' }] });
        });

        const ops = await store.getAll();
        expect(ops).toHaveLength(1);
        expect(ops[0].body).toEqual({ metrics: [{ value: 82.5, metric_id: 'm1', split_id: null }] });
    });
});
