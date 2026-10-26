import { describe, expect, it } from 'vitest';

import { copyActivityValues, copyCircuitValues, copyPlanSections, planCopyEligibility } from '../planCopy';

const bench = {
    id: 'bench', name: 'Bench', has_sets: true,
    metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }, { id: 'r', name: 'Reps', unit: 'reps' }],
};
const plank = { id: 'plank', name: 'Plank', has_sets: false, metric_definitions: [{ id: 's', name: 'Time', unit: 's' }] };
const row = { id: 'row', name: 'Row', has_sets: true, metric_definitions: [{ id: 'w', name: 'Weight', unit: 'kg' }] };
const activityById = new Map([[bench.id, bench], [plank.id, plank], [row.id, row]]);
const circuit = { id: 'circ', name: 'Finisher', slots: [{ id: 'slot-a', activity_definition_id: 'plank' }] };
const circuitById = new Map([[circuit.id, circuit]]);

const set = (w, r, extra = {}) => ({ metrics: [{ metric_id: 'w', split_id: null, value: w }, { metric_id: 'r', split_id: null, value: r }], ...extra });
let counter = 0;
const makeKey = () => `new-${(counter += 1)}`;

describe('planCopyEligibility', () => {
    const entry = { executed_sessions: [] };
    const comparison = { date: '2026-10-16', kind: 'plan', sections: [{ name: 'Main', items: [{ type: 'activity' }] }] };

    it('hides Copy without a same-template comparison or on a past date', () => {
        expect(planCopyEligibility({ entry, comparison: null })).toBeNull();
        expect(planCopyEligibility({ entry, comparison, readOnly: true })).toBeNull();
    });

    it('disables Copy while loading, with nothing to copy, or once a session started from the plan', () => {
        expect(planCopyEligibility({ entry, comparison: { ...comparison, isLoading: true } })).toMatchObject({ allowed: false, reason: expect.stringMatching(/^Loading/) });
        expect(planCopyEligibility({ entry, comparison: { ...comparison, kind: 'empty', sections: [] } })).toMatchObject({ allowed: false, reason: expect.stringMatching(/^Nothing to copy/) });
        expect(planCopyEligibility({ entry, comparison: { ...comparison, sections: [{ name: 'Main', items: [] }] } }).allowed).toBe(false);
        expect(planCopyEligibility({ entry: { executed_sessions: [{ id: 's' }] }, comparison })).toEqual({
            allowed: false, reason: 'A session has already started from this plan.',
        });
    });

    it('allows Copy otherwise', () => {
        expect(planCopyEligibility({ entry, comparison })).toEqual({ allowed: true, reason: null });
    });
});

describe('copyActivityValues', () => {
    it('keeps values only: no notes or tags, no empty sets, no unknown metrics', () => {
        const copied = copyActivityValues({
            notes: 'Pause', tags: ['t'],
            sets: [
                set(100, 5, { notes: 'top', tags: ['t2'] }),
                { metrics: [] },
                { metrics: [{ metric_id: 'gone', value: 1 }, { metric_id: 'w', value: '' }] },
                { metrics: [{ metric_definition_id: 'w', value: '102.5' }] },
            ],
        }, bench);
        expect(copied).toEqual({ schema: 1, sets: [
            { metrics: set(100, 5).metrics, notes: null },
            { metrics: [{ metric_id: 'w', split_id: null, value: 102.5 }], notes: null },
        ] });
    });

    it('caps sets and copies flat values for activities without sets', () => {
        const many = copyActivityValues({ sets: Array.from({ length: 60 }, () => set(1, 1)) }, bench);
        expect(many.sets).toHaveLength(50);
        expect(copyActivityValues({ metrics: [{ metric_id: 's', value: 60 }], notes: 'x' }, plank))
            .toEqual({ schema: 1, metrics: [{ metric_id: 's', split_id: null, value: 60 }] });
        expect(copyActivityValues({ sets: [] }, bench)).toBeNull();
    });
});

describe('copyCircuitValues', () => {
    it('keeps rounds for the circuit current slots and drops notes', () => {
        expect(copyCircuitValues({
            notes: 'go', rounds: [{ notes: 'easy', slots: [
                { slot_id: 'slot-a', metrics: [{ metric_id: 's', value: 30 }] },
                { slot_id: 'removed', metrics: [{ metric_id: 's', value: 1 }] },
            ] }],
        }, circuit, activityById)).toEqual({ schema: 1, rounds: [{ notes: null, slots: [
            { slot_id: 'slot-a', metrics: [{ metric_id: 's', split_id: null, value: 30 }] },
        ] }] });
    });
});

describe('copyPlanSections', () => {
    const target = [
        { name: 'Warm-up', items: [{ type: 'activity', activity_definition_id: 'plank', name: 'Plank', item_key: 't-plank' }] },
        { name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', name: 'Bench', item_key: 't-bench', extra: 'kept' },
            { type: 'activity', activity_definition_id: 'bench', name: 'Bench', item_key: 't-bench-2' },
        ] },
    ];

    it('replaces items and values from a plan, keeping template keys and section order', () => {
        const source = { kind: 'plan', sections: [
            { name: 'Main', items: [
                { type: 'activity', activity_definition_id: 'bench', item_key: 't-bench', prescription: { sets: [set(100, 5, { notes: 'n' })] } },
                { type: 'activity', activity_definition_id: 'row', item_key: 'p-row', added_in_plan: true, prescription: { notes: 'only a note' } },
            ] },
            { name: 'Warm-up', items: [{ type: 'activity', activity_definition_id: 'plank', item_key: 'old-template-key' }] },
        ] };
        const { sections, skipped } = copyPlanSections({ templateId: 'tmpl', source, targetSections: target, activityById, circuitById, makeKey });
        expect(sections.map((section) => section.name)).toEqual(['Warm-up', 'Main']);
        // A plan source's template key is kept even when this target no longer has it.
        expect(sections[0].items).toEqual([{ type: 'activity', activity_definition_id: 'plank', name: 'Plank', item_key: 'old-template-key' }]);
        expect(sections[1].items[0]).toEqual({
            type: 'activity', activity_definition_id: 'bench', name: 'Bench', item_key: 't-bench', extra: 'kept',
            prescription: { schema: 1, sets: [{ metrics: set(100, 5).metrics, notes: null }] },
        });
        // An item added in the source plan stays added; a notes-only prescription copies to nothing.
        expect(sections[1].items[1]).toEqual({ type: 'activity', activity_definition_id: 'row', name: 'Row', item_key: 'p-row', added_in_plan: true });
        expect(skipped).toEqual([]);
    });

    it('maps logged items onto target keys by aligned position, including repeated activities', () => {
        const source = { kind: 'logged', sections: [
            { name: 'Main', items: [
                { type: 'activity', activity_definition_id: 'bench', name: 'Bench', prescription: { sets: [set(100, 5)] } },
                { type: 'activity', activity_definition_id: 'bench', name: 'Bench', prescription: { sets: [set(80, 8)] } },
                { type: 'activity', activity_definition_id: 'bench', name: 'Bench', prescription: { sets: [set(60, 12)] } },
            ] },
        ] };
        counter = 0;
        const { sections } = copyPlanSections({ templateId: 'tmpl', source, targetSections: target, activityById, circuitById, makeKey });
        // A section the logged session lacks empties: the copy replaces the plan.
        expect(sections[0].items).toEqual([]);
        expect(sections[1].items.map((item) => [item.item_key, Boolean(item.added_in_plan)])).toEqual([
            ['t-bench', false], ['t-bench-2', false], ['new-1', true],
        ]);
        expect(sections[1].items[1].prescription.sets[0].metrics).toEqual(set(80, 8).metrics);
    });

    it('skips items in sections the template no longer has and deleted activities or circuits', () => {
        const source = { kind: 'plan', sections: [
            { name: 'Main', items: [
                { type: 'activity', activity_definition_id: 'deleted', name: 'Old lift' },
                { type: 'circuit', circuit_definition_id: 'circ', item_key: 'c1', prescription: { rounds: [{ slots: [{ slot_id: 'slot-a', metrics: [{ metric_id: 's', value: 20 }] }] }] } },
                { type: 'circuit', circuit_definition_id: 'gone-circ', name: 'Gone' },
            ] },
            { name: 'Cool-down', items: [{ type: 'activity', activity_definition_id: 'plank', name: 'Plank' }] },
        ] };
        const { sections, skipped } = copyPlanSections({ templateId: 'tmpl', source, targetSections: target, activityById, circuitById, makeKey });
        expect(sections[1].items).toEqual([{
            type: 'circuit', circuit_definition_id: 'circ', name: 'Finisher', item_key: 'c1',
            prescription: { schema: 1, rounds: [{ notes: null, slots: [{ slot_id: 'slot-a', metrics: [{ metric_id: 's', split_id: null, value: 20 }] }] }] },
        }]);
        expect(skipped).toEqual([
            { name: 'Plank', reason: '“Cool-down” is no longer in this template' },
            { name: 'Old lift', reason: 'this activity was deleted' },
            { name: 'Gone', reason: 'this circuit was deleted' },
        ]);
    });

    it('never uses one key twice', () => {
        const source = { kind: 'plan', sections: [{ name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', item_key: 't-bench' },
            { type: 'activity', activity_definition_id: 'bench', item_key: 't-bench' },
        ] }] };
        counter = 0;
        const { sections } = copyPlanSections({ templateId: 'tmpl', source, targetSections: target, activityById, circuitById, makeKey });
        const keys = sections[1].items.map((item) => item.item_key);
        expect(new Set(keys).size).toBe(keys.length);
    });
});
