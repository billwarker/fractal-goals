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

    describe('progress chart on save', () => {
        const seriesKey = (scope = 'all') => [...queryKeys.activityProgressTimeline(rootId, 'a1', 'i1'), 'series', 60, scope];
        const row = { id: 'i1', session_date: '2026-11-04T09:00:00Z', sets: [{ metrics: [{ metric_id: 'm1', value: 100 }] }], metrics: [], progress_comparison: null };
        const past = { id: 'past', session_date: '2026-11-01T09:00:00Z', sets: [{ metrics: [{ metric_id: 'm1', value: 90 }] }], metrics: [] };
        const saved = {
            id: 'i1',
            activity_definition_id: 'a1',
            completed: false,
            sets: [{ metrics: [{ metric_id: 'm1', value: 120 }] }],
            metrics: [],
            progress_comparison: { previous_instance_id: 'past', metric_comparisons: [{ metric_id: 'm1', current_value: 120 }] },
        };
        const update = (serverResponse, updates = { sets: saved.sets }) => ({
            kind: SESSION_OP.INSTANCE_UPDATE,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', updates, serverResponse },
        });

        beforeEach(() => {
            env.queryClient.setQueryData(activitiesKey, [{ id: 'i1', activity_definition_id: 'a1', sets: row.sets, progress_comparison: null }]);
            env.queryClient.setQueryData(seriesKey(), { chart_settings: {}, instances: [past, row] });
        });

        it('moves the point and the hints together when a save is acknowledged', async () => {
            const { queryClient, outbox, goOnline } = env;
            await enqueue(outbox, queryClient, update(saved));

            // Queued but unconfirmed: the session shows the edit, the chart still shows confirmed values.
            expect(queryClient.getQueryData(seriesKey()).instances[1].sets).toEqual(row.sets);
            await goOnline();

            const instance = queryClient.getQueryData(activitiesKey)[0];
            const [pastRow, currentRow] = queryClient.getQueryData(seriesKey()).instances;
            expect(instance.progress_comparison).toEqual(saved.progress_comparison);
            expect(currentRow.progress_comparison).toEqual(saved.progress_comparison);
            expect(currentRow.sets).toEqual(saved.sets);
            expect(currentRow.session_date).toBe(row.session_date);
            expect(pastRow).toEqual(past);
        });

        it('holds both until the newest queued edit is acknowledged', async () => {
            const newest = { ...saved, sets: [{ metrics: [{ metric_id: 'm1', value: 130 }] }] };
            const betweenAcks = [];
            env.cleanup();
            env = harness({
                send: async (op) => {
                    betweenAcks.push({
                        seriesSets: env.queryClient.getQueryData(seriesKey()).instances[1].sets,
                        comparison: env.queryClient.getQueryData(activitiesKey)[0].progress_comparison,
                    });
                    return { status: 200, data: op.meta.serverResponse };
                },
            });
            const { queryClient, outbox, goOnline } = env;
            queryClient.setQueryData(activitiesKey, [{ id: 'i1', activity_definition_id: 'a1', sets: row.sets, progress_comparison: null }]);
            queryClient.setQueryData(seriesKey(), { chart_settings: {}, instances: [past, row] });
            await enqueue(outbox, queryClient, update(saved));
            await enqueue(outbox, queryClient, update(newest, { sets: newest.sets }));
            await goOnline();

            // The second send runs after the first ack: neither surface moved for the older save.
            expect(betweenAcks).toHaveLength(2);
            expect(betweenAcks[1]).toEqual({ seriesSets: row.sets, comparison: null });
            expect(queryClient.getQueryData(seriesKey()).instances[1].sets).toEqual(newest.sets);
            expect(queryClient.getQueryData(activitiesKey)[0].progress_comparison).toEqual(newest.progress_comparison);
        });

        it('leaves the chart alone when a save is rejected', async () => {
            env.cleanup();
            env = harness({ send: async () => { const error = new Error('Rejected'); error.response = { status: 400, data: { error: 'Rejected' } }; throw error; } });
            const { queryClient, outbox, goOnline } = env;
            queryClient.setQueryData(activitiesKey, [{ id: 'i1', activity_definition_id: 'a1', sets: row.sets }]);
            queryClient.setQueryData(seriesKey(), { chart_settings: {}, instances: [past, row] });
            await enqueue(outbox, queryClient, update(saved));
            await goOnline();

            expect(queryClient.getQueryData(seriesKey()).instances[1]).toEqual(row);
        });

        it('refreshes the chart once the queue drains', async () => {
            const { queryClient, outbox, goOnline } = env;
            const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
            await enqueue(outbox, queryClient, update(saved));
            await goOnline();

            const keys = invalidate.mock.calls.map(([filters]) => JSON.stringify(filters.queryKey));
            expect(keys).toContain(JSON.stringify(['activity-progress-timeline', rootId]));
        });
    });

    it('finds which cached session an instance or set belongs to', () => {
        env.queryClient.setQueryData(activitiesKey, [{ id: 'i1', sets: [{ id: 'set-1' }] }]);
        expect(findSessionForActivity(env.queryClient, rootId, { instanceId: 'i1' })).toEqual({ sessionId, instanceId: 'i1' });
        expect(findSessionForActivity(env.queryClient, rootId, { setId: 'set-1' })).toEqual({ sessionId, instanceId: 'i1' });
        expect(findSessionForActivity(env.queryClient, rootId, { instanceId: 'nope' })).toBeNull();
    });

    it('refetches timelines only once the server has a queued tag or comparison change', async () => {
        const { queryClient, outbox, goOnline } = env;
        const invalidate = vi.spyOn(queryClient, 'invalidateQueries');
        const timelineFilter = { queryKey: ['activity-progress-timeline', rootId], refetchType: 'all' };
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.INSTANCE_TAGS,
            entityIds: ['i1'],
            meta: { instanceId: 'i1', tags: [], serverResponse: { tags: [], version: 2, progress_comparison: { previous_instance_id: 'p1' } } },
        });
        await enqueue(outbox, queryClient, {
            kind: SESSION_OP.PROGRESS_COMPARISON,
            entityIds: ['i1'],
            coalesceKey: 'progress-comparison:i1',
            meta: {
                instanceId: 'i1',
                comparisonContext: { mode: 'all', tag_ids: [], tags: [] },
                serverResponse: { comparison_context: { mode: 'all', tag_ids: [], tags: [], version: 2 }, progress_comparison: { previous_instance_id: 'p2' } },
            },
        });
        // While queued, the server still answers with the old context, so nothing refetches yet.
        expect(invalidate).not.toHaveBeenCalledWith(timelineFilter);

        await goOnline();

        expect(invalidate).toHaveBeenCalledWith(timelineFilter);
        const [instance] = queryClient.getQueryData(activitiesKey);
        expect(instance.comparison_context.version).toBe(2);
        expect(instance.progress_comparison.previous_instance_id).toBe('p2');
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

