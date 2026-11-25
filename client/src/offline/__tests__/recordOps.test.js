import { QueryClient, dehydrate, hydrate } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { online, getConflicts, warning } = vi.hoisted(() => ({
    online: { value: false }, getConflicts: vi.fn(), warning: vi.fn(),
}));
vi.mock('../connectivity', () => ({ isOnline: () => online.value }));
vi.mock('../../utils/api/syncApi', () => ({ syncApi: { getConflicts } }));
vi.mock('../../utils/notify', () => ({ default: { warning, error: vi.fn() } }));

import { queryKeys } from '../../hooks/queryKeys';
import { createMemoryStore } from '../memoryStore';
import { createOutbox } from '../outbox';
import { registerRecordOpHandlers } from '../recordOpHandlers';
import {
    queueGoalCreate, queueGoalUpdate, queueNoteCreate, queueNoteDelete, queueNoteUpdate,
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
