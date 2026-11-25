import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../utils/notify', () => ({ default: { error: vi.fn(), success: vi.fn() } }));

import { queryKeys } from '../../hooks/queryKeys';
import { buildTemplateSessionPayload } from '../../utils/createSessionPayload';
import { plannedSetId, runSlotInstanceId } from '../circuitIds';
import { createMemoryStore } from '../memoryStore';
import { createOutbox } from '../outbox';
import { registerSessionOpHandlers } from '../sessionOpHandlers';
import { startSessionOffline } from '../sessionStart';

const ROOT = 'root';
const press = { id: 'press', name: 'Press', has_sets: true, has_metrics: true, group_id: 'g' };
const jump = { id: 'jump', name: 'Jump', has_sets: false, has_metrics: false };
const circuit = { id: 'circuit', name: 'Finisher', version: 1, slots: [
    { id: 'slot', sort_order: 0, activity_definition_id: 'press', activity: press },
] };
const template = {
    id: 'template', name: 'Push day', template_data: { sections: [{ name: 'Main', items: [
        { type: 'activity', activity_id: 'press', item_key: 'a', prescription: { tags: ['heavy'], sets: [{ tags: ['paused'] }, {}] } },
        { type: 'circuit', circuit_definition_id: 'circuit', item_key: 'c', prescription: { rounds: [{}, {}, {}] } },
        { type: 'activity', activity_id: 'jump', item_key: 'b' },
    ] }] },
};

function setup(send = async () => ({ data: {} })) {
    let online = false;
    const queryClient = new QueryClient();
    queryClient.setQueryData(queryKeys.activities(ROOT), [press, jump]);
    queryClient.setQueryData(queryKeys.circuits(ROOT, false), [circuit]);
    queryClient.setQueryData(queryKeys.activityGroups(ROOT), [{ id: 'g', name: 'Upper' }]);
    queryClient.setQueryData([...queryKeys.activityTagCatalog(ROOT), {}], { tags: [{ id: 'heavy', name: 'Heavy' }, { id: 'paused', name: 'Paused' }] });
    const outbox = createOutbox({ store: createMemoryStore(), send, isOnline: () => online, lock: (run) => run() });
    registerSessionOpHandlers(outbox, queryClient);
    const start = (payload = buildTemplateSessionPayload(template, null, [], { plan_ref: { date: 'x' } })) => (
        startSessionOffline(outbox, queryClient, { rootId: ROOT, userId: 'user', template, payload })
    );
    return { queryClient, outbox, start, connect: () => { online = true; return outbox.flush(); } };
}

describe('starting a session with no signal', () => {
    it('shows every planned item under the ids the server will give it', async () => {
        const { queryClient, outbox, start } = setup();
        const session = await start();
        const instances = queryClient.getQueryData(queryKeys.sessionActivities(ROOT, session.id));
        const [run] = queryClient.getQueryData(queryKeys.sessionCircuitRuns(ROOT, session.id));
        const [first, middle, last] = session.attributes.session_data.sections[0].items;
        const planned = instances.find(({ id }) => id === first.activity_instance_id);
        expect(planned).toMatchObject({ name: 'Press', group_name: 'Upper', tags: [{ id: 'heavy' }] });
        expect(planned.sets.map(({ id }) => id)).toEqual([await plannedSetId(planned.id, 0), await plannedSetId(planned.id, 1)]);
        expect(planned.sets[0].effective_tags.map(({ id }) => id)).toEqual(['heavy', 'paused']);
        expect(middle.circuit_run_id).toBe(run.id);
        expect(run.rounds).toHaveLength(3);
        expect(instances.map(({ id }) => id)).toContain(await runSlotInstanceId(run.id, 'slot'));
        expect(instances.map(({ id }) => id)).toContain(last.activity_instance_id);

        const [op] = outbox.pendingOps(session.id);
        const [bodyFirst, bodyMiddle] = op.body.session_data.sections[0].items;
        expect(op.body).toMatchObject({ id: session.id, template_id: 'template' });
        expect([bodyFirst.instance_id, bodyMiddle.circuit_run_id]).toEqual([planned.id, run.id]);
        expect(bodyFirst.item_key).toBe('a');
        expect(op.body).not.toHaveProperty('plan_ref');
        expect(queryClient.getQueryData(queryKeys.activeSession('user', ROOT)).id).toBe(session.id);
    });

    it('asks for a connection when something it uses is not on this device', async () => {
        const { queryClient, outbox, start } = setup();
        queryClient.setQueryData(queryKeys.circuits(ROOT, false), []);
        await expect(start()).resolves.toBeNull();
        expect(outbox.hasPending()).toBe(false);
    });

    it('waits, losing nothing, while another session is in progress', async () => {
        vi.useFakeTimers();
        let busy = true;
        const sent = [];
        const { outbox, start, connect } = setup(async (op) => {
            if (busy) {
                throw Object.assign(new Error('409'), {
                    config: { method: 'post', url: `/api${op.url}` },
                    response: { status: 409, data: { code: 'active_session_exists', error: 'In progress', active_session: { id: 's2', root_id: ROOT, name: 'On the Mac' } } },
                });
            }
            sent.push(op.kind);
            return { data: {} };
        });
        const session = await start();
        await outbox.submit({ scope: session.id, kind: 'session.timer', method: 'post', url: '/x', meta: { rootId: ROOT, sessionId: session.id } });
        await connect();
        // For days, if need be: it is never given up on, and nothing goes ahead of it.
        await vi.advanceTimersByTimeAsync(3 * 24 * 60 * 60 * 1000);
        expect(outbox.pendingOps(session.id)).toHaveLength(2);
        expect(outbox.pendingOps(session.id)[0].lastError.activeSession).toEqual({ id: 's2', rootId: ROOT, name: 'On the Mac' });
        busy = false;
        await vi.advanceTimersByTimeAsync(60 * 1000);
        expect(sent).toEqual(['session.start', 'session.timer']);
        vi.useRealTimers();
    });
});
