import { describe, expect, it } from 'vitest';

import {
    bestRuleValue,
    buildConditionSeries,
    compareValue,
    evidenceDate,
    evidenceSets,
    instanceYield,
} from '../goalConditionSeries';

const set = (values, extra = {}) => ({
    ...extra,
    metrics: Object.entries(values).flatMap(([metricId, value]) => (
        Array.isArray(value)
            ? value.map((side) => ({ metric_id: metricId, value: side }))
            : [{ metric_id: metricId, value }]
    )),
});

const instance = (id, date, sets) => ({ id, session_date: date, sets });

describe('evidence parsing', () => {
    it('reads dates from session, start or creation time', () => {
        expect(evidenceDate({ session_date: '2026-03-02T00:00:00Z' }).toISOString()).toBe('2026-03-02T00:00:00.000Z');
        expect(evidenceDate({ time_start: '2026-03-03T10:00:00Z' }).toISOString()).toBe('2026-03-03T10:00:00.000Z');
        expect(evidenceDate({ session_date: 'not a date' })).toBeNull();
        expect(evidenceDate({})).toBeNull();
    });

    it('skips skipped sets and falls back to instance metrics when there are no sets', () => {
        expect(evidenceSets({
            sets: [set({ weight: 100 }), set({ weight: 300 }, { status: 'skipped' })],
        })).toEqual([new Map([['weight', [100]]])]);
        expect(evidenceSets({ metric_values: [{ metric_definition_id: 'pace', value: '5' }] }))
            .toEqual([new Map([['pace', [5]]])]);
        expect(evidenceSets({ sets: [set({ weight: '' })] })).toEqual([]);
    });
});

describe('rule bests (matching the server evaluator)', () => {
    it('takes the best set, where a split metric counts its weakest side', () => {
        const curls = { sets: [set({ weight: [30, 25] }), set({ weight: [27, 27] })] };
        expect(bestRuleValue(curls, 'weight', '>=')).toBe(27);
        expect(bestRuleValue(curls, 'weight', '<=')).toBe(27);
        expect(bestRuleValue({ sets: [set({ time: [50, 55] }), set({ time: [58, 52] })] }, 'time', '<=')).toBe(55);
        expect(bestRuleValue(curls, 'missing', '>=')).toBeNull();
    });

    it('sums per-set yield and needs every yield metric present', () => {
        const bench = { sets: [set({ weight: 200, reps: 5 }), set({ weight: 100, reps: 10 }), set({ weight: 50 })] };
        expect(instanceYield(bench, ['weight', 'reps'])).toBe(2000);
        expect(instanceYield(bench, ['weight'])).toBeNull();
        expect(instanceYield({ sets: [set({ weight: 50 })] }, ['weight', 'reps'])).toBeNull();
    });

    it('compares at threshold boundaries with a small tolerance', () => {
        expect(compareValue(100, '>=', 100)).toBe(true);
        expect(compareValue(99.9999999, '>=', 100)).toBe(true);
        expect(compareValue(99.99, '>=', 100)).toBe(false);
        expect(compareValue(100, '>', 100)).toBe(false);
        expect(compareValue(100, '<=', 100)).toBe(true);
        expect(compareValue(100, '<', 100)).toBe(false);
        expect(compareValue(0.1 + 0.2, '==', 0.3)).toBe(true);
        expect(compareValue(1, '!=', 2)).toBe(false);
    });
});

describe('buildConditionSeries', () => {
    const later = instance('b', '2026-03-05T00:00:00Z', [set({ weight: 225, reps: 4 })]);
    const earlier = instance('a', '2026-03-01T00:00:00Z', [set({ weight: 205, reps: 8 })]);
    const undated = { id: 'c', sets: [set({ weight: 999 })] };

    it('orders points by date, drops undated instances, and charts up to two rules against their thresholds', () => {
        const condition = {
            kind: 'single_session',
            measure: 'sets',
            rules: [
                { metric_definition_id: 'weight', operator: '>=', value: '225' },
                { metric_definition_id: 'reps', operator: '>=', value: 6 },
                { metric_definition_id: 'rpe', operator: '<=', value: 8 },
            ],
        };
        const { points, series } = buildConditionSeries(condition, [later, undated, earlier], {
            metricsById: new Map([['weight', { name: 'Weight', unit: 'lbs' }]]),
        });
        expect(points.map((point) => point.instanceId)).toEqual(['a', 'b']);
        expect(series).toHaveLength(2);
        expect(series[0]).toEqual(expect.objectContaining({ label: 'Weight', unit: 'lbs', threshold: 225, data: [205, 225] }));
        expect(series[1]).toEqual(expect.objectContaining({ label: 'Metric', threshold: 6, data: [8, 4] }));
    });

    it('charts the running count of qualifying sessions for consistency', () => {
        const condition = {
            kind: 'consistency',
            measure: 'sets',
            required_count: 2,
            rules: [{ metric_definition_id: 'reps', operator: '>=', value: 5 }],
        };
        const { series } = buildConditionSeries(condition, [earlier, later]);
        expect(series).toEqual([expect.objectContaining({ id: 'count', threshold: 2, data: [1, 1] })]);
        const anySession = buildConditionSeries({ ...condition, rules: [] }, [earlier, later]);
        expect(anySession.series[0].data).toEqual([1, 2]);
    });

    it('charts the running total for cumulative conditions and the per-session value otherwise', () => {
        const cumulative = buildConditionSeries(
            { kind: 'cumulative', measure: 'metric', metric_definition_id: 'reps', operator: '>=', target_value: '20' },
            [earlier, later],
        );
        expect(cumulative.series[0]).toEqual(expect.objectContaining({ threshold: 20, data: [8, 12] }));

        const yieldSeries = buildConditionSeries(
            { kind: 'single_session', measure: 'yield', operator: '>=', target_value: 1000 },
            [earlier, later],
            { yieldMetricIds: ['weight', 'reps'] },
        );
        expect(yieldSeries.series[0]).toEqual(expect.objectContaining({ id: 'yield', label: 'Total yield', data: [1640, 900] }));
    });

    it('returns points without series when there is no condition', () => {
        expect(buildConditionSeries(null, [earlier])).toEqual({
            points: [{ instanceId: 'a', date: new Date('2026-03-01T00:00:00Z') }],
            series: [],
        });
    });
});
