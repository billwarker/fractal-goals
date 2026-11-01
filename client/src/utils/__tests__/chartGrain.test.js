import { describe, expect, it } from 'vitest';

import cases from '../../../../tests/fixtures/chart_grain_cases.json';
import { bucketCount, bucketStart, bucketStarts, localDayKey, resolveGrain } from '../chartGrain';

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
