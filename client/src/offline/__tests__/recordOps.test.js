import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { online, getConflicts, warning } = vi.hoisted(() => ({
    online: { value: false }, getConflicts: vi.fn(), warning: vi.fn(),
}));
vi.mock('../connectivity', () => ({ isOnline: () => online.value }));
vi.mock('../../utils/api/syncApi', () => ({ syncApi: { getConflicts } }));
vi.mock('../../utils/notify', () => ({ default: { warning, error: vi.fn() } }));

import { buildConditionPayload, conditionToDraft } from '../../utils/goalConditions';
import { queryKeys } from '../../hooks/queryKeys';
import { activityMetricId } from '../circuitIds';
import { createMemoryStore } from '../memoryStore';
import { createOutbox } from '../outbox';
import { registerRecordOpHandlers } from '../recordOpHandlers';
import {
    changedGoalFields, queueActivityCreate, queueGoalCreate, queueGoalUpdate, queueNoteCreate, queueNoteDelete, queueNoteUpdate,
    queueTemplateCreate, queueTemplateUpdate,
} from '../recordOps';
import { shouldQueueRecord } from '../recordQueue';

const ROOT = 'root';
const treeKey = queryKeys.fractalTree(ROOT);
const notesKey = queryKeys.goalNotes(ROOT, 'g1', {});
const tree = () => ({ id: ROOT, name: 'Root', children: [{ id: 'g1', name: 'Old', description: 'D', children: [] }] });

describe('offline goal and note writes', () => {
    let queryClient;
    let outbox;
    let sent;
    let stop;

    beforeEach(() => {
        online.value = false;
        sent = [];
        getConflicts.mockReset().mockResolvedValue({ data: { conflicts: [] } });
        warning.mockReset();
        queryClient = new QueryClient();
        queryClient.setQueryData(treeKey, tree());
        queryClient.setQueryData(notesKey, [{ id: 'n1', content: 'First' }]);
        outbox = createOutbox({
            store: createMemoryStore(),
            send: async (op) => {
                sent.push(op);
                return { data: {} };
            },
            isOnline: () => online.value,
        });
        stop = registerRecordOpHandlers(outbox, queryClient);
    });

    afterEach(() => stop());

    const reconnect = async () => {
        online.value = true;
        await outbox.flush();
        await vi.waitFor(() => expect(outbox.hasPending()).toBe(false));
    };

    it('shows a new goal at once and sends it with the same id, before its note', async () => {
        const goal = await queueGoalCreate(outbox, ROOT, { name: 'New', type: 'LongTermGoal', parent_id: ROOT });
        // Its parent id travels in attributes, like the server's goals.
        expect(queryClient.getQueryData(treeKey).children.map((child) => child.name)).toEqual(['Old', 'New']);
        await queueNoteCreate(outbox, ROOT, { context_type: 'goal', context_id: goal.id, content: 'Why' });
        await reconnect();
        expect(sent.map((op) => op.url)).toEqual(['/root/goals', '/root/notes']);
        expect(sent[0].body.id).toBe(goal.id);
        expect(sent[1].body.context_id).toBe(goal.id);
    });

    it('edits carry what each field held, so the server can merge them', async () => {
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'A', track_activities: false });
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'B' });
        expect(queryClient.getQueryData(treeKey).children[0].name).toBe('B');
        await reconnect();
        expect(sent.map((op) => op.body._base)).toEqual([{ name: 'Old' }, { name: 'A' }]);
        expect(Date.parse(sent[0].body._edited_at)).not.toBeNaN();
        expect(sent[0].body.track_activities).toBe(false);
    });

    it('queues only what the form really changed', async () => {
        const condition = {
            id: 'c', activity_definition_id: 'a', kind: 'consistency', measure: 'sets', min_sets: 1, required_count: 3,
            rules: [], tag_ids: [], tag_match: 'contains', set_aggregate: 'each', consecutive: false, name: null,
        };
        const goal = {
            id: 'g1', name: 'Old', description: 'D', deadline: '2026-12-01T00:00:00Z', started_at: '2026-01-01T09:00:00Z',
            completion_condition: 'activity_threshold', condition,
            attributes: { track_activities: true, inherit_parent_activities: false },
        };
        const form = {
            name: 'Old', description: 'D', deadline: '2026-12-01', started_at: '2026-01-01',
            track_activities: true, inherit_parent_activities: false,
            completion_condition: 'activity_threshold', condition: buildConditionPayload(conditionToDraft(condition)),
            review_cadence_value: null, review_cadence_unit: null, review_disabled: false,
            attachments: [{ asset_id: 'm1', alt_text: '' }],
        };
        const saved = [{ asset_id: 'm1' }];
        expect(changedGoalFields(goal, form, saved)).toEqual({});
        expect(changedGoalFields(goal, { ...form, name: 'New' }, saved)).toEqual({ name: 'New' });
        expect(changedGoalFields(goal, { ...form, deadline: null }, saved)).toEqual({ deadline: null });
        // A pair travels together.
        expect(changedGoalFields(goal, { ...form, review_cadence_value: 2, review_cadence_unit: null }, saved))
            .toEqual({ review_cadence_value: 2, review_cadence_unit: null });
        expect(Object.keys(changedGoalFields(goal, { ...form, completion_condition: 'manual', condition: undefined }, saved)).sort())
            .toEqual(['completion_condition', 'condition']);
        expect(changedGoalFields(goal, { ...form, attachments: [] }, saved)).toEqual({ attachments: [] });
    });

    it('uses what the form started from, and never sends that as a field', async () => {
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'Mine', _base: { name: 'When I started' } });
        await reconnect();
        expect(sent[0].body).toMatchObject({ name: 'Mine', _base: { name: 'When I started' } });
        expect(queryClient.getQueryData(treeKey).children[0]).not.toHaveProperty('_base');
    });

    it('queues nothing when nothing changed', async () => {
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'Old', description: 'D' });
        expect(outbox.hasPending()).toBe(false);
    });

    it('keeps queued changes on top of server data that arrives first', async () => {
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'Mine' });
        await queryClient.fetchQuery({ queryKey: treeKey, queryFn: tree });
        expect(queryClient.getQueryData(treeKey).children[0].name).toBe('Mine');
    });

    it('keeps queued changes on top of a stored copy restored later', async () => {
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'Mine' });
        const stored = new QueryClient();
        stored.setQueryData(treeKey, tree());
        queryClient.removeQueries({ queryKey: treeKey });
        hydrate(queryClient, dehydrate(stored));
        expect(queryClient.getQueryData(treeKey).children[0].name).toBe('Mine');
    });

    it('creates, edits and deletes notes', async () => {
        const { data: note } = await queueNoteCreate(outbox, ROOT, { context_type: 'goal', context_id: 'g1', content: 'Second' });
        await queueNoteUpdate(outbox, ROOT, { id: 'n1', content: 'First' }, 'Edited');
        expect(queryClient.getQueryData(notesKey).map((item) => item.content)).toEqual(['Second', 'Edited']);
        await queueNoteDelete(outbox, ROOT, note);
        expect(queryClient.getQueryData(notesKey).map((item) => item.id)).toEqual(['n1']);
        await reconnect();
        // The note that was created and deleted offline never reaches the server.
        expect(sent.map((op) => op.method)).toEqual(['put']);
        expect(sent[0].body._base).toEqual({ content: 'First' });
    });

    it('makes an activity that can be logged at once', async () => {
        queryClient.setQueryData(queryKeys.activities(ROOT), []);
        const activity = await queueActivityCreate(outbox, ROOT, {
            name: 'Press', metrics: [{ name: 'Reps', unit: 'reps' }, { name: '', unit: 'kg' }, { name: 'Weight', unit: 'kg' }],
        });
        expect(activity.metric_definitions.map(({ name }) => name)).toEqual(['Reps', 'Weight']);
        expect(activity.metric_definitions[1].id).toBe(await activityMetricId(activity.id, 1));
        expect(queryClient.getQueryData(queryKeys.activities(ROOT))).toEqual([activity]);
        await reconnect();
        expect(sent[0]).toMatchObject({ url: '/root/activities', body: { id: activity.id, name: 'Press' } });
    });

    it('keeps the latest of several template saves, against the revision they began from', async () => {
        queryClient.setQueryData(queryKeys.sessionTemplates(ROOT), [{ id: 't1', name: 'Old', revision: 4 }]);
        await queueTemplateUpdate(outbox, ROOT, 't1', { name: 'A', template_data: { sections: [1] }, expected_revision: 4 });
        await queueTemplateUpdate(outbox, ROOT, 't1', { name: 'B', template_data: { sections: [2] }, expected_revision: 4 });
        expect(queryClient.getQueryData(queryKeys.sessionTemplates(ROOT))[0]).toMatchObject({ name: 'B', revision: 4 });
        const made = await queueTemplateCreate(outbox, ROOT, { name: 'New', template_data: {} });
        expect(queryClient.getQueryData(queryKeys.sessionTemplates(ROOT)).map(({ id }) => id)).toEqual(['t1', made.id]);
        await reconnect();
        expect(sent.map((op) => op.body.name)).toEqual(['B', 'New']);
        expect(sent[0].body).toMatchObject({ expected_revision: 4, template_data: { sections: [2] } });
    });

    it('queues until what was queued has been sent', async () => {
        expect(shouldQueueRecord(null, ROOT)).toBe(false);
        expect(shouldQueueRecord(outbox, ROOT)).toBe(true);
        online.value = true;
        expect(shouldQueueRecord(outbox, ROOT)).toBe(false);
        online.value = false;
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'A' });
        online.value = true;
        expect(shouldQueueRecord(outbox, ROOT)).toBe(true);
        expect(shouldQueueRecord(outbox, 'another-root')).toBe(false);
    });

    it('says so when a sent edit clashed with another device', async () => {
        getConflicts.mockResolvedValue({ data: { conflicts: [{ id: 'c1' }] } });
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'A' });
        await reconnect();
        await vi.waitFor(() => expect(warning).toHaveBeenCalledTimes(1));
        await queueGoalUpdate(outbox, queryClient, ROOT, 'g1', { name: 'B' });
        await vi.waitFor(() => expect(getConflicts).toHaveBeenCalledTimes(2));
        expect(warning).toHaveBeenCalledTimes(1);
    });
});
