import { describe, expect, it } from 'vitest';

import { loggedSessionPlanSections, sessionSectionItems } from '../loggedSessionPlan';

describe('loggedSessionPlanSections', () => {
    it('turns logged sets and circuit rounds into plan prescriptions', () => {
        const session = { attributes: { session_data: { sections: [{ name: 'Main', items: [
            { type: 'activity', activity: {
                activity_definition_id: 'bench', name: 'Bench',
                sets: [{ metrics: [{ metric_id: 'w', split_id: 'left', value: 100 }], notes: 'heavy' }],
                notes: 'felt good',
            } },
            { type: 'circuit', circuit: {
                id: 'run', name: 'Finisher', circuit_definition_id: 'circ',
                slots: [
                    { id: 'run-b', sort_order: 1, source_slot_id: 'slot-b', activity_definition_id: 'b' },
                    { id: 'run-a', sort_order: 0, source_slot_id: 'slot-a', activity_definition_id: 'a' },
                    { id: 'run-x', sort_order: 2, source_slot_id: null, activity_definition_id: 'x' },
                ],
                rounds: [{ round_number: 1, members: [
                    { circuit_run_slot_id: 'run-a', metrics: [{ metric_id: 's', value: 30 }] },
                    { circuit_run_slot_id: 'run-x', metrics: [{ metric_id: 's', value: 9 }] },
                ] }],
            } },
        ] }] } } };
        expect(loggedSessionPlanSections(session)).toEqual([{ name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', name: 'Bench', prescription: {
                sets: [{ metrics: [{ metric_id: 'w', split_id: 'left', value: 100 }], notes: 'heavy' }],
                metrics: [],
                notes: 'felt good',
            } },
            { type: 'circuit', circuit_definition_id: 'circ', name: 'Finisher', prescription: { rounds: [{ notes: null, slots: [
                { slot_id: 'slot-a', metrics: [{ metric_id: 's', value: 30 }] },
                { slot_id: 'slot-b', metrics: [] },
            ] }] } },
        ] }]);
    });

    it('reads legacy exercise lists and tolerates a missing session', () => {
        expect(sessionSectionItems({ exercises: [{ activity_id: 'a' }] })).toEqual([{ type: 'activity', activity: { activity_id: 'a' } }]);
        expect(loggedSessionPlanSections({ attributes: { session_data: { sections: [{ name: 'Old', exercises: [{ activity_id: 'a', name: 'A' }] }] } } }))
            .toEqual([{ name: 'Old', items: [{ type: 'activity', activity_definition_id: 'a', name: 'A', prescription: { sets: [], metrics: [], notes: null } }] }]);
        expect(loggedSessionPlanSections(null)).toEqual([]);
    });
});
