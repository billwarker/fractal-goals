import { chunkRange, monthChunksForRange, overscanChunks, shiftMonthKey } from '../calendarChunks';

describe('calendarChunks', () => {
    it('lists every month a visible range touches', () => {
        expect(monthChunksForRange('2026-08-30', '2026-10-10')).toEqual(['2026-08', '2026-09', '2026-10']);
        expect(monthChunksForRange('2026-12-27', '2027-01-06')).toEqual(['2026-12', '2027-01']);
        expect(monthChunksForRange('2026-09-06', '2026-09-26')).toEqual(['2026-09']);
    });

    it('returns no chunks for a missing or inverted range', () => {
        expect(monthChunksForRange(null, '2026-09-01')).toEqual([]);
        expect(monthChunksForRange('2026-10-01', '2026-09-01')).toEqual([]);
    });

    it('bounds a chunk to its calendar month, including leap years', () => {
        expect(chunkRange('2026-09')).toEqual({ start: '2026-09-01', end: '2026-09-30' });
        expect(chunkRange('2028-02')).toEqual({ start: '2028-02-01', end: '2028-02-29' });
        expect(chunkRange('2026-12')).toEqual({ start: '2026-12-01', end: '2026-12-31' });
    });

    it('overscans neighbours across year boundaries without repeating visible chunks', () => {
        expect(shiftMonthKey('2026-01', -1)).toBe('2025-12');
        expect(overscanChunks(['2026-12', '2027-01'])).toEqual(['2026-11', '2027-02']);
        expect(overscanChunks(['2026-09'], 2)).toEqual(['2026-08', '2026-10', '2026-07', '2026-11']);
        expect(overscanChunks([])).toEqual([]);
    });
});
