// @vitest-environment node
import { describe, expect, it } from 'vitest';

import { loggedSessionPlanSections, sessionSectionItems } from '../loggedSessionPlan';

describe('loggedSessionPlanSections', () => {
    it('turns logged sets and circuit rounds into plan prescriptions', () => {
        const session = { attributes: { session_data: { sections: [{ name: 'Main', items: [
            { type: 'activity', activity: {
                activity_definition_id: 'bench', name: 'Bench',
                tags: [{ id: 'heavy', name: 'Heavy' }],
                sets: [{
                    metrics: [{ metric_id: 'w', split_id: 'left', value: 100 }], notes: 'heavy',
                    tags: [{ id: 'top', name: 'Top set' }], inherited_tags: [{ id: 'heavy', name: 'Heavy' }],
                }],
                notes: 'felt good',
            } },
            { type: 'circuit', circuit: {
                id: 'run', name: 'Finisher', circuit_definition_id: 'circ',
                tags: [{ id: 'scope-1', definition_id: 'amrap', name: 'AMRAP' }],
                slots: [
                    { id: 'run-b', sort_order: 1, source_slot_id: 'slot-b', activity_definition_id: 'b' },
                    { id: 'run-a', sort_order: 0, source_slot_id: 'slot-a', activity_definition_id: 'a' },
                    { id: 'run-x', sort_order: 2, source_slot_id: null, activity_definition_id: 'x' },
                ],
                rounds: [{ round_number: 1, tags: [{ id: 'scope-2', definition_id: 'fast', name: 'Fast' }], members: [
                    { circuit_run_slot_id: 'run-a', metrics: [{ metric_id: 's', value: 30 }] },
                    { circuit_run_slot_id: 'run-x', metrics: [{ metric_id: 's', value: 9 }] },
                ] }],
            } },
        ] }] } } };
        expect(loggedSessionPlanSections(session)).toEqual([{ name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', name: 'Bench', prescription: {
                tags: ['heavy'],
                // Only tags put on the set itself: inherited ones stay the activity's.
                sets: [{ metrics: [{ metric_id: 'w', split_id: 'left', value: 100 }], notes: 'heavy', tags: ['top'] }],
                metrics: [],
                notes: 'felt good',
            } },
            { type: 'circuit', circuit_definition_id: 'circ', name: 'Finisher', prescription: { tags: ['amrap'], rounds: [{ notes: null, tags: ['fast'], slots: [
                { slot_id: 'slot-a', metrics: [{ metric_id: 's', value: 30 }] },
                { slot_id: 'slot-b', metrics: [] },
            ] }] } },
        ] }]);
    });

    it('reads legacy exercise lists and tolerates a missing session', () => {
        expect(sessionSectionItems({ exercises: [{ activity_id: 'a' }] })).toEqual([{ type: 'activity', activity: { activity_id: 'a' } }]);
        expect(loggedSessionPlanSections({ attributes: { session_data: { sections: [{ name: 'Old', exercises: [{ activity_id: 'a', name: 'A' }] }] } } }))
            .toEqual([{ name: 'Old', items: [{ type: 'activity', activity_definition_id: 'a', name: 'A', prescription: { tags: [], sets: [], metrics: [], notes: null } }] }]);
        expect(loggedSessionPlanSections(null)).toEqual([]);
    });
});
