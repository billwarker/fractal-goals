import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryKeys } from '../../hooks/queryKeys';
import { createMemoryStore, createOutbox } from '../outbox';
import { SESSION_OP, applyOptimistic, findSessionForActivity, registerSessionOpHandlers } from '../sessionOpHandlers';

vi.mock('../../utils/notify', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

const rootId = 'root-1';
const sessionId = 'session-1';
const activitiesKey = queryKeys.sessionActivities(rootId, sessionId);
const sessionKey = queryKeys.session(rootId, sessionId);

function harness({ send } = {}) {
    let online = false;
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const outbox = createOutbox({
        store: createMemoryStore(),
        send: send || (async (op) => ({ status: 200, data: op.meta.serverResponse })),
        isOnline: () => online,
        lock: (callback) => callback(),
    });
    const cleanup = registerSessionOpHandlers(outbox, queryClient);
    return {
        queryClient,
        outbox,
        cleanup,
        goOnline: () => {
            online = true;
            return outbox.flush();
        },
    };
}

async function enqueue(outbox, queryClient, op) {
    const full = { scope: sessionId, method: 'put', url: '/x', entityIds: [], ...op, meta: { rootId, sessionId, ...op.meta } };
    applyOptimistic(queryClient, full);
    return outbox.submit(full);
}

describe('session op handlers', () => {
    let env;

    beforeEach(() => {
        env = harness();
        env.queryClient.setQueryData(activitiesKey, [{ id: 'i1', completed: false, notes: null }]);
        env.queryClient.setQueryData(sessionKey, { id: sessionId, is_paused: false, attributes: {} });
    });

    afterEach(() => {
        env.cleanup();
        env.queryClient.clear();
    });

    it('keeps unsynced edits visible when stale server data lands', async () => {
        const { queryClient, outbox } = env;
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.INSTANCE_UPDATE,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', updates: { notes: 'paused at rack' } },
        });

        // A refetch returns the server's pre-edit copy.
        await queryClient.fetchQuery({
            queryKey: activitiesKey,
            queryFn: async () => [{ id: 'i1', completed: false, notes: null }],
            staleTime: 0,
        });

        expect(queryClient.getQueryData(activitiesKey)[0].notes).toBe('paused at rack');
    });

    it('applies the server copy on ack only when nothing newer is queued for that record', async () => {
        const { queryClient, outbox, goOnline } = env;
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.INSTANCE_UPDATE,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', updates: { notes: 'v1' }, serverResponse: { id: 'i1', notes: 'v1', version: 2 } },
        });

        await goOnline();

        expect(queryClient.getQueryData(activitiesKey)[0]).toEqual({ id: 'i1', notes: 'v1', version: 2 });
    });

    it('shows an activity added offline and keeps it through a refetch', async () => {
        const { queryClient, outbox } = env;
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.ACTIVITY_ADD,
            creates: ['i2'],
            meta: { instanceId: 'i2', placeholder: { id: 'i2', name: 'Squat' } },
        });

        await queryClient.fetchQuery({
            queryKey: activitiesKey,
            queryFn: async () => [{ id: 'i1' }],
            staleTime: 0,
        });

        expect(queryClient.getQueryData(activitiesKey).map((entry) => entry.id)).toEqual(['i1', 'i2']);
    });

    it('shows a circuit added offline in its section and keeps it through a refetch', async () => {
        const { queryClient, outbox } = env;
        const circuitsKey = queryKeys.sessionCircuitRuns(rootId, sessionId);
        queryClient.setQueryData(circuitsKey, []);
        queryClient.setQueryData(sessionKey, {
            id: sessionId,
            attributes: { session_data: { sections: [{ name: 'Main', items: [{ type: 'activity', activity_instance_id: 'i1' }] }] } },
        });
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.CIRCUIT_CREATE,
            creates: ['run-1'],
            meta: { runId: 'run-1', placeholder: { id: 'run-1', rounds: [] }, sectionIndex: 0, itemIndex: 0 },
        });

        await queryClient.fetchQuery({ queryKey: circuitsKey, queryFn: async () => [], staleTime: 0 });
        await queryClient.fetchQuery({
            queryKey: sessionKey,
            queryFn: async () => ({ id: sessionId, attributes: { session_data: { sections: [{ name: 'Main', items: [] }] } } }),
            staleTime: 0,
        });

        expect(queryClient.getQueryData(circuitsKey).map((run) => run.id)).toEqual(['run-1']);
        expect(queryClient.getQueryData(sessionKey).attributes.session_data.sections[0].items)
            .toEqual([{ type: 'circuit', circuit_run_id: 'run-1' }]);
    });

    it('refreshes the session once after its queue drains', async () => {
        const { queryClient, outbox, goOnline } = env;
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.PAUSE,
            entityIds: [sessionId],
            meta: { occurredAt: '2026-10-13T10:00:00.000Z', serverResponse: { id: sessionId, is_paused: true } },
        });
        expect(queryClient.getQueryData(sessionKey).is_paused).toBe(true);
        expect(invalidate).not.toHaveBeenCalled();

        await goOnline();

        const invalidatedKeys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters.queryKey));
        expect(invalidatedKeys).toContain(JSON.stringify(sessionKey));
        expect(invalidatedKeys).toContain(JSON.stringify(activitiesKey));
    });

    it('finds which cached session an instance or set belongs to', () => {
        env.queryClient.setQueryData(activitiesKey, [{ id: 'i1', sets: [{ id: 'set-1' }] }]);
        expect(findSessionForActivity(env.queryClient, rootId, { instanceId: 'i1' })).toEqual({ sessionId, instanceId: 'i1' });
        expect(findSessionForActivity(env.queryClient, rootId, { setId: 'set-1' })).toEqual({ sessionId, instanceId: 'i1' });
        expect(findSessionForActivity(env.queryClient, rootId, { instanceId: 'nope' })).toBeNull();
    });

    it('shows queued tag and goal-link changes on the instance', async () => {
        const { queryClient, outbox } = env;
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.INSTANCE_TAGS,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', tags: [{ id: 't1', name: 'Heavy' }] },
        });
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.INSTANCE_GOAL_LINK,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', goalId: 'g2', remove: false },
        });

        const [instance] = queryClient.getQueryData(activitiesKey);
        expect(instance.tags).toEqual([{ id: 't1', name: 'Heavy' }]);
        expect(instance.associated_goal_ids).toEqual(['g2']);
    });
});

