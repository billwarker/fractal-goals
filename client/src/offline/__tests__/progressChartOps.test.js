import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';

import { queryKeys } from '../../hooks/queryKeys';
import { aggregateMetric, aggregateYield } from '../../utils/setAggregation';
import { buildConditionSeries } from '../../utils/goalConditionSeries';
import { patchProgressSeriesInstance } from '../progressChartOps';

const key = (...rest) => [...queryKeys.activityProgressTimeline('root', 'activity', 'current'), ...rest];
const set = (weight, reps) => ({ metrics: [{ metric_id: 'weight', value: weight }, { metric_id: 'reps', value: reps }] });
const row = { id: 'current', session_date: '2026-11-04T09:00:00Z', sets: [set(100, 5)], metrics: [] };

function clientWithSeries(instances = [row]) {
    const client = new QueryClient();
    client.setQueryData(key('series', 60, 'all'), { instances });
    return client;
}

describe('patchProgressSeriesInstance', () => {
    const saved = { id: 'current', activity_definition_id: 'activity', sets: [set(140, 3)], metrics: [], progress_comparison: { metric_comparisons: [] } };

    it('patches every comparison scope and keeps the session date', () => {
        const client = clientWithSeries();
        client.setQueryData(key('series', 60, 'same-tags'), { instances: [row] });
        patchProgressSeriesInstance(client, { rootId: 'root', instance: saved });
        for (const scope of ['all', 'same-tags']) {
            const [patched] = client.getQueryData(key('series', 60, scope)).instances;
            expect(patched.sets).toEqual(saved.sets);
            expect(patched.progress_comparison).toEqual(saved.progress_comparison);
            expect(patched.session_date).toBe(row.session_date);
        }
    });

    it('ignores timeline lists, other rows and other instances', () => {
        const past = { id: 'past', sets: [set(90, 5)] };
        const client = clientWithSeries([past, row]);
        const timeline = { items: [{ id: 'current' }], total: 1 };
        const otherKey = [...queryKeys.activityProgressTimeline('root', 'activity', 'other'), 'series', 60, 'all'];
        client.setQueryData(key(20, 'all'), timeline);
        client.setQueryData(otherKey, { instances: [row] });
        patchProgressSeriesInstance(client, { rootId: 'root', instance: saved });
        expect(client.getQueryData(key('series', 60, 'all')).instances[0]).toEqual(past);
        expect(client.getQueryData(key(20, 'all'))).toEqual(timeline);
        expect(client.getQueryData(otherKey).instances[0]).toEqual(row);
    });

    it('leaves fields out of a partial response untouched', () => {
        const client = clientWithSeries();
        patchProgressSeriesInstance(client, { rootId: 'root', instance: { id: 'current', activity_definition_id: 'activity', completed: true } });
        expect(client.getQueryData(key('series', 60, 'all')).instances[0]).toEqual({ ...row, completed: true });
    });

    it('gives the charts the saved top set, average, yield and goal values', () => {
        const client = clientWithSeries();
        const instance = { ...saved, sets: [set(100, 5), set(120, 2), set(110, 4)] };
        patchProgressSeriesInstance(client, { rootId: 'root', instance });
        const [patched] = client.getQueryData(key('series', 60, 'all')).instances;

        expect(aggregateMetric(patched, { id: 'weight' }, 'top')).toBe(120);
        expect(aggregateMetric(patched, { id: 'weight' }, 'average')).toBe(110);
        expect(aggregateYield(patched, ['weight', 'reps'], 'total')).toBe(1180);
        const { series } = buildConditionSeries({
            measure: 'sets', kind: 'single_session', rules: [{ metric_definition_id: 'weight', operator: '>=', value: 150 }],
        }, [patched]);
        expect(series[0].data).toEqual([120]);
    });
});
