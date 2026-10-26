import { describe, expect, it } from 'vitest';

import { compareCircuitSlot, comparePrescriptions, indexByAlignKey, relativeDelta } from '../planComparison';

const weight = { id: 'w', name: 'Weight', unit: 'kg', is_multiplicative: true, is_additive: false };
const reps = { id: 'r', name: 'Reps', unit: 'reps', is_multiplicative: true, is_additive: true };
const bench = { id: 'bench', has_sets: true, metric_definitions: [weight, reps] };
const pullups = { id: 'pull', has_sets: true, metric_definitions: [{ ...reps, is_multiplicative: false }] };
const run = { id: 'run', has_sets: false, metric_definitions: [{ id: 't', name: 'Time', unit: 'min', higher_is_better: false }] };

const set = (w, r) => ({ metrics: [{ metric_id: 'w', value: w }, { metric_id: 'r', value: r }] });

describe('relativeDelta', () => {
    it('labels better and worse changes by direction', () => {
        expect(relativeDelta(105, 100)).toMatchObject({ delta: 5, pct: 5, improved: true, label: '▲5%' });
        expect(relativeDelta(95, 100)).toMatchObject({ improved: false, label: '▼5%' });
        expect(relativeDelta(95, 100, { higherIsBetter: false })).toMatchObject({ improved: true, label: '▲5%' });
    });

    it('falls back to an absolute change from 0, and supports absolute mode', () => {
        expect(relativeDelta(3, 0).label).toBe('+3');
        expect(relativeDelta(97.5, 100, { mode: 'absolute' }).label).toBe('-2.5');
    });

    it('returns null when nothing changed or a side is missing', () => {
        expect(relativeDelta(100, 100)).toBeNull();
        expect(relativeDelta(100, 100, { includeUnchanged: true })).toEqual({ delta: 0, pct: 0, improved: null, label: '0%' });
        expect(relativeDelta(null, 100, { includeUnchanged: true })).toBeNull();
        expect(relativeDelta(null, 100)).toBeNull();
        expect(relativeDelta(100, undefined)).toBeNull();
    });
});

describe('comparePrescriptions', () => {
    it('compares set yields and total yield for yield activities', () => {
        const result = comparePrescriptions(
            { sets: [set(105, 5), set(100, 5), set(100, 5)] },
            { sets: [set(100, 5), set(100, 5)] },
            bench,
        );
        expect(result.yieldEligible).toBe(true);
        expect(result.sets[0].deltas).toEqual([expect.objectContaining({ key: 'yield', label: '▲5%' })]);
        expect(result.sets[1].deltas).toEqual([expect.objectContaining({ key: 'yield', improved: null, label: '0%' })]);
        expect(result.sets[2]).toEqual({ isNew: true, deltas: [] });
        expect(result.totals).toEqual([expect.objectContaining({ label: 'Total yield', value: 1525, change: expect.objectContaining({ label: '▲52.5%' }) })]);
        expect(result.removedSets).toBe(0);
    });

    it('compares each changed value and additive totals without a yield', () => {
        const result = comparePrescriptions(
            { sets: [{ metrics: [{ metric_id: 'r', value: 11 }] }] },
            { sets: [{ metrics: [{ metric_id: 'r', value: 10 }] }, { metrics: [{ metric_id: 'r', value: 8 }] }] },
            pullups,
        );
        expect(result.sets[0].deltas).toEqual([expect.objectContaining({ metric: 'reps', label: '▲10%' })]);
        expect(result.totals).toEqual([expect.objectContaining({ label: 'Total Reps', value: 11, change: expect.objectContaining({ improved: false }) })]);
        expect(result.removedSets).toBe(1);
    });

    it('compares flat values by the metric direction', () => {
        const result = comparePrescriptions({ metrics: [{ metric_id: 't', value: 18 }] }, { metrics: [{ metric_id: 't', value: 20 }] }, run);
        expect(result.flat).toEqual([expect.objectContaining({ metric: 'min', improved: true, label: '▲10%' })]);
    });

    it('ignores untracked metrics and needs a previous prescription', () => {
        const untracked = { ...bench, metric_definitions: [weight, { ...reps, track_progress: false }] };
        expect(comparePrescriptions({ sets: [set(110, 5)] }, { sets: [set(100, 9)] }, untracked).sets[0].deltas)
            .toEqual([expect.objectContaining({ metric: 'kg', label: '▲10%' })]);
        expect(comparePrescriptions({ sets: [set(1, 1)] }, null, bench)).toBeNull();
    });
});

describe('indexByAlignKey', () => {
    it('keys items as the columns align them', () => {
        const index = indexByAlignKey('tmpl', [{ name: 'Main', items: [
            { type: 'activity', activity_definition_id: 'bench', item_key: 'a' },
            { type: 'activity', activity_definition_id: 'bench', item_key: 'b' },
        ] }]);
        expect(index.get('tmpl|a:bench#0').item_key).toBe('a');
        expect(index.get('tmpl|a:bench#1').item_key).toBe('b');
    });
});

describe('compareCircuitSlot', () => {
    it('compares a member value in a round, and needs the compared round', () => {
        const hold = { id: 'fl', metric_definitions: [{ id: 't', name: 'Hold Time', unit: 's' }] };
        expect(compareCircuitSlot(hold, [{ metric_id: 't', value: 17 }], [{ metric_id: 't', value: 17 }]))
            .toEqual([expect.objectContaining({ improved: null, label: '0%' })]);
        expect(compareCircuitSlot(hold, [{ metric_id: 't', value: 17 }], null)).toBeNull();
    });
});
