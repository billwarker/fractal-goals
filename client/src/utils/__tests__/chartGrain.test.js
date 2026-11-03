import { describe, expect, it } from 'vitest';

import cases from '../../../../tests/fixtures/chart_grain_cases.json';
import { bucketCount, bucketRows, bucketStart, bucketStarts, localDayKey, resolveGrain } from '../chartGrain';

describe('chart grain (shared fixture with services/chart_grain.py)', () => {
    it.each(cases.bucket_start)('bucket start of $day by $grain', ({ day, grain, expected }) => {
        expect(bucketStart(day, grain)).toBe(expected);
    });

    it.each(cases.bucket_count)('$grain buckets from $first to $last', ({ first, last, grain, expected }) => {
        expect(bucketCount(first, last, grain)).toBe(expected);
    });

    it.each(cases.resolve_grain)('resolves $requested over $first..$last', ({ requested, first, last, budget, expected }) => {
        expect(resolveGrain(requested, first, last, budget)).toBe(expected);
    });
});

describe('bucketStarts', () => {
    it('lists every bucket, including empty ones, across month and year ends', () => {
        expect(bucketStarts('2026-12-30', '2027-01-02', 'day')).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
        expect(bucketStarts('2026-03-05', '2026-03-17', 'week')).toEqual(['2026-03-02', '2026-03-09', '2026-03-16']);
        expect(bucketStarts('2026-11-20', '2027-02-01', 'month')).toEqual(['2026-11-01', '2026-12-01', '2027-01-01', '2027-02-01']);
    });
});

describe('localDayKey', () => {
    it('reads the local calendar day', () => {
        expect(localDayKey(new Date(2026, 2, 5, 23, 30))).toBe('2026-03-05');
    });
});

describe('bucketRows', () => {
    const items = [
        { day: '2026-03-02', seconds: 60 },
        { day: '2026-03-02', seconds: 30 },
        { day: '2026-03-04', seconds: 10 },
        { day: null, seconds: 999 },
    ];
    const options = { dayOf: (item) => item.day, secondsOf: (item) => item.seconds };

    it('counts and sums per bucket, keeping empty buckets and skipping undated items', () => {
        expect(bucketRows(items, options)).toEqual({ grain: 'day', rows: [
            { key: '2026-03-02', count: 2, seconds: 90 },
            { key: '2026-03-03', count: 0, seconds: 0 },
            { key: '2026-03-04', count: 1, seconds: 10 },
        ] });
    });

    it('spans the range, coarsens to fit the budget, and is empty without dated items', () => {
        // A year of days fits the 500-bar budget; two years don't.
        expect(bucketRows(items, { ...options, grain: 'day', range: { start: '2026-01-01', end: '2026-12-31' } }).grain).toBe('day');
        const result = bucketRows(items, { ...options, grain: 'day', range: { start: '2025-01-01', end: '2026-12-31' } });
        expect(result.grain).toBe('week');
        expect(result.rows.find((row) => row.key === '2026-03-02')).toEqual({ key: '2026-03-02', count: 3, seconds: 100 });
        expect(bucketRows([], options)).toEqual({ grain: 'day', rows: [] });
    });
});
