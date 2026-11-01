import { describe, expect, it } from 'vitest';

import { buildSeries, OTHER_KEY, seriesColor } from '../buildSeries';

const entity = (key) => ({ key, label: key.toUpperCase() });

describe('buildSeries', () => {
    it('keeps each entity in its own slot when a filter removes another', () => {
        const entities = ['a', 'b', 'c'].map(entity);
        const all = buildSeries({ entities, buckets: ['d1'], rows: [
            { key: 'a', bucket: 'd1', value: 1 }, { key: 'b', bucket: 'd1', value: 5 }, { key: 'c', bucket: 'd1', value: 3 },
        ] });
        const withoutB = buildSeries({ entities, buckets: ['d1'], rows: [
            { key: 'a', bucket: 'd1', value: 1 }, { key: 'c', bucket: 'd1', value: 3 },
        ] });
        expect(all.series.map((item) => [item.key, item.slot])).toEqual([['b', 1], ['c', 2], ['a', 0]]);
        expect(withoutB.series.map((item) => [item.key, item.slot])).toEqual([['c', 2], ['a', 0]]);
    });

    it('folds everything past seven series into one Other, never a ninth colour', () => {
        const entities = Array.from({ length: 10 }, (_, index) => entity(`g${index}`));
        const rows = entities.map((item, index) => ({ key: item.key, bucket: 'd1', value: index + 1 }));
        const { series, total, bucketTotals } = buildSeries({ entities, rows, buckets: ['d1'] });
        expect(series).toHaveLength(8);
        const other = series.at(-1);
        expect(other).toMatchObject({ key: OTHER_KEY, label: 'Other (3)', slot: null, total: 1 + 2 + 3 });
        expect(new Set(series.filter((item) => item.slot != null).map((item) => item.slot)).size).toBe(7);
        expect(total).toBe(55);
        expect(bucketTotals).toEqual([55]);
        expect(seriesColor(other, { seriesColors: ['#1'], otherSeriesColor: '#other' })).toBe('#other');
    });

    it('drops rows outside the buckets and entities without time', () => {
        const { series } = buildSeries({ entities: ['a', 'b'].map(entity), buckets: ['d1'], rows: [
            { key: 'a', bucket: 'd2', value: 4 }, { key: 'b', bucket: 'd1', value: 0 },
        ] });
        expect(series).toEqual([]);
    });
});
