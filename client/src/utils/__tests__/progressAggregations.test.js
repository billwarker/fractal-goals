import { describe, expect, it } from 'vitest';

import {
    computeAutoAggregations,
    filterTrackedMetricDefs,
    resolveAutoAggregationMode,
} from '../progressAggregations';

describe('progressAggregations', () => {
    it('filters out metrics with progress tracking disabled', () => {
        const tracked = filterTrackedMetricDefs([
            { id: 'weight', track_progress: true },
            { id: 'notes', track_progress: false },
            { id: 'reps' },
        ]);

        expect(tracked.map((metric) => metric.id)).toEqual(['weight', 'reps']);
    });

    it('derives aggregation modes from metric flags', () => {
        const metricDefs = [
            { id: 'reps', is_multiplicative: false, is_additive: true },
            { id: 'orm', is_multiplicative: false, is_additive: false },
            { id: 'time', is_best_set_metric: true, is_multiplicative: false, is_additive: false },
            { id: 'weight', is_multiplicative: true },
        ];

        expect(resolveAutoAggregationMode(metricDefs[0], metricDefs, { hasSets: true })).toBe('max');
        expect(resolveAutoAggregationMode(metricDefs[1], metricDefs, { hasSets: true })).toBe('max');
        expect(resolveAutoAggregationMode(metricDefs[2], metricDefs, { hasSets: true })).toBe('max');
        expect(resolveAutoAggregationMode(metricDefs[3], metricDefs, { hasSets: true })).toBe('last');
        expect(resolveAutoAggregationMode(metricDefs[0], metricDefs, { hasSets: false })).toBe('last');
    });

    it('computes aggregations from tracked metric definitions', () => {
        const sets = [
            {
                metrics: [
                    { metric_id: 'weight', value: 100 },
                    { metric_id: 'reps', value: 5 },
                    { metric_id: 'distance', value: 400 },
                ],
            },
            {
                metrics: [
                    { metric_id: 'weight', value: 105 },
                    { metric_id: 'reps', value: 4 },
                    { metric_id: 'distance', value: 500 },
                ],
            },
        ];
        const metricDefs = filterTrackedMetricDefs([
            { id: 'weight', is_multiplicative: true },
            { id: 'reps', is_multiplicative: true },
            { id: 'distance', is_multiplicative: false, is_additive: true },
            { id: 'internal', is_multiplicative: true, track_progress: false },
        ]);

        expect(computeAutoAggregations(sets, metricDefs)).toEqual({
            additive_totals: { distance: 900 },
            yield_per_set: [
                { set_index: 0, yield: 500 },
                { set_index: 1, yield: 420 },
            ],
            total_yield: 920,
            best_set_index: 0,
            best_set_yield: 500,
            best_set_values: {
                weight: 100,
                reps: 5,
                distance: 400,
            },
        });
    });
});
