import { describe, expect, it } from 'vitest';

import contract from '../serverContract.json';
import { buildPlaceholderRun } from '../circuitOps';
import {
    applySessionPause,
    applySessionResume,
    applyTimerAction,
    buildPlaceholderInstance,
    buildPlaceholderNote,
} from '../sessionOps';

// Placeholders stand in for server records until sync, so they must have exactly the
// server's fields: missing ones break views, extra ones mask bugs. The contract file is
// recorded from real API responses by tests/integration/test_offline_contract.py.
const keysOf = (record) => Object.keys(record).filter((key) => key !== '_pendingSync').sort();

describe('offline placeholders match the server contract', () => {
    it('activity instance', () => {
        const instance = buildPlaceholderInstance({ id: 'i', sessionId: 's', definition: { id: 'd', name: 'Squat' } });
        expect(keysOf(instance)).toEqual(contract.activity_instance);
    });

    it('note', () => {
        const note = buildPlaceholderNote({ id: 'n', data: { content: 'x', context_type: 'session', context_id: 's' } });
        expect(keysOf(note)).toEqual(contract.note);
    });

    it('circuit run, slot, round, and member', async () => {
        const run = await buildPlaceholderRun({
            id: 'def',
            name: 'Finisher',
            slots: [{ id: 'src', sort_order: 0, activity_definition_id: 'a', activity: { id: 'a', name: 'Row', has_sets: false } }],
        }, { runId: '3f1c2a9e-7b44-4c1e-9d2a-6f0b8e5a1c77', sessionId: 's', rootId: 'r' });
        expect(keysOf(run)).toEqual(contract.circuit_run);
        expect(keysOf(run.slots[0])).toEqual(contract.circuit_run_slot);
        expect(keysOf(run.rounds[0])).toEqual(contract.circuit_round);
        expect(keysOf(run.rounds[0].members[0])).toEqual(contract.circuit_round_member);
    });
});

describe('optimistic patches only write server fields', () => {
    const at = '2026-10-14T10:00:00.000Z';
    const subset = (record, allowed) => keysOf(record).filter((key) => !allowed.includes(key));

    it('timer actions', () => {
        const instance = buildPlaceholderInstance({ id: 'i', sessionId: 's', definition: { id: 'd', name: 'Squat' } });
        for (const action of ['start', 'complete', 'reset']) {
            const [patched] = applyTimerAction([instance], { instanceId: 'i', action, at, extraData: { target_duration_seconds: 60 } });
            expect(subset(patched, contract.activity_instance)).toEqual([]);
        }
    });

    it('pause and resume', () => {
        const session = Object.fromEntries(contract.session.map((key) => [key, null]));
        const paused = applySessionPause(session, [], at);
        expect(subset(paused.session, contract.session)).toEqual([]);
        expect(subset(applySessionResume(paused.session, [], at).session, contract.session)).toEqual([]);
    });
});
