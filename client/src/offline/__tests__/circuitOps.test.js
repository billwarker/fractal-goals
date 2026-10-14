import { describe, expect, it } from 'vitest';

import fixture from '../../../../tests/fixtures/circuit_id_vectors.json';
import * as circuitIds from '../circuitIds';
import {
    addRoundToRun,
    applyTagChange,
    buildPlaceholderRound,
    buildPlaceholderRun,
    cascadeMemberMetric,
    placeholderCircuitInstances,
    removeRoundFromRun,
} from '../circuitOps';

const toCamel = (name) => name.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

describe('circuit id derivation', () => {
    it.each(fixture.vectors)('$fn($arg) matches the server', async (vector) => {
        await expect(circuitIds[toCamel(vector.fn)](vector.parent, vector.arg)).resolves.toBe(vector.expected);
    });
});

const definition = {
    id: 'def-1',
    name: 'Finisher',
    version: 3,
    slots: [
        { id: 'src-b', sort_order: 1, activity_definition_id: 'burpee', activity: { id: 'burpee', name: 'Burpee', has_sets: false, has_metrics: false } },
        { id: 'src-a', sort_order: 0, activity_definition_id: 'squat', activity: { id: 'squat', name: 'Squat', has_sets: true, has_metrics: true, metric_definitions: [{ id: 'kg' }] } },
    ],
};
const runId = '3f1c2a9e-7b44-4c1e-9d2a-6f0b8e5a1c77';

describe('buildPlaceholderRun', () => {
    it('mirrors the server structure with derived ids', async () => {
        const run = await buildPlaceholderRun(definition, { runId, sessionId: 's', rootId: 'r' });

        expect(run).toMatchObject({ id: runId, status: 'planned', round_count: 1, name: 'Finisher' });
        expect(run.slots.map((slot) => slot.source_slot_id)).toEqual(['src-a', 'src-b']);
        const [squat, burpee] = run.slots;
        expect(squat.id).toBe(await circuitIds.runSlotId(runId, 'src-a'));
        expect(squat.activity_instance_id).toBe(await circuitIds.runSlotInstanceId(runId, 'src-a'));
        expect(squat.activity_schema.metric_definitions).toEqual([{ id: 'kg' }]);
        expect(burpee.activity_instance_id).toBeNull();

        const [round] = run.rounds;
        expect(round.id).toBe(await circuitIds.initialRoundId(runId, 1));
        const [squatMember, burpeeMember] = round.members;
        expect(squatMember).toMatchObject({
            id: await circuitIds.roundMemberId(round.id, squat.id),
            activity_set_id: await circuitIds.roundMemberSetId(round.id, squat.id),
            activity_instance_id: squat.activity_instance_id,
        });
        expect(burpeeMember).toMatchObject({
            activity_set_id: null,
            activity_instance_id: await circuitIds.roundMemberInstanceId(round.id, burpee.id),
        });
    });
});

describe('placeholderCircuitInstances', () => {
    it('creates the slot and member instances the server will create, with matching ids', async () => {
        const run = await buildPlaceholderRun(definition, { runId, sessionId: 's', rootId: 'r' });
        const instances = placeholderCircuitInstances(run, { sessionId: 's', rootId: 'r' });
        const [squat, burpee] = run.slots;
        const [round] = run.rounds;

        expect(instances.map((instance) => instance.id)).toEqual([
            squat.activity_instance_id,
            round.members.find((member) => member.circuit_run_slot_id === burpee.id).activity_instance_id,
        ]);
        expect(instances[1]).toMatchObject({ name: 'Burpee', session_id: 's', activity_definition_id: 'burpee' });

        const next = await buildPlaceholderRound(run.slots, { roundId: '9b2d4f60-1a3c-4e5f-8a7b-2c3d4e5f6a7b', roundNumber: 2 });
        expect(placeholderCircuitInstances(run, { sessionId: 's', rootId: 'r', rounds: [next] })).toHaveLength(1);
    });
});

describe('round and result patches', () => {
    const member = (id, slot, metrics = []) => ({ id, circuit_run_slot_id: slot, metrics });
    const baseRun = {
        id: 'run',
        tags: [],
        rounds: [
            { id: 'r1', round_number: 1, tags: [], members: [member('m1', 'slot-a', [{ metric_definition_id: 'kg', value: 60 }])] },
            { id: 'r2', round_number: 2, tags: [], members: [member('m2', 'slot-a')] },
            { id: 'r3', round_number: 3, tags: [], members: [member('m3', 'slot-a', [{ metric_definition_id: 'kg', value: 70 }])] },
        ],
    };

    it('adds a round once and renumbers after a removal', async () => {
        const round = await buildPlaceholderRound([{ id: 'slot-a', sort_order: 0, has_sets: false }], {
            roundId: '9b2d4f60-1a3c-4e5f-8a7b-2c3d4e5f6a7b', roundNumber: 4,
        });
        const added = addRoundToRun(addRoundToRun(baseRun, round), round);
        expect(added.round_count).toBe(4);

        const removed = removeRoundFromRun(added, 'r2');
        expect(removed.rounds.map((item) => [item.id, item.round_number])).toEqual([
            ['r1', 1], ['r3', 2], [round.id, 3],
        ]);
    });

    it('cascades a value only into later empty slots, like the server', () => {
        const next = cascadeMemberMetric(baseRun, { memberId: 'm1', metricId: 'kg' });
        expect(next.rounds[1].members[0].metrics).toEqual([expect.objectContaining({ metric_definition_id: 'kg', value: 60 })]);
        expect(next.rounds[2].members[0].metrics[0].value).toBe(70);
    });

    it('adds and removes run and round tags from the mutation payload', () => {
        const tagged = applyTagChange(baseRun, { data: { name: 'Strength', color: '#123ABC', definition_id: 'tag-1' } });
        expect(tagged.tags).toEqual([expect.objectContaining({ definition_id: 'tag-1', name: 'Strength' })]);
        expect(applyTagChange(tagged, { data: { name: 'Strength', definition_id: 'tag-1', assigned: false } }).tags).toEqual([]);

        const roundTagged = applyTagChange(baseRun, { roundId: 'r2', data: { name: 'Heavy  Day' } });
        expect(roundTagged.rounds[1].tags).toEqual([expect.objectContaining({ name: 'Heavy  Day' })]);
        expect(applyTagChange(roundTagged, { roundId: 'r2', data: { name: 'heavy day', assigned: false } }).rounds[1].tags).toEqual([]);
    });
});
