import { describe, expect, it } from 'vitest';

import {
    canComputeYield,
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

    it('computes yield when all tracked metric definitions are multiplicative', () => {
        const sets = [
            {
                metrics: [
                    { metric_id: 'weight', value: 100 },
                    { metric_id: 'reps', value: 5 },
                ],
            },
            {
                metrics: [
                    { metric_id: 'weight', value: 105 },
                    { metric_id: 'reps', value: 4 },
                ],
            },
        ];
        const metricDefs = filterTrackedMetricDefs([
            { id: 'weight', is_multiplicative: true },
            { id: 'reps', is_multiplicative: true },
            { id: 'internal', is_multiplicative: true, track_progress: false },
        ]);

        expect(computeAutoAggregations(sets, metricDefs)).toEqual({
            additive_totals: {},
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
            },
        });
    });

    it('does not compute yield when any tracked metric is non-multiplicative', () => {
        const sets = [
            {
                metrics: [
                    { metric_id: 'distance', value: 24 },
                    { metric_id: 'reps', value: 5 },
                ],
            },
        ];
        const metricDefs = filterTrackedMetricDefs([
            { id: 'distance', is_multiplicative: false, is_additive: true },
            { id: 'reps', is_multiplicative: true },
        ]);

        const result = computeAutoAggregations(sets, metricDefs);

        expect(canComputeYield(metricDefs)).toBe(false);
        expect(result.yield_per_set).toEqual([]);
        expect(result.total_yield).toBeNull();
        expect(result.best_set_yield).toBeNull();
        expect(result.additive_totals).toEqual({ distance: 24 });
        expect(result.best_set_values).toEqual({ distance: 24, reps: 5 });
    });

    it('breaks anchor ties with the remaining metrics in definition order', () => {
        const metricDefs = [
            { id: 'speed', is_best_set_metric: true, higher_is_better: true },
            { id: 'quality', higher_is_better: true },
        ];
        const sets = [
            { metrics: [{ metric_id: 'speed', value: 70 }, { metric_id: 'quality', value: 5 }] },
            { metrics: [{ metric_id: 'speed', value: 70 }, { metric_id: 'quality', value: 6 }] },
        ];

        expect(computeAutoAggregations(sets, metricDefs).best_set_index).toBe(1);
    });

    it('respects lower-is-better secondary metrics and prefers present tie-break values', () => {
        const metricDefs = [
            { id: 'score', is_best_set_metric: true, higher_is_better: true },
            { id: 'errors', higher_is_better: false },
        ];
        const sets = [
            { metrics: [{ metric_id: 'score', value: 8 }] },
            { metrics: [{ metric_id: 'score', value: 8 }, { metric_id: 'errors', value: 2 }] },
            { metrics: [{ metric_id: 'score', value: 8 }, { metric_id: 'errors', value: 3 }] },
        ];

        expect(computeAutoAggregations(sets, metricDefs).best_set_index).toBe(1);
    });
});
